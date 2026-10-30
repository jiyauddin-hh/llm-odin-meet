"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRequireAuth } from "@/lib/auth";
import { classroomSocket, request } from "@/lib/socket";
import { useCall } from "@/lib/useCall";
import LiveEditor from "@/components/classroom/LiveEditor";
import Participants from "@/components/classroom/Participants";
import Terminal from "@/components/classroom/Terminal";
import CallStage from "@/components/classroom/CallStage";
import ControlBar from "@/components/classroom/ControlBar";
import Chat from "@/components/classroom/Chat";
import AiClassBar from "@/components/classroom/AiClassBar";
import { Avatar, LANGUAGE_LABEL, Spinner } from "@/components/ui";
import Icon, { LogoMark } from "@/components/Icons";

const displayName = (m) => m?.name || m?.username || "someone";

export default function ClassroomRoom({ params }) {
  const code = String(params.code || "").toUpperCase();
  const { user, loading } = useRequireAuth();
  const router = useRouter();

  const socketRef = useRef(null);
  const editorRef = useRef(null);
  const versionRef = useRef(0);
  const syncing = useRef(false);
  const holdsPenRef = useRef(false);
  const roomRef = useRef(null);
  const toastTimer = useRef(null);
  const modeRef = useRef("code");
  const pendingContent = useRef(null); // snapshot that arrived before the editor existed
  const clockRef = useRef(0); // server time minus ours, for the AI teacher's timed lines

  const [socket, setSocket] = useState(null);
  const [sid, setSid] = useState(null);
  const [joinKey, setJoinKey] = useState(0);
  const [room, setRoom] = useState(null); // snapshot from the server
  const [status, setStatus] = useState("connecting"); // connecting | live | reconnecting | ended | kicked | error
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null); // { text, action?: { label, run } }
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [mode, setMode] = useState("code"); // code | meet
  const [sidebar, setSidebar] = useState("people"); // people | chat | null
  const [pinned, setPinned] = useState(null);
  const [showStrip, setShowStrip] = useState(true);
  const [unread, setUnread] = useState(0);
  const [split, setSplit] = useState(SPLIT_DEFAULT); // editor share of the code column (desktop)
  const [fontSize, setFontSize] = useState(14);
  const splitBox = useRef(null);
  roomRef.current = room;
  modeRef.current = mode;

  const me = user?.id;
  const isTeacher = !!room && room.teacherId === me;
  const controllerId = room ? (room.writerId ?? room.teacherId) : null;
  const holdsPen = !!room && controllerId === me;
  holdsPenRef.current = holdsPen;
  const controller = room?.members.find((m) => m.id === controllerId);
  const teacher = room?.members.find((m) => m.id === room.teacherId);
  const myHand = !!room?.members.find((m) => m.id === me)?.hand;
  // What the admin lets me do here (the host always has everything in their own class).
  const myPerms = room?.members.find((m) => m.id === me)?.perms || ALL_PERMS;

  const flash = useCallback((text, action) => {
    setToast({ text, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? 8000 : 3500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("qc_class_mode");
      if (saved === "meet" || saved === "code") setMode(saved);
      const sp = Number(localStorage.getItem("qc_class_split"));
      if (sp >= SPLIT_MIN && sp <= SPLIT_MAX) setSplit(sp);
      const fs = Number(localStorage.getItem("qc_class_font"));
      if (fs >= FONT_MIN && fs <= FONT_MAX) setFontSize(fs);
    } catch {}
    // On small screens the panel is a drawer over the room, so start with it closed.
    if (window.innerWidth < 1024) setSidebar(null);
  }, []);
  const changeMode = (m) => {
    setMode(m);
    try {
      localStorage.setItem("qc_class_mode", m);
    } catch {}
  };
  const saveSplit = (v) => {
    setSplit(v);
    try {
      localStorage.setItem("qc_class_split", String(v));
    } catch {}
  };
  const changeFont = (d) =>
    setFontSize((f) => {
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, f + d));
      try {
        localStorage.setItem("qc_class_font", String(next));
      } catch {}
      return next;
    });
  const startDrag = (e) => {
    const box = splitBox.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let last = split;
    const move = (ev) => {
      last = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, (ev.clientY - box.top) / box.height));
      setSplit(last);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      saveSplit(last);
    };
    document.body.style.cursor = "row-resize";
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(editorRef.current?.getValue() ?? "");
      flash("Code copied to the clipboard");
    } catch {
      flash("Couldn't copy. Select the code and press Ctrl+C.");
    }
  };

  const call = useCall({ socket, sid, ice: room?.ice, isTeacher, teacherId: room?.teacherId, joinKey, notify: flash });

  const applySnapshot = useCallback((state) => {
    if (state.serverNow) clockRef.current = state.serverNow - Date.now();
    versionRef.current = state.version;
    if (editorRef.current) {
      editorRef.current.setContent(state.content);
      editorRef.current.showCursor(state.cursor && state.cursor.userId !== state.you.id ? state.cursor : null);
    } else {
      pendingContent.current = state.content;
    }
    setRoom(state);
  }, []);

  // The editor only renders once the room is known, so the first snapshot is applied here.
  useEffect(() => {
    if (room && editorRef.current && pendingContent.current != null) {
      editorRef.current.setContent(pendingContent.current);
      pendingContent.current = null;
    }
  }, [room]);

  const resync = useCallback(async () => {
    const s = socketRef.current;
    if (!s || syncing.current) return;
    syncing.current = true;
    try {
      const res = await request(s, "sync");
      applySnapshot(res.state);
    } catch {
      /* the reconnect path will try again */
    } finally {
      syncing.current = false;
    }
  }, [applySnapshot]);

  // Connect once we know who the user is.
  useEffect(() => {
    if (loading || !user) return;
    const s = classroomSocket();
    socketRef.current = s;
    setSocket(s);
    let gone = false;

    const join = async () => {
      try {
        const res = await request(s, "join", { code });
        setSid(res.sid);
        applySnapshot(res.state);
        setStatus("live");
        setError("");
        setJoinKey((k) => k + 1);
      } catch (e) {
        setError(e.message);
        setStatus("error");
        s.disconnect();
      }
    };

    s.on("connect", join);
    s.on("connect_error", (e) => {
      setError(e.message === "Please log in" ? "Please log in again" : "Can't reach the class right now");
      setStatus((st) => (st === "live" ? "reconnecting" : "error"));
    });
    s.on("disconnect", () => {
      if (!gone) setStatus((st) => (st === "live" ? "reconnecting" : st));
    });
    s.on("presence", (p) => setRoom((r) => (r ? { ...r, ...p } : r)));
    s.on("edit", ({ changes, version, length }) => {
      if (holdsPenRef.current) return;
      if (version !== versionRef.current + 1) return resync();
      versionRef.current = version;
      const len = editorRef.current?.applyEdits(changes);
      if (len != null && len !== length) resync();
    });
    s.on("replace", ({ content, version }) => {
      if (holdsPenRef.current) return;
      versionRef.current = version;
      editorRef.current?.setContent(content);
    });
    s.on("cursor", (c) => {
      if (c.userId !== user.id) editorRef.current?.showCursor(c);
    });
    s.on("language", ({ language }) => setRoom((r) => (r ? { ...r, language } : r)));
    s.on("stdin", ({ stdin }) => setRoom((r) => (r ? { ...r, stdin } : r)));
    s.on("control", ({ writerId, by }) => {
      editorRef.current?.showCursor(null);
      const r = roomRef.current;
      if (r) {
        const youNow = (writerId ?? r.teacherId) === user.id;
        const wasYou = (r.writerId ?? r.teacherId) === user.id;
        if (youNow && !wasYou) {
          flash("You have the pen. Everyone can see what you type.");
          if (modeRef.current === "meet") flash("You have the pen. Everyone can see what you type.", { label: "Open editor", run: () => changeMode("code") });
          setTimeout(() => editorRef.current?.focus(), 50);
        } else if (wasYou && !youNow) {
          const who = r.members.find((m) => m.id === writerId);
          flash(writerId == null ? `${by ? displayName(by) : "The teacher"} took the pen back` : `The pen went to ${displayName(who)}`);
        }
      }
      setRoom((cur) => (cur ? { ...cur, writerId } : cur));
      resync();
    });
    s.on("run:start", (running) => setRoom((r) => (r ? { ...r, running } : r)));
    s.on("run:result", (entry) => setRoom((r) => (r ? { ...r, running: null, terminal: [...r.terminal, entry].slice(-40) } : r)));
    s.on("terminal:clear", () => setRoom((r) => (r ? { ...r, terminal: [] } : r)));
    s.on("chat", (msg) => {
      setRoom((r) => (r ? { ...r, chat: [...(r.chat || []), msg].slice(-200) } : r));
      if (msg.by?.id !== user.id) setUnread((n) => n + 1);
    });
    // The AI teacher (classes hosted by the AI): status, each spoken line, questions to the class.
    const setAi = (fn) => setRoom((r) => (r?.ai ? { ...r, ai: fn(r.ai) } : r));
    const tick = (p) => p?.now && (clockRef.current = p.now - Date.now());
    s.on("ai:status", (ai) => {
      tick(ai);
      setRoom((r) => (r ? { ...r, ai } : r));
    });
    s.on("ai:say", (line) => {
      tick(line);
      setAi((ai) => ({ ...ai, current: line }));
    });
    s.on("ai:quiet", ({ id }) => setAi((ai) => (ai.current?.id === id ? { ...ai, current: null } : ai)));
    s.on("ai:ask", (ask) => {
      tick(ask);
      setAi((ai) => ({ ...ai, ask }));
      if (window.innerWidth >= 1024) setSidebar("chat");
      flash("Your teacher asked a question. Answer in the chat!");
    });
    s.on("ai:ask-closed", () => setAi((ai) => ({ ...ai, ask: null })));
    s.on("ended", () => {
      gone = true;
      setStatus("ended");
    });
    s.on("kicked", () => {
      gone = true;
      setStatus("kicked");
    });

    return () => {
      gone = true;
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, code, applySnapshot, resync, flash]);

  useEffect(() => {
    if (sidebar === "chat") setUnread(0);
  }, [sidebar, room?.chat?.length]);

  // Someone started presenting their screen: offer to switch to it.
  const screenPeers = call.peers.filter((p) => p.screen).map((p) => p.sid).join(",");
  const prevScreens = useRef("");
  useEffect(() => {
    const now = new Set(screenPeers ? screenPeers.split(",") : []);
    const before = new Set(prevScreens.current ? prevScreens.current.split(",") : []);
    prevScreens.current = screenPeers;
    for (const s of now) {
      if (before.has(s)) continue;
      const peer = call.peers.find((p) => p.sid === s);
      const member = roomRef.current?.members.find((m) => m.id === peer?.userId);
      const key = `${s}:screen`;
      if (modeRef.current === "meet") setPinned(key);
      else flash(`${displayName(member || peer?.user)} is presenting their screen`, { label: "View", run: () => { changeMode("meet"); setPinned(key); } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenPeers]);

  // ---- actions ----
  const send = useCallback(
    (event, payload) =>
      request(socketRef.current, event, payload).catch((e) => {
        flash(e.message);
        throw e;
      }),
    [flash],
  );

  const onEdit = useCallback(
    (changes, value) => {
      const s = socketRef.current;
      if (!s || !holdsPenRef.current) return;
      request(s, "edit", { changes, length: value.length })
        .then((res) => {
          versionRef.current = res.version;
          if (res.resync) return request(s, "replace", { content: editorRef.current?.getValue() ?? value }).then((r) => (versionRef.current = r.version));
        })
        .catch(() => resync());
    },
    [resync],
  );

  const onCursor = useCallback((cursor) => {
    if (holdsPenRef.current) socketRef.current?.emit("cursor", cursor);
  }, []);

  const canRun = myPerms.run;
  const run = useCallback(() => {
    if (room?.running || !holdsPenRef.current || !canRun) return;
    send("run").catch(() => {});
  }, [room?.running, send, canRun]);

  // The admin can switch a feature off mid-class: stop whatever is no longer allowed.
  useEffect(() => {
    if (!room) return;
    if (!myPerms.mic && call.local.mic) call.muteSelf("Your admin turned off voice for you");
    if (!myPerms.cam && call.local.cam) {
      call.toggleCam();
      flash("Your admin turned off video for you");
    }
    if (!myPerms.screen && call.local.screen) {
      call.toggleScreen();
      flash("Your admin turned off screen sharing for you");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPerms.mic, myPerms.cam, myPerms.screen, call.local.mic, call.local.cam, call.local.screen]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  const endClass = () =>
    send("end")
      .then(() => setStatus("ended"))
      .catch(() => {});

  const leave = () => {
    socketRef.current?.emit("leave");
    router.push("/classroom");
  };

  // ---- video tiles ----
  const tiles = useMemo(() => {
    if (!room) return [];
    const meMember = room.members.find((m) => m.id === me) || user;
    const list = [
      {
        key: "me", userId: me, user: meMember, name: "You", stream: call.localStreams.cam, local: true,
        mic: call.local.mic, cam: call.local.cam, speaking: call.local.speaking, isTeacher,
      },
    ];
    if (room.ai) {
      const bot = room.members.find((m) => m.isBot);
      list.push({ key: "ai", ai: room.ai, clock: clockRef, userId: bot?.id, user: bot, name: room.ai.name || displayName(bot), isTeacher: true });
    }
    if (call.local.screen) list.push({ key: "me:screen", userId: me, user: meMember, name: "Your screen", stream: call.localStreams.screen, local: true, isScreen: true });
    for (const p of call.peers) {
      const member = room.members.find((m) => m.id === p.userId) || p.user;
      list.push({
        key: p.sid, userId: p.userId, user: member, name: displayName(member), stream: p.camStream,
        mic: p.mic, cam: p.cam, speaking: p.speaking, isTeacher: member?.isTeacher || p.userId === room.teacherId, state: p.state,
      });
      if (p.screen) list.push({ key: `${p.sid}:screen`, userId: p.userId, user: member, name: `${displayName(member)}'s screen`, stream: p.screenStream, isScreen: true, state: p.state });
    }
    // Teacher first, then whoever is talking, then the rest.
    return list.sort((a, b) => (a.isScreen !== b.isScreen ? (a.isScreen ? -1 : 1) : a.isTeacher !== b.isTeacher ? (a.isTeacher ? -1 : 1) : 0));
  }, [room, me, user, call.peers, call.local, call.localStreams, isTeacher]);

  const media = useMemo(() => {
    const map = new Map();
    if (me) map.set(me, { mic: call.local.mic, cam: call.local.cam, screen: call.local.screen, speaking: call.local.speaking });
    for (const p of call.peers) {
      const cur = map.get(p.userId) || {};
      map.set(p.userId, { mic: cur.mic || p.mic, cam: cur.cam || p.cam, screen: cur.screen || p.screen, speaking: cur.speaking || p.speaking });
    }
    return map;
  }, [call.peers, call.local, me]);

  // ---- render ----
  if (loading || !user) return <FullScreen><Spinner /></FullScreen>;

  if (status === "ended" || status === "kicked") {
    const ended = status === "ended";
    return (
      <FullScreen>
        <div className="card w-full max-w-md p-8 text-center">
          <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${ended ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
            <Icon name={ended ? "check-circle" : "x-circle"} className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-xl font-bold text-white">{ended ? "The class has ended" : "You were removed from the class"}</h1>
          <p className="mt-2 text-sm text-slate-400">{ended ? `Thanks for joining${room?.title ? ` “${room.title}”` : ""}. The host closed the room.` : "Ask your teacher for the code if you need to rejoin."}</p>
          <Link href="/classroom" className="btn-primary mt-6 w-full justify-center">
            <Icon name="arrow-left" className="h-4 w-4" /> Back to Classroom
          </Link>
        </div>
      </FullScreen>
    );
  }

  if (status === "error" && !room) {
    return (
      <FullScreen>
        <div className="card w-full max-w-md p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
            <Icon name="alert-triangle" className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-xl font-bold text-white">Can&apos;t join this class</h1>
          <p className="mt-2 text-sm text-slate-400">{error || "Something went wrong."}</p>
          <p className="mt-1 font-mono text-xs tracking-[0.25em] text-slate-500">{code}</p>
          <Link href="/classroom" className="btn-primary mt-6 w-full justify-center">
            <Icon name="arrow-left" className="h-4 w-4" /> Back to Classroom
          </Link>
        </div>
      </FullScreen>
    );
  }

  if (!room) {
    return (
      <FullScreen>
        <div className="flex flex-col items-center text-center">
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-2xl bg-brand-500/20" />
            <LogoMark className="relative h-12 w-12" />
          </span>
          <p className="mt-6 font-semibold text-white">Joining class</p>
          <p className="mt-1 font-mono text-sm tracking-[0.3em] text-slate-500">{code}</p>
        </div>
      </FullScreen>
    );
  }

  const online = room.members.filter((m) => m.online !== false);
  const viewers = Math.max(0, online.length - 1);
  const hands = online.filter((m) => m.hand && !m.isTeacher).length;
  const pen = holdsPen
    ? isTeacher
      ? viewers
        ? { tone: "emerald", icon: "dot", text: `Presenting to ${viewers} ${viewers === 1 ? "viewer" : "viewers"}` }
        : { tone: "slate", icon: "clock", text: "Waiting for students to join" }
      : { tone: "emerald", icon: "edit", text: "You have the pen" }
    : isTeacher
      ? { tone: "amber", icon: "edit", text: `${displayName(controller)} is coding` }
      : { tone: "slate", icon: "eye", text: `Following ${displayName(controller)}${controllerId === room.teacherId ? " (host)" : ""}` };
  const toneCls = {
    emerald: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/25",
    amber: "bg-amber-500/10 text-amber-200 ring-amber-500/25",
    slate: "bg-white/[0.05] text-slate-300 ring-white/[0.08]",
  }[pen.tone];
  const stripVisible = mode === "code" && showStrip && (tiles.length > 1 || call.local.cam || call.local.screen || !!room.ai);
  const chat = room.chat || [];
  const file = FILE[room.language] || FILE.python;

  const panel = sidebar && (
    <>
      <div className="flex items-center gap-1 border-b border-white/[0.06] p-2">
        <button className={`tab flex-1 justify-center ${sidebar === "people" ? "tab-active" : ""}`} onClick={() => setSidebar("people")}>
          <Icon name="users" className="h-3.5 w-3.5" /> People <span className="text-xs text-slate-500">{online.length}</span>
        </button>
        <button className={`tab flex-1 justify-center ${sidebar === "chat" ? "tab-active" : ""}`} onClick={() => setSidebar("chat")}>
          <Icon name="message-circle" className="h-3.5 w-3.5" /> Chat
          {unread > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
        </button>
        <button className="btn-icon btn-ghost !h-8 !w-8" onClick={() => setSidebar(null)} aria-label="Close panel">
          <Icon name="x" className="h-3.5 w-3.5" />
        </button>
      </div>
      {sidebar === "people" ? (
        <>
          <div className="border-b border-white/[0.06] p-3">
            <p className="text-xs text-slate-400">Invite people with the class code</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex-1 rounded-lg border border-white/[0.08] bg-ink-950/70 px-3 py-2 text-center font-mono text-base font-semibold tracking-[0.35em] text-white">{code}</span>
              <CopyButton text={() => `${window.location.origin}/classroom/${code}`} label="Copy link" />
            </div>
          </div>
          <Participants
            members={room.members}
            writerId={room.writerId}
            teacherId={room.teacherId}
            me={me}
            isTeacher={isTeacher}
            media={media}
            onGive={(userId) => send("control", { userId }).catch(() => {})}
            onTake={() => send("control", { userId: null }).catch(() => {})}
            onKick={(userId) => send("kick", { userId }).catch(() => {})}
            onMute={(userId) => send("call:mute", { userId }).catch(() => {})}
            onMuteAll={() => send("call:mute", { userId: null }).catch(() => {})}
          />
        </>
      ) : (
        <Chat messages={chat} me={me} onSend={(text) => send("chat", { text })} disabled={!myPerms.chat} />
      )}
    </>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink-950 lg:h-[100dvh]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-ink-950/90 px-2 backdrop-blur-xl sm:gap-3 sm:px-3">
        <Link href="/classroom" className="btn-ghost btn-icon !h-9 !w-9" title="Back to Classroom (you stay in the class until you leave)" aria-label="Back to Classroom">
          <Icon name="arrow-left" className="h-4 w-4" />
        </Link>
        <LogoMark className="hidden h-7 w-7 sm:block" />
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight text-white sm:text-[15px]">{room.title}</h1>
            <p className="hidden truncate text-[11px] leading-tight text-slate-500 sm:block">
              {isTeacher ? "Hosted by you · " : teacher ? `Hosted by ${displayName(teacher)} · ` : ""}
              {online.length} in class
            </p>
          </div>
          <span className="pill shrink-0 bg-rose-500/15 text-[10px] font-bold uppercase tracking-wider text-rose-300 ring-1 ring-inset ring-rose-500/30">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /> Live
          </span>
        </div>
        {status === "reconnecting" && (
          <span className="pill shrink-0 bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25">
            <Icon name="refresh" className="h-3 w-3 animate-spin" /> <span className="hidden sm:inline">Reconnecting…</span>
          </span>
        )}
        {!room.teacherOnline && !isTeacher && <span className="pill hidden shrink-0 bg-white/[0.06] text-slate-400 sm:inline-flex">Host is away</span>}

        <div className="ml-auto flex items-center gap-2">
          <button className="hidden items-center md:flex" onClick={() => setSidebar("people")} title="People in the class">
            <AvatarStack members={online} />
          </button>
          <span className="hidden sm:block">
            <CopyButton text={() => `${window.location.origin}/classroom/${code}`} label="Invite" icon="share" primary title="Copy an invite link" />
          </span>
          {mode === "code" && (tiles.length > 1 || call.local.cam || call.local.screen) && (
            <button className="btn-ghost btn-icon !h-9 !w-9" onClick={() => setShowStrip((v) => !v)} title={showStrip ? "Hide videos" : "Show videos"} aria-label={showStrip ? "Hide videos" : "Show videos"}>
              <Icon name={showStrip ? "eye-off" : "eye"} className="h-4 w-4" />
            </button>
          )}
          <div className="segmented hidden sm:flex">
            <button className={`tab !py-1 text-xs ${mode === "code" ? "tab-active" : ""}`} onClick={() => changeMode("code")}>
              <Icon name="code" className="h-3.5 w-3.5" /> Code
            </button>
            <button className={`tab !py-1 text-xs ${mode === "meet" ? "tab-active" : ""}`} onClick={() => changeMode("meet")}>
              <Icon name="grid" className="h-3.5 w-3.5" /> Meet
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-2 sm:p-3">
        {/* Main column */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {call.error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">
              <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{call.error}</span>
              <button onClick={call.clearError} aria-label="Dismiss">
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
          )}

          {room.ai && <AiClassBar ai={room.ai} clock={clockRef} showCaption={mode === "code"} onAnswer={() => setSidebar("chat")} />}

          {mode === "meet" ? (
            <div className="flex min-h-[60vh] flex-1 flex-col lg:min-h-0">
              <CallStage tiles={tiles} pinned={pinned} onPin={setPinned} mode="stage" />
            </div>
          ) : (
            stripVisible && <CallStage tiles={tiles} pinned={pinned} onPin={setPinned} mode="strip" />
          )}

          {/* The editor stays mounted (hidden in Meet view) so it keeps receiving edits. */}
          <div
            ref={splitBox}
            style={{ "--split": `${split * 100}%` }}
            className={`${mode === "meet" ? "hidden" : "flex"} min-h-0 flex-1 flex-col gap-3 lg:gap-0`}
          >
            <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#0b0d17] shadow-card lg:min-h-[160px] lg:flex-none lg:basis-[var(--split)]">
              {/* Editor toolbar: file tab, who is typing, run */}
              <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-ink-950/90 pr-2">
                <div className="flex items-center gap-2 border-b-2 border-brand-400 bg-[#0b0d17] px-4 py-2.5 text-sm text-slate-100">
                  <span className={`h-2.5 w-2.5 rounded-sm ${file.color}`} />
                  <span className="font-mono text-[13px]">{file.name}</span>
                </div>
                {isTeacher ? (
                  <select
                    className="rounded-lg border border-white/[0.08] bg-ink-900 py-1 pl-2 pr-7 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    value={room.language}
                    onChange={(e) => send("language", { language: e.target.value }).catch(() => {})}
                    aria-label="Language"
                  >
                    {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-500">{LANGUAGE_LABEL[room.language]}</span>
                )}
                <span className={`pill ring-1 ring-inset ${toneCls}`}>
                  {pen.icon === "dot" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> : <Icon name={pen.icon} className="h-3 w-3" />}
                  {pen.text}
                </span>
                {isTeacher && !holdsPen && (
                  <button className="btn-soft btn-sm !py-1 text-xs" onClick={() => send("control", { userId: null }).catch(() => {})}>
                    Take the pen back
                  </button>
                )}
                {!isTeacher && holdsPen && (
                  <button className="btn-ghost btn-sm !py-1 text-xs" onClick={() => send("control", { userId: null }).catch(() => {})}>
                    Hand it back
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2 py-1.5">
                  <div className="hidden items-center rounded-lg border border-white/[0.06] bg-white/[0.02] sm:flex">
                    <button className="flex h-7 w-7 items-center justify-center rounded-l-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30" onClick={() => changeFont(-1)} disabled={fontSize <= FONT_MIN} title="Smaller text" aria-label="Smaller text">
                      <Icon name="minus" className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center font-mono text-[11px] tabular-nums text-slate-400" title="Editor font size">{fontSize}</span>
                    <button className="flex h-7 w-7 items-center justify-center rounded-r-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30" onClick={() => changeFont(1)} disabled={fontSize >= FONT_MAX} title="Larger text" aria-label="Larger text">
                      <Icon name="plus" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button className="btn-ghost btn-icon !h-8 !w-8" onClick={copyCode} title="Copy the code" aria-label="Copy the code">
                    <Icon name="copy" className="h-3.5 w-3.5" />
                  </button>
                  <span className="hidden h-5 w-px bg-white/[0.08] sm:block" />
                  {holdsPen ? (
                    <>
                      <span className="hidden items-center gap-1 text-[11px] text-slate-500 md:flex">
                        <span className="kbd">Ctrl</span>+<span className="kbd">↵</span>
                      </span>
                      <button
                        className="btn-success btn-sm"
                        disabled={!!room.running || !canRun}
                        onClick={run}
                        title={canRun ? "Run (Ctrl+Enter)" : "Running code is turned off for you by the admin"}
                      >
                        {room.running ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon name="play" className="h-3.5 w-3.5" />}
                        {room.running ? "Running…" : "Run"}
                      </button>
                    </>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Icon name="lock" className="h-3.5 w-3.5" /> Read-only
                    </span>
                  )}
                </div>
              </div>
              {room.language === "java" && <div className="border-b border-white/[0.04] bg-ink-950/60 px-4 py-1 text-[11px] text-slate-500">The class must be named Main.</div>}
              <div className="min-h-0 flex-1">
                <LiveEditor ref={editorRef} language={room.language} readOnly={!holdsPen} onEdit={onEdit} onCursor={onCursor} remoteLabel={displayName(controller)} fontSize={fontSize} />
              </div>
            </div>

            {/* Drag to resize the editor and console (double-click resets). */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize the editor and console"
              title="Drag to resize · double-click to reset"
              className="group hidden h-3 shrink-0 cursor-row-resize touch-none items-center justify-center lg:flex"
              onPointerDown={startDrag}
              onDoubleClick={() => saveSplit(SPLIT_DEFAULT)}
            >
              <span className="h-1 w-10 rounded-full bg-white/[0.08] transition group-hover:w-16 group-hover:bg-brand-400/70" />
            </div>

            <div className="h-[260px] shrink-0 lg:h-auto lg:min-h-[120px] lg:flex-1">
              <Terminal
                terminal={room.terminal}
                running={room.running}
                stdin={room.stdin}
                canEdit={holdsPen}
                isTeacher={isTeacher}
                language={room.language}
                onStdin={(stdin) => send("stdin", { stdin }).catch(() => {})}
                onClear={() => send("terminal:clear").catch(() => {})}
              />
            </div>
          </div>
        </section>

        {/* Side panel: a column on large screens, a drawer on small ones */}
        {sidebar && <aside className="hidden w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/70 lg:flex xl:w-[22rem]">{panel}</aside>}
      </div>
      {sidebar && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label={sidebar === "chat" ? "Chat" : "People"}>
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebar(null)} aria-label="Close panel" />
          <aside className="absolute inset-y-0 right-0 flex w-[min(24rem,100%)] animate-scale-in flex-col border-l border-white/[0.08] bg-ink-900 shadow-2xl">{panel}</aside>
        </div>
      )}

      <ControlBar
        call={call}
        hand={myHand}
        perms={myPerms}
        onHand={(raised) => socketRef.current?.emit("hand", { raised })}
        isTeacher={isTeacher}
        mode={mode}
        onMode={changeMode}
        onLeave={leave}
        onEnd={endClass}
        confirmEnd={confirmEnd}
        setConfirmEnd={setConfirmEnd}
        chatUnread={unread}
        sidebar={sidebar}
        onChat={() => setSidebar((s) => (s === "chat" ? null : "chat"))}
        onPeople={() => setSidebar((s) => (s === "people" ? null : "people"))}
        peopleCount={online.length}
        hands={hands}
        elapsed={<Elapsed since={room.startedAt} />}
        code={code}
      />

      {toast && (
        <div role="status" className="fixed left-1/2 top-16 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 animate-scale-in items-center gap-3 rounded-xl border border-white/[0.1] bg-ink-900/95 px-4 py-2.5 text-sm text-white shadow-2xl backdrop-blur-xl">
          <Icon name="info" className="h-4 w-4 shrink-0 text-brand-300" />
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="btn-soft btn-sm"
              onClick={() => {
                toast.action.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ALL_PERMS = { mic: true, cam: true, screen: true, chat: true, pen: true, run: true };

const SPLIT_DEFAULT = 0.64;
const SPLIT_MIN = 0.25;
const SPLIT_MAX = 0.85;
const FONT_MIN = 11;
const FONT_MAX = 24;

const FILE = {
  python: { name: "main.py", color: "bg-sky-400" },
  javascript: { name: "main.js", color: "bg-amber-300" },
  cpp: { name: "main.cpp", color: "bg-indigo-400" },
  java: { name: "Main.java", color: "bg-orange-400" },
  go: { name: "main.go", color: "bg-cyan-400" },
};

/** Centred page for the joining / ended / error states. */
function FullScreen({ children }) {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-ink-950 px-4">{children}</div>;
}

/** Class clock. Ticks on its own so the whole room doesn't re-render every second. */
function Elapsed({ since }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const p = (n) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  return <>{h ? `${h}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`}</>;
}

function AvatarStack({ members }) {
  const shown = members.slice(0, 4);
  return (
    <span className="flex items-center">
      {shown.map((m, i) => (
        <span key={m.id} className={`rounded-full ring-2 ring-ink-950 ${i ? "-ml-2" : ""}`}>
          <Avatar user={m} size={28} />
        </span>
      ))}
      {members.length > shown.length && (
        <span className="-ml-2 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-ink-800 px-1.5 text-[11px] font-semibold text-slate-200 ring-2 ring-ink-950">
          +{members.length - shown.length}
        </span>
      )}
    </span>
  );
}

function CopyButton({ text, label, icon = "share", mono = false, primary = false, title }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {}
  };
  return (
    <button
      onClick={copy}
      title={title || label}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
        primary ? "bg-brand-500/20 text-brand-100 ring-1 ring-inset ring-brand-400/30 hover:bg-brand-500/30" : "border border-white/[0.08] bg-white/[0.03] text-slate-200 hover:border-white/20"
      } ${mono ? "font-mono tracking-[0.2em]" : ""}`}
    >
      {done ? "Copied" : label}
      <Icon name={done ? "check" : icon} className={`h-3.5 w-3.5 ${done ? "text-emerald-300" : "text-slate-400"}`} />
    </button>
  );
}
