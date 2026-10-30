"use client";

import { useEffect, useRef, useState } from "react";
import Confetti from "./Confetti";
import * as sfx from "./sound";

const MEDAL = {
  1: { label: "Champion", ring: "from-amber-200 via-yellow-400 to-amber-600", text: "qz-gold", height: "h-48 sm:h-64", glow: "shadow-[0_0_80px_10px_rgba(251,191,36,0.45)]" },
  2: { label: "2nd place", ring: "from-slate-100 via-slate-300 to-slate-500", text: "qz-silver", height: "h-36 sm:h-48", glow: "shadow-[0_0_60px_6px_rgba(203,213,225,0.35)]" },
  3: { label: "3rd place", ring: "from-orange-300 via-amber-700 to-orange-900", text: "qz-bronze", height: "h-28 sm:h-36", glow: "shadow-[0_0_60px_6px_rgba(217,119,6,0.35)]" },
};

/**
 * The winner show, WWE style: lights down, spotlights, a drumroll before each
 * reveal, then 3rd, 2nd and 1st slam onto the podium, the champion last with a
 * fanfare and confetti. Every screen runs the same timeline from `finaleAt`
 * (server time), so the whole room gasps at the same moment.
 */
export default function Finale({ state, clock, you, host }) {
  const podium = state.podium || [];
  // Reveal order: 3rd, 2nd, then the champion. Fewer players, fewer reveals.
  const order = [3, 2, 1].filter((r) => podium.some((p) => p.rank === r));
  const steps = [];
  let t = 3500;
  for (const r of order) {
    const roll = r === 1 ? 3500 : 2500;
    steps.push({ rank: r, rollAt: t - roll, at: t });
    t += r === 1 ? 4000 : 4500;
  }
  const listAt = (steps.at(-1)?.at ?? 2000) + 3500;

  const [now, setNow] = useState(() => Date.now() + clock.current);
  const fired = useRef(new Set());
  const mountedAt = useRef(Date.now() + clock.current);
  const [burst, setBurst] = useState(0);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clock.current), 50);
    return () => clearInterval(id);
  }, [clock]);

  const elapsed = now - state.finaleAt;
  const revealed = (r) => steps.find((s) => s.rank === r && elapsed >= s.at);
  const champ = elapsed >= (steps.find((s) => s.rank === 1)?.at ?? Infinity);

  // Sounds and confetti fire once, when their moment passes (not for moments
  // that were already over when this screen opened).
  useEffect(() => {
    const once = (key, at, fn) => {
      if (elapsed < at || fired.current.has(key)) return;
      fired.current.add(key);
      if (mountedAt.current - state.finaleAt <= at + 400) fn();
    };
    once("intro", 0, () => sfx.drumroll(1.2));
    for (const s of steps) {
      once(`roll${s.rank}`, s.rollAt, () => sfx.drumroll((s.at - s.rollAt) / 1000));
      once(`hit${s.rank}`, s.at, () => {
        sfx.impact(s.rank === 1);
        if (s.rank === 1) {
          setTimeout(() => sfx.fanfare(), 250);
          setBurst((b) => b + 1);
          setTimeout(() => setBurst((b) => b + 1), 900);
        }
      });
    }
  });

  const slot = (rank) => {
    const p = podium.find((x) => x.rank === rank);
    const m = MEDAL[rank];
    const shown = !!p && !!revealed(rank);
    return (
      <div className={`flex w-1/3 max-w-[15rem] flex-col items-center ${rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3"}`}>
        <div className={`relative mb-3 flex w-full flex-col items-center ${shown ? "qz-slam" : "opacity-0"}`}>
          {rank === 1 && shown && <Crown />}
          <span className={`rounded-full bg-gradient-to-br p-1 ${m.ring} ${shown ? m.glow : ""}`}>
            <Face user={p} size={narrow ? (rank === 1 ? 80 : 60) : rank === 1 ? 128 : 96} />
          </span>
          <span className={`mt-3 w-full truncate px-1 text-center text-sm font-black uppercase tracking-wide sm:text-xl ${m.text}`}>{p?.name || p?.username}</span>
          <span className="text-sm font-semibold tabular-nums text-white/80">{p?.score?.toLocaleString()} pts</span>
        </div>
        <div className={`qz-podium relative flex w-full items-start justify-center rounded-t-xl ${m.height} ${p ? "" : "opacity-30"}`} data-rank={rank}>
          <span className={`mt-3 text-4xl font-black sm:text-6xl ${m.text}`}>{rank}</span>
          <span className="absolute bottom-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white/60 sm:text-xs">{m.label}</span>
        </div>
      </div>
    );
  };

  const mine = you && !host && you.rank;

  return (
    <div className={`qz-stage fixed inset-0 z-50 flex flex-col overflow-y-auto ${champ ? "qz-lights-up" : ""}`} role="dialog" aria-label="Quiz winners">
      <div className="qz-spot qz-spot-l" aria-hidden />
      <div className="qz-spot qz-spot-r" aria-hidden />
      {steps.some((s) => elapsed >= s.at && elapsed < s.at + 350) && <div className="qz-flash" aria-hidden />}
      <Confetti burst={burst} rain={champ} />

      <div className={`relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 pb-10 pt-[max(2rem,env(safe-area-inset-top))] ${steps.some((s) => elapsed >= s.at && elapsed < s.at + 500) ? "qz-shake" : ""}`}>
        <p className="text-xs font-bold uppercase tracking-[0.4em] text-amber-200/80">{state.title}</p>
        <h2 className={`mt-3 text-center text-3xl font-black uppercase tracking-tight sm:text-5xl ${champ ? "qz-gold qz-pulse" : "text-white"}`}>
          {champ ? "We have a champion!" : podium.length ? "And the winners are…" : "Nobody played this time"}
        </h2>

        <div className="mt-auto flex w-full items-end justify-center gap-2 pt-10 sm:gap-4">
          {slot(2)}
          {slot(1)}
          {slot(3)}
        </div>

        {elapsed >= listAt && (
          <div className="mt-8 w-full max-w-xl animate-fade-up">
            {mine && (
              <p className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-center text-lg font-bold text-amber-100">
                You finished <span className="qz-gold text-2xl">#{you.rank}</span> of {you.players} with {you.score.toLocaleString()} points
              </p>
            )}
            <ol className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur">
              {(state.top || []).map((p) => (
                <li key={p.userId} className={`flex items-center gap-3 px-4 py-2.5 ${you && p.userId === you.userId ? "bg-amber-400/10" : ""}`}>
                  <span className="w-6 text-right font-black tabular-nums text-white/60">{p.rank}</span>
                  <Face user={p} size={32} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-white">{p.name || p.username}</span>
                  <span className="text-xs text-white/50">{p.correct} right</span>
                  <span className="w-20 text-right font-bold tabular-nums text-amber-200">{p.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/** A player's photo, or their initial on a gradient. */
export function Face({ user, size = 40 }) {
  const letter = (user?.name || user?.username || "?")[0].toUpperCase();
  if (user?.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt="" className="block rounded-full bg-ink-900 object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 via-indigo-500 to-accent-500 font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}

function Crown() {
  return (
    <svg viewBox="0 0 64 40" className="qz-crown absolute -top-9 h-10 w-16 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)] sm:-top-11 sm:h-12 sm:w-20" aria-hidden>
      <defs>
        <linearGradient id="qz-crown-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <path d="M4 36 L8 10 L22 24 L32 4 L42 24 L56 10 L60 36 Z" fill="url(#qz-crown-g)" stroke="#fef3c7" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="32" cy="4" r="3.5" fill="#fef3c7" />
      <circle cx="8" cy="10" r="3" fill="#fef3c7" />
      <circle cx="56" cy="10" r="3" fill="#fef3c7" />
    </svg>
  );
}
