"use client";

// Timing for the daily live test. The server's clock is the truth, so the
// countdowns use the offset between it and this device.
import { useEffect, useState } from "react";

export function serverOffset(serverNow) {
  return new Date(serverNow).getTime() - Date.now();
}

/** Server time, ticking every `ms`. */
export function useNow(offset = 0, ms = 250) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const id = setInterval(() => setNow(Date.now() + offset), ms);
    return () => clearInterval(id);
  }, [offset, ms]);
  return now;
}

export function parts(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, total: s };
}

const pad = (n) => String(n).padStart(2, "0");

export function clock(msLeft) {
  const { h, m, s } = parts(msLeft);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function duration(ms) {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${pad(s % 60)}s` : `${s}s`;
}

export function timeOfDay(d) {
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Today", "Tomorrow" or a date. */
export function dayLabel(d, now = Date.now()) {
  const day = (x) => new Date(x).toDateString();
  if (day(d) === day(now)) return "Today";
  if (day(d) === day(now + 86_400_000)) return "Tomorrow";
  return new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Big flip-style HH : MM : SS digits. The seconds tile pops each tick. */
export function CountdownDigits({ msLeft, tone = "brand", size = "lg" }) {
  const { h, m, s } = parts(msLeft);
  const units = [
    ...(h ? [[h, "hours"]] : []),
    [m, "min"],
    [s, "sec"],
  ];
  const tones = {
    brand: "border-brand-500/40 from-brand-600/30 to-cyan-500/10 text-white",
    amber: "border-amber-400/50 from-amber-500/30 to-orange-500/10 text-amber-50",
    red: "border-rose-400/60 from-rose-600/40 to-rose-500/10 text-rose-50",
  };
  const big = size === "lg";
  return (
    <div className="flex items-start justify-center gap-2 sm:gap-3" role="timer" aria-live="off">
      {units.map(([v, label], i) => (
        <div key={label} className="flex items-start gap-2 sm:gap-3">
          {i > 0 && <span className={`${big ? "pt-3 text-3xl sm:text-5xl" : "pt-1 text-2xl"} font-bold text-slate-500`}>:</span>}
          <div className="text-center">
            <div
              key={label === "sec" ? v : undefined}
              className={`rounded-xl border bg-gradient-to-b font-mono font-bold tabular-nums shadow-lg ${tones[tone]} ${
                big ? "min-w-[4.5rem] px-3 py-2 text-4xl sm:min-w-[6rem] sm:text-6xl" : "min-w-[3.25rem] px-2 py-1 text-2xl sm:text-3xl"
              } ${label === "sec" ? "live-tick" : ""}`}
            >
              {pad(v)}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-400">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
