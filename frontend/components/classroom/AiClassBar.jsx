"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icons";

const PREP = {
  planning: "is writing today's lesson",
  voice: "is recording the lesson",
  face: "is getting ready on camera",
  ready: "is ready",
};

const at = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Ticks every second while mounted, in server time. */
function useNow(clock) {
  const [now, setNow] = useState(() => Date.now() + clock.current);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clock.current), 1000);
    return () => clearInterval(id);
  }, [clock]);
  return now;
}

/**
 * What the AI teacher is doing, above the editor: getting ready (before
 * class), a question for the class with a countdown, or live captions.
 */
export default function AiClassBar({ ai, clock, showCaption, onAnswer }) {
  const now = useNow(clock);
  if (!ai) return null;
  const name = ai.name || "The teacher";

  if (ai.stage === "failed") {
    return (
      <Bar tone="rose" icon="alert-triangle">
        {name} ran into a technical problem and had to stop the class. Sorry about that!
      </Bar>
    );
  }
  if (ai.stage === "ended" && !ai.current) {
    return (
      <Bar tone="emerald" icon="check-circle">
        That&apos;s the end of today&apos;s class. Your homework is in the chat.
      </Bar>
    );
  }
  if (ai.ask) {
    const left = Math.max(0, Math.round((ai.ask.until - now) / 1000));
    return (
      <Bar tone="amber" icon="help-circle">
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-amber-100">{name} asks: </span>
          {ai.ask.question}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-amber-200">{left}s</span>
        <button className="btn-soft btn-sm shrink-0" onClick={onAnswer}>
          <Icon name="message-circle" className="h-3.5 w-3.5" /> Answer in chat
        </button>
      </Bar>
    );
  }
  if (PREP[ai.stage]) {
    const starts = new Date(ai.startsAt).getTime();
    const mins = Math.ceil((starts - now) / 60_000);
    const { done, total } = ai.progress || {};
    const pct = ai.stage === "face" && total ? Math.round((done / total) * 100) : null;
    return (
      <Bar tone="sky" icon="clock">
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-sky-100">{starts > now ? `Class starts at ${at(starts)}${mins <= 60 ? ` (in ${mins} min)` : ""}` : "Starting in a moment"}. </span>
          {name} {PREP[ai.stage]}
          {pct != null && ` (${pct}%)`}…
        </span>
        {pct != null && (
          <span className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-white/10 sm:block">
            <span className="block h-full rounded-full bg-sky-400 transition-all" style={{ width: `${pct}%` }} />
          </span>
        )}
      </Bar>
    );
  }
  if (showCaption && ai.current?.text) {
    return (
      <Bar tone="slate" icon="mic">
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-white">{name}: </span>
          {ai.current.text}
        </span>
      </Bar>
    );
  }
  return null;
}

function Bar({ tone, icon, children }) {
  const tones = {
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-100",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-50",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-50",
    slate: "border-white/[0.08] bg-ink-900/80 text-slate-200",
  };
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${tones[tone]}`} role="status" aria-live="polite">
      <Icon name={icon} className="h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}
