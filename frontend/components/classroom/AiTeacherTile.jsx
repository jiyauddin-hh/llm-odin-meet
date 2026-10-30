"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icons";

/**
 * The AI teacher's "camera". A looping idle video (or the photo) sits under
 * the talking clip; each clip starts at the moment the server set, so
 * everyone in the class hears the same words at the same time. A late joiner
 * starts mid-sentence. Clips without a face video play voice-only over the idle loop.
 */
export default function AiTeacherTile({ tile, big = false, pinned = false, onPin, className = "" }) {
  const { ai, clock, name } = tile;
  const talkRef = useRef(null);
  const voiceRef = useRef(null);
  const [talking, setTalking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const current = ai?.current || null;

  useEffect(() => {
    const media = current?.video ? talkRef.current : voiceRef.current;
    const other = current?.video ? voiceRef.current : talkRef.current;
    other?.pause();
    if (!current || !media) {
      talkRef.current?.pause();
      voiceRef.current?.pause();
      setTalking(false);
      return;
    }
    const src = current.video || current.audio;
    if (media.getAttribute("src") !== src) media.src = src;
    let timer = null;
    const go = () => {
      const offset = (Date.now() + clock.current - current.startAt) / 1000;
      if (offset * 1000 > current.ms) return setTalking(false);
      if (offset < 0) {
        timer = setTimeout(go, -offset * 1000);
        return;
      }
      try {
        media.currentTime = offset;
      } catch {}
      media
        .play()
        .then(() => {
          setBlocked(false);
          setTalking(!!current.video);
        })
        .catch((e) => {
          if (e?.name === "NotAllowedError") {
            setBlocked(true);
            // Without sound we can still show the face moving.
            if (current.video) {
              media.muted = true;
              media.play().then(() => setTalking(true)).catch(() => {});
            }
          }
        });
    };
    media.muted = false;
    if (media.readyState >= 1) go();
    else media.addEventListener("loadedmetadata", go, { once: true });
    return () => {
      clearTimeout(timer);
      media.removeEventListener("loadedmetadata", go);
    };
    // A new line is a new id; nothing else should restart playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const unblock = () => {
    const media = current?.video ? talkRef.current : voiceRef.current;
    setBlocked(false);
    if (!media || !current) return;
    media.muted = false;
    const offset = (Date.now() + clock.current - current.startAt) / 1000;
    try {
      media.currentTime = Math.max(0, offset);
    } catch {}
    media.play().catch(() => {});
  };

  const speaking = !!current;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-ink-950 shadow-card ring-1 ring-inset transition ${
        speaking ? "ring-2 ring-emerald-400" : pinned ? "ring-brand-500/60" : "ring-white/[0.08]"
      } ${className}`}
    >
      {ai?.idleUrl ? (
        <video src={ai.idleUrl} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ai?.photoUrl || tile.user?.avatarUrl} alt="" className={`absolute inset-0 h-full w-full object-cover ${speaking ? "qc-ai-breathe" : ""}`} />
      )}
      <video
        ref={talkRef}
        playsInline
        preload="auto"
        onEnded={() => setTalking(false)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${talking ? "opacity-100" : "opacity-0"}`}
      />
      <audio ref={voiceRef} preload="auto" />

      {big && current?.text && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center px-4">
          <p className="max-w-3xl rounded-xl bg-black/65 px-4 py-2 text-center text-sm leading-relaxed text-white backdrop-blur-md sm:text-base">{current.text}</p>
        </div>
      )}

      {blocked && (
        <button onClick={unblock} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950/60 text-sm font-medium text-white backdrop-blur-[2px]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 shadow-lg shadow-brand-500/40">
            <Icon name="play" className="h-5 w-5" />
          </span>
          Tap to hear {name}
        </button>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-xs text-white backdrop-blur-md">
        <Icon name="mic" className={`h-3.5 w-3.5 ${speaking ? "text-emerald-300" : "text-slate-300"}`} />
        <span className="truncate font-medium drop-shadow">{name}</span>
        <span className="shrink-0 rounded bg-sky-500/80 px-1 text-[10px] font-semibold uppercase tracking-wide">AI teacher</span>
      </div>
      {onPin && (
        <button
          onClick={() => onPin(pinned ? null : tile.key)}
          title={pinned ? "Unpin" : "Pin to the main stage"}
          className={`absolute right-2 top-2 rounded-lg bg-black/50 p-1.5 text-white backdrop-blur transition ${pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <Icon name={pinned ? "x" : "maximize"} className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
