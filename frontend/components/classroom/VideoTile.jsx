"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import Icon from "@/components/Icons";

/** One person (or one shared screen) in the call. */
export default function VideoTile({ tile, big = false, pinned = false, onPin, className = "" }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const { stream, local, isScreen, cam, mic, speaking, name, user, isTeacher, state } = tile;
  const showVideo = isScreen || cam;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream || null;
    const play = () => v.play().then(() => setBlocked(false)).catch(() => setBlocked(!local));
    play();
    v.addEventListener("loadedmetadata", play);
    return () => v.removeEventListener("loadedmetadata", play);
    // mic is a dependency because unmuting can pause playback until the viewer clicks.
  }, [stream, local, showVideo, mic]);

  const connecting = !local && state && state !== "connected" && state !== "completed";

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-ink-950 shadow-card ring-1 ring-inset transition ${
        speaking && !isScreen ? "ring-2 ring-emerald-400" : pinned ? "ring-brand-500/60" : "ring-white/[0.08]"
      } ${className}`}
    >
      {/* A remote person whose voice is off (or not allowed) is never played. */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={local || (!isScreen && !mic)}
        className={`h-full w-full ${isScreen ? "object-contain" : "object-cover"} ${local && !isScreen ? "[transform:scaleX(-1)]" : ""} ${showVideo ? "" : "invisible"}`}
      />
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.10),transparent_65%)] bg-ink-900">
          <span className={`rounded-full transition ${speaking ? "shadow-[0_0_0_6px_rgba(52,211,153,0.25)]" : ""}`}>
            <Avatar user={user} size={big ? 96 : 44} ring={speaking} />
          </span>
          {big && <span className="text-sm font-medium text-slate-300">{local ? "You" : name}</span>}
        </div>
      )}
      {connecting && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-950/60 text-xs text-slate-300">
          <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" /> Connecting…
        </div>
      )}
      {blocked && (
        <button
          onClick={() => ref.current?.play().then(() => setBlocked(false)).catch(() => {})}
          className="absolute inset-0 flex items-center justify-center bg-ink-950/70 text-sm font-medium text-white"
        >
          <Icon name="play" className="mr-2 h-4 w-4" /> Tap to play
        </button>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-xs text-white backdrop-blur-md">
        {isScreen ? (
          <Icon name="monitor" className="h-3.5 w-3.5 text-sky-300" />
        ) : mic ? (
          <Icon name="mic" className={`h-3.5 w-3.5 ${speaking ? "text-emerald-300" : "text-slate-300"}`} />
        ) : (
          <Icon name="mic-off" className="h-3.5 w-3.5 text-rose-300" />
        )}
        <span className="truncate font-medium drop-shadow">{name}</span>
        {isTeacher && !isScreen && <span className="shrink-0 rounded bg-brand-500/80 px-1 text-[10px] font-semibold uppercase tracking-wide">Host</span>}
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
