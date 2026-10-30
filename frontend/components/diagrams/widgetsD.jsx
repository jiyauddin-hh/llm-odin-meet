"use client";

// Interactive System Design teaching diagrams (set D). Each widget is rendered
// from a ```diagram fenced block in a lesson and receives optional JSON
// `params`. Everything is plain React + inline SVG with seeded (deterministic)
// data and simulation clocks that start at 0, so server and client renders
// match. Bad params are coerced/clamped, never thrown on.

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";

/* ---------- shared helpers ---------- */

const C = {
  brand: "#8b5cf6",
  brandL: "#a78bfa",
  amber: "#fbbf24",
  emerald: "#34d399",
  sky: "#38bdf8",
  fuchsia: "#e879f9",
  rose: "#fb7185",
  orange: "#fb923c",
  teal: "#2dd4bf",
  grid: "#191c2c",
  axis: "#363b56",
  text: "#94a3b8",
  dim: "#64748b",
  ink: "#0d0f1a",
  ink8: "#161a28",
  ink7: "#232a3d",
};
const EASE = "cubic-bezier(.4,0,.2,1)";

/** Small seeded PRNG so "random" data is identical on every render. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash (32-bit) with a final avalanche; `seed` gives independent hash functions. */
function fnv1a(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const lerp = (a, b, t) => a + (b - a) * t;

/** Params come from hand-written JSON: accept numbers or numeric strings, else the default. */
const num = (v, d) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : d;
};
const int = (v, d, lo, hi) => clamp(Math.round(num(v, d)), lo, hi);
/** Pick one of `opts` (case-insensitive, with aliases), else the default. */
const oneOf = (v, opts, d, aliases = {}) => {
  const k = String(v ?? "").toLowerCase().trim();
  const key = aliases[k] || k;
  return opts.includes(key) ? key : d;
};
/** The diagram block may contain any JSON (a number, an array, null…): only objects count. */
const safe = (p) => (p && typeof p === "object" && !Array.isArray(p) ? p : {});

/** Linear scale with an inverse, used for data ↔ pixel mapping. */
function scale(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.inv = (p) => d0 + ((p - r0) / (r1 - r0 || 1)) * (d1 - d0);
  return f;
}

/** Plot frame: viewBox size, padding and x/y scales. */
function plot(xd, yd, { w = 400, h = 260, l = 38, r = 12, t = 12, b = 28 } = {}) {
  const x0 = l, x1 = w - r, y0 = h - b, y1 = t;
  return { w, h, x0, x1, y0, y1, xd, yd, sx: scale(xd[0], xd[1], x0, x1), sy: scale(yd[0], yd[1], y0, y1) };
}

/** A "nice" axis maximum (1/2/2.5/5 × 10^k steps) and its ticks. */
function nice(v, steps = 4) {
  const raw = Math.max(v, 1e-9) / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw - 1e-9) || 10 * mag;
  return { max: step * steps, ticks: Array.from({ length: steps + 1 }, (_, i) => +(i * step).toFixed(6)) };
}

/** `n` values evenly spread around `center`, at most `gap` apart and within `span`. */
function spread(n, center, span, gap) {
  const g = n > 1 ? Math.min(gap, span / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => center + (i - (n - 1) / 2) * g);
}

/** A unique id that is safe inside url(#...). */
function useSvgId() {
  return "d" + useId().replace(/[^a-zA-Z0-9]/g, "");
}

/** Run fn every `ms` while `on` is true; cleaned up on stop/unmount. */
function useTicker(on, fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

/** Calls onFrame(dtSeconds) every animation frame while `on` (dt capped so a background tab can't jump). */
function useLoop(on, onFrame) {
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => {
    if (!on) return undefined;
    let raf, last = performance.now();
    const tick = (now) => {
      cb.current(Math.min(0.1, Math.max(0, (now - last) / 1000)));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}

/** setTimeout that is cancelled automatically on unmount. */
function useLater() {
  const ids = useRef(new Set());
  useEffect(() => {
    const set = ids.current;
    return () => set.forEach(clearTimeout);
  }, []);
  return useCallback((fn, ms) => {
    const id = setTimeout(() => {
      ids.current.delete(id);
      fn();
    }, ms);
    ids.current.add(id);
  }, []);
}

/** True while the element is (nearly) on screen, so live simulations idle when scrolled away. */
function useInView(ref) {
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return vis;
}

/** Grid lines, axis lines and tick labels. */
function Axes({ p, xticks = [], yticks = [], xlabel, ylabel, xfmt = (v) => v, yfmt = (v) => v }) {
  return (
    <g fontSize="10" fill={C.dim}>
      {yticks.map((v) => (
        <g key={`y${v}`}>
          <line x1={p.x0} x2={p.x1} y1={p.sy(v)} y2={p.sy(v)} stroke={C.grid} />
          <text x={p.x0 - 5} y={p.sy(v) + 3} textAnchor="end">{yfmt(v)}</text>
        </g>
      ))}
      {xticks.map((v) => (
        <g key={`x${v}`}>
          <line x1={p.sx(v)} x2={p.sx(v)} y1={p.y1} y2={p.y0} stroke={C.grid} />
          <text x={p.sx(v)} y={p.y0 + 13} textAnchor="middle">{xfmt(v)}</text>
        </g>
      ))}
      <line x1={p.x0} x2={p.x1} y1={p.y0} y2={p.y0} stroke={C.axis} />
      <line x1={p.x0} x2={p.x0} y1={p.y1} y2={p.y0} stroke={C.axis} />
      {xlabel && <text x={p.x1} y={p.y0 - 5} textAnchor="end" fill={C.text}>{xlabel}</text>}
      {ylabel && <text x={p.x0 + 5} y={p.y1 + 10} fill={C.text}>{ylabel}</text>}
    </g>
  );
}

/** Card wrapper shared by every widget (not-prose: it lives inside Markdown). */
function Card({ title, caption, params = {}, children }) {
  const P = safe(params);
  return (
    <figure className="not-prose my-6 mx-auto max-w-[640px] rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="mb-3 text-sm font-semibold text-white">{typeof P.title === "string" && P.title ? P.title : title}</div>
      {children}
      <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">{typeof P.caption === "string" && P.caption ? P.caption : caption}</figcaption>
    </figure>
  );
}

function Button({ primary, className = "", ...rest }) {
  const tone = primary ? "bg-brand-500 hover:bg-brand-600" : "bg-ink-700 hover:bg-ink-600";
  return <button type="button" className={`rounded-md px-3 py-1 text-xs text-white transition-colors disabled:opacity-40 ${tone} ${className}`} {...rest} />;
}

function Slider({ label, value, min, max, step = 0.01, onChange, display }) {
  return (
    <label className="flex min-w-[150px] flex-1 items-center gap-2 text-xs text-slate-400">
      <span className="shrink-0">{label}</span>
      <input type="range" className="w-full accent-brand-500" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-12 shrink-0 text-right font-mono text-slate-200">{display ?? value}</span>
    </label>
  );
}

function Stat({ label, value, color = "text-slate-200" }) {
  return (
    <span className="rounded-md bg-ink-800 px-2 py-0.5 font-mono text-xs">
      <span className="text-slate-500">{label} </span>
      <span className={color}>{value}</span>
    </span>
  );
}

const Row = ({ children, className = "" }) => <div className={`mt-3 flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;

/** Row of mutually exclusive option buttons. */
function Choice({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, label]) => (
        <Button key={k} primary={k === value} onClick={() => onChange(k)}>{label}</Button>
      ))}
    </div>
  );
}

/** Legend swatch for HTML legends under charts. */
const Key = ({ color, children, line }) => (
  <span className="flex items-center gap-1">
    <span className={line ? "h-0.5 w-3" : "h-2.5 w-2.5 rounded-sm"} style={{ background: color }} />
    {children}
  </span>
);

/** Arrowhead marker definition. */
function Arrow({ id, color }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  );
}

/** Soft glow filter for "hot" / highlighted shapes. */
function Glow({ id, sd = 4 }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation={sd} />
    </filter>
  );
}

/** A dot that glides from `from` to `to` over `ms` once mounted (key it to replay). */
function Packet({ from, to, ms = 600, color, r = 5, label }) {
  const [at, setAt] = useState(from);
  useEffect(() => {
    let b;
    const a = requestAnimationFrame(() => (b = requestAnimationFrame(() => setAt(to))));
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <g style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: `transform ${ms}ms ${EASE}` }}>
      <circle r={r} fill={color} stroke="#fff" strokeWidth="1" />
      {label && <text y={-r - 3} textAnchor="middle" fontSize="9" fill={color}>{label}</text>}
    </g>
  );
}

/* ====================================================================== */
/* 1. sharding: range vs hash vs directory partitioning                    */
/* ====================================================================== */

// Deliberately skewed first letters (lots of A, J, M, S) — real names cluster too.
const SH_NAMES = [
  "Aaron", "Abby", "Adam", "Aiden", "Aisha", "Alex", "Alice", "Amir", "Ana", "Anya", "Arjun", "Ava",
  "Ben", "Carlos", "Chen", "Chloe", "Dan", "Diego", "Emma", "Eli", "Finn", "Grace", "Hana", "Ivan",
  "Jack", "Jade", "James", "Jin", "John", "Jose", "Julia", "Juan", "Kai", "Kim", "Leo", "Liam", "Lucy",
  "Maria", "Mark", "Maya", "Mia", "Mike", "Mohammed", "Max", "Mei", "Nina", "Noah", "Omar", "Priya",
  "Raj", "Rosa", "Sam", "Sara", "Sofia", "Sean", "Sana", "Sid", "Sophie", "Steve", "Uma", "Wei", "Yuki", "Zoe",
];
const SH_PAL = [C.sky, C.emerald, C.amber, C.fuchsia, C.brandL, C.orange, C.teal, "#f472b6", "#a3e635"];
const SH_STRATS = ["range", "hash", "directory"];
const SH_MAX = 8;

function makeUsers(seed) {
  const rnd = mulberry32(seed);
  const pool = [...SH_NAMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const ids = new Set([1989]);
  const users = pool.slice(0, 39).map((name) => {
    let id;
    do id = 1000 + Math.floor(rnd() * 9000);
    while (ids.has(id));
    ids.add(id);
    return { id, name, traffic: 1 + Math.round(rnd() * 3) };
  });
  // The celebrity: one key that gets as much traffic as ~30 normal users together.
  users.push({ id: 1989, name: "Taylor", traffic: 80, hot: true });
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

const letterIdx = (u) => clamp(u.name.toUpperCase().charCodeAt(0) - 65, 0, 25);
const rangeShard = (u, n) => Math.floor((letterIdx(u) * n) / 26);
const hashShard = (u, n) => fnv1a(`user:${u.id}`) % n;
/** Letter span owned by shard s under range partitioning, e.g. "A–F". */
function rangeLabel(s, n) {
  const ls = [];
  for (let L = 0; L < 26; L++) if (Math.floor((L * n) / 26) === s) ls.push(String.fromCharCode(65 + L));
  return ls.length ? `${ls[0]}–${ls[ls.length - 1]}` : "—";
}
/** Directory: a lookup table; new keys go round-robin so shards start balanced. */
const dirInit = (count, n) => Array.from({ length: count }, (_, i) => i % n);
/** Adding a shard to a directory only moves enough keys to fill the new shard. */
function dirGrow(map, n) {
  const m = [...map];
  const target = Math.floor(m.length / (n + 1));
  const moved = [];
  for (let k = 0; k < target; k++) {
    const counts = new Array(n).fill(0);
    m.forEach((s) => s < n && counts[s]++);
    const big = counts.indexOf(Math.max(...counts));
    const i = m.lastIndexOf(big);
    if (i < 0) break;
    m[i] = n;
    moved.push(i);
  }
  return { map: m, moved };
}

/** Small bar chart (one bar per shard) with a dashed "perfectly even" line. */
function ShardBars({ title, values, colors, hot = [], unit }) {
  const n = values.length;
  const total = values.reduce((a, b) => a + b, 0);
  const even = total / Math.max(1, n);
  const ax = nice(Math.max(...values, even, 1) * 1.08, 3);
  const p = plot([0, n], [0, ax.max], { w: 256, h: 150, l: 32, r: 6, t: 20, b: 22 });
  const bw = ((p.x1 - p.x0) / n) * 0.7;
  return (
    <svg viewBox={`0 0 ${p.w} ${p.h}`} className="w-full h-auto">
      <text x={p.x0} y={11} fontSize="10.5" fontWeight="600" fill={C.text}>{title}</text>
      <Axes p={p} yticks={ax.ticks} />
      {values.map((v, s) => {
        const x = p.sx(s + 0.5) - bw / 2;
        const isHot = hot[s];
        return (
          <g key={s}>
            {isHot && <rect x={x - 2} y={p.sy(v) - 2} width={bw + 4} height={p.y0 - p.sy(v) + 2} fill={C.rose} opacity="0.35" rx="3" style={{ filter: "blur(3px)" }} />}
            <rect x={x} y={p.sy(v)} width={bw} height={p.y0 - p.sy(v)} rx="2" fill={isHot ? C.rose : colors[s]} opacity={isHot ? 1 : 0.85} style={{ transition: `y 500ms ${EASE}, height 500ms ${EASE}` }} />
            <text x={x + bw / 2} y={p.sy(v) - 3} textAnchor="middle" fontSize="9" fill={isHot ? C.rose : C.text}>{v}</text>
            <text x={x + bw / 2} y={p.y0 + 13} textAnchor="middle" fontSize="9.5" fill={C.dim}>S{s}</text>
          </g>
        );
      })}
      <line x1={p.x0} x2={p.x1} y1={p.sy(even)} y2={p.sy(even)} stroke={C.text} strokeDasharray="4 3" strokeOpacity="0.7" />
      <text x={p.x1} y={p.sy(even) - 3} textAnchor="end" fontSize="8.5" fill={C.text}>even = {fmt(even, 1)}{unit}</text>
    </svg>
  );
}

export function Sharding({ params = {} }) {
  const P = safe(params);
  const seed = int(P.seed, 3, 0, 1e9);
  const users = useMemo(() => makeUsers(seed), [seed]);
  const [strategy, setStrategy] = useState(oneOf(P.strategy, SH_STRATS, "hash", { lookup: "directory", dir: "directory", hashing: "hash", ranged: "range" }));
  const [n, setN] = useState(int(P.shards, 4, 2, SH_MAX));
  const [dir, setDir] = useState(() => dirInit(users.length, int(P.shards, 4, 2, SH_MAX)));
  const [report, setReport] = useState(null); // last reshard: counts + who moved
  const id = useSvgId();

  const shardOf = (u, i) =>
    strategy === "range" ? rangeShard(u, n) : strategy === "hash" ? hashShard(u, n) : clamp(dir[i] ?? i % n, 0, n - 1);
  const assign = users.map(shardOf);
  const byShard = Array.from({ length: n }, () => []);
  assign.forEach((s, i) => byShard[s].push(i));
  const rows = byShard.map((a) => a.length);
  const traffic = byShard.map((a) => a.reduce((t, i) => t + users[i].traffic, 0));
  const avgT = traffic.reduce((a, b) => a + b, 0) / n;
  const hot = traffic.map((t) => t > 1.5 * avgT);

  // Which records moved in the last reshard, for the strategy now on screen.
  const movedIds = useMemo(() => {
    if (!report || report.to !== n) return new Set();
    if (strategy === "directory") return new Set(report.dirMoved.map((i) => users[i].id));
    const f = strategy === "range" ? rangeShard : hashShard;
    return new Set(users.filter((u) => f(u, report.from) !== f(u, report.to)).map((u) => u.id));
  }, [report, n, strategy, users]);

  const changeN = (v) => {
    setN(v);
    setDir(dirInit(users.length, v));
    setReport(null);
  };
  const reshard = () => {
    if (n >= SH_MAX) return;
    const to = n + 1;
    const grown = dirGrow(dir, n);
    const moved = {
      range: users.filter((u) => rangeShard(u, n) !== rangeShard(u, to)).length,
      hash: users.filter((u) => hashShard(u, n) !== hashShard(u, to)).length,
      directory: grown.moved.length,
    };
    setDir(grown.map);
    setN(to);
    setReport({ from: n, to, moved, dirMoved: grown.moved });
  };

  // Layout: up to 4 shard boxes per row, records as name chips inside.
  const W = 520, PAD = 4, GAP = 8;
  const cols = Math.min(n, 4), boxRows = Math.ceil(n / 4);
  const boxW = (W - 2 * PAD - (cols - 1) * GAP) / cols;
  const chipCols = Math.max(2, Math.floor((boxW - 8) / 30));
  const chipW = (boxW - 8) / chipCols;
  const chipRows = Math.max(1, Math.ceil(Math.max(...rows, 1) / chipCols));
  const boxH = 26 + chipRows * 15 + 4;
  const H = PAD * 2 + boxRows * boxH + (boxRows - 1) * GAP;
  const boxAt = (s) => ({ x: PAD + (s % 4) * (boxW + GAP), y: PAD + Math.floor(s / 4) * (boxH + GAP) });
  const maxChars = Math.max(3, Math.floor((chipW - 6) / 4.6));
  const label = (s) => (strategy === "range" ? rangeLabel(s, n) : strategy === "hash" ? `h(id)%${n}=${s}` : "lookup");
  const STRAT_INFO = {
    range: "Keys are split by name ranges. Range scans are easy, but popular letters overload a shard.",
    hash: `shard = hash(id) % ${n}. Spreads keys evenly, but changing N remaps almost everything.`,
    directory: "A lookup table maps each key to a shard. Most flexible (move any key), but the table is extra state to keep fast and available.",
  };

  return (
    <Card
      title="Sharding a users table"
      params={P}
      caption="Switch strategies and compare the two bar charts: rows can be balanced while traffic is not — the celebrity key (red) makes its shard a hot spot no matter how you split. Press Reshard to add a shard and see how many records each strategy has to move."
    >
      <Choice options={[["range", "Range (A–F, G–L…)"], ["hash", "Hash (id % N)"], ["directory", "Directory / lookup"]]} value={strategy} onChange={setStrategy} />
      <p className="mt-2 text-xs text-slate-400">{STRAT_INFO[strategy]}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full h-auto" style={{ transition: "all 400ms" }}>
        <defs><Glow id={`${id}g`} sd={5} /></defs>
        {byShard.map((_, s) => {
          const b = boxAt(s);
          return (
            <g key={s}>
              {hot[s] && <rect x={b.x} y={b.y} width={boxW} height={boxH} rx="8" fill="none" stroke={C.rose} strokeWidth="5" opacity="0.7" filter={`url(#${id}g)`} />}
              <rect x={b.x} y={b.y} width={boxW} height={boxH} rx="8" fill={C.ink8} stroke={hot[s] ? C.rose : C.axis} strokeWidth={hot[s] ? 1.6 : 1} />
              <text x={b.x + 7} y={b.y + 15} fontSize="11" fontWeight="700" fill={SH_PAL[s]}>S{s}</text>
              <text x={b.x + 26} y={b.y + 15} fontSize="9" fill={C.text} fontFamily="ui-monospace, monospace">{label(s)}</text>
              {hot[s] && <text x={b.x + boxW - 6} y={b.y + 15} textAnchor="end" fontSize="9" fontWeight="700" fill={C.rose}>HOT</text>}
            </g>
          );
        })}
        {users.map((u, i) => {
          const s = assign[i];
          const j = byShard[s].indexOf(i);
          const b = boxAt(s);
          const x = b.x + 4 + (j % chipCols) * chipW, y = b.y + 24 + Math.floor(j / chipCols) * 15;
          const moved = movedIds.has(u.id);
          const col = u.hot ? C.rose : SH_PAL[s];
          return (
            <g key={u.id} style={{ transform: `translate(${x}px, ${y}px)`, transition: `transform 800ms ${EASE}` }}>
              <rect width={chipW - 3} height="13" rx="3" fill={col} fillOpacity={u.hot ? 0.9 : 0.16} stroke={moved ? C.amber : col} strokeWidth={moved ? 1.8 : 0.8} />
              <text x={(chipW - 3) / 2} y="9.5" textAnchor="middle" fontSize="8" fill={u.hot ? "#fff" : "#e2e8f0"} fontWeight={u.hot ? 700 : 400}>
                {u.name.length > maxChars ? u.name.slice(0, maxChars - 1) + "…" : u.name}
              </text>
            </g>
          );
        })}
      </svg>
      {strategy === "directory" && (
        <div className="mt-2 rounded-md bg-ink-800 px-2 py-1 font-mono text-[10.5px] leading-relaxed text-slate-400">
          <span className="text-slate-500">lookup table: </span>
          {users.slice(0, 7).map((u, i) => (
            <span key={u.id} className="mr-2">{u.name}→<span style={{ color: SH_PAL[assign[i]] }}>S{assign[i]}</span></span>
          ))}
          <span>… ({users.length} entries)</span>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-3">
        <ShardBars title="rows per shard" values={rows} colors={SH_PAL} />
        <ShardBars title="traffic per shard (req/s)" values={traffic} colors={SH_PAL} hot={hot} />
      </div>
      <Row>
        <Slider label="shards N" value={n} min={2} max={SH_MAX} step={1} onChange={changeN} display={n} />
        <Button primary onClick={reshard} disabled={n >= SH_MAX}>Reshard (+1 shard)</Button>
      </Row>
      {report && report.to === n && (
        <div className="mt-3 rounded-lg bg-ink-800 px-3 py-2 text-xs text-slate-400">
          <div className="mb-1.5 text-slate-200">
            Resharded {report.from} → {report.to}: records that had to move <span className="text-amber-300">(amber outline)</span>
          </div>
          {SH_STRATS.map((k) => {
            const m = report.moved[k];
            return (
              <div key={k} className="mb-1 flex items-center gap-2">
                <span className={`w-16 shrink-0 ${k === strategy ? "font-semibold text-white" : ""}`}>{k}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(m / users.length) * 100}%`, background: k === "hash" ? C.rose : k === "range" ? C.amber : C.emerald }} />
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-slate-200">{m}/{users.length} ({Math.round((m / users.length) * 100)}%)</span>
              </div>
            );
          })}
          <div className="mt-1 text-[11px] text-slate-500">
            hash % N moves about N/(N+1) of all keys — that is why real systems use consistent hashing (only ~1/(N+1) move).
          </div>
        </div>
      )}
    </Card>
  );
}

/* ====================================================================== */
/* 2. replication: leader/follower with sync, async and semi-sync acks     */
/* ====================================================================== */

const REP_MODES = ["sync", "semi-sync", "async"];
const REP_MULT = [1, 1, 1.8, 0.6, 1.35]; // per-node network/apply speed: some followers are slower
const REP_ACK = 0.35; // seconds for an ack to travel back
const REP_POS = { client: { x: 52, y: 115 }, leader: { x: 225, y: 115 }, fx: 438 };

function repInit(followers) {
  return {
    t: 0,
    epoch: 0,
    leader: 0,
    nodes: Array.from({ length: followers + 1 }, () => ({ val: 0, ver: 0, alive: true })),
    msgs: [],
    writes: [],
    nextVal: 1,
    failoverAt: null,
    note: null,
  };
}

function repWrite(s, mode, lag) {
  const L = s.leader;
  if (!s.nodes[L].alive || s.failoverAt != null) return s;
  const ver = s.nodes[L].ver + 1, val = s.nextVal;
  const nodes = s.nodes.map((nd, i) => (i === L ? { ...nd, ver, val } : nd));
  const fol = nodes.map((_, i) => i).filter((i) => i !== L && nodes[i].alive);
  const msgs = [...s.msgs, ...fol.map((i) => ({ kind: "rep", from: L, to: i, ver, val, epoch: s.epoch, t0: s.t, dur: lag * REP_MULT[i] }))];
  const need = mode === "sync" ? fol.length : mode === "semi-sync" ? Math.min(1, fol.length) : 0;
  const w = { ver, val, epoch: s.epoch, t0: s.t, need, acks: 0, mode, status: need ? "pending" : "acked", ackedAt: need ? null : s.t };
  return { ...s, nodes, msgs, writes: [...s.writes, w].slice(-10), nextVal: val + 1, note: null };
}

function repKill(s) {
  const L = s.leader;
  if (!s.nodes[L].alive || s.failoverAt != null || !s.nodes.some((nd, i) => i !== L && nd.alive)) return s;
  return {
    ...s,
    nodes: s.nodes.map((nd, i) => (i === L ? { ...nd, alive: false } : nd)),
    msgs: [], // whatever the leader had not shipped yet dies with it
    writes: s.writes.map((w) => (w.status === "pending" ? { ...w, status: "failed" } : w)),
    failoverAt: s.t + 1.2,
    note: { tone: "amber", text: "Leader crashed! Followers notice the missing heartbeats and elect a new leader…" },
  };
}

function repStep(s, dt, lag) {
  const t = s.t + dt;
  let nodes = s.nodes, writes = s.writes, msgs = [], note = s.note;
  for (const m of s.msgs) {
    if (t < m.t0 + m.dur) {
      msgs.push(m);
      continue;
    }
    if (m.epoch !== s.epoch) continue;
    if (m.kind === "rep") {
      if (!nodes[m.to].alive) continue;
      if (m.ver > nodes[m.to].ver) nodes = nodes.map((nd, i) => (i === m.to ? { ...nd, ver: m.ver, val: m.val } : nd));
      msgs.push({ kind: "ack", from: m.to, to: m.from, ver: m.ver, epoch: m.epoch, t0: t, dur: REP_ACK });
    } else {
      writes = writes.map((w) => {
        if (w.epoch !== m.epoch || w.ver !== m.ver || w.status !== "pending") return w;
        const acks = w.acks + 1;
        return acks >= w.need ? { ...w, acks, status: "acked", ackedAt: t } : { ...w, acks };
      });
    }
  }
  let { leader, epoch, failoverAt } = s;
  if (failoverAt != null && t >= failoverAt) {
    // Promote the most up-to-date surviving follower.
    const cands = nodes.map((nd, i) => ({ nd, i })).filter((c) => c.nd.alive && c.i !== leader);
    if (cands.length) {
      const best = cands.reduce((a, b) => (b.nd.ver > a.nd.ver ? b : a));
      const lost = writes.filter((w) => w.epoch === epoch && w.status === "acked" && w.ver > best.nd.ver);
      writes = writes.map((w) => (lost.includes(w) ? { ...w, status: "lost" } : w));
      leader = best.i;
      epoch += 1;
      // The new leader brings lagging followers up to date.
      cands.forEach((c) => {
        if (c.i !== leader && c.nd.ver < best.nd.ver)
          msgs.push({ kind: "rep", from: leader, to: c.i, ver: best.nd.ver, val: best.nd.val, epoch, t0: t, dur: lag * REP_MULT[c.i] });
      });
      note = lost.length
        ? { tone: "rose", text: `N${leader + 1} promoted (it had x = ${best.nd.val}). LOST acknowledged writes: ${lost.map((w) => `x=${w.val}`).join(", ")} — the client was told "OK" but the data is gone.` }
        : { tone: "emerald", text: `N${leader + 1} promoted (it had x = ${best.nd.val}). No acknowledged write was lost.` };
    }
    failoverAt = null;
  }
  return { ...s, t, nodes, msgs, writes, leader, epoch, failoverAt, note };
}

/** Where each node sits: leader in the middle, live followers on the right, dead nodes at the bottom. */
function repLayout(s) {
  const pos = {};
  const alive = [], dead = [];
  s.nodes.forEach((nd, i) => {
    if (i === s.leader && nd.alive) pos[i] = REP_POS.leader;
    else (nd.alive ? alive : dead).push(i);
  });
  spread(alive.length, 115, 172, 58).forEach((y, j) => (pos[alive[j]] = { x: REP_POS.fx, y }));
  dead.forEach((i, j) => (pos[i] = { x: 140 + j * 98, y: 214 }));
  return pos;
}

export function Replication({ params = {} }) {
  const P = safe(params);
  const [followers, setFollowers] = useState(int(P.followers, 2, 1, 4));
  const [mode, setMode] = useState(oneOf(P.mode, REP_MODES, "async", { semi: "semi-sync", semisync: "semi-sync", semi_sync: "semi-sync", synchronous: "sync", asynchronous: "async" }));
  const [lag, setLag] = useState(clamp(num(P.lag, 1.5), 0.2, 4));
  const [s, setS] = useState(() => repInit(int(P.followers, 2, 1, 4)));
  const [readFrom, setReadFrom] = useState(null);
  const [read, setRead] = useState(null);
  const id = useSvgId();

  const busy = s.msgs.length > 0 || s.failoverAt != null || s.writes.some((w) => w.status === "pending");
  useLoop(busy, (dt) => setS((cur) => repStep(cur, dt, lag)));

  const reset = (f = followers) => {
    setS(repInit(f));
    setRead(null);
    setReadFrom(null);
  };
  const pos = repLayout(s);
  const L = s.leader;
  const leaderAlive = s.nodes[L].alive;
  const followerIdx = s.nodes.map((_, i) => i).filter((i) => i !== L && s.nodes[i].alive);
  const target = followerIdx.includes(readFrom) ? readFrom : followerIdx[followerIdx.length > 1 ? 1 : 0];

  const doRead = () => {
    const i = target ?? L;
    const nd = s.nodes[i];
    const mine = [...s.writes].reverse().find((w) => w.status !== "lost" && w.status !== "failed");
    setRead({ node: i, val: nd.val, ver: nd.ver, lastVal: mine?.val, stale: !!mine && nd.ver < mine.ver && mine.epoch === s.epoch, fromLeader: i === L, t: s.t });
  };
  const last = s.writes[s.writes.length - 1];
  const clientMsg = !last
    ? { c: C.dim, t: "idle" }
    : last.status === "pending"
      ? { c: C.amber, t: `waiting for ${last.need - last.acks} ack… ${fmt(s.t - last.t0, 1)}s` }
      : last.status === "acked"
        ? { c: C.emerald, t: `x=${last.val} OK in ${last.ackedAt - last.t0 < 0.01 ? "~0" : fmt(last.ackedAt - last.t0, 2)}s` }
        : last.status === "lost"
          ? { c: C.rose, t: `x=${last.val} was OK… then LOST` }
          : { c: C.rose, t: `x=${last.val} error: no ack` };
  const STATUS = { pending: ["…", "border-amber-400/60 text-amber-300"], acked: ["✓", "border-emerald-400/50 text-emerald-300"], lost: ["lost", "border-rose-400/70 text-rose-300 line-through"], failed: ["error", "border-slate-500 text-slate-400"] };
  const MODE_INFO = {
    sync: "Client waits until every follower has the write: no data loss, but latency = the slowest follower.",
    "semi-sync": "Client waits for one follower: one extra copy guaranteed, latency = the fastest follower.",
    async: "Client is acked as soon as the leader has it: fastest, but followers are stale and a leader crash can lose writes.",
  };

  return (
    <Card
      title="Leader–follower replication"
      params={P}
      caption="Write a few values, then Read from a follower before replication finishes — you get a stale value even though your write succeeded. In async mode, write twice and immediately Kill leader: the promoted follower never got those writes, so acknowledged data is lost. Try the same in sync mode and watch the write latency instead. Click a follower to read from it."
    >
      <Choice options={[["sync", "Sync"], ["semi-sync", "Semi-sync"], ["async", "Async"]]} value={mode} onChange={setMode} />
      <p className="mt-2 text-xs text-slate-400">{MODE_INFO[mode]}</p>
      <svg viewBox="0 0 520 240" className="mt-2 w-full h-auto">
        <defs>
          <Arrow id={`${id}a`} color={C.axis} />
          <Glow id={`${id}g`} sd={6} />
        </defs>
        {/* client → leader */}
        {leaderAlive && <line x1={REP_POS.client.x + 34} y1={REP_POS.client.y} x2={REP_POS.leader.x - 50} y2={REP_POS.leader.y} stroke={C.axis} strokeWidth="1.5" markerEnd={`url(#${id}a)`} />}
        {/* replication links */}
        {leaderAlive &&
          followerIdx.map((i) => {
            const stale = s.nodes[i].ver < s.nodes[L].ver;
            return <line key={i} x1={pos[L].x + 46} y1={pos[L].y} x2={pos[i].x - 50} y2={pos[i].y} stroke={stale ? C.amber : C.axis} strokeOpacity={stale ? 0.6 : 1} strokeDasharray={stale ? "4 4" : undefined} markerEnd={`url(#${id}a)`} style={{ transition: "all 600ms" }} />;
          })}
        {/* client */}
        <g>
          <rect x={REP_POS.client.x - 34} y={REP_POS.client.y - 20} width="68" height="40" rx="8" fill={C.ink8} stroke={C.sky} />
          <text x={REP_POS.client.x} y={REP_POS.client.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.sky}>Client</text>
          <text x={REP_POS.client.x - 34} y={REP_POS.client.y + 36} fontSize="9.5" fill={clientMsg.c}>{clientMsg.t}</text>
        </g>
        {s.failoverAt != null && (
          <text x={REP_POS.leader.x} y={REP_POS.leader.y + 4} textAnchor="middle" fontSize="11" fill={C.amber}>electing…</text>
        )}
        {s.nodes.map((nd, i) => {
          const p = pos[i];
          const isL = i === L && nd.alive;
          const stale = nd.alive && !isL && leaderAlive && nd.ver < s.nodes[L].ver;
          const col = !nd.alive ? C.dim : isL ? C.brandL : C.sky;
          const sel = i === target && !isL;
          return (
            <g
              key={i}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: `transform 700ms ${EASE}`, cursor: !isL && nd.alive ? "pointer" : "default" }}
              onClick={() => !isL && nd.alive && setReadFrom(i)}
              opacity={nd.alive ? 1 : 0.55}
            >
              {isL && <rect x="-46" y="-24" width="92" height="48" rx="10" fill="none" stroke={C.brand} strokeWidth="5" opacity="0.5" filter={`url(#${id}g)`} />}
              <rect x="-46" y="-24" width="92" height="48" rx="10" fill={C.ink8} stroke={sel ? "#fff" : col} strokeWidth={sel ? 1.8 : 1.2} />
              <text x="-38" y="-10" fontSize="9" fill={col} fontWeight="700">{!nd.alive ? "DEAD" : isL ? "LEADER" : "FOLLOWER"} N{i + 1}</text>
              <text x="-38" y="8" fontSize="14" fontWeight="700" fill={nd.alive ? "#e2e8f0" : C.dim} fontFamily="ui-monospace, monospace">x = {nd.val}</text>
              <text x="38" y="8" textAnchor="end" fontSize="9" fill={C.dim}>v{nd.ver}</text>
              {stale && <text x="-38" y="19" fontSize="8.5" fill={C.amber}>stale · lag ×{REP_MULT[i]}</text>}
              {!stale && nd.alive && !isL && <text x="-38" y="19" fontSize="8.5" fill={C.dim}>up to date</text>}
              {!nd.alive && <path d="M-46,-24 L46,24 M46,-24 L-46,24" stroke={C.rose} strokeWidth="1.5" opacity="0.7" />}
            </g>
          );
        })}
        {/* replication (amber) and ack (green) messages in flight */}
        {s.msgs.map((m, k) => {
          const a = pos[m.from], b = pos[m.to];
          if (!a || !b) return null;
          const f = clamp((s.t - m.t0) / m.dur, 0, 1);
          const x = lerp(a.x + 46 * Math.sign(b.x - a.x || 1), b.x - 46 * Math.sign(b.x - a.x || 1), f);
          const y = lerp(a.y, b.y, f);
          return m.kind === "rep" ? (
            <g key={k}>
              <circle cx={x} cy={y} r="6" fill={C.amber} stroke="#fff" strokeWidth="1" />
              <text x={x} y={y - 9} textAnchor="middle" fontSize="8.5" fill={C.amber}>x={m.val}</text>
            </g>
          ) : (
            <circle key={k} cx={x} cy={y} r="3.5" fill={C.emerald} />
          );
        })}
      </svg>
      {s.note && (
        <div className={`mt-2 rounded-md px-3 py-1.5 text-xs ${s.note.tone === "rose" ? "bg-rose-500/10 text-rose-300" : s.note.tone === "amber" ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>{s.note.text}</div>
      )}
      {read && (
        <div className={`mt-2 rounded-md px-3 py-1.5 text-xs ${read.stale ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
          {read.fromLeader ? "No follower alive — read from the leader: " : `Read from N${read.node + 1} → `}
          <span className="font-mono font-bold">x = {read.val}</span>{" "}
          {read.stale
            ? `STALE: you wrote x = ${read.lastVal}, but this follower hasn't applied it yet → read-your-writes violation.`
            : "(fresh — it matches your latest write)"}
        </div>
      )}
      {s.writes.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
          writes:
          {s.writes.map((w, k) => (
            <span key={k} className={`rounded border px-1.5 py-px font-mono ${STATUS[w.status][1]}`}>x={w.val} {STATUS[w.status][0]}</span>
          ))}
        </div>
      )}
      <Row>
        <Button primary onClick={() => setS((cur) => repWrite(cur, mode, lag))} disabled={!leaderAlive || s.failoverAt != null}>Write x={s.nextVal}</Button>
        <Button onClick={doRead}>Read from follower{target != null ? ` N${target + 1}` : ""}</Button>
        <Button onClick={() => setS(repKill)} disabled={!leaderAlive || s.failoverAt != null || followerIdx.length === 0} className="!bg-rose-600/80 hover:!bg-rose-600">Kill leader</Button>
        <Button onClick={() => reset()}>Reset</Button>
      </Row>
      <Row>
        <Slider label="replication lag" value={lag} min={0.2} max={4} step={0.1} onChange={setLag} display={`${lag.toFixed(1)}s`} />
        <Slider label="followers" value={followers} min={1} max={4} step={1} onChange={(v) => { setFollowers(v); reset(v); }} display={followers} />
      </Row>
    </Card>
  );
}

/* ====================================================================== */
/* 3. cap-theorem: a partition forces a choice between C and A             */
/* ====================================================================== */

const CAP_VALUES = {
  1: [{ name: "red", c: C.rose }, { name: "orange", c: C.orange }, { name: "yellow", c: C.amber }],
  2: [{ name: "blue", c: C.sky }, { name: "violet", c: C.brandL }, { name: "teal", c: C.teal }],
};
const CAP_POS = { A: { x: 150, y: 140 }, B: { x: 370, y: 140 }, c1: { x: 66, y: 44 }, c2: { x: 454, y: 44 } };
const CAP_SYSTEMS = {
  CP: { label: "Consistency + Partition tolerance", text: "Refuses requests it can't make consistent: during a partition some clients get errors.", ex: "HBase, ZooKeeper, etcd, MongoDB (default)" },
  AP: { label: "Availability + Partition tolerance", text: "Always answers, even if the answer is stale or conflicts with the other side; repairs later.", ex: "Cassandra, DynamoDB, CouchDB, Riak" },
};

export function CapTheorem({ params = {} }) {
  const P = safe(params);
  const [choice, setChoice] = useState(oneOf(P.choice, ["CP", "AP"].map((k) => k.toLowerCase()), "cp").toUpperCase());
  const [part, setPart] = useState(!!P.partition);
  const [nodes, setNodes] = useState({ A: { name: "green", c: C.emerald, ts: 0 }, B: { name: "green", c: C.emerald, ts: 0 } });
  const [clock, setClock] = useState(0);
  const [counter, setCounter] = useState({ 1: 0, 2: 0 });
  const [reply, setReply] = useState({ 1: null, 2: null });
  const [packets, setPackets] = useState([]);
  const [recon, setRecon] = useState(null);
  const later = useLater();
  const partRef = useRef(part);
  partRef.current = part;
  const pid = useRef(0);

  const side = (c) => (c === 1 ? "A" : "B");
  const other = (n) => (n === "A" ? "B" : "A");
  const say = (c, tone, text) => setReply((r) => ({ ...r, [c]: { tone, text } }));
  const send = (from, to, color, ms, cut = false) => {
    const k = ++pid.current;
    const a = CAP_POS[from], b = CAP_POS[to];
    const end = cut ? { x: (a.x + b.x) / 2 + (a.x < b.x ? -14 : 14), y: a.y } : b;
    setPackets((ps) => [...ps, { k, from: { x: a.x + (a.x < b.x ? 52 : -52), y: a.y }, to: { x: end.x + (cut ? 0 : a.x < b.x ? -52 : 52), y: end.y }, color, ms }]);
    later(() => setPackets((ps) => ps.filter((p) => p.k !== k)), ms + 250);
  };

  const write = (c) => {
    const me = side(c), them = other(me);
    const v = CAP_VALUES[c][counter[c] % 3];
    setCounter((x) => ({ ...x, [c]: x[c] + 1 }));
    const ts = clock + 1;
    setClock(ts);
    const val = { ...v, ts };
    setRecon(null);
    if (part) {
      if (choice === "CP") {
        say(c, "amber", `write ${v.name}: waiting for Node ${them} to confirm…`);
        send(me, them, v.c, 500, true);
        later(() => say(c, "rose", `error: unavailable — Node ${them} unreachable, write of ${v.name} rejected`), 1300);
      } else {
        setNodes((n) => ({ ...n, [me]: val }));
        say(c, "emerald", `OK: ${v.name} accepted by Node ${me} only (Node ${them} can't hear about it)`);
        send(me, them, v.c, 500, true);
      }
      return;
    }
    if (choice === "CP") {
      // Synchronous: commit on both before answering.
      say(c, "amber", `write ${v.name}: replicating to Node ${them}…`);
      send(me, them, v.c, 600);
      later(() => {
        if (partRef.current) return say(c, "rose", "error: unavailable — partition happened mid-write");
        setNodes((n) => ({ ...n, A: val, B: val }));
        say(c, "emerald", `OK: ${v.name} committed on both nodes`);
      }, 700);
    } else {
      // Asynchronous: answer now, replicate in the background.
      setNodes((n) => ({ ...n, [me]: val }));
      say(c, "emerald", `OK: ${v.name} (replicating to Node ${them} in the background)`);
      send(me, them, v.c, 600);
      later(() => !partRef.current && setNodes((n) => (n[them].ts < ts ? { ...n, [them]: val } : n)), 650);
    }
  };

  const doRead = (c) => {
    const me = side(c), them = other(me);
    if (part && choice === "CP") return say(c, "rose", `error: unavailable — can't confirm the latest value with Node ${them}`);
    const v = nodes[me];
    const diverged = nodes.A.ts !== nodes.B.ts || nodes.A.name !== nodes.B.name;
    if (part && diverged) say(c, "amber", `read: ${v.name} (t=${v.ts}) — but Node ${them} says ${nodes[them].name}! Stale/conflicting.`);
    else say(c, "emerald", `read: ${v.name} (t=${v.ts})`);
  };

  const heal = () => {
    setPart(false);
    const { A, B } = nodes;
    if (A.ts === B.ts && A.name === B.name) {
      setRecon({ tone: "emerald", text: choice === "CP" ? "Network healed. Nothing to reconcile: CP refused the conflicting writes." : "Network healed. Replicas already agree." });
      return;
    }
    send("A", "B", A.c, 700);
    send("B", "A", B.c, 700);
    const win = A.ts >= B.ts ? A : B, lose = win === A ? B : A;
    later(() => {
      setNodes({ A: win, B: win });
      setRecon({ tone: "amber", text: `Last-write-wins: kept ${win.name} (t=${win.ts}), silently discarded ${lose.name} (t=${lose.ts}) — that client's write is lost.` });
    }, 800);
  };

  const reset = () => {
    setPart(false);
    setNodes({ A: { name: "green", c: C.emerald, ts: 0 }, B: { name: "green", c: C.emerald, ts: 0 } });
    setClock(0);
    setReply({ 1: null, 2: null });
    setRecon(null);
  };

  const diverged = nodes.A.name !== nodes.B.name || nodes.A.ts !== nodes.B.ts;
  const TONE = { emerald: "text-emerald-300", rose: "text-rose-300", amber: "text-amber-300" };
  const sys = CAP_SYSTEMS[choice];
  const tri = { C: { x: 90, y: 20 }, A: { x: 22, y: 132 }, P: { x: 158, y: 132 } };
  const edge = (a, b, on, label, lx, ly) => (
    <g>
      <line x1={tri[a].x} y1={tri[a].y} x2={tri[b].x} y2={tri[b].y} stroke={on ? C.brandL : C.axis} strokeWidth={on ? 4 : 1.5} strokeDasharray={label === "CA" ? "4 4" : undefined} style={{ transition: "all 300ms" }} />
      <text x={lx} y={ly} textAnchor="middle" fontSize="10" fontWeight="700" fill={on ? C.brandL : C.dim}>{label}</text>
    </g>
  );

  return (
    <Card
      title="CAP theorem: what happens during a partition"
      params={P}
      caption="With the network healthy, both modes look the same. Cut the network, then write from both clients: CP refuses (consistent but unavailable), AP accepts both (available but the replicas now disagree). Heal to see AP reconcile with last-write-wins — one write is silently thrown away."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Choice options={[["CP", "CP (consistent)"], ["AP", "AP (available)"]]} value={choice} onChange={setChoice} />
        <Button onClick={() => (part ? heal() : (setPart(true), setRecon(null)))} className={part ? "!bg-emerald-600/80 hover:!bg-emerald-600" : "!bg-rose-600/80 hover:!bg-rose-600"}>
          {part ? "Heal network" : "Cut network (partition)"}
        </Button>
        <Button onClick={reset}>Reset</Button>
      </div>
      <svg viewBox="0 0 520 200" className="mt-3 w-full h-auto">
        {/* clients and their links to the local node */}
        {[1, 2].map((c) => {
          const cp = CAP_POS[`c${c}`], np = CAP_POS[side(c)];
          return (
            <g key={c}>
              <line x1={cp.x} y1={cp.y + 16} x2={np.x + (c === 1 ? -20 : 20)} y2={np.y - 26} stroke={C.axis} strokeWidth="1.5" />
              <rect x={cp.x - 40} y={cp.y - 16} width="80" height="32" rx="8" fill={C.ink8} stroke={C.sky} />
              <text x={cp.x} y={cp.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.sky}>Client {c}</text>
            </g>
          );
        })}
        {/* the network link */}
        {part ? (
          <g>
            <line x1={CAP_POS.A.x + 52} y1={CAP_POS.A.y} x2={246} y2={CAP_POS.A.y} stroke={C.rose} strokeWidth="2" strokeDasharray="5 4" />
            <line x1={274} y1={CAP_POS.A.y} x2={CAP_POS.B.x - 52} y2={CAP_POS.A.y} stroke={C.rose} strokeWidth="2" strokeDasharray="5 4" />
            <path d={`M250,${CAP_POS.A.y - 14} L270,${CAP_POS.A.y + 14} M270,${CAP_POS.A.y - 14} L250,${CAP_POS.A.y + 14}`} stroke={C.rose} strokeWidth="3" />
            <text x="260" y={CAP_POS.A.y + 32} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.rose}>PARTITION</text>
          </g>
        ) : (
          <g>
            <line x1={CAP_POS.A.x + 52} y1={CAP_POS.A.y} x2={CAP_POS.B.x - 52} y2={CAP_POS.A.y} stroke={C.emerald} strokeOpacity="0.6" strokeWidth="2" />
            <text x="260" y={CAP_POS.A.y - 8} textAnchor="middle" fontSize="9" fill={C.dim}>replication link</text>
          </g>
        )}
        {["A", "B"].map((k) => {
          const p = CAP_POS[k], v = nodes[k];
          return (
            <g key={k}>
              <rect x={p.x - 52} y={p.y - 28} width="104" height="56" rx="10" fill={C.ink8} stroke={diverged ? C.amber : C.brandL} strokeWidth={diverged ? 1.8 : 1.2} />
              <text x={p.x} y={p.y - 13} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.brandL}>Node {k}</text>
              <circle cx={p.x - 32} cy={p.y + 6} r="7" fill={v.c} style={{ transition: "fill 400ms" }} />
              <text x={p.x - 20} y={p.y + 10} fontSize="12" fontWeight="700" fill="#e2e8f0" fontFamily="ui-monospace, monospace">{v.name}</text>
              <text x={p.x} y={p.y + 23} textAnchor="middle" fontSize="8.5" fill={C.dim}>written at t={v.ts}</text>
            </g>
          );
        })}
        {diverged && <text x="260" y="192" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.amber}>⚠ replicas disagree (conflict)</text>}
        {packets.map((p) => <Packet key={p.k} from={p.from} to={p.to} ms={p.ms} color={p.color} />)}
      </svg>
      <div className="mt-1 grid grid-cols-2 gap-3">
        {[1, 2].map((c) => (
          <div key={c} className="rounded-lg bg-ink-800 p-2">
            <div className="flex flex-wrap gap-1.5">
              <Button primary onClick={() => write(c)}>Client {c}: write {CAP_VALUES[c][counter[c] % 3].name}</Button>
              <Button onClick={() => doRead(c)}>Read</Button>
            </div>
            <div className={`mt-1.5 min-h-[2.5em] font-mono text-[11px] leading-snug ${reply[c] ? TONE[reply[c].tone] : "text-slate-500"}`}>{reply[c]?.text || "no request yet"}</div>
          </div>
        ))}
      </div>
      {recon && <div className={`mt-2 rounded-md bg-ink-800 px-3 py-1.5 text-xs ${TONE[recon.tone]}`}>{recon.text}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-ink-800 p-2">
        <svg viewBox="0 0 180 150" className="w-[150px] shrink-0">
          {edge("C", "A", false, "CA", 40, 72)}
          {edge("C", "P", choice === "CP", "CP", 140, 72)}
          {edge("A", "P", choice === "AP", "AP", 90, 146)}
          {Object.entries(tri).map(([k, p]) => (
            <g key={k}>
              <circle cx={p.x} cy={p.y} r="13" fill={C.ink} stroke={choice.includes(k) ? C.brandL : C.axis} strokeWidth="1.5" />
              <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill={choice.includes(k) ? "#fff" : C.dim}>{k}</text>
            </g>
          ))}
        </svg>
        <div className="min-w-[180px] flex-1 text-xs text-slate-400">
          <div className="font-semibold text-brand-400">{choice}: {sys.label}</div>
          <div className="mt-1">{sys.text}</div>
          <div className="mt-1">Examples: <span className="text-slate-200">{sys.ex}</span></div>
          <div className="mt-1 text-[11px] text-slate-500">CA (dashed) isn't a real option for a distributed system: networks do partition, so P is mandatory and the choice is C or A while it lasts.</div>
        </div>
      </div>
    </Card>
  );
}

/* ====================================================================== */
/* 4. rate-limiter: token bucket, leaky bucket and window counters         */
/* ====================================================================== */

const RL_T = 20; // seconds of simulated traffic
const RL_BIN = 0.5; // bar width in seconds
const RL_DT = 0.1; // state sampling step
const RL_ALGOS = ["token-bucket", "leaky-bucket", "fixed-window", "sliding-window-log", "sliding-window-counter"];
const RL_INFO = {
  "token-bucket": { label: "Token bucket", state: "tokens", text: "Tokens drip in at `rate`/s up to `capacity`; each request spends one. Allows bursts up to the bucket size, then limits to the rate." },
  "leaky-bucket": { label: "Leaky bucket", state: "queue", text: "Requests join a queue of size `capacity` that drains at a fixed `rate`/s. Same accept/reject decisions as a token bucket, but accepted requests are queued and processed at a steady pace (pink line); overflow is rejected." },
  "fixed-window": { label: "Fixed window", state: "count", text: "Count requests per window; reject after `limit`. Simple, but 2× the limit can slip through around a window boundary." },
  "sliding-window-log": { label: "Sliding log", state: "in window", text: "Keep a timestamp per accepted request; allow if fewer than `limit` in the last window. Exact, but memory grows with traffic." },
  "sliding-window-counter": { label: "Sliding counter", state: "estimate", text: "Estimate = previous window × overlap + current window. Near-exact with just two counters — what most APIs use." },
};

/** Seeded background traffic plus bursts (one straddles t = 10 s, a window boundary). */
function rlArrivals(seed) {
  const rnd = mulberry32(seed);
  const out = [];
  let t = rnd() * 0.3;
  while (t < RL_T) {
    out.push(t);
    t += -Math.log(Math.max(1e-6, rnd())) / 3.2;
  }
  const burst = (at, n, spread) => {
    for (let i = 0; i < n; i++) out.push(at + rnd() * spread);
  };
  burst(3.6, 14, 0.5);
  burst(9.45, 10, 0.5);
  burst(10.02, 10, 0.5);
  burst(15.2, 12, 0.6);
  return out;
}

/** Replays every arrival through the algorithm; returns per-request verdicts and a sampled state line. */
function rlSimulate(times, algo, rate, cap) {
  const W = clamp(cap / rate, 0.5, 10);
  const res = [], samples = [], deps = []; // deps: when queued requests leave the leaky bucket
  let tokens = cap, level = 0, last = 0;
  let winStart = 0, winCount = 0, prevCount = 0;
  const log = [];
  const advance = (t) => {
    const dt = t - last;
    tokens = Math.min(cap, tokens + dt * rate);
    level = Math.max(0, level - dt * rate);
    last = t;
    const ws = Math.floor(t / W + 1e-9) * W;
    if (ws > winStart + 1e-9) {
      prevCount = ws - winStart <= W + 1e-6 ? winCount : 0;
      winStart = ws;
      winCount = 0;
    }
    while (log.length && log[0] <= t - W) log.shift();
  };
  const est = (t) => prevCount * Math.max(0, 1 - (t - winStart) / W) + winCount;
  const state = (t) =>
    algo === "token-bucket" ? tokens : algo === "leaky-bucket" ? level : algo === "fixed-window" ? winCount : algo === "sliding-window-log" ? log.length : est(t);
  let si = 0;
  const sampleTo = (upTo) => {
    while (si * RL_DT <= upTo + 1e-9 && si * RL_DT <= RL_T + 1e-9) {
      const st = si * RL_DT;
      advance(st);
      samples.push({ t: st, v: state(st) });
      si++;
    }
  };
  for (const t of times) {
    sampleTo(t);
    advance(t);
    let ok;
    if (algo === "token-bucket") {
      ok = tokens >= 1;
      if (ok) tokens -= 1;
    } else if (algo === "leaky-bucket") {
      ok = level + 1 <= cap + 1e-9;
      if (ok) {
        level += 1;
        deps.push(t + level / rate); // it leaves once the backlog ahead of it has drained
      }
    } else if (algo === "fixed-window") {
      ok = winCount < cap;
      if (ok) winCount++;
    } else if (algo === "sliding-window-log") {
      ok = log.length < cap;
      if (ok) log.push(t);
    } else {
      ok = est(t) + 1 <= cap + 1e-9;
      if (ok) winCount++;
    }
    res.push({ t, ok });
  }
  sampleTo(RL_T);
  return { res, samples, deps, W };
}

/** Most requests accepted in any span of length W (shows the fixed-window boundary burst). */
function rlPeak(res, W, upTo) {
  const acc = res.filter((r) => r.ok && r.t <= upTo).map((r) => r.t);
  let best = 0;
  for (let i = 0, j = 0; i < acc.length; i++) {
    while (acc[i] - acc[j] >= W) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

/** Left-hand picture of the limiter's state at the playhead. */
function RlGauge({ algo, v, cap, rate, W, ph }) {
  const frac = clamp(v / Math.max(cap, 1e-9), 0, 1);
  const top = 46, bot = 176, h = bot - top;
  if (algo === "token-bucket" || algo === "leaky-bucket") {
    const isTok = algo === "token-bucket";
    const n = Math.floor(v + 1e-9);
    const cols = 5, coin = 13;
    return (
      <g>
        <text x="66" y="14" textAnchor="middle" fontSize="10" fill={C.text}>{isTok ? `+${rate} tokens/s` : "requests in"}</text>
        <path d="M60,20 L60,34 M56,30 L60,36 L64,30" stroke={isTok ? C.amber : C.sky} strokeWidth="1.5" fill="none" />
        {/* the bucket */}
        <path d={`M14,${top} L22,${bot} L110,${bot} L118,${top}`} fill={C.ink8} stroke={C.axis} strokeWidth="2" />
        {isTok ? (
          Array.from({ length: Math.min(n, 40) }, (_, i) => {
            const r = Math.floor(i / cols), c = i % cols;
            return <circle key={i} cx={34 + c * 16} cy={bot - 9 - r * coin} r="5.5" fill={C.amber} stroke="#b45309" strokeWidth="1" />;
          })
        ) : (
          <rect x={20} y={bot - frac * (h - 6)} width={92} height={frac * (h - 6)} fill={C.sky} opacity="0.35" style={{ transition: "all 120ms" }} />
        )}
        {!isTok && (
          <g>
            <rect x="60" y={bot} width="12" height="6" fill={C.axis} />
            {[0, 1, 2].map((i) => <circle key={i} cx="66" cy={bot + 11 + ((ph * 20 + i * 5) % 14)} r="2" fill={C.sky} />)}
          </g>
        )}
        <line x1="10" x2="122" y1={bot - (h - 6)} y2={bot - (h - 6)} stroke={C.rose} strokeDasharray="3 3" strokeOpacity="0.7" />
        <text x="66" y={bot - (h - 6) - 4} textAnchor="middle" fontSize="8.5" fill={C.rose}>capacity {cap}</text>
        <text x="66" y={isTok ? 196 : 206} textAnchor="middle" fontSize="11" fontWeight="700" fill="#e2e8f0" fontFamily="ui-monospace, monospace">
          {isTok ? `${fmt(v, 1)} tokens` : `queue ${fmt(v, 1)}`}
        </text>
        {!isTok && <text x="66" y="218" textAnchor="middle" fontSize="9" fill={C.text}>leaks {rate}/s</text>}
      </g>
    );
  }
  // window algorithms: a vertical counter gauge against the limit
  const left = algo === "fixed-window" ? W - ((ph % W) + W) % W : null;
  return (
    <g>
      <text x="66" y="22" textAnchor="middle" fontSize="10" fill={C.text}>window {fmt(W, 1)}s</text>
      <rect x="44" y={top} width="44" height={h} rx="5" fill={C.ink8} stroke={C.axis} />
      <rect x="46" y={bot - frac * (h - 4) - 2} width="40" height={frac * (h - 4)} rx="4" fill={frac >= 1 ? C.rose : C.emerald} opacity="0.75" style={{ transition: "all 120ms" }} />
      <text x="92" y={top + 9} fontSize="8.5" fill={C.rose}>limit {cap}</text>
      <text x="66" y="196" textAnchor="middle" fontSize="11" fontWeight="700" fill="#e2e8f0" fontFamily="ui-monospace, monospace">{fmt(v, algo === "sliding-window-counter" ? 1 : 0)} / {cap}</text>
      {left != null && <text x="66" y="210" textAnchor="middle" fontSize="9" fill={C.text}>resets in {fmt(left, 1)}s</text>}
    </g>
  );
}

export function RateLimiter({ params = {} }) {
  const P = safe(params);
  const [algo, setAlgo] = useState(oneOf(P.algorithm ?? P.algo, RL_ALGOS, "token-bucket", { token: "token-bucket", leaky: "leaky-bucket", fixed: "fixed-window", "sliding-window": "sliding-window-log", "sliding-log": "sliding-window-log", "sliding-counter": "sliding-window-counter", sliding: "sliding-window-log" }));
  const [rate, setRate] = useState(int(P.rate, 5, 1, 15));
  const [cap, setCap] = useState(int(P.capacity ?? P.limit, 10, 1, 30));
  const [extra, setExtra] = useState([]); // Burst! arrivals
  const [ph, setPh] = useState(RL_T); // playhead: start with the whole timeline visible
  const [running, setRunning] = useState(false);
  const seed = int(P.seed, 21, 0, 1e9);
  const base = useMemo(() => rlArrivals(seed), [seed]);
  const times = useMemo(() => [...base, ...extra].filter((t) => t >= 0 && t < RL_T).sort((a, b) => a - b), [base, extra]);
  const sim = useMemo(() => rlSimulate(times, algo, rate, cap), [times, algo, rate, cap]);

  useTicker(running, () => setPh((p) => Math.min(RL_T, +(p + 0.1).toFixed(2))), 50);
  useEffect(() => {
    if (ph >= RL_T) setRunning(false);
  }, [ph]);

  const play = () => {
    if (running) return setRunning(false);
    if (ph >= RL_T) setPh(0);
    setRunning(true);
  };
  const burst = () => {
    const rnd = mulberry32(seed * 7 + extra.length + 1);
    const at = Math.min(ph, RL_T - 0.5);
    setExtra((e) => [...e, ...Array.from({ length: 15 }, () => at + rnd() * 0.3)]);
  };

  const info = RL_INFO[algo];
  const isWin = algo.includes("window");
  const nb = RL_T / RL_BIN;
  const bins = Array.from({ length: nb }, () => ({ ok: 0, no: 0 }));
  let acc = 0, rej = 0;
  for (const r of sim.res) {
    const b = Math.min(nb - 1, Math.floor(r.t / RL_BIN));
    if (r.t <= ph) {
      r.ok ? (bins[b].ok++, acc++) : (bins[b].no++, rej++);
    }
  }
  // Leaky bucket: requests actually processed per bin (a smooth outflow).
  const outBins = new Array(nb).fill(0);
  if (algo === "leaky-bucket") sim.deps.forEach((d) => d <= ph && d < RL_T && outBins[Math.floor(d / RL_BIN)]++);
  const ymax = nice(Math.max(4, ...sim.res.reduce((m, r) => (m[Math.floor(r.t / RL_BIN)] = (m[Math.floor(r.t / RL_BIN)] || 0) + 1, m), []).filter(Boolean)), 4);
  const smax = nice(Math.max(cap, ...sim.samples.map((s) => s.v)) * 1.3, 2);
  const pb = plot([0, RL_T], [0, ymax.max], { w: 520, h: 150, l: 168, r: 8, t: 14, b: 20 });
  const ps = plot([0, RL_T], [0, smax.max], { w: 520, h: 98, l: 168, r: 8, t: 10, b: 24 });
  const cur = sim.samples[clamp(Math.round(ph / RL_DT), 0, sim.samples.length - 1)]?.v ?? 0;
  const vis = sim.samples.filter((s) => s.t <= ph + 1e-9);
  const bw = (pb.x1 - pb.x0) / nb;
  const peak = rlPeak(sim.res, sim.W, ph);
  const bounds = isWin ? Array.from({ length: Math.floor(RL_T / sim.W) }, (_, i) => (i + 1) * sim.W).filter((t) => t < RL_T) : [];
  const xt = [0, 5, 10, 15, 20];

  return (
    <Card
      title="Rate limiting algorithms"
      params={P}
      caption="Press Play to replay 20 s of traffic, and hit Burst! while it runs. Compare algorithms on the same traffic: the token bucket lets a burst through until it runs dry; the leaky bucket smooths it into a steady drain; fixed window lets almost 2× the limit through around t = 10 s (see “max in any window”), which the sliding windows prevent."
    >
      <Choice options={RL_ALGOS.map((k) => [k, RL_INFO[k].label])} value={algo} onChange={setAlgo} />
      <p className="mt-2 text-xs text-slate-400">{info.text.replace(/`(\w+)`/g, "$1")}</p>
      <svg viewBox="0 0 520 250" className="mt-2 w-full h-auto">
        <g transform="translate(6, 6)">
          <RlGauge algo={algo} v={cur} cap={cap} rate={rate} W={sim.W} ph={ph} />
        </g>
        {/* requests per 0.5 s: accepted (green) stacked under rejected 429 (red) */}
        <Axes p={pb} yticks={ymax.ticks} ylabel="requests / 0.5s" />
        {bounds.map((t) => <line key={t} x1={pb.sx(t)} x2={pb.sx(t)} y1={pb.y1} y2={pb.y0} stroke={C.brandL} strokeOpacity="0.35" strokeDasharray="2 3" />)}
        {bins.map((b, i) => {
          const x = pb.sx(i * RL_BIN) + 0.8;
          return (
            <g key={i}>
              <rect x={x} y={pb.sy(b.ok)} width={bw - 1.6} height={pb.y0 - pb.sy(b.ok)} fill={C.emerald} opacity="0.85" />
              <rect x={x} y={pb.sy(b.ok + b.no)} width={bw - 1.6} height={pb.sy(b.ok) - pb.sy(b.ok + b.no)} fill={C.rose} opacity="0.9" />
            </g>
          );
        })}
        {algo === "leaky-bucket" && (
          <path d={outBins.map((v, i) => `${i ? "L" : "M"}${pb.sx(i * RL_BIN).toFixed(1)},${pb.sy(v).toFixed(1)}H${pb.sx((i + 1) * RL_BIN).toFixed(1)}`).join("")} fill="none" stroke={C.fuchsia} strokeWidth="1.8" />
        )}
        {/* algorithm state over time */}
        <g transform={`translate(0, ${pb.h})`}>
          <Axes p={ps} xticks={xt} yticks={smax.ticks} xfmt={(v) => `${v}s`} />
          {bounds.map((t) => <line key={t} x1={ps.sx(t)} x2={ps.sx(t)} y1={ps.y1} y2={ps.y0} stroke={C.brandL} strokeOpacity="0.35" strokeDasharray="2 3" />)}
          <line x1={ps.x0} x2={ps.x1} y1={ps.sy(cap)} y2={ps.sy(cap)} stroke={C.rose} strokeDasharray="4 3" strokeOpacity="0.6" />
          <text x={ps.x1 - 2} y={ps.sy(cap) - 3} textAnchor="end" fontSize="8.5" fill={C.rose}>{isWin ? "limit" : "capacity"}</text>
          {vis.length > 1 && (
            <polyline points={vis.map((s) => `${ps.sx(s.t).toFixed(1)},${ps.sy(s.v).toFixed(1)}`).join(" ")} fill="none" stroke={algo === "token-bucket" ? C.amber : C.sky} strokeWidth="1.8" strokeLinejoin="round" />
          )}
          <text x={ps.x0 + 5} y={ps.y1 + 9} fontSize="10" fill={C.text}>{info.state}</text>
        </g>
        {/* playhead */}
        {ph < RL_T && <line x1={pb.sx(ph)} x2={pb.sx(ph)} y1={pb.y1} y2={pb.h + ps.y0} stroke="#fff" strokeOpacity="0.6" />}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <Key color={C.emerald}>accepted</Key>
        <Key color={C.rose}>rejected (HTTP 429)</Key>
        <Key color={algo === "token-bucket" ? C.amber : C.sky} line>{info.state}</Key>
        {isWin && <Key color={C.brandL} line>window boundary</Key>}
        {algo === "leaky-bucket" && <Key color={C.fuchsia} line>processed (steady outflow)</Key>}
      </div>
      <Row>
        <Button primary onClick={play}>{running ? "Pause" : ph >= RL_T ? "Replay" : "Play"}</Button>
        <Button onClick={burst} className="!bg-rose-600/80 hover:!bg-rose-600">Burst! (+15)</Button>
        <Button onClick={() => { setExtra([]); setRunning(false); setPh(RL_T); }}>Reset</Button>
        <Stat label="t" value={`${fmt(ph, 1)}s`} />
        <Stat label="accepted" value={acc} color="text-emerald-300" />
        <Stat label="rejected" value={rej} color="text-rose-300" />
        <Stat label={`max in any ${fmt(sim.W, 1)}s`} value={peak} color={peak > cap ? "text-amber-300" : "text-slate-200"} />
      </Row>
      <Row>
        <Slider label={algo === "leaky-bucket" ? "leak rate" : isWin ? "rate" : "refill rate"} value={rate} min={1} max={15} step={1} onChange={setRate} display={`${rate}/s`} />
        <Slider label={isWin ? "limit / window" : algo === "leaky-bucket" ? "queue size" : "bucket size"} value={cap} min={1} max={30} step={1} onChange={setCap} display={cap} />
      </Row>
      {isWin && <p className="mt-1 text-[11px] text-slate-500">window length = limit ÷ rate = {fmt(sim.W, 1)} s</p>}
    </Card>
  );
}

/* ====================================================================== */
/* 5. message-queue: producers, a backlog, consumers, retries and a DLQ    */
/* ====================================================================== */

const MQ = { QX1: 392, QY: 100, SLOT: 16, SLOTS: 15, PX: 50, CX: 428, DLQX: 160, DLQY: 204, FLY: 0.45, FETCH: 0.3, MAXTRY: 3 };
const MQ_COL = [C.sky, C.fuchsia, C.emerald, C.amber];
const mqProdY = (i, n) => spread(n, 100, 150, 50)[i];
const mqConsY = (i, n) => spread(n, 100, 168, 38)[i];
const mqSlot = (i) => ({ x: MQ.QX1 - 9 - Math.min(i, MQ.SLOTS - 1) * MQ.SLOT, y: MQ.QY });
const mqDlq = (i) => ({ x: MQ.DLQX + 9 + Math.min(i, 13) * 16, y: MQ.DLQY + 12 });

function mqInit(producers, consumers, seed) {
  return {
    t: 0,
    id: 0,
    rnd: mulberry32(seed),
    prods: Array.from({ length: producers }, (_, i) => ({ next: 0.3 + i * 0.41, flash: -9 })),
    queue: [],
    fly: [],
    cons: Array.from({ length: consumers }, () => ({ msg: null, phase: "idle", t0: 0, dur: 1, ack: -9 })),
    dlq: [],
    produced: 0,
    consumed: 0,
    retries: 0,
    hist: [{ t: 0, d: 0 }],
    lastSample: 0,
  };
}

/** Advance the simulation by dt seconds (mutates `s`; the component re-renders after). */
function mqStep(s, dt, cfg) {
  s.t += dt;
  const t = s.t;
  const np = s.prods.length, nc = s.cons.length;
  s.prods.forEach((p, i) => {
    for (let guard = 0; t >= p.next && guard < 20; guard++) {
      const msg = { id: s.id++, p: i, tries: 0 };
      s.fly.push({ msg, dest: "tail", from: { x: MQ.PX + 30, y: mqProdY(i, np) }, t0: p.next, dur: MQ.FLY });
      p.flash = p.next;
      s.produced++;
      p.next += (1 / cfg.rate) * (0.6 + 0.8 * s.rnd());
    }
  });
  s.fly = s.fly.filter((f) => {
    if (t < f.t0 + f.dur) return true;
    if (f.dest === "tail") s.queue.push(f.msg);
    else if (f.dest === "head") s.queue.unshift(f.msg);
    else s.dlq.push(f.msg);
    return false;
  });
  s.cons.forEach((c, i) => {
    if (c.phase === "down" && t >= c.until) c.phase = "idle";
    if (c.phase === "fetch" && t >= c.t0 + MQ.FETCH) {
      c.phase = "work";
      c.t0 = t;
      c.dur = cfg.proc * (0.75 + 0.5 * s.rnd());
    }
    if (c.phase === "work") {
      const crashing = cfg.crash && i === 0;
      if (crashing && t >= c.t0 + c.dur * 0.5) {
        // Crash mid-processing: the message was never acked, so the broker redelivers it.
        const msg = c.msg;
        msg.tries++;
        s.retries++;
        s.fly.push({ msg, dest: msg.tries >= MQ.MAXTRY ? "dlq" : "head", from: { x: MQ.CX - 8, y: mqConsY(i, nc) }, t0: t, dur: 0.5 });
        c.msg = null;
        c.phase = "down";
        c.until = t + 0.8;
      } else if (!crashing && t >= c.t0 + c.dur) {
        s.consumed++;
        c.msg = null;
        c.phase = "idle";
        c.ack = t;
      }
    }
    if (c.phase === "idle" && s.queue.length) {
      c.msg = s.queue.shift();
      c.phase = "fetch";
      c.t0 = t;
    }
  });
  while (t - s.lastSample >= 0.25) {
    s.lastSample += 0.25;
    s.hist.push({ t: s.lastSample, d: s.queue.length });
  }
  while (s.hist.length && s.hist[0].t < t - 30) s.hist.shift();
}

function mqSetConsumers(s, n) {
  while (s.cons.length < n) s.cons.push({ msg: null, phase: "idle", t0: s.t, dur: 1, ack: -9 });
  while (s.cons.length > n) {
    const c = s.cons.pop();
    if (c.msg) s.queue.unshift(c.msg); // un-acked work goes back to the queue
  }
}

export function MessageQueue({ params = {} }) {
  const P = safe(params);
  const producers = int(P.producers, 2, 1, 4);
  const seed = int(P.seed, 5, 0, 1e9);
  const [consumers, setConsumers] = useState(int(P.consumers, 1, 1, 6));
  const [rate, setRate] = useState(clamp(num(P.rate, 1.2), 0.2, 5));
  const [proc, setProc] = useState(clamp(num(P.processing, 0.6), 0.1, 3));
  const [crash, setCrash] = useState(!!P.crash);
  const [running, setRunning] = useState(true);
  const sim = useRef(null);
  if (!sim.current) sim.current = mqInit(producers, int(P.consumers, 1, 1, 6), seed);
  const [, bump] = useReducer((x) => x + 1, 0);
  const box = useRef(null);
  const inView = useInView(box);
  const id = useSvgId();

  useLoop(running && inView, (dt) => {
    mqStep(sim.current, dt, { rate, proc, crash });
    bump();
  });
  const changeConsumers = (v) => {
    setConsumers(v);
    mqSetConsumers(sim.current, v);
    bump();
  };
  const reset = () => {
    sim.current = mqInit(producers, consumers, seed);
    bump();
  };

  const s = sim.current;
  const t = s.t;
  const nc = s.cons.length;
  const inRate = producers * rate, outRate = nc / proc;
  const inflight = s.cons.filter((c) => c.msg).length;
  // Crop empty space above the top-most producer/consumer.
  const vbTop = Math.max(0, Math.floor(Math.min(mqProdY(0, producers), mqConsY(0, nc), MQ.QY - 34) - 20));
  const growing = inRate > outRate * 1.02;
  const dmax = nice(Math.max(10, ...s.hist.map((h) => h.d)), 4);
  const pc = plot([-30, 0], [0, dmax.max], { w: 520, h: 130, l: 34, r: 10, t: 12, b: 24 });
  const line = s.hist.map((h) => `${pc.sx(h.t - t).toFixed(1)},${pc.sy(h.d).toFixed(1)}`).join(" ");
  const dot = (m, x, y, r = 5.5) => (
    <g key={m.id} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}>
      <circle r={r} fill={MQ_COL[m.p % 4]} stroke={m.tries ? C.rose : C.ink} strokeWidth={m.tries ? 2 : 1} />
      {m.tries > 0 && <text y="3" textAnchor="middle" fontSize="7" fontWeight="700" fill={C.ink}>{m.tries}</text>}
    </g>
  );

  return (
    <Card
      title="Message queue: producers, backlog, consumers"
      params={P}
      caption="When producers publish faster than consumers can process, the backlog (queue depth) grows without bound — add consumers or speed up processing until the chart levels off and drains. Turn on “consumer crash”: consumer 1 dies mid-message, the un-acked message is redelivered (the number is its delivery count), and after 3 failed deliveries it is parked in the dead-letter queue."
    >
      <div ref={box}>
        <svg viewBox={`0 ${vbTop} 520 ${234 - vbTop}`} className="w-full h-auto">
          <defs><Glow id={`${id}g`} sd={3} /></defs>
          {/* producers */}
          {s.prods.map((p, i) => {
            const y = mqProdY(i, producers);
            const hot = t - p.flash < 0.25;
            return (
              <g key={i}>
                <rect x={MQ.PX - 36} y={y - 14} width="66" height="28" rx="7" fill={C.ink8} stroke={MQ_COL[i]} strokeWidth={hot ? 2.2 : 1} />
                <text x={MQ.PX - 3} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={MQ_COL[i]}>Producer {i + 1}</text>
              </g>
            );
          })}
          {/* the queue: head on the right */}
          <text x={(MQ.QX1 + MQ.QX1 - MQ.SLOTS * MQ.SLOT) / 2} y={MQ.QY - 22} textAnchor="middle" fontSize="10" fill={C.text}>queue ({s.queue.length})</text>
          <text x={MQ.QX1 - 2} y={MQ.QY + 26} textAnchor="end" fontSize="8.5" fill={C.dim}>head →</text>
          <rect x={MQ.QX1 - MQ.SLOTS * MQ.SLOT - 4} y={MQ.QY - 13} width={MQ.SLOTS * MQ.SLOT + 8} height="26" rx="6" fill={C.ink8} stroke={growing ? C.amber : C.axis} />
          {Array.from({ length: MQ.SLOTS }, (_, i) => {
            const p = mqSlot(i);
            return <rect key={i} x={p.x - 7} y={p.y - 9} width="14" height="18" rx="3" fill="none" stroke={C.grid} />;
          })}
          {s.queue.slice(0, MQ.SLOTS).map((m, i) => { const p = mqSlot(i); return dot(m, p.x, p.y); })}
          {s.queue.length > MQ.SLOTS && (
            <text x={MQ.QX1 - MQ.SLOTS * MQ.SLOT - 8} y={MQ.QY + 4} textAnchor="end" fontSize="10" fontWeight="700" fill={C.amber}>+{s.queue.length - MQ.SLOTS}</text>
          )}
          {/* dead-letter queue */}
          <rect x={MQ.DLQX - 2} y={MQ.DLQY} width="232" height="24" rx="6" fill={C.ink8} stroke={s.dlq.length ? C.rose : C.axis} strokeDasharray="4 3" />
          <text x={MQ.DLQX - 8} y={MQ.DLQY + 15} textAnchor="end" fontSize="10" fill={s.dlq.length ? C.rose : C.dim}>dead-letter queue</text>
          {s.dlq.slice(-14).map((m, i) => { const p = mqDlq(i); return dot(m, p.x, p.y, 5); })}
          {s.dlq.length > 14 && <text x={MQ.DLQX + 236} y={MQ.DLQY + 15} fontSize="9" fill={C.rose}>({s.dlq.length})</text>}
          {/* consumers */}
          {s.cons.map((c, i) => {
            const y = mqConsY(i, nc);
            const crashed = c.phase === "down";
            const acked = t - c.ack < 0.3;
            const prog = c.phase === "work" ? clamp((t - c.t0) / c.dur, 0, 1) : 0;
            const col = crashed ? C.rose : crash && i === 0 ? C.orange : C.emerald;
            return (
              <g key={i}>
                {acked && <rect x={MQ.CX - 8} y={y - 13} width="86" height="26" rx="7" fill="none" stroke={C.emerald} strokeWidth="4" opacity="0.6" filter={`url(#${id}g)`} />}
                <rect x={MQ.CX - 8} y={y - 13} width="86" height="26" rx="7" fill={C.ink8} stroke={col} />
                <rect x={MQ.CX - 6} y={y + 7} width={82 * prog} height="4" rx="2" fill={col} opacity="0.8" />
                <text x={MQ.CX + 4} y={y + 3} fontSize="9.5" fontWeight="700" fill={col}>C{i + 1}</text>
                <text x={MQ.CX + 20} y={y + 3} fontSize="8.5" fill={C.text}>
                  {crashed ? "✕ crashed" : c.phase === "work" ? (acked ? "ack ✓" : "working") : c.phase === "fetch" ? "pulling" : acked ? "ack ✓" : "idle"}
                </text>
                {c.phase === "work" && c.msg && dot(c.msg, MQ.CX + 68, y - 1, 4.5)}
              </g>
            );
          })}
          {/* messages in flight */}
          {s.fly.map((f) => {
            const k = clamp((t - f.t0) / f.dur, 0, 1);
            const to = f.dest === "tail" ? mqSlot(s.queue.length) : f.dest === "head" ? mqSlot(0) : mqDlq(Math.min(s.dlq.length, 13));
            return dot(f.msg, lerp(f.from.x, to.x, k), lerp(f.from.y, to.y, k) - Math.sin(k * Math.PI) * 10);
          })}
          {s.cons.map((c, i) => {
            if (c.phase !== "fetch" || !c.msg) return null;
            const k = clamp((t - c.t0) / MQ.FETCH, 0, 1), a = mqSlot(0);
            return dot(c.msg, lerp(a.x, MQ.CX - 8, k), lerp(a.y, mqConsY(i, nc), k));
          })}
        </svg>
        <svg viewBox={`0 0 ${pc.w} ${pc.h}`} className="mt-1 w-full h-auto">
          <Axes p={pc} xticks={[-30, -20, -10, 0]} yticks={dmax.ticks} xfmt={(v) => (v ? `${v}s` : "now")} ylabel="queue depth (backlog)" />
          {s.hist.length > 1 && (
            <>
              <polygon points={`${pc.sx(s.hist[0].t - t)},${pc.y0} ${line} ${pc.sx(s.hist[s.hist.length - 1].t - t)},${pc.y0}`} fill={growing ? C.amber : C.sky} opacity="0.12" />
              <polyline points={line} fill="none" stroke={growing ? C.amber : C.sky} strokeWidth="2" strokeLinejoin="round" />
            </>
          )}
        </svg>
      </div>
      <Row>
        <Stat label="in" value={`${fmt(inRate, 1)}/s`} color="text-sky-300" />
        <Stat label="out capacity" value={`${fmt(outRate, 1)}/s`} color="text-emerald-300" />
        <span className={`rounded-md bg-ink-800 px-2 py-0.5 text-xs font-bold ${growing ? "text-amber-300" : "text-emerald-300"}`}>{growing ? "backlog growing ↑" : "keeping up ✓"}</span>
      </Row>
      <Row>
        <Stat label="produced" value={s.produced} />
        <Stat label="consumed" value={s.consumed} color="text-emerald-300" />
        <Stat label="queued" value={s.queue.length} color="text-amber-300" />
        <Stat label="in-flight" value={inflight} color="text-sky-300" />
        <Stat label="redeliveries" value={s.retries} color="text-orange-300" />
        <Stat label="DLQ" value={s.dlq.length} color="text-rose-300" />
      </Row>
      <Row>
        <Slider label="produce rate" value={rate} min={0.2} max={5} step={0.1} onChange={setRate} display={`${rate.toFixed(1)}/s`} />
        <Slider label="consumers" value={consumers} min={1} max={6} step={1} onChange={changeConsumers} display={consumers} />
      </Row>
      <Row>
        <Slider label="processing time" value={proc} min={0.1} max={3} step={0.1} onChange={setProc} display={`${proc.toFixed(1)}s`} />
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" className="accent-rose-500" checked={crash} onChange={(e) => setCrash(e.target.checked)} />
          consumer crash
        </label>
        <Button primary onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Play"}</Button>
        <Button onClick={reset}>Reset</Button>
      </Row>
    </Card>
  );
}

/* ====================================================================== */
/* 6. circuit-breaker: CLOSED → OPEN → HALF-OPEN                           */
/* ====================================================================== */

const CB = { EVERY: 0.4, OK: 0.5, TIMEOUT: 2.0, FAST: 0.35, WINDOW: 20 };
const CB_COL = { closed: C.emerald, open: C.rose, half: C.amber };
const CB_NAME = { closed: "CLOSED", open: "OPEN", half: "HALF-OPEN" };

function cbInit(seed) {
  return { t: 0, rnd: mulberry32(seed), state: "closed", consec: 0, openedAt: 0, trial: false, next: 0.2, id: 0, reqs: [], log: [], bands: [{ s: "closed", t0: 0 }], n: { ok: 0, fail: 0, fast: 0 }, saved: 0, trans: null };
}

function cbGo(s, to, why) {
  s.trans = { from: s.state, to, t: s.t, why };
  s.state = to;
  s.bands.push({ s: to, t0: s.t });
  if (to === "open") s.openedAt = s.t;
  if (to === "closed") s.consec = 0;
}

function cbStep(s, dt, cfg) {
  s.t += dt;
  const t = s.t;
  if (s.state === "open" && t - s.openedAt >= cfg.cooldown) cbGo(s, "half", "cooldown elapsed");
  for (let guard = 0; t >= s.next && guard < 10; guard++) {
    const t0 = s.next;
    s.next += CB.EVERY;
    const real = s.state === "closed" || (s.state === "half" && !s.trial);
    if (real) {
      const fail = s.rnd() < cfg.fail;
      const trial = s.state === "half";
      if (trial) s.trial = true;
      s.reqs.push({ id: s.id++, t0, kind: fail ? "fail" : "ok", trial, end: t0 + (fail ? CB.TIMEOUT : CB.OK) });
    } else {
      // Fail fast: no call to the dependency, serve a fallback instead.
      s.reqs.push({ id: s.id++, t0, kind: "fast", end: t0 + CB.FAST });
      s.saved += cfg.fail * CB.TIMEOUT + (1 - cfg.fail) * CB.OK;
    }
  }
  s.reqs = s.reqs.filter((r) => {
    if (t < r.end) return true;
    s.n[r.kind]++;
    s.log.push({ t: r.end, kind: r.kind });
    if (r.trial) {
      s.trial = false;
      if (s.state === "half") cbGo(s, r.kind === "ok" ? "closed" : "open", r.kind === "ok" ? "trial succeeded" : "trial failed");
    } else if (r.kind !== "fast" && s.state === "closed") {
      if (r.kind === "fail") {
        s.consec++;
        if (s.consec >= cfg.threshold) cbGo(s, "open", `${s.consec} failures in a row`);
      } else s.consec = 0;
    }
    return false;
  });
  while (s.log.length && s.log[0].t < t - CB.WINDOW) s.log.shift();
  while (s.bands.length > 1 && s.bands[1].t0 < t - CB.WINDOW) s.bands.shift();
}

export function CircuitBreaker({ params = {} }) {
  const P = safe(params);
  const [threshold, setThreshold] = useState(int(P.threshold, 5, 1, 10));
  const [cooldown, setCooldown] = useState(int(P.cooldown, 5, 1, 15));
  const [failPct, setFailPct] = useState(int(P.failure ?? P.failureRate, 20, 0, 100));
  const [running, setRunning] = useState(true);
  const seed = int(P.seed, 9, 0, 1e9);
  const sim = useRef(null);
  if (!sim.current) sim.current = cbInit(seed);
  const [, bump] = useReducer((x) => x + 1, 0);
  const box = useRef(null);
  const inView = useInView(box);
  const id = useSvgId();

  useLoop(running && inView, (dt) => {
    cbStep(sim.current, dt, { fail: failPct / 100, threshold, cooldown });
    bump();
  });

  const s = sim.current;
  const t = s.t;
  const col = CB_COL[s.state];
  const recent = s.trans && t - s.trans.t < 1.6 ? s.trans : null;
  const Y = 58, SVC = 74, BRK = 236, DEP = 430;

  // State machine geometry.
  const SM = { closed: { x: 88, y: 36 }, open: { x: 432, y: 36 }, half: { x: 260, y: 112 } };
  const EDGES = [
    { from: "closed", to: "open", d: "M146,28 Q260,-4 374,28", lx: 260, ly: 3, label: `${threshold} failures in a row` },
    { from: "open", to: "half", d: "M436,56 Q430,108 320,114", lx: 420, ly: 102, label: `after ${cooldown}s cooldown` },
    { from: "half", to: "open", d: "M300,96 Q350,70 392,56", lx: 334, ly: 66, label: "trial fails" },
    { from: "half", to: "closed", d: "M200,112 Q96,110 88,56", lx: 104, ly: 102, label: "trial succeeds" },
  ];

  const pt = plot([-CB.WINDOW, 0], [0, 3], { w: 520, h: 124, l: 62, r: 10, t: 8, b: 24 });
  const rowY = { ok: 2.5, fail: 1.5, fast: 0.5 };
  const rowC = { ok: C.emerald, fail: C.rose, fast: C.amber };
  const pips = Array.from({ length: threshold }, (_, i) => i < s.consec);

  return (
    <Card
      title="Circuit breaker"
      params={P}
      caption="Drag the dependency failure rate up (try 80%): after enough consecutive failures the breaker trips OPEN and requests fail fast with a fallback instead of each waiting for a 2 s timeout. After the cooldown it lets one trial request through (HALF-OPEN). Lower the failure rate and the next trial closes it again. (Time is slowed down so you can watch.)"
    >
      <div ref={box}>
        <svg viewBox="0 0 520 112" className="w-full h-auto">
          <defs><Glow id={`${id}g`} sd={5} /></defs>
          {/* service → breaker → dependency */}
          <line x1={SVC + 48} y1={Y} x2={BRK - 22} y2={Y} stroke={C.axis} strokeWidth="2" />
          <line x1={BRK + 22} y1={Y} x2={DEP - 58} y2={Y} stroke={s.state === "open" ? C.grid : C.axis} strokeWidth="2" />
          <rect x={SVC - 48} y={Y - 22} width="96" height="44" rx="9" fill={C.ink8} stroke={C.sky} />
          <text x={SVC} y={Y - 3} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.sky}>Your service</text>
          <text x={SVC} y={Y + 12} textAnchor="middle" fontSize="8.5" fill={C.dim}>{(1 / CB.EVERY).toFixed(1)} req/s</text>
          {/* breaker switch */}
          <circle cx={BRK - 20} cy={Y} r="4" fill={col} />
          <circle cx={BRK + 20} cy={Y} r="4" fill={col} />
          <line x1={BRK - 20} y1={Y} x2={BRK + 20} y2={Y} stroke={col} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={s.state === "half" ? "5 4" : undefined}
            style={{ transformOrigin: `${BRK - 20}px ${Y}px`, transform: `rotate(${s.state === "open" ? -38 : s.state === "half" ? -16 : 0}deg)`, transition: `transform 400ms ${EASE}` }} />
          <text x={BRK} y={Y + 26} textAnchor="middle" fontSize="10" fontWeight="700" fill={col}>breaker: {CB_NAME[s.state]}</text>
          <rect x={DEP - 58} y={Y - 22} width="116" height="44" rx="9" fill={C.ink8} stroke={failPct >= 50 ? C.rose : C.brandL} />
          <text x={DEP} y={Y - 3} textAnchor="middle" fontSize="11" fontWeight="700" fill={failPct >= 50 ? C.rose : C.brandL}>Dependency</text>
          <text x={DEP} y={Y + 12} textAnchor="middle" fontSize="8.5" fill={C.dim}>{failPct}% of calls time out</text>
          {/* requests in flight */}
          {s.reqs.map((r) => {
            const k = clamp((t - r.t0) / (r.end - r.t0), 0, 1);
            let x, c, wait = false;
            if (r.kind === "fast") {
              const go = k < 0.5 ? k * 2 : 2 - k * 2;
              x = lerp(SVC + 48, BRK - 26, go);
              c = C.amber;
            } else if (r.kind === "ok") {
              const go = k < 0.5 ? k * 2 : 2 - k * 2;
              x = lerp(SVC + 48, DEP - 62, go);
              c = k < 0.5 ? C.sky : C.emerald;
            } else {
              const travel = CB.OK / 2 / CB.TIMEOUT;
              x = lerp(SVC + 48, DEP - 62, clamp(k / travel, 0, 1));
              wait = k > travel;
              c = wait ? C.rose : C.sky;
            }
            const dy = wait ? ((r.id % 5) - 2) * 7 : r.kind === "fast" ? -8 : 0;
            return (
              <g key={r.id}>
                {wait && <circle cx={x} cy={Y + dy} r={6 + 3 * ((t * 2) % 1)} fill="none" stroke={C.rose} opacity={1 - ((t * 2) % 1)} />}
                <circle cx={x} cy={Y + dy} r={r.trial ? 6 : 4.5} fill={c} stroke={r.trial ? "#fff" : "none"} />
              </g>
            );
          })}
          <text x={BRK} y={Y - 26} textAnchor="middle" fontSize="9" fill={C.text}>
            {s.state === "closed" ? "" : s.state === "open" ? `cooldown: ${fmt(Math.max(0, cooldown - (t - s.openedAt)), 1)}s left` : s.trial ? "trial request in flight…" : "waiting for a trial request"}
          </text>
          {s.state === "closed" && (
            <g>
              <text x={BRK - 52} y={Y - 25} fontSize="8.5" fill={C.text}>fails in a row</text>
              {pips.map((on, i) => <rect key={i} x={BRK + 10 + i * 8} y={Y - 32} width="6" height="8" rx="1.5" fill={on ? C.rose : C.ink7} />)}
            </g>
          )}
        </svg>
        {/* state machine */}
        <svg viewBox="0 0 520 152" className="mt-1 w-full h-auto">
          <g transform="translate(0, 12)">
          <defs>
            {EDGES.map((e, i) => <Arrow key={i} id={`${id}a${i}`} color={recent && recent.from === e.from && recent.to === e.to ? CB_COL[e.to] : C.axis} />)}
          </defs>
          {EDGES.map((e, i) => {
            const on = recent && recent.from === e.from && recent.to === e.to;
            return (
              <g key={i}>
                <path d={e.d} fill="none" stroke={on ? CB_COL[e.to] : C.axis} strokeWidth={on ? 3 : 1.4} markerEnd={`url(#${id}a${i})`} style={{ transition: "stroke 300ms, stroke-width 300ms" }} />
                <text x={e.lx} y={e.ly} textAnchor="middle" fontSize="9" fill={on ? CB_COL[e.to] : C.dim}>{e.label}</text>
              </g>
            );
          })}
          {Object.entries(SM).map(([k, p]) => {
            const on = s.state === k;
            return (
              <g key={k}>
                {on && <rect x={p.x - 56} y={p.y - 17} width="112" height="34" rx="17" fill={CB_COL[k]} opacity="0.45" filter={`url(#${id}g)`} />}
                <rect x={p.x - 56} y={p.y - 17} width="112" height="34" rx="17" fill={on ? CB_COL[k] : C.ink8} fillOpacity={on ? 0.25 : 1} stroke={CB_COL[k]} strokeWidth={on ? 2 : 1} strokeOpacity={on ? 1 : 0.5} style={{ transition: "all 300ms" }} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11.5" fontWeight="700" fill={on ? "#fff" : CB_COL[k]} opacity={on ? 1 : 0.7}>{CB_NAME[k]}</text>
              </g>
            );
          })}
          </g>
        </svg>
        {/* timeline: state bands + one mark per completed request */}
        <svg viewBox={`0 0 ${pt.w} ${pt.h}`} className="mt-1 w-full h-auto">
          {s.bands.map((b, i) => {
            const end = i + 1 < s.bands.length ? s.bands[i + 1].t0 : t;
            const x0 = pt.sx(clamp(b.t0 - t, -CB.WINDOW, 0)), x1 = pt.sx(clamp(end - t, -CB.WINDOW, 0));
            return <rect key={i} x={x0} y={pt.y1} width={Math.max(0, x1 - x0)} height={pt.y0 - pt.y1} fill={CB_COL[b.s]} opacity="0.1" />;
          })}
          <Axes p={pt} xticks={[-20, -15, -10, -5, 0]} xfmt={(v) => (v ? `${v}s` : "now")} />
          {Object.entries(rowY).map(([k, y]) => (
            <text key={k} x={pt.x0 - 5} y={pt.sy(y) + 3} textAnchor="end" fontSize="9.5" fill={rowC[k]}>{k === "ok" ? "success" : k === "fail" ? "timeout" : "fallback"}</text>
          ))}
          {s.log.map((l, i) => <circle key={i} cx={pt.sx(l.t - t)} cy={pt.sy(rowY[l.kind])} r="3.2" fill={rowC[l.kind]} opacity="0.9" />)}
        </svg>
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400">
        <Key color={C.emerald}>CLOSED band</Key>
        <Key color={C.rose}>OPEN band</Key>
        <Key color={C.amber}>HALF-OPEN band</Key>
      </div>
      <Row>
        <Stat label="success" value={s.n.ok} color="text-emerald-300" />
        <Stat label="timeouts" value={s.n.fail} color="text-rose-300" />
        <Stat label="fast-fail (fallback)" value={s.n.fast} color="text-amber-300" />
        <Stat label="latency saved" value={`${fmt(s.saved, 1)}s`} color="text-sky-300" />
      </Row>
      <Row>
        <Slider label="dependency failure rate" value={failPct} min={0} max={100} step={1} onChange={setFailPct} display={`${failPct}%`} />
      </Row>
      <Row>
        <Slider label="threshold" value={threshold} min={1} max={10} step={1} onChange={setThreshold} display={threshold} />
        <Slider label="cooldown" value={cooldown} min={1} max={15} step={1} onChange={setCooldown} display={`${cooldown}s`} />
        <Button primary onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Play"}</Button>
        <Button onClick={() => { sim.current = cbInit(seed); bump(); }}>Reset</Button>
      </Row>
    </Card>
  );
}

/* ====================================================================== */
/* 7. bloom-filter: k hashes into m bits, and false positives              */
/* ====================================================================== */

const BF_DEFAULT = ["apple", "banana", "cherry", "grape", "lemon"];
const BF_TRY = ["apple", "mango", "kiwi", "peach", "plum", "melon", "lime", "fig"];
const BF_DICT = [
  "mango", "kiwi", "peach", "plum", "melon", "lime", "fig", "papaya", "guava", "pear", "date", "olive", "coconut", "apricot", "orange",
  "quince", "lychee", "durian", "raisin", "nectarine", "berry", "tomato", "carrot", "onion", "garlic", "pepper", "potato", "radish",
  "spinach", "celery", "squash", "pumpkin", "turnip", "leek", "kale", "basil", "mint", "thyme", "sage", "dill", "fennel", "ginger",
  "cumin", "clove", "nutmeg", "vanilla", "cocoa", "coffee", "tea", "honey", "sugar", "salt", "bread", "rice", "pasta", "cheese", "butter",
];

/** k bit positions for a word via double hashing: (h1 + i·h2) mod m. */
function bfIdx(word, m, k) {
  const h1 = fnv1a(word), h2 = (fnv1a(word, 0x5bd1e995) | 1) >>> 0;
  return Array.from({ length: k }, (_, i) => (h1 + i * h2) % m);
}
const bfP = (n, m, k) => (1 - Math.exp((-k * n) / m)) ** k;

export function BloomFilter({ params = {} }) {
  const P = safe(params);
  const init = Array.isArray(P.words) ? P.words.filter((w) => typeof w === "string" && w.trim()).map((w) => w.trim().toLowerCase().slice(0, 24)).slice(0, 64) : BF_DEFAULT;
  const [m, setM] = useState(int(P.bits, 32, 16, 128));
  const [k, setK] = useState(int(P.hashes, 3, 1, 8));
  const [items, setItems] = useState(() => [...new Set(init)]);
  const [input, setInput] = useState("");
  const [last, setLast] = useState(null); // { op, word }
  const id = useSvgId();

  // Bits are rebuilt from the item list, so changing m or k "re-inserts" everything.
  const owners = useMemo(() => {
    const o = Array.from({ length: m }, () => []);
    items.forEach((w) => new Set(bfIdx(w, m, k)).forEach((i) => o[i].push(w)));
    return o;
  }, [items, m, k]);
  const n = items.length;
  const setBits = owners.filter((o) => o.length).length;

  const clean = (w) => String(w).trim().toLowerCase().slice(0, 24);
  const add = (w = input) => {
    const word = clean(w);
    if (!word) return;
    if (!items.includes(word) && items.length < 200) setItems((it) => [...it, word]);
    setLast({ op: "add", word, dup: items.includes(word) });
  };
  const check = (w = input) => {
    const word = clean(w);
    if (!word) return;
    setInput(word);
    setLast({ op: "check", word });
  };
  const findFP = () => {
    const hit = BF_DICT.find((w) => !items.includes(w) && bfIdx(w, m, k).every((i) => owners[i].length));
    if (hit) check(hit);
    else setLast({ op: "nofp" });
  };

  // Result of the last operation (recomputed so it stays correct if m/k change).
  const idx = last?.word ? bfIdx(last.word, m, k) : [];
  const res = last?.op === "check"
    ? (() => {
        const zero = idx.find((i) => !owners[i].length);
        if (zero !== undefined) return { tone: "sky", text: `“${last.word}”: definitely NOT present — bit ${zero} is 0.` };
        if (items.includes(last.word)) return { tone: "emerald", text: `“${last.word}”: probably present — all ${k} bits are 1 (and it really was added).` };
        const by = [...new Set(idx.flatMap((i) => owners[i]))];
        return { tone: "rose", fp: true, text: `“${last.word}”: probably present… but it was NEVER added — FALSE POSITIVE. Its bits were set by ${by.join(", ")}.` };
      })()
    : last?.op === "add"
      ? { tone: "brand", text: last.dup ? `“${last.word}” is already in the filter.` : `Added “${last.word}”: set bits ${[...new Set(idx)].join(", ")} to 1.` }
      : last?.op === "nofp"
        ? { tone: "sky", text: "No false positive found in the test dictionary — the filter is sparse enough. Add more words or shrink m." }
        : null;

  // Grid layout: 16 bits per row.
  const COLS = 16, CELL = 28, GX = (520 - COLS * CELL) / 2, GY = 76;
  const rows = Math.ceil(m / COLS);
  const H = GY + rows * CELL + 6;
  const cellAt = (i) => ({ x: GX + (i % COLS) * CELL, y: GY + Math.floor(i / COLS) * CELL });
  const hi = new Set(idx);
  const lineCol = last?.op === "check" ? (res?.fp ? C.rose : C.emerald) : C.amber;

  // FP-rate chart: p(n) for the current m and k.
  const nMax = Math.max(Math.ceil(m / 2), n + 2);
  const pc = plot([0, nMax], [0, 1], { w: 520, h: 150, l: 40, r: 12, t: 12, b: 26 });
  const pNow = bfP(n, m, k);
  const kOpt = n ? (m / n) * Math.LN2 : Infinity;
  const xt = nice(nMax, 4).ticks.filter((v) => v <= nMax);
  const TONES = { sky: "bg-sky-500/10 text-sky-300", emerald: "bg-emerald-500/10 text-emerald-300", rose: "bg-rose-500/10 text-rose-300", brand: "bg-brand-500/10 text-brand-300" };

  return (
    <Card
      title="Bloom filter"
      params={P}
      caption="Each word is hashed k times to k bit positions. Add sets those bits; Check looks at them — any 0 means definitely absent, all 1s means probably present. Click “find a false positive” to see a word that was never added but whose bits were all set by other words. More items or fewer bits ⇒ more false positives; the chart shows the theory."
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && check()}
          placeholder="type a word…"
          maxLength={24}
          className="w-36 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-slate-200 outline-none focus:border-brand-500"
        />
        <Button primary onClick={() => add()}>Add</Button>
        <Button onClick={() => check()}>Check</Button>
        <Button onClick={findFP}>Find a false positive</Button>
        <Button onClick={() => { setItems([]); setLast(null); }}>Clear</Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        try:
        {BF_TRY.map((w) => (
          <button key={w} type="button" onClick={() => check(w)} className="rounded border border-ink-600 px-1.5 py-px font-mono text-slate-300 hover:border-brand-500">{w}</button>
        ))}
      </div>
      <svg viewBox={`0 0 520 ${H}`} className="mt-2 w-full h-auto">
        {last?.word && (
          <g>
            <rect x={260 - 70} y={6} width="140" height="26" rx="7" fill={C.ink8} stroke={lineCol} />
            <text x={260} y={23} textAnchor="middle" fontSize="12" fontWeight="700" fill="#e2e8f0" fontFamily="ui-monospace, monospace">{last.word}</text>
            {idx.map((b, i) => {
              const c = cellAt(b);
              const sx = 260 + (i - (idx.length - 1) / 2) * 44;
              return (
                <g key={i}>
                  <path d={`M${sx},50 C${sx},${GY - 6} ${c.x + CELL / 2},${GY - 22} ${c.x + CELL / 2},${c.y + 3}`} fill="none" stroke={lineCol} strokeOpacity="0.55" strokeWidth="1.2" />
                  <text x={sx} y={45} textAnchor="middle" fontSize="9" fill={lineCol} fontFamily="ui-monospace, monospace">h{i}={b}</text>
                </g>
              );
            })}
          </g>
        )}
        {!last?.word && <text x="260" y="34" textAnchor="middle" fontSize="11" fill={C.dim}>Add or Check a word to see its {k} hash positions</text>}
        {owners.map((o, i) => {
          const c = cellAt(i);
          const on = o.length > 0;
          const h = hi.has(i);
          const ring = h ? (last.op === "check" && !on ? C.rose : lineCol) : C.axis;
          return (
            <g key={i}>
              <rect x={c.x + 2} y={c.y + 2} width={CELL - 4} height={CELL - 4} rx="4" fill={on ? C.brand : C.ink8} fillOpacity={on ? 0.75 : 1} stroke={ring} strokeWidth={h ? 2.2 : 1} style={{ transition: "fill 300ms, fill-opacity 300ms" }} />
              <text x={c.x + CELL / 2} y={c.y + CELL / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={on ? "#fff" : C.dim} fontFamily="ui-monospace, monospace">{on ? 1 : 0}</text>
              <text x={c.x + 4} y={c.y + 9} fontSize="6" fill={on ? "#ddd6fe" : C.dim}>{i}</text>
            </g>
          );
        })}
      </svg>
      {res && <div className={`mt-2 rounded-md px-3 py-1.5 text-xs ${TONES[res.tone]}`}>{res.text}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        in the filter ({n}):
        {items.length ? items.map((w) => <span key={w} className="rounded bg-ink-800 px-1.5 py-px font-mono text-brand-400">{w}</span>) : <span>nothing yet</span>}
      </div>
      <Row>
        <Slider label="bits m" value={m} min={16} max={128} step={8} onChange={setM} display={m} />
        <Slider label="hashes k" value={k} min={1} max={8} step={1} onChange={setK} display={k} />
      </Row>
      <svg viewBox={`0 0 ${pc.w} ${pc.h}`} className="mt-3 w-full h-auto">
        <Axes p={pc} xticks={xt} yticks={[0, 0.25, 0.5, 0.75, 1]} yfmt={(v) => `${v * 100}%`} xlabel="items inserted n" ylabel="false-positive rate p" />
        <polyline points={Array.from({ length: 121 }, (_, i) => { const x = (nMax * i) / 120; return `${pc.sx(x).toFixed(1)},${pc.sy(bfP(x, m, k)).toFixed(1)}`; }).join(" ")} fill="none" stroke={C.brandL} strokeWidth="2.2" />
        <line x1={pc.sx(n)} x2={pc.sx(n)} y1={pc.y0} y2={pc.sy(pNow)} stroke={C.amber} strokeDasharray="3 3" />
        <circle cx={pc.sx(n)} cy={pc.sy(pNow)} r="5" fill={C.amber} stroke="#fff" strokeWidth="1.2" />
        <text x={clamp(pc.sx(n) + 8, pc.x0 + 4, pc.x1 - 90)} y={Math.max(pc.y1 + 22, pc.sy(pNow) - 8)} fontSize="10" fill={C.amber}>n={n}: p≈{fmt(pNow * 100, 1)}%</text>
        <text x={pc.x1 - 4} y={pc.y1 + 26} textAnchor="end" fontSize="10" fill={C.text} fontFamily="ui-monospace, monospace">p = (1 − e^(−kn/m))^k</text>
      </svg>
      <Row>
        <Stat label="bits set" value={`${setBits}/${m} (${Math.round((setBits / m) * 100)}%)`} color="text-brand-400" />
        <Stat label="p(theory)" value={`${fmt(pNow * 100, 1)}%`} color="text-amber-300" />
        <Stat label="optimal k = (m/n)·ln2" value={n ? fmt(kOpt, 1) : "—"} color={n && Math.abs(Math.round(kOpt) - k) <= 0 ? "text-emerald-300" : "text-sky-300"} />
      </Row>
    </Card>
  );
}

export const WIDGETS_D = {
  sharding: Sharding,
  replication: Replication,
  "cap-theorem": CapTheorem,
  "rate-limiter": RateLimiter,
  "message-queue": MessageQueue,
  "circuit-breaker": CircuitBreaker,
  "bloom-filter": BloomFilter,
};
