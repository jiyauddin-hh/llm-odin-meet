"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./socket";

/**
 * In-class video call over a WebRTC mesh, signalled through the classroom
 * socket. Every peer connection has the same three transceivers in the same
 * order (mic, camera, screen); turning media on and off swaps tracks with
 * replaceTrack, so after the first offer/answer nothing is ever renegotiated.
 * Offer glare is handled with the "perfect negotiation" pattern.
 */

const CAM = {
  student: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } },
  teacher: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30 } },
};
const KBPS = { audio: 48, cam: 350, camTeacher: 800, screen: 1500 };
const SPEAK_THRESHOLD = 0.02;

function setBitrate(sender, kbps) {
  try {
    const p = sender.getParameters();
    if (!p.encodings || !p.encodings.length) p.encodings = [{}];
    p.encodings[0].maxBitrate = kbps * 1000;
    sender.setParameters(p).catch(() => {});
  } catch {}
}

function describe(err, what) {
  if (err?.name === "NotAllowedError" || err?.name === "SecurityError") return `Permission for the ${what} was denied. Allow it in the address bar and try again.`;
  if (err?.name === "NotFoundError" || err?.name === "OverconstrainedError") return `No ${what} was found on this device.`;
  if (err?.name === "NotReadableError") return `The ${what} is in use by another app.`;
  return err?.message || `Could not start the ${what}.`;
}

export function useCall({ socket, sid, ice, isTeacher, teacherId, joinKey, notify }) {
  const [peers, setPeers] = useState([]);
  const [local, setLocal] = useState({ mic: false, cam: false, screen: false, speaking: false });
  const [error, setError] = useState("");

  const peersRef = useRef(new Map());
  const rosterRef = useRef(new Map()); // everyone in the call: sid -> { userId, user, mic, cam, screen }
  const localRef = useRef(null);
  const audioCtx = useRef(null);
  const analysers = useRef(new Map());
  const sidRef = useRef(sid);
  const iceRef = useRef(ice);
  const teacherRef = useRef(isTeacher);
  const teacherIdRef = useRef(teacherId);
  const notifyRef = useRef(notify);
  const socketRef = useRef(socket);
  sidRef.current = sid;
  iceRef.current = ice;
  teacherRef.current = isTeacher;
  teacherIdRef.current = teacherId;
  notifyRef.current = notify;
  socketRef.current = socket;

  const secure = typeof window === "undefined" ? true : !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia);

  if (!localRef.current && typeof window !== "undefined") {
    localRef.current = {
      mic: false, cam: false, screen: false, speaking: false,
      audioTrack: null, videoTrack: null, screenTrack: null,
      camStream: new MediaStream(), screenStream: new MediaStream(),
    };
  }

  const publish = useCallback(() => {
    setPeers(
      [...peersRef.current.values()].map((p) => ({
        sid: p.sid, userId: p.userId, user: p.user, mic: p.mic, cam: p.cam, screen: p.screen,
        camStream: p.camStream, screenStream: p.screenStream, speaking: p.speaking, state: p.pc.connectionState,
      })),
    );
  }, []);
  const publishLocal = useCallback(() => {
    const l = localRef.current;
    setLocal({ mic: l.mic, cam: l.cam, screen: l.screen, speaking: l.speaking });
  }, []);

  // ---- speaking detection (one analyser per audio track) ----
  const watch = useCallback((key, track) => {
    if (typeof window === "undefined" || !track) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx.current ??= new Ctx();
      const prev = analysers.current.get(key);
      if (prev) {
        try { prev.src.disconnect(); } catch {}
      }
      const src = audioCtx.current.createMediaStreamSource(new MediaStream([track]));
      const an = audioCtx.current.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      analysers.current.set(key, { src, an, data: new Uint8Array(an.fftSize) });
    } catch {}
  }, []);
  const unwatch = useCallback((key) => {
    const a = analysers.current.get(key);
    if (!a) return;
    try { a.src.disconnect(); } catch {}
    analysers.current.delete(key);
  }, []);

  useEffect(() => {
    const resume = () => audioCtx.current?.state === "suspended" && audioCtx.current.resume().catch(() => {});
    document.addEventListener("pointerdown", resume);
    const timer = setInterval(() => {
      let changed = false;
      for (const [key, a] of analysers.current) {
        const muted = key === "local" ? !localRef.current.mic : !peersRef.current.get(key)?.mic;
        if (muted) {
          const p = key === "local" ? localRef.current : peersRef.current.get(key);
          if (p?.speaking) {
            p.speaking = false;
            if (key === "local") publishLocal();
            else changed = true;
          }
          continue;
        }
        a.an.getByteTimeDomainData(a.data);
        let sum = 0;
        for (let i = 0; i < a.data.length; i++) {
          const v = (a.data[i] - 128) / 128;
          sum += v * v;
        }
        const speaking = Math.sqrt(sum / a.data.length) > SPEAK_THRESHOLD;
        if (key === "local") {
          const l = localRef.current;
          const now = speaking && l.mic;
          if (l.speaking !== now) {
            l.speaking = now;
            publishLocal();
          }
        } else {
          const p = peersRef.current.get(key);
          const now = speaking && !!p?.mic;
          if (p && p.speaking !== now) {
            p.speaking = now;
            changed = true;
          }
        }
      }
      if (changed) publish();
    }, 250);
    return () => {
      clearInterval(timer);
      document.removeEventListener("pointerdown", resume);
    };
  }, [publish, publishLocal]);

  // ---- peers ----
  // Put whatever we're currently sending on a connection's mic / camera / screen senders.
  const attachLocal = (pc) => {
    const l = localRef.current;
    const [ta, tc, ts] = pc.getTransceivers();
    if (l.audioTrack) ta?.sender.replaceTrack(l.audioTrack);
    if (l.videoTrack) tc?.sender.replaceTrack(l.videoTrack);
    if (l.screenTrack) ts?.sender.replaceTrack(l.screenTrack);
  };

  const signal = useCallback((to, payload) => socketRef.current?.emit("rtc:signal", { to, ...payload }), []);

  const removePeer = useCallback(
    (peerSid) => {
      const p = peersRef.current.get(peerSid);
      if (!p) return;
      unwatch(peerSid);
      try { p.pc.close(); } catch {}
      peersRef.current.delete(peerSid);
      publish();
    },
    [publish, unwatch],
  );

  const createPeer = useCallback(
    (peerSid, info = {}, { waitForOffer = false } = {}) => {
      const existing = peersRef.current.get(peerSid);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: iceRef.current || [] });
      const peer = {
        sid: peerSid, userId: info.userId, user: info.user,
        mic: !!info.mic, cam: !!info.cam, screen: !!info.screen,
        pc, polite: String(sidRef.current) > String(peerSid), makingOffer: false, ignoreOffer: false, waitForOffer,
        camStream: new MediaStream(), screenStream: new MediaStream(), speaking: false, queued: [],
      };
      // The offerer creates the three transceivers; the answerer adopts the ones
      // the offer creates (see adoptTransceivers). Transceivers made here with
      // addTransceiver would never be matched to the offer's m-lines, so the
      // answerer would end up with six and every index would be off by three.
      if (!waitForOffer) {
        pc.addTransceiver("audio", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" });
        attachLocal(pc);
      }

      pc.ontrack = (e) => {
        const idx = pc.getTransceivers().indexOf(e.transceiver);
        const target = idx === 2 ? peer.screenStream : peer.camStream;
        target.addTrack(e.track);
        if (e.track.kind === "audio") watch(peerSid, e.track);
        publish();
      };
      pc.onnegotiationneeded = async () => {
        if (peer.waitForOffer && !pc.remoteDescription) return;
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          signal(peerSid, { description: pc.localDescription.toJSON() });
        } catch (err) {
          console.warn("negotiation", err);
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.onicecandidate = ({ candidate }) => signal(peerSid, { candidate: candidate ? candidate.toJSON() : null });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          const [ta, tc, ts] = pc.getTransceivers();
          if (ta) setBitrate(ta.sender, KBPS.audio);
          if (tc) setBitrate(tc.sender, teacherRef.current ? KBPS.camTeacher : KBPS.cam);
          if (ts) setBitrate(ts.sender, KBPS.screen);
        } else if (pc.connectionState === "failed") {
          try { pc.restartIce(); } catch {}
        }
        publish();
      };
      peersRef.current.set(peerSid, peer);
      publish();
      return peer;
    },
    [publish, signal, watch],
  );

  const handleSignal = useCallback(
    async ({ from, fromUser, description, candidate }) => {
      const peer = peersRef.current.get(from) || createPeer(from, rosterRef.current.get(from) || { userId: fromUser?.id, user: fromUser }, { waitForOffer: true });
      const { pc } = peer;
      try {
        if (description) {
          const collision = description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
          await pc.setRemoteDescription(description);
          if (peer.waitForOffer && description.type === "offer") {
            for (const t of pc.getTransceivers().slice(0, 3)) t.direction = "sendrecv";
            attachLocal(pc);
          }
          peer.waitForOffer = false;
          for (const c of peer.queued.splice(0)) await pc.addIceCandidate(c).catch(() => {});
          if (description.type === "offer") {
            await pc.setLocalDescription();
            signal(from, { description: pc.localDescription.toJSON() });
          }
        } else if (candidate !== undefined) {
          if (!pc.remoteDescription) peer.queued.push(candidate);
          else await pc.addIceCandidate(candidate).catch((err) => { if (!peer.ignoreOffer) console.warn("ice", err); });
        }
      } catch (err) {
        console.warn("rtc", err);
      }
    },
    [createPeer, signal],
  );

  // ---- who connects to whom ----
  // A connection is only opened where media can flow: everyone to the host, and
  // everyone to whoever has a mic, camera or screen on. Students who only watch
  // don't connect to each other, so a class of 30 needs about 30 connections
  // instead of 435, and each student's browser holds one instead of 29.
  // Of each pair the side with the smaller socket id makes the offer; the other
  // side's connection is created when the offer arrives (handleSignal).
  // Connections stay open after a mic is turned off, so toggling doesn't churn.
  const reconcile = useCallback(() => {
    const me = sidRef.current;
    if (!me) return;
    const l = localRef.current;
    const sending = l.mic || l.cam || l.screen;
    for (const [peerSid, info] of rosterRef.current) {
      if (peersRef.current.has(peerSid) || String(me) > String(peerSid)) continue;
      const host = teacherRef.current || info.userId === teacherIdRef.current;
      if (host || sending || info.mic || info.cam || info.screen) createPeer(peerSid, info);
    }
  }, [createPeer]);

  const announce = useCallback(() => {
    const l = localRef.current;
    socketRef.current?.emit("call:state", { mic: l.mic, cam: l.cam, screen: l.screen });
    publishLocal();
    reconcile();
  }, [publishLocal, reconcile]);

  const senderAt = (p, i) => p.pc.getTransceivers()[i]?.sender;
  const eachPeer = (fn) => peersRef.current.forEach(fn);

  const muteSelf = useCallback(
    (reason) => {
      const l = localRef.current;
      if (!l.mic) return;
      l.mic = false;
      if (l.audioTrack) l.audioTrack.enabled = false;
      announce();
      if (reason) notifyRef.current?.(reason);
    },
    [announce],
  );

  // ---- socket wiring ----
  useEffect(() => {
    if (!socket) return;
    const onPeer = (p) => {
      if (p.sid === sidRef.current) return;
      rosterRef.current.set(p.sid, { userId: p.userId, user: p.user, mic: !!p.mic, cam: !!p.cam, screen: !!p.screen });
      reconcile();
    };
    const onLeft = ({ sid: s }) => {
      rosterRef.current.delete(s);
      removePeer(s);
    };
    const onState = ({ sid: s, mic, cam, screen }) => {
      const info = rosterRef.current.get(s);
      if (info) Object.assign(info, { mic, cam, screen });
      const p = peersRef.current.get(s);
      if (p) {
        Object.assign(p, { mic, cam, screen });
        if (!mic) p.speaking = false;
        publish();
      }
      reconcile();
    };
    const onSignal = (msg) => handleSignal(msg);
    const onForce = ({ by }) => muteSelf(`${by?.name || by?.username || "The teacher"} muted your microphone`);
    socket.on("call:peer", onPeer);
    socket.on("call:peer-left", onLeft);
    socket.on("call:state", onState);
    socket.on("rtc:signal", onSignal);
    socket.on("call:force-mute", onForce);
    return () => {
      socket.off("call:peer", onPeer);
      socket.off("call:peer-left", onLeft);
      socket.off("call:state", onState);
      socket.off("rtc:signal", onSignal);
      socket.off("call:force-mute", onForce);
    };
  }, [socket, reconcile, removePeer, handleSignal, publish, muteSelf]);

  // (Re)join the call after every successful classroom join. Our socket id is
  // new each time, so existing connections are dropped and rebuilt.
  useEffect(() => {
    if (!socket || !joinKey) return;
    let cancelled = false;
    for (const s of [...peersRef.current.keys()]) removePeer(s);
    rosterRef.current.clear();
    const l = localRef.current;
    request(socket, "call:join", { mic: l.mic, cam: l.cam, screen: l.screen })
      .then(({ peers: list }) => {
        if (cancelled) return;
        for (const p of list) {
          if (p.sid !== sidRef.current) rosterRef.current.set(p.sid, { userId: p.userId, user: p.user, mic: !!p.mic, cam: !!p.cam, screen: !!p.screen });
        }
        reconcile();
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [socket, joinKey, reconcile, removePeer]);

  // ---- local media ----
  const toggleMic = useCallback(async () => {
    const l = localRef.current;
    setError("");
    audioCtx.current?.resume?.().catch(() => {});
    try {
      if (!l.audioTrack) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        l.audioTrack = s.getAudioTracks()[0];
        l.camStream.addTrack(l.audioTrack);
        eachPeer((p) => senderAt(p, 0)?.replaceTrack(l.audioTrack));
        watch("local", l.audioTrack);
        l.mic = true;
      } else {
        l.mic = !l.mic;
        l.audioTrack.enabled = l.mic;
      }
      announce();
    } catch (e) {
      setError(describe(e, "microphone"));
    }
  }, [announce, watch]);

  const toggleCam = useCallback(async () => {
    const l = localRef.current;
    setError("");
    try {
      if (l.cam) {
        l.videoTrack?.stop();
        if (l.videoTrack) l.camStream.removeTrack(l.videoTrack);
        l.videoTrack = null;
        eachPeer((p) => senderAt(p, 1)?.replaceTrack(null));
        l.cam = false;
      } else {
        const s = await navigator.mediaDevices.getUserMedia({ video: CAM[teacherRef.current ? "teacher" : "student"] });
        const t = s.getVideoTracks()[0];
        try { t.contentHint = "motion"; } catch {}
        l.videoTrack = t;
        l.camStream.addTrack(t);
        eachPeer((p) => {
          const snd = senderAt(p, 1);
          snd?.replaceTrack(t);
          if (snd) setBitrate(snd, teacherRef.current ? KBPS.camTeacher : KBPS.cam);
        });
        t.addEventListener("ended", () => {
          if (l.videoTrack === t && l.cam) toggleCam();
        });
        l.cam = true;
      }
      announce();
    } catch (e) {
      setError(describe(e, "camera"));
    }
  }, [announce]);

  const stopScreen = useCallback(() => {
    const l = localRef.current;
    if (!l.screen) return;
    l.screenTrack?.stop();
    if (l.screenTrack) l.screenStream.removeTrack(l.screenTrack);
    l.screenTrack = null;
    eachPeer((p) => senderAt(p, 2)?.replaceTrack(null));
    l.screen = false;
    announce();
  }, [announce]);

  const toggleScreen = useCallback(async () => {
    const l = localRef.current;
    setError("");
    if (l.screen) return stopScreen();
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
      const t = s.getVideoTracks()[0];
      try { t.contentHint = "detail"; } catch {}
      l.screenTrack = t;
      l.screenStream.addTrack(t);
      eachPeer((p) => {
        const snd = senderAt(p, 2);
        snd?.replaceTrack(t);
        if (snd) setBitrate(snd, KBPS.screen);
      });
      t.addEventListener("ended", stopScreen);
      l.screen = true;
      announce();
    } catch (e) {
      if (e?.name !== "NotAllowedError") setError(describe(e, "screen share"));
    }
  }, [announce, stopScreen]);

  // Tear everything down when the page goes away.
  useEffect(
    () => () => {
      for (const s of [...peersRef.current.keys()]) {
        const p = peersRef.current.get(s);
        try { p.pc.close(); } catch {}
      }
      peersRef.current.clear();
      const l = localRef.current;
      [l?.audioTrack, l?.videoTrack, l?.screenTrack].forEach((t) => t?.stop());
      audioCtx.current?.close?.().catch(() => {});
    },
    [],
  );

  return {
    peers,
    local,
    localStreams: { cam: localRef.current?.camStream, screen: localRef.current?.screenStream },
    toggleMic,
    toggleCam,
    toggleScreen,
    muteSelf,
    error,
    clearError: () => setError(""),
    secure,
  };
}
