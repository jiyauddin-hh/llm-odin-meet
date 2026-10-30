"use client";

// One view per animation template, drawn for the ~330×290 stage of the
// 400×711 reel canvas. Each receives the current step, the previous step (to
// animate what changed) and the template settings.

const cellBase = "flex items-center justify-center rounded-xl border-2 font-mono font-bold transition-all duration-500 ease-out";
const panel = "rounded-2xl border border-white/10 bg-[#0d1117]/85 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur";

/* ---------- code: a program walkthrough ---------- */
export function CodeView({ anim, step, prev }) {
  const lines = anim.code.split("\n");
  const vars = Object.entries(step.vars || {});
  const out = step.output;
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`${panel} p-3 font-mono text-[14px] leading-[1.65]`}>
        <div className="mb-1.5 flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        {lines.map((l, i) => {
          const on = step.line === i + 1;
          return (
            <div
              key={i}
              className={`flex gap-2.5 rounded-lg px-2 transition-all duration-500 ${on ? "bg-gradient-to-r from-violet-500/45 to-fuchsia-500/10 shadow-[0_0_18px_rgba(139,92,246,0.45)]" : ""}`}
            >
              <span className={`w-4 shrink-0 select-none text-right ${on ? "text-amber-300" : "text-slate-600"}`}>{on ? "▶" : i + 1}</span>
              <span className={`whitespace-pre ${on ? "text-white" : "text-slate-300"}`}>{l || " "}</span>
            </div>
          );
        })}
      </div>
      {(vars.length > 0 || out !== undefined) && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className={`${panel} p-2.5`}>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-sky-300/80">Variables</div>
            <div className="flex flex-wrap gap-1.5">
              {vars.map(([name, value]) => {
                const changed = prev?.vars?.[name] !== value;
                return (
                  <span key={`${name}-${value}`} className={`rounded-lg border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 font-mono text-[13px] ${changed ? "reel-pop reel-flash" : ""}`}>
                    <span className="text-sky-300">{name}</span>
                    <span className="text-slate-500">=</span>
                    <span className="text-white">{value}</span>
                  </span>
                );
              })}
              {vars.length === 0 && <span className="text-[12px] text-slate-600">—</span>}
            </div>
          </div>
          <div className={`${panel} bg-black/70 p-2.5`}>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300/80">Output</div>
            <div className="font-mono text-[13px] leading-snug text-emerald-300">
              {(out || "").split("\n").slice(-4).map((l, i, all) => (
                <div key={`${i}-${l}`} className={i === all.length - 1 && out !== prev?.output ? "reel-fade-up" : ""}>
                  {l || " "}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- array: boxes or bars that move ---------- */

/** Stable identities per cell so swapped values slide to their new place. */
export function arrayIds(steps) {
  let ids = steps[0].array.map((_, i) => i);
  let next = ids.length;
  return steps.map((s, k) => {
    if (k > 0) {
      ids = ids.slice(0, s.array.length);
      while (ids.length < s.array.length) ids.push(next++);
      if (s.swap) {
        const [a, b] = s.swap;
        [ids[a], ids[b]] = [ids[b], ids[a]];
      }
    }
    return ids.slice();
  });
}

export function ArrayView({ anim, step, ids }) {
  const n = step.array.length;
  const gap = 7;
  const Wc = Math.max(20, Math.min(58, Math.floor((310 + gap) / Math.max(n, 1)) - gap));
  const nums = step.array.filter((v) => typeof v === "number");
  const max = Math.max(1, ...nums.map(Math.abs));
  const hi = new Set(step.highlight || []);
  const done = new Set(step.done || []);
  const pointers = Object.entries(step.pointers || {});
  const inRange = (i) => !step.range || (i >= step.range[0] && i <= step.range[1]);
  const width = n * (Wc + gap) - gap;
  const barMax = 190;

  return (
    <div className="flex flex-col items-center py-2">
      <div className="relative" style={{ width, height: anim.bars ? barMax + 26 : Wc + 26 }}>
        {step.array.map((v, i) => {
          const style = done.has(i)
            ? "border-emerald-300 bg-gradient-to-b from-emerald-400/60 to-emerald-600/40 text-white shadow-[0_0_16px_rgba(52,211,153,0.5)]"
            : hi.has(i)
              ? "reel-glow border-amber-300 bg-gradient-to-b from-amber-300/70 to-orange-500/50 text-white -translate-y-1.5"
              : "border-white/20 bg-gradient-to-b from-slate-700/80 to-slate-800/80 text-slate-100";
          return (
            <div key={ids[i]} className="absolute bottom-6 transition-all duration-500 ease-out" style={{ left: i * (Wc + gap), width: Wc, opacity: inRange(i) ? 1 : 0.18 }}>
              <div
                className={`${cellBase} ${style} ${Wc < 34 ? "text-[12px]" : "text-[17px]"} ${anim.bars ? "items-end pb-1.5" : ""}`}
                style={{ height: anim.bars ? Math.max(22, (Math.abs(Number(v)) / max) * barMax) : Wc }}
              >
                {v}
              </div>
              <div className="mt-1 text-center font-mono text-[10px] text-white/40">{i}</div>
            </div>
          );
        })}
      </div>
      <div className="relative mt-1 h-11" style={{ width }}>
        {pointers.map(([label, i], k) => (
          <div key={label} className="absolute flex flex-col items-center transition-all duration-500 ease-out" style={{ left: i * (Wc + gap), width: Wc, top: (k % 2) * 18 }}>
            <span className="text-[13px] leading-none text-fuchsia-300">▲</span>
            <span className="rounded bg-fuchsia-500/25 px-1 font-mono text-[12px] font-bold text-fuchsia-200">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- stack / queue / call stack ---------- */
export function StackView({ anim, step }) {
  const queue = anim.mode === "queue";
  const calls = anim.mode === "calls";
  const label = { stack: "Stack · last in, first out", queue: "Queue · first in, first out", calls: "Call stack" }[anim.mode];
  const items = step.items.map((it, i) => ({ it, key: `${i}-${it}` }));
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">{label}</div>
      <div className="relative">
        {step.popped && (
          <div
            key={`p-${step.popped}-${step.caption}`}
            className="reel-float-away absolute -top-12 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl border-2 border-rose-300 bg-rose-500/50 px-4 py-2 font-mono text-[16px] font-bold text-white shadow-[0_0_20px_rgba(244,63,94,0.6)]"
          >
            {step.popped}
          </div>
        )}
        <div
          className={
            queue
              ? "flex min-h-[70px] min-w-[260px] items-center gap-2 rounded-2xl border-2 border-dashed border-white/25 bg-white/5 p-2.5"
              : "flex min-h-[210px] w-60 flex-col-reverse gap-2 rounded-b-2xl border-[3px] border-t-0 border-white/30 bg-white/5 p-2.5"
          }
        >
          {items.map(({ it, key }, i) => {
            const top = queue ? i === 0 : i === items.length - 1;
            return (
              <div
                key={key}
                className={`reel-pop rounded-xl border-2 px-3 py-2 text-center font-mono text-[16px] font-bold ${
                  top
                    ? calls
                      ? "border-violet-300 bg-gradient-to-r from-violet-500/60 to-fuchsia-500/40 text-white shadow-[0_0_18px_rgba(139,92,246,0.5)]"
                      : "border-amber-300 bg-gradient-to-r from-amber-400/60 to-orange-500/40 text-white shadow-[0_0_18px_rgba(251,191,36,0.45)]"
                    : "border-white/20 bg-slate-800/80 text-slate-100"
                }`}
              >
                {it}
              </div>
            );
          })}
          {items.length === 0 && <div className="py-6 text-center text-[13px] text-white/30">empty</div>}
        </div>
      </div>
      {queue && items.length > 0 && (
        <div className="flex w-full max-w-[270px] justify-between text-[11px] font-semibold text-white/45">
          <span>⬅ front leaves first</span>
          <span>back</span>
        </div>
      )}
    </div>
  );
}

/* ---------- dictionary ---------- */
export function DictView({ step, prev }) {
  const before = new Map(prev?.entries || []);
  return (
    <div className="flex justify-center py-2">
      <div className={`${panel} w-full max-w-[300px] overflow-hidden p-0`}>
        <div className="grid grid-cols-[1fr_auto_1fr] bg-gradient-to-r from-sky-500/25 to-violet-500/25 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
          <span>key</span>
          <span />
          <span className="text-right">value</span>
        </div>
        {step.entries.map(([k, v]) => {
          const isNew = !before.has(k);
          const changed = !isNew && before.get(k) !== v;
          return (
            <div
              key={`${k}-${v}`}
              className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-white/10 px-4 py-2 font-mono text-[16px] transition-colors duration-500 ${
                step.highlight === k ? "bg-amber-400/25 shadow-[inset_4px_0_0_rgba(251,191,36,0.9)]" : ""
              } ${isNew ? "reel-fade-up" : changed ? "reel-flash" : ""}`}
            >
              <span className="font-bold text-sky-300">{k}</span>
              <span className="text-white/40">→</span>
              <span className="text-right font-bold text-white">{v}</span>
            </div>
          );
        })}
        {step.entries.length === 0 && <div className="border-t border-white/10 py-5 text-center text-[13px] text-white/30">{"{ }"} empty</div>}
      </div>
    </div>
  );
}

/* ---------- slides ---------- */
export function SlidesView({ step }) {
  return (
    <div key={step.caption} className="flex flex-col items-center justify-center gap-4 py-2 text-center">
      {step.title && <h3 className="reel-pop bg-gradient-to-r from-white via-cyan-100 to-fuchsia-200 bg-clip-text text-[30px] font-black leading-tight text-transparent">{step.title}</h3>}
      {step.body && (
        <p className="reel-fade-up text-[17px] font-medium leading-relaxed text-white/85" style={{ animationDelay: "0.15s" }}>
          {step.body}
        </p>
      )}
      {step.code && (
        <pre className={`${panel} reel-fade-up w-full overflow-hidden p-3 text-left font-mono text-[14px] text-slate-100`} style={{ animationDelay: "0.3s" }}>
          {step.code}
        </pre>
      )}
    </div>
  );
}
