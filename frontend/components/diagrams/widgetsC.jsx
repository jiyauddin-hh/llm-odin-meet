"use client";

// Interactive system-design teaching diagrams (set C). Each widget is rendered
// from a ```diagram fenced block in a lesson and receives optional JSON
// `params`. Everything is plain React + inline SVG; any randomness is seeded
// so server and client renders match, and simulations only start on the client.

import { useEffect, useId, useMemo, useRef, useState } from "react";

/* ---------- shared helpers ---------- */

const C = {
  brand: "#8b5cf6",
  brandL: "#a78bfa",
  amber: "#fbbf24",
  emerald: "#34d399",
  sky: "#38bdf8",
  fuchsia: "#e879f9",
  rose: "#fb7185",
  grid: "#191c2c",
  axis: "#363b56",
  text: "#94a3b8",
  dim: "#64748b",
};
// One colour per server / node (sky, amber, emerald, fuchsia, rose, violet, teal, orange).
const PALETTE = [C.sky, C.amber, C.emerald, C.fuchsia, C.rose, C.brandL, "#2dd4bf", "#fb923c"];
const DARK = "#0a0b14";

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

/** 32-bit string hash (FNV-1a + murmur finaliser so similar names spread out). */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** A param as a finite number (numeric strings allowed), else the default. */
function num(v, d) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : d;
}
/** Lessons may pass anything as params (null, an array…): treat it as {}. */
const obj = (p) => (p && typeof p === "object" && !Array.isArray(p) ? p : {});

/** 3 significant digits without trailing noise: 11.574 → "11.6". */
const sig = (v, p = 3) => (Number.isFinite(v) ? String(Number(v.toPrecision(p))) : "—");

/** Counts with K / M / B / T suffixes. */
function fmtCount(v) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  for (const [k, s] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]]) if (a >= k * 0.9995) return sig(v / k) + s;
  return sig(v);
}

/** Bytes in decimal units (1 KB = 1000 B, the usual estimation shortcut). */
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
function fmtBytes(b) {
  if (!Number.isFinite(b) || b < 0) return "—";
  let i = 0;
  while (b >= 999.5 && i < BYTE_UNITS.length - 1) {
    b /= 1000;
    i++;
  }
  return `${sig(b)} ${BYTE_UNITS[i]}`;
}

/** Seconds → "250 µs", "8.77 h", "3.2 years". */
const DUR_UNITS = [[3.15576e7, "years"], [2.6298e6, "months"], [86400, "days"], [3600, "h"], [60, "min"], [1, "s"], [1e-3, "ms"], [1e-6, "µs"], [1e-9, "ns"]];
function fmtDuration(s) {
  if (!Number.isFinite(s)) return "—";
  if (s <= 0) return "0 s";
  for (const [k, u] of DUR_UNITS) {
    if (s >= k * 0.9995) {
      const v = sig(s / k);
      return `${v} ${v === "1" && u.length > 3 ? u.slice(0, -1) : u}`;
    }
  }
  return `${sig(s * 1e9)} ns`;
}
const shortDur = (s) => fmtDuration(s).replace(" years", "y").replace(" year", "y").replace(" months", "mo").replace(" month", "mo").replace(" days", "d").replace(" day", "d").replace(" min", "m").replace(" ", "");

/** Linear scale with an inverse, used for data ↔ pixel mapping. */
function scale(d0, d1, r0, r1) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  f.inv = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
  return f;
}

/** Plot frame: viewBox size, padding and x/y scales. */
function plot(xd, yd, { w = 400, h = 260, l = 38, r = 12, t = 12, b = 28 } = {}) {
  const x0 = l, x1 = w - r, y0 = h - b, y1 = t;
  return { w, h, x0, x1, y0, y1, xd, yd, sx: scale(xd[0], xd[1], x0, x1), sy: scale(yd[0], yd[1], y0, y1) };
}

/** "Nice" axis ticks from 0 to just above max (steps of 1, 2 or 5 × 10^k). */
function niceTicks(max, n = 4) {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = 0; v < max + step * 0.999 && out.length < 12; v += step) out.push(v);
  return out;
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

/** Runs onFrame(dtSeconds) every animation frame while `on` is true. */
function useLoop(on, onFrame) {
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => {
    if (!on) return undefined;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      cb.current(Math.min(0.064, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}

/** Simulations live in refs; this re-renders on demand. */
function useForce() {
  const [, set] = useState(0);
  return () => set((n) => (n + 1) % 1e9);
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
  const prm = obj(params);
  return (
    <figure className="not-prose my-6 mx-auto max-w-[640px] rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="mb-3 text-sm font-semibold text-white">{typeof prm.title === "string" && prm.title ? prm.title : title}</div>
      {children}
      <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">{typeof prm.caption === "string" && prm.caption ? prm.caption : caption}</figcaption>
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
      <span className="w-14 shrink-0 text-right font-mono text-slate-200">{display ?? value}</span>
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

/** Bigger number tile for headline results. */
function Tile({ label, value, sub, color = "text-slate-200" }) {
  return (
    <div className="rounded-lg bg-ink-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-base font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{sub}</div>}
    </div>
  );
}

/** − value + control. */
function Stepper({ label, display, onDec, onInc, decDisabled, incDisabled }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400">
      <span>{label}</span>
      <Button className="px-2" onClick={onDec} disabled={decDisabled}>−</Button>
      <span className="min-w-[4rem] text-center font-mono text-slate-200">{display}</span>
      <Button className="px-2" onClick={onInc} disabled={incDisabled}>+</Button>
    </div>
  );
}

const Legend = ({ color, label, dashed }) => (
  <span className="flex items-center gap-1 text-[11px] text-slate-400">
    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${dashed ? "border border-dashed" : ""}`} style={dashed ? { borderColor: color } : { background: color }} />
    {label}
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

/* ---------- latency-numbers: "numbers every programmer should know" ---------- */

const LAT_CATS = {
  cpu: { label: "CPU / memory", color: C.sky },
  storage: { label: "Storage", color: C.amber },
  network: { label: "Network", color: C.fuchsia },
};
const LATENCIES = [
  { name: "L1 cache reference", ns: 0.5, cat: "cpu", note: "The value is already in the core's tiny private cache: the fastest read there is." },
  { name: "Branch mispredict", ns: 5, cat: "cpu", note: "The CPU guessed the wrong side of an if and has to throw work away." },
  { name: "L2 cache reference", ns: 7, cat: "cpu", note: "A bigger, slightly slower cache that is still on the chip." },
  { name: "Mutex lock / unlock", ns: 25, cat: "cpu", note: "An uncontended lock. Contended locks cost far more." },
  { name: "Main memory reference", ns: 100, cat: "cpu", note: "A trip out to RAM costs 200 L1 hits. That gap is why CPUs have caches." },
  { name: "Compress 1 KB (Zippy)", ns: 3000, cat: "cpu", note: "Fast compression is cheap next to sending the bytes over a network." },
  { name: "Send 1 KB over 1 Gbps", ns: 1e4, cat: "network", note: "Just the time to push 1 KB onto a 1 Gbps link." },
  { name: "SSD random read", ns: 1.5e5, cat: "storage", note: "Read one 4 KB page from flash, about 1,500× slower than RAM." },
  { name: "Read 1 MB from memory", ns: 2.5e5, cat: "cpu", note: "Sequential RAM reads stream at about 4 GB/s." },
  { name: "Round trip in datacenter", ns: 5e5, cat: "network", note: "One network call to another machine in the same building." },
  { name: "Read 1 MB from SSD", ns: 1e6, cat: "storage", note: "A sequential SSD read, about 4× slower than reading the same MB from memory." },
  { name: "Disk seek", ns: 1e7, cat: "storage", note: "A spinning disk physically moves its head. Avoid random disk I/O." },
  { name: "Read 1 MB from disk", ns: 2e7, cat: "storage", note: "A sequential read from a spinning disk, about 80× slower than memory." },
  { name: "Packet CA → Netherlands → CA", ns: 1.5e8, cat: "network", note: "Bounded by the speed of light: a cross-continent round trip is about 150 ms. Put servers near users." },
];
const LAT_NANO = ["1ns", "10ns", "100ns", "1µs", "10µs", "100µs", "1ms", "10ms", "100ms", "1s"];
const LAT_HUMAN = ["1s", "10s", "1.7m", "17m", "2.8h", "1.2d", "12d", "3.8mo", "3.2y", "32y"];
/** Human scale: 1 ns becomes 1 s, so the value in ns reads as seconds. */
const humanTime = (ns) => (ns < 60 ? `${sig(ns)} s` : fmtDuration(ns));

export function LatencyNumbers({ params = {} }) {
  const prm = obj(params);
  const [human, setHuman] = useState(prm.human === true);
  const [sel, setSel] = useState(4);
  const [hover, setHover] = useState(null);
  const [grown, setGrown] = useState(false); // bars grow in once mounted
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const rowH = 19, top = 6;
  const p = plot([-1, 9], [0, 1], { w: 520, h: top + LATENCIES.length * rowH + 36, l: 170, r: 62, t: top, b: 36 });
  const cur = LATENCIES[hover ?? sel] || LATENCIES[0];
  const cat = LAT_CATS[cur.cat];
  const valueText = (ns) => (human ? humanTime(ns) : fmtDuration(ns * 1e-9));

  return (
    <Card
      title="Latency numbers every engineer should know"
      params={params}
      caption="Each gridline is 10× slower than the last. Hover or tap a bar for details, then switch on Human scale: if an L1 cache hit took half a second, one transatlantic round trip would take almost five years."
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {Object.values(LAT_CATS).map((c) => <Legend key={c.label} color={c.color} label={c.label} />)}
        <Button primary={human} className="ml-auto" onClick={() => setHuman((h) => !h)}>{human ? "Human scale: on (1 ns = 1 s)" : "Human scale: off"}</Button>
      </div>
      <svg viewBox={`0 0 ${p.w} ${p.h}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}>
        <Axes p={p} xticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]} xfmt={(v) => (human ? LAT_HUMAN : LAT_NANO)[v]} />
        {LATENCIES.map((d, i) => {
          const y = top + i * rowH;
          const bw = Math.max(1, p.sx(Math.log10(d.ns)) - p.x0);
          const color = LAT_CATS[d.cat].color;
          const on = (hover ?? sel) === i;
          return (
            <g key={d.name} className="cursor-pointer" onMouseEnter={() => setHover(i)} onClick={() => setSel(i)}>
              <rect x="0" y={y} width={p.w} height={rowH} fill={on ? C.brand : "#fff"} opacity={on ? 0.12 : 0} rx="3" />
              <text x={p.x0 - 6} y={y + rowH / 2 + 3.5} textAnchor="end" fontSize="10" fill={on ? "#e2e8f0" : C.text}>{d.name}</text>
              <rect
                x={p.x0}
                y={y + 3.5}
                height={rowH - 7}
                width={grown ? bw : 0}
                rx="2"
                fill={color}
                opacity={on ? 1 : 0.75}
                style={{ transition: `width 0.9s cubic-bezier(.2,.8,.2,1) ${i * 45}ms` }}
              />
              <text
                x={p.x0 + bw + 5}
                y={y + rowH / 2 + 3.5}
                fontSize="9.5"
                fontFamily="ui-monospace, monospace"
                fill={on ? "#e2e8f0" : C.text}
                style={{ opacity: grown ? 1 : 0, transition: `opacity 0.4s ease ${0.5 + i * 0.045}s` }}
              >
                {valueText(d.ns)}
              </text>
            </g>
          );
        })}
        <text x={(p.x0 + p.x1) / 2} y={p.y0 + 28} textAnchor="middle" fontSize="10" fill={C.text}>
          {human ? "time if 1 ns took 1 second (log scale)" : "latency (log scale: each gridline is 10× slower)"}
        </text>
      </svg>
      <div className="mt-3 rounded-lg bg-ink-800 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold" style={{ color: cat.color }}>{cur.name}</span>
          <span className="font-mono text-sm text-slate-200">{fmtDuration(cur.ns * 1e-9)}</span>
          <span className="text-xs text-slate-400">≈ <span className="font-mono text-amber-300">{humanTime(cur.ns)}</span> on the human scale</span>
          <span className="text-xs text-slate-500">{cur.ns === 0.5 ? "the baseline" : `${fmtCount(cur.ns / 0.5)}× an L1 hit`}</span>
        </div>
        <div className="mt-1 text-xs leading-relaxed text-slate-400">{cur.note}</div>
      </div>
    </Card>
  );
}

/* ---------- availability: the nines, downtime budgets, series vs parallel ---------- */

const AV_STOPS = [0.9, 0.95, 0.99, 0.995, 0.999, 0.9995, 0.9999, 0.99995, 0.99999];
const YEAR_S = 365.25 * 86400;
const AV_PERIODS = [["per year", YEAR_S], ["per month", YEAR_S / 12], ["per week", 7 * 86400], ["per day", 86400]];

/** Availability as a percentage with just enough digits: 0.998001 → "99.8%". */
function pctStr(a) {
  if (!Number.isFinite(a)) return "—";
  const miss = 1 - a;
  if (miss <= 1e-12) return "≈100%";
  const d = clamp(Math.ceil(-Math.log10(miss) - 1e-9) - 1, 0, 10);
  let s = (a * 100).toFixed(d);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return `${s}%`;
}
const ninesOf = (a) => (1 - a <= 1e-12 ? "12+" : (-Math.log10(1 - a)).toFixed(1));
/** Index of the stop closest to a target availability (compared on the log of downtime). */
const nearestStop = (a) => {
  const t = Math.log10(Math.max(1e-9, 1 - a));
  let best = 0;
  AV_STOPS.forEach((s, i) => {
    if (Math.abs(Math.log10(1 - s) - t) < Math.abs(Math.log10(1 - AV_STOPS[best]) - t)) best = i;
  });
  return best;
};

export function Availability({ params = {} }) {
  const prm = obj(params);
  const [idx, setIdx] = useState(() => nearestStop(1 - 10 ** -clamp(num(prm.nines, 3), 1, 5)));
  const [n, setN] = useState(() => Math.round(clamp(num(prm.components, 3), 1, 6)));
  const [ci, setCi] = useState(() => nearestStop(clamp(num(prm.component, 0.99), 0.9, 0.99999)));
  const A = AV_STOPS[idx];
  const a = AV_STOPS[ci];
  const series = a ** n;
  const parallel = 1 - (1 - a) ** n;

  // Downtime-per-year bars for every stop (log height so each nine is one step down).
  const bars = AV_STOPS.map((s, i) => {
    const sec = (1 - s) * YEAR_S;
    const hgt = clamp(((Math.log10(sec / 3600) + 1.5) / 4.6) * 64, 4, 70);
    return { i, s, sec, hgt };
  });

  // Series / parallel diagram geometry.
  const slotW = 360 / n;
  const bw = Math.min(70, slotW - 10);
  const prH = Math.min(26, 112 / n);
  const prTop = 104 + (112 - prH * n) / 2;
  const mid = 160;

  return (
    <Card
      title="Availability: counting the nines"
      params={params}
      caption="Drag the slider (or tap a bar): every extra nine cuts the downtime budget by 10×. Then build a system: parts in series must ALL be up, so availability multiplies down; redundant parts in parallel only fail if ALL of them fail."
    >
      <Row className="mt-0">
        <Slider label="availability" value={idx} min={0} max={AV_STOPS.length - 1} step={1} onChange={(v) => setIdx(clamp(Math.round(v), 0, AV_STOPS.length - 1))} display={pctStr(A)} />
        <Stat label="nines" value={ninesOf(A)} color="text-brand-400" />
      </Row>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {AV_PERIODS.map(([label, secs]) => (
          <Tile key={label} label={`downtime ${label}`} value={fmtDuration((1 - A) * secs)} color="text-amber-300" />
        ))}
      </div>
      <svg viewBox="0 0 400 122" className="mt-3 w-full h-auto">
        <text x="4" y="11" fontSize="10" fill={C.text}>allowed downtime per year (log scale), tap a bar</text>
        <line x1="4" x2="396" y1="96" y2="96" stroke={C.axis} />
        {bars.map((b) => {
          const x = 8 + b.i * 43.5;
          const on = b.i === idx;
          return (
            <g key={b.i} className="cursor-pointer" onClick={() => setIdx(b.i)}>
              <rect x={x - 3} y="14" width="40" height="106" fill="#fff" opacity="0" />
              <rect x={x} y={96 - b.hgt} width="34" height={b.hgt} rx="3" fill={on ? C.amber : C.axis} style={{ transition: "fill 0.3s" }} />
              <text x={x + 17} y={92 - b.hgt} textAnchor="middle" fontSize="8.5" fill={on ? C.amber : C.dim}>{shortDur(b.sec)}</text>
              <text x={x + 17} y="110" textAnchor="middle" fontSize="8.5" fill={on ? "#e2e8f0" : C.dim}>{pctStr(b.s)}</text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 border-t border-ink-700 pt-3 text-[11px] uppercase tracking-wider text-slate-500">compose a system</div>
      <Row className="mt-2">
        <Stepper label="components" display={n} onDec={() => setN((v) => Math.max(1, v - 1))} onInc={() => setN((v) => Math.min(6, v + 1))} decDisabled={n <= 1} incDisabled={n >= 6} />
        <Stepper label="each" display={pctStr(a)} onDec={() => setCi((v) => Math.max(0, v - 1))} onInc={() => setCi((v) => Math.min(AV_STOPS.length - 1, v + 1))} decDisabled={ci <= 0} incDisabled={ci >= AV_STOPS.length - 1} />
      </Row>
      <svg viewBox="0 0 400 226" className="mt-2 w-full h-auto">
        {/* series: one chain, every link must hold */}
        <text x="4" y="14" fontSize="10.5" fontWeight="600" fill={C.rose}>SERIES: all must be up</text>
        <line x1="14" x2="386" y1="46" y2="46" stroke={C.axis} strokeWidth="2" />
        <circle cx="14" cy="46" r="4" fill={C.dim} />
        <circle cx="386" cy="46" r="4" fill={C.dim} />
        {Array.from({ length: n }, (_, i) => {
          const cx = 20 + slotW * (i + 0.5);
          return (
            <g key={`s${i}`}>
              <rect x={cx - bw / 2} y="32" width={bw} height="28" rx="5" fill="#191c2c" stroke={C.rose} strokeOpacity="0.7" />
              <text x={cx} y="50" textAnchor="middle" fontSize={bw < 50 ? 8.5 : 10} fontFamily="ui-monospace, monospace" fill="#e2e8f0">{pctStr(a)}</text>
            </g>
          );
        })}
        <text x="396" y="80" textAnchor="end" fontSize="10" fill={C.text}>
          {pctStr(a)}<tspan baselineShift="super" fontSize="7">{n}</tspan> = <tspan fill={C.rose} fontWeight="700">{pctStr(series)}</tspan>
        </text>

        {/* parallel: redundant copies, any one is enough */}
        <text x="4" y="98" fontSize="10.5" fontWeight="600" fill={C.emerald}>PARALLEL: any one is enough</text>
        <line x1="14" x2="110" y1={mid} y2={mid} stroke={C.axis} strokeWidth="2" />
        <line x1="290" x2="386" y1={mid} y2={mid} stroke={C.axis} strokeWidth="2" />
        <circle cx="14" cy={mid} r="4" fill={C.dim} />
        <circle cx="386" cy={mid} r="4" fill={C.dim} />
        {Array.from({ length: n }, (_, i) => {
          const cy = prTop + prH * (i + 0.5);
          return (
            <g key={`p${i}`}>
              <path d={`M110,${mid} C140,${mid} 140,${cy} 165,${cy} M235,${cy} C260,${cy} 260,${mid} 290,${mid}`} fill="none" stroke={C.axis} strokeWidth="1.5" />
              <rect x="165" y={cy - prH / 2 + 2} width="70" height={prH - 4} rx="4" fill="#191c2c" stroke={C.emerald} strokeOpacity="0.7" />
              <text x="200" y={cy + 3.5} textAnchor="middle" fontSize={prH < 18 ? 8.5 : 10} fontFamily="ui-monospace, monospace" fill="#e2e8f0">{pctStr(a)}</text>
            </g>
          );
        })}
        <text x="396" y="98" textAnchor="end" fontSize="10" fill={C.text}>
          1 − (1 − {pctStr(a)})<tspan baselineShift="super" fontSize="7">{n}</tspan> = <tspan fill={C.emerald} fontWeight="700">{pctStr(parallel)}</tspan>
        </text>
      </svg>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Tile label="series" value={pctStr(series)} color="text-rose-300" sub={`${ninesOf(series)} nines · down ${fmtDuration((1 - series) * YEAR_S)}/yr${n > 1 ? " · worse than any single part" : ""}`} />
        <Tile label="parallel (redundant)" value={pctStr(parallel)} color="text-emerald-300" sub={`${ninesOf(parallel)} nines · down ${fmtDuration((1 - parallel) * YEAR_S)}/yr`} />
      </div>
    </Card>
  );
}

/* ---------- estimation: back-of-the-envelope capacity planning ---------- */

const DAY_S = 86400;
const round2 = (v) => Number(v.toPrecision(2));

export function Estimation({ params = {} }) {
  const prm = obj(params);
  // Log sliders keep log10 of the value so 1K…10B fits on one track.
  const [lDau, setDau] = useState(() => Math.log10(clamp(num(prm.dau, 1e8), 1e3, 1e10)));
  const [lApu, setApu] = useState(() => Math.log10(clamp(num(prm.actionsPerUser, 10), 0.1, 1000)));
  const [lRw, setRw] = useState(() => Math.log10(clamp(num(prm.readWrite, 10), 0.1, 1000)));
  const [lKb, setKb] = useState(() => Math.log10(clamp(num(prm.objectKB, 1), 0.1, 10000)));
  const [peak, setPeak] = useState(() => clamp(num(prm.peak, 2), 1, 10));
  const [years, setYears] = useState(() => Math.round(clamp(num(prm.years, 5), 1, 10)));
  const [rep, setRep] = useState(prm.replication !== false);

  const dau = round2(10 ** lDau), apu = round2(10 ** lApu), rw = round2(10 ** lRw), kb = round2(10 ** lKb);
  const writesDay = dau * apu;
  const wq = writesDay / DAY_S;
  const rq = wq * rw;
  const pk = (wq + rq) * peak;
  const bytesDay = writesDay * kb * 1000;
  const rf = rep ? 3 : 1;
  const perYear = bytesDay * 365;
  const total = perYear * years * rf;
  const bwIn = wq * kb * 1000, bwOut = rq * kb * 1000;

  const yt = niceTicks(total);
  const p = plot([0.4, years + 0.6], [0, yt[yt.length - 1] || 1], { h: 180, l: 52, t: 22 });
  const barW = Math.min(30, ((p.x1 - p.x0) / (years + 0.2)) * 0.62);

  const lines = [
    ["write QPS", `${fmtCount(dau)} users × ${sig(apu)} writes / 86,400 s`, `≈ ${fmtCount(wq)}/s`],
    ["read QPS", `${fmtCount(wq)} × ${sig(rw)} reads per write`, `≈ ${fmtCount(rq)}/s`],
    ["peak QPS", `(${fmtCount(wq)} + ${fmtCount(rq)}) × ${sig(peak)} peak factor`, `≈ ${fmtCount(pk)}/s`],
    ["storage/day", `${fmtCount(writesDay)} writes × ${fmtBytes(kb * 1000)}`, `≈ ${fmtBytes(bytesDay)}`],
    ["storage total", `${fmtBytes(bytesDay)} × 365 × ${years} yr${rep ? " × 3 replicas" : ""}`, `≈ ${fmtBytes(total)}`],
    ["bandwidth", `in ${fmtCount(wq)}/s × ${fmtBytes(kb * 1000)} · out ${fmtCount(rq)}/s × ${fmtBytes(kb * 1000)}`, `${fmtBytes(bwIn)}/s · ${fmtBytes(bwOut)}/s`],
  ];

  return (
    <Card
      title="Back-of-the-envelope estimation"
      params={params}
      caption="Move the sliders and watch the formulas update. The habit to learn: users × actions ÷ 86,400 gives QPS, and writes × object size × days × replicas gives storage. Round boldly: you only need the right order of magnitude."
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <Slider label="daily users" value={lDau} min={3} max={10} step={0.05} onChange={setDau} display={fmtCount(dau)} />
        <Slider label="writes/user/day" value={lApu} min={-1} max={3} step={0.05} onChange={setApu} display={sig(apu)} />
        <Slider label="reads per write" value={lRw} min={-1} max={3} step={0.05} onChange={setRw} display={`${sig(rw)}:1`} />
        <Slider label="object size" value={lKb} min={-1} max={4} step={0.05} onChange={setKb} display={fmtBytes(kb * 1000)} />
        <Slider label="peak factor" value={peak} min={1} max={10} step={0.5} onChange={setPeak} display={`${sig(peak)}×`} />
        <Slider label="years" value={years} min={1} max={10} step={1} onChange={(v) => setYears(Math.round(v))} display={years} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="write QPS" value={fmtCount(wq)} color="text-sky-300" />
        <Tile label="read QPS" value={fmtCount(rq)} color="text-emerald-300" />
        <Tile label="peak QPS" value={fmtCount(pk)} color="text-amber-300" />
        <Tile label="storage / day" value={fmtBytes(bytesDay)} color="text-brand-400" />
        <Tile label={`storage · ${years} yr`} value={fmtBytes(total)} color="text-fuchsia-300" sub={rep ? "incl. 3× replication" : "single copy"} />
        <Tile label="bandwidth in" value={`${fmtBytes(bwIn)}/s`} color="text-sky-300" />
        <Tile label="bandwidth out" value={`${fmtBytes(bwOut)}/s`} color="text-emerald-300" />
        <button
          type="button"
          onClick={() => setRep((r) => !r)}
          className={`rounded-lg px-3 py-2 text-left text-xs transition-colors ${rep ? "bg-brand-500/20 text-brand-200 ring-1 ring-brand-500/60" : "bg-ink-800 text-slate-400 hover:bg-ink-700"}`}
        >
          <div className="text-[10px] uppercase tracking-wider text-slate-500">replication</div>
          <div className="font-mono text-base font-semibold">{rep ? "3× on" : "off"}</div>
        </button>
      </div>
      <div className="mt-3 space-y-1 rounded-lg bg-ink-800 px-3 py-2 font-mono text-[11px] leading-relaxed">
        {lines.map(([k, f, r]) => (
          <div key={k} className="flex flex-wrap gap-x-2">
            <span className="w-24 shrink-0 text-slate-500">{k}</span>
            <span className="text-slate-300">{f}</span>
            <span className="text-amber-300">{r}</span>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${p.w} ${p.h}`} className="mt-3 w-full h-auto">
        <Axes p={p} xticks={Array.from({ length: years }, (_, i) => i + 1)} yticks={yt} xfmt={(v) => `yr ${v}`} yfmt={(v) => (v === 0 ? "0" : fmtBytes(v))} />
        <text x={p.x0} y="12" fontSize="10" fill={C.text}>cumulative storage</text>
        <g fontSize="10">
          <rect x={p.x1 - 150} y="4" width="9" height="9" rx="2" fill={C.brand} />
          <text x={p.x1 - 137} y="12" fill={C.text}>data</text>
          {rep && (
            <>
              <rect x={p.x1 - 98} y="4" width="9" height="9" rx="2" fill={C.brandL} opacity="0.45" />
              <text x={p.x1 - 85} y="12" fill={C.text}>2 extra replicas</text>
            </>
          )}
        </g>
        {Array.from({ length: years }, (_, i) => {
          const y = i + 1;
          const data = perYear * y;
          const all = data * rf;
          const x = p.sx(y) - barW / 2;
          return (
            <g key={y}>
              <rect x={x} y={p.sy(all)} width={barW} height={Math.max(0, p.sy(data) - p.sy(all))} fill={C.brandL} opacity="0.45" style={{ transition: "y 0.4s, height 0.4s" }} />
              <rect x={x} y={p.sy(data)} width={barW} height={Math.max(0, p.y0 - p.sy(data))} fill={C.brand} style={{ transition: "y 0.4s, height 0.4s" }} />
              {(years <= 6 || y === years) && (
                <text x={p.sx(y)} y={p.sy(all) - 4} textAnchor="middle" fontSize="9" fill={C.text}>{fmtBytes(all)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </Card>
  );
}

/* ---------- scaling: vertical (bigger box) vs horizontal (more boxes) ---------- */

// Bigger machines cost disproportionately more, and the biggest one is a hard ceiling.
const VERT_TIERS = [
  { cpu: 2, ram: 4, cap: 2000, cost: 40 },
  { cpu: 4, ram: 16, cap: 5000, cost: 110 },
  { cpu: 8, ram: 32, cap: 10000, cost: 250 },
  { cpu: 16, ram: 64, cap: 20000, cost: 600 },
  { cpu: 32, ram: 128, cap: 40000, cost: 1500 },
  { cpu: 64, ram: 256, cap: 80000, cost: 3800 },
  { cpu: 128, ram: 1024, cap: 160000, cost: 10000 },
  { cpu: 224, ram: 4096, cap: 280000, cost: 25000 }, // the biggest box money can buy
];
const V_MAX = VERT_TIERS[VERT_TIERS.length - 1];
const H_CAP = 10000; // users one commodity server handles
const H_COST = 250; // $/month per commodity server
const LB_COST = 60; // $/month for the load balancer
const SC_LO = 3, SC_HI = 6.7; // log10 users: 1K … 5M
const vertTier = (u) => VERT_TIERS.findIndex((t) => t.cap >= u); // -1: beyond the biggest box
const hServers = (u) => Math.max(2, Math.ceil(u / H_CAP)); // at least 2 for redundancy
const ramStr = (gb) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`);

/** Three little person glyphs. */
function People({ x, y, color }) {
  return (
    <g fill={color}>
      {[-14, 0, 14].map((dx, i) => {
        const px = x + dx, py = y + (i === 1 ? -5 : 0);
        return (
          <g key={dx}>
            <circle cx={px} cy={py - 8} r="4.5" />
            <path d={`M${px - 7},${py + 6} a7,7 0 0 1 14,0 z`} />
          </g>
        );
      })}
    </g>
  );
}

/** Dots that flow along an SVG path forever (SMIL, so no re-renders needed). */
function Flow({ d, count, color, dur = 1.4 }) {
  return Array.from({ length: count }, (_, i) => (
    <circle key={i} r="2.6" fill={color} opacity="0.9">
      <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(-i * dur) / count}s`} path={d} />
    </circle>
  ));
}

export function Scaling({ params = {} }) {
  const prm = obj(params);
  const [mode, setMode] = useState(prm.mode === "vertical" ? "vertical" : "horizontal");
  const [lu, setLu] = useState(() => clamp(Math.log10(Math.max(1, num(prm.users, 5000))), SC_LO, SC_HI));
  const [ramp, setRamp] = useState(false);
  const id = useSvgId();
  useTicker(ramp, () => (lu >= SC_HI ? setRamp(false) : setLu(Math.min(SC_HI, lu + 0.025))), 70);

  const users = round2(10 ** lu);
  const ti = vertTier(users);
  const vOver = ti < 0;
  const tier = vOver ? V_MAX : VERT_TIERS[ti];
  const vCap = tier.cap, vCost = tier.cost;
  const hs = hServers(users);
  const hCap = hs * H_CAP, hCost = hs * H_COST + LB_COST;
  const vert = mode === "vertical";
  const util = clamp(users / (vert ? vCap : hCap), 0, 1);
  const utilColor = (u) => (u > 0.95 ? C.rose : u > 0.75 ? C.amber : C.emerald);
  const nDots = 2 + Math.round((lu - SC_LO) * 2);

  // Capacity and cost charts on log-log axes, side by side.
  const pc = plot([SC_LO, SC_HI], [3, 7], { w: 400, h: 180, l: 40, r: 214, t: 22, b: 30 });
  const pk = plot([SC_LO, SC_HI], [1, 5.5], { w: 400, h: 180, l: 240, r: 8, t: 22, b: 30 });
  const path = (fn, pp) => {
    let d = "", pen = false;
    for (let i = 0; i <= 220; i++) {
      const x = SC_LO + ((SC_HI - SC_LO) * i) / 220;
      const v = fn(10 ** x);
      if (v == null) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${pp.sx(x).toFixed(1)},${pp.sy(clamp(Math.log10(v), pp.yd[0], pp.yd[1])).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const vCapFn = (u) => (vertTier(u) < 0 ? V_MAX.cap : VERT_TIERS[vertTier(u)].cap);
  const vCostFn = (u) => (vertTier(u) < 0 ? null : VERT_TIERS[vertTier(u)].cost);
  const hCapFn = (u) => hServers(u) * H_CAP;
  const hCostFn = (u) => hServers(u) * H_COST + LB_COST;
  const ceilX = Math.log10(V_MAX.cap);
  const cell = { cols: 6, w: 24, h: 30, gx: 28, gy: 36, x: 222, y: 16 };
  const shown = Math.min(hs, 24);

  // Vertical: one box that grows with the tier.
  const vi = vOver ? VERT_TIERS.length - 1 : ti;
  const vw = 60 + vi * 12, vh = 46 + vi * 10;
  const vx = 285 - vw / 2, vy = 82 - vh / 2;

  return (
    <Card
      title="Vertical vs horizontal scaling"
      params={params}
      caption="Drag the traffic slider (or press Ramp up). Vertical scaling buys a bigger machine: cheap and simple at first, but the price per user climbs and you hit a ceiling at the biggest box, which is also a single point of failure. Horizontal scaling adds commodity servers behind a load balancer: more moving parts, but it keeps growing in a straight line."
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Button primary={vert} onClick={() => setMode("vertical")}>Vertical (scale up)</Button>
        <Button primary={!vert} onClick={() => setMode("horizontal")}>Horizontal (scale out)</Button>
      </div>
      <svg viewBox="0 0 400 170" className="w-full h-auto">
        <defs>
          <Arrow id={`${id}a`} color={C.dim} />
        </defs>
        <People x={42} y={78} color={C.text} />
        <text x="42" y="104" textAnchor="middle" fontSize="11" fontWeight="600" fill="#e2e8f0">{fmtCount(users)}</text>
        <text x="42" y="117" textAnchor="middle" fontSize="9.5" fill={C.dim}>users</text>
        {vert ? (
          <g>
            <line x1="72" y1="80" x2={vx - 6} y2="80" stroke={C.axis} strokeWidth="2" markerEnd={`url(#${id}a)`} />
            <Flow d={`M72,80 L${vx - 6},80`} count={nDots} color={vOver ? C.rose : C.sky} />
            <g style={{ transition: "all 0.4s" }}>
              <rect x={vx} y={vy} width={vw} height={vh} rx="8" fill={vOver ? "rgba(251,113,133,0.12)" : "#191c2c"} stroke={vOver ? C.rose : C.brandL} strokeWidth={vOver ? 2.5 : 1.5} />
              {/* utilisation fills the box from the bottom */}
              <rect x={vx + 3} y={vy + vh - 3 - (vh - 6) * util} width={vw - 6} height={(vh - 6) * util} rx="5" fill={utilColor(util)} opacity="0.18" />
              <text x="285" y={vy + vh / 2 - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#e2e8f0">{tier.cpu} vCPU</text>
              <text x="285" y={vy + vh / 2 + 10} textAnchor="middle" fontSize="10" fill={C.text}>{ramStr(tier.ram)} RAM</text>
            </g>
            <text x="285" y={vy - 5} textAnchor="middle" fontSize="9.5" fill={utilColor(util)}>{vOver ? "OVERLOADED" : `${Math.round(util * 100)}% busy`}</text>
            <text x="285" y={vy + vh + 13} textAnchor="middle" fontSize="9.5" fill={vOver ? C.rose : C.amber}>
              {vOver ? "ceiling: no bigger machine exists" : "single point of failure"}
            </text>
          </g>
        ) : (
          <g>
            <line x1="72" y1="80" x2="146" y2="80" stroke={C.axis} strokeWidth="2" markerEnd={`url(#${id}a)`} />
            <Flow d="M72,80 L146,80" count={nDots} color={C.sky} />
            <rect x="150" y="60" width="50" height="40" rx="7" fill="#191c2c" stroke={C.brandL} strokeWidth="1.5" />
            <text x="175" y="78" textAnchor="middle" fontSize="11" fontWeight="700" fill="#e2e8f0">LB</text>
            <text x="175" y="91" textAnchor="middle" fontSize="8.5" fill={C.dim}>load bal.</text>
            {Array.from({ length: shown }, (_, i) => {
              const cx = cell.x + (i % cell.cols) * cell.gx, cy = cell.y + Math.floor(i / cell.cols) * cell.gy;
              const more = i === 23 && hs > 24;
              return (
                <g key={i}>
                  <line x1="200" y1="80" x2={cx} y2={cy + cell.h / 2} stroke={C.axis} strokeOpacity="0.45" />
                  <rect x={cx} y={cy} width={cell.w} height={cell.h} rx="4" fill="#191c2c" stroke={more ? C.dim : C.sky} strokeOpacity="0.8" />
                  {more ? (
                    <text x={cx + cell.w / 2} y={cy + cell.h / 2 + 3} textAnchor="middle" fontSize="8" fill={C.text}>+{fmtCount(hs - 23)}</text>
                  ) : (
                    <rect x={cx + 2} y={cy + cell.h - 2 - (cell.h - 4) * util} width={cell.w - 4} height={(cell.h - 4) * util} rx="2" fill={utilColor(util)} opacity="0.35" />
                  )}
                </g>
              );
            })}
            {[0, 1, 2].filter((i) => i < shown).map((i) => {
              const cx = cell.x + (i % cell.cols) * cell.gx, cy = cell.y + Math.floor(i / cell.cols) * cell.gy;
              return <Flow key={i} d={`M200,80 L${cx},${cy + cell.h / 2}`} count={2} color={C.sky} dur={1} />;
            })}
            <text x="175" y="118" textAnchor="middle" fontSize="9.5" fill={C.text}>{hs} servers × {fmtCount(H_CAP)}</text>
            <text x="175" y="131" textAnchor="middle" fontSize="9.5" fill={C.emerald}>one can fail safely</text>
          </g>
        )}
      </svg>
      <Row>
        <Slider label="traffic" value={lu} min={SC_LO} max={SC_HI} step={0.01} onChange={(v) => { setRamp(false); setLu(v); }} display={fmtCount(users)} />
        <Button primary onClick={() => (lu >= SC_HI ? (setLu(SC_LO), setRamp(true)) : setRamp((r) => !r))}>{ramp ? "Pause" : lu >= SC_HI ? "Replay ramp" : "Ramp up"}</Button>
      </Row>
      <Row>
        <Stat label="capacity" value={`${fmtCount(vert ? vCap : hCap)} users`} color={vert && vOver ? "text-rose-300" : "text-sky-300"} />
        <Stat label="cost" value={`$${fmtCount(vert ? vCost : hCost)}/mo`} color="text-amber-300" />
        <Stat label="per 1K users" value={`$${sig(((vert ? vCost : hCost) / users) * 1000)}`} />
        <Stat label="busy" value={`${Math.round(util * 100)}%`} color={util > 0.95 ? "text-rose-300" : "text-emerald-300"} />
      </Row>
      <svg viewBox="0 0 400 180" className="mt-3 w-full h-auto">
        <rect x={pc.sx(ceilX)} y={pc.y1} width={pc.x1 - pc.sx(ceilX)} height={pc.y0 - pc.y1} fill={C.rose} opacity="0.07" />
        <Axes p={pc} xticks={[3, 4, 5, 6]} yticks={[3, 4, 5, 6, 7]} xfmt={(v) => fmtCount(10 ** v)} yfmt={(v) => fmtCount(10 ** v)} />
        <Axes p={pk} xticks={[3, 4, 5, 6]} yticks={[1, 2, 3, 4, 5]} xfmt={(v) => fmtCount(10 ** v)} yfmt={(v) => `$${fmtCount(10 ** v)}`} />
        <text x={pc.x0} y="12" fontSize="10" fill={C.text}>capacity vs load (users)</text>
        <text x={pk.x0} y="12" fontSize="10" fill={C.text}>monthly cost vs load</text>
        <text x={pc.x1} y={pc.y0 + 24} textAnchor="end" fontSize="9" fill={C.dim}>load (users) →</text>
        <text x={pk.x1} y={pk.y0 + 24} textAnchor="end" fontSize="9" fill={C.dim}>load (users) →</text>
        <line x1={pc.sx(SC_LO)} y1={pc.sy(SC_LO)} x2={pc.sx(SC_HI)} y2={pc.sy(SC_HI)} stroke={C.text} strokeDasharray="4 3" />
        <text x={pc.sx(4.6)} y={pc.sy(4.6) + 14} fontSize="8.5" fill={C.text} transform={`rotate(-41 ${pc.sx(4.6)} ${pc.sy(4.6) + 14})`}>load</text>
        <path d={path(vCapFn, pc)} fill="none" stroke={C.amber} strokeWidth={vert ? 2.5 : 1.3} opacity={vert ? 1 : 0.5} />
        <path d={path(hCapFn, pc)} fill="none" stroke={C.sky} strokeWidth={vert ? 1.3 : 2.5} opacity={vert ? 0.5 : 1} />
        <path d={path(vCostFn, pk)} fill="none" stroke={C.amber} strokeWidth={vert ? 2.5 : 1.3} opacity={vert ? 1 : 0.5} />
        <path d={path(hCostFn, pk)} fill="none" stroke={C.sky} strokeWidth={vert ? 1.3 : 2.5} opacity={vert ? 0.5 : 1} />
        <text x={pk.sx(ceilX) + 3} y={pk.sy(Math.log10(V_MAX.cost)) - 4} fontSize="11" fontWeight="700" fill={C.rose}>✕</text>
        <text x={pc.sx(ceilX) + 3} y={pc.y0 - 5} fontSize="8.5" fill={C.rose}>ceiling</text>
        {/* current traffic marker on both charts */}
        <line x1={pc.sx(lu)} x2={pc.sx(lu)} y1={pc.y1} y2={pc.y0} stroke={C.brandL} strokeOpacity="0.6" />
        <line x1={pk.sx(lu)} x2={pk.sx(lu)} y1={pk.y1} y2={pk.y0} stroke={C.brandL} strokeOpacity="0.6" />
        <circle cx={pc.sx(lu)} cy={pc.sy(clamp(Math.log10(vert ? vCap : hCap), 3, 7))} r="4.5" fill={vert ? (vOver ? C.rose : C.amber) : C.sky} stroke="#fff" strokeWidth="1.2" />
        {!(vert && vOver) && (
          <circle cx={pk.sx(lu)} cy={pk.sy(clamp(Math.log10(vert ? vCost : hCost), 1, 5.5))} r="4.5" fill={vert ? C.amber : C.sky} stroke="#fff" strokeWidth="1.2" />
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3">
        <Legend color={C.amber} label="vertical" />
        <Legend color={C.sky} label="horizontal" />
        <Legend color={C.text} label="load (capacity must stay above it)" dashed />
      </div>
    </Card>
  );
}

/* ---------- load-balancer: routing algorithms and health checks ---------- */

const LB_ALGOS = [["round-robin", "Round robin"], ["weighted", "Weighted 3:1:1"], ["least-connections", "Least connections"], ["ip-hash", "IP hash"]];
const LB_ALIAS = { rr: "round-robin", roundrobin: "round-robin", "weighted-round-robin": "weighted", least: "least-connections", leastconn: "least-connections", "least-conn": "least-connections", iphash: "ip-hash", hash: "ip-hash", sticky: "ip-hash" };
const LB_CLIENTS = [
  { ip: "10.0.0.7", color: C.sky },
  { ip: "10.0.0.23", color: C.amber },
  { ip: "10.0.1.4", color: C.emerald },
  { ip: "10.0.2.91", color: C.fuchsia },
];
const LB_TRAVEL = 0.55; // seconds per hop
const LB_DETECT = 1.2; // health checks need this long to notice a change
const lbWeight = (i) => (i === 0 ? 3 : 1);

function lbInit(n, seed, down = []) {
  return {
    t: 0, spawn: 0.15, id: 0, rr: 0, failed: 0, reqs: [],
    cw: new Array(n).fill(0),
    rnd: mulberry32(seed),
    servers: Array.from({ length: n }, (_, i) => ({ active: 0, handled: 0, down: !!down[i], since: -10 })),
  };
}

/** The LB's view: a dead server stays in the pool until the health check notices; a revived one rejoins after it passes. */
const inPool = (s, t) => (s.down ? t - s.since < LB_DETECT : t - s.since >= LB_DETECT * 0.7);

function lbPick(sim, algo, client) {
  const n = sim.servers.length;
  const ok = sim.servers.map((s, i) => (inPool(s, sim.t) ? i : -1)).filter((i) => i >= 0);
  if (!ok.length) return -1;
  if (algo === "weighted") {
    // Smooth weighted round robin (as in nginx): no bursts to the heavy server.
    let total = 0, best = ok[0];
    for (const i of ok) {
      sim.cw[i] += lbWeight(i);
      total += lbWeight(i);
      if (sim.cw[i] > sim.cw[best]) best = i;
    }
    sim.cw[best] -= total;
    return best;
  }
  if (algo === "least-connections") {
    let best = -1;
    for (let k = 0; k < ok.length; k++) {
      const i = ok[(k + sim.rr) % ok.length]; // rotate the start so ties are shared
      if (best < 0 || sim.servers[i].active < sim.servers[best].active) best = i;
    }
    sim.rr++;
    return best;
  }
  if (algo === "ip-hash") {
    // Same client → same server; if it is out of the pool, walk to the next one.
    const h = hash32(LB_CLIENTS[client]?.ip || "");
    for (let k = 0; k < n; k++) {
      const i = (h + k) % n;
      if (inPool(sim.servers[i], sim.t)) return i;
    }
    return -1;
  }
  const i = ok[sim.rr % ok.length];
  sim.rr++;
  return i;
}

function lbStep(sim, dt, algo) {
  sim.t += dt;
  sim.spawn -= dt;
  while (sim.spawn <= 0) {
    const r = sim.rnd;
    sim.spawn += 0.2 + r() * 0.25;
    const long = r() < 0.3; // a few slow requests make least-connections shine
    sim.reqs.push({ id: sim.id++, client: Math.floor(r() * LB_CLIENTS.length) % LB_CLIENTS.length, phase: "in", p: 0, server: -1, left: long ? 2.5 + r() * 2.5 : 0.4 + r() * 0.8 });
  }
  for (const q of sim.reqs) {
    if (q.phase === "in") {
      q.p += dt / LB_TRAVEL;
      if (q.p >= 1) {
        q.server = lbPick(sim, algo, q.client);
        q.p = 0;
        if (q.server < 0) { q.phase = "fail"; sim.failed++; }
        else { sim.servers[q.server].active++; q.phase = "out"; }
      }
    } else if (q.phase === "out") {
      q.p += dt / LB_TRAVEL;
      if (q.p >= 1) {
        const s = sim.servers[q.server];
        q.p = 0;
        if (s.down) { s.active--; q.phase = "fail"; sim.failed++; } // routed to a dead box
        else q.phase = "serve";
      }
    } else if (q.phase === "serve") {
      q.left -= dt;
      if (q.left <= 0) {
        const s = sim.servers[q.server];
        s.active--;
        s.handled++;
        q.phase = "done";
        q.p = 0;
      }
    } else q.p += dt / 0.6; // fail / done markers fade out
  }
  sim.reqs = sim.reqs.filter((q) => !((q.phase === "fail" || q.phase === "done") && q.p >= 1));
}

export function LoadBalancer({ params = {} }) {
  const prm = obj(params);
  const n = Math.round(clamp(num(prm.servers, 3), 1, 6));
  const seed = Math.round(num(prm.seed, 42));
  const want = String(prm.algorithm || "round-robin").toLowerCase();
  const [algo, setAlgo] = useState(LB_ALGOS.some(([k]) => k === want) ? want : LB_ALIAS[want] || "round-robin");
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const force = useForce();
  const sim = useRef(null);
  if (!sim.current || sim.current.servers.length !== n) sim.current = lbInit(n, seed);
  const S = sim.current;

  useLoop(running, (dt) => {
    lbStep(sim.current, dt * speed, algo);
    force();
  });

  const restart = (keepDown) => {
    sim.current = lbInit(n, seed, keepDown ? sim.current.servers.map((s) => s.down) : []);
    force();
  };
  const pickAlgo = (k) => {
    setAlgo(k);
    sim.current = lbInit(n, seed, sim.current.servers.map((s) => s.down));
    force();
  };
  const toggle = (i) => {
    const s = S.servers[i];
    if (!s) return;
    s.down = !s.down;
    s.since = S.t;
    // Connections in progress on a crashed server are lost.
    if (s.down) for (const q of S.reqs) if (q.server === i && q.phase === "serve") { s.active--; q.phase = "fail"; q.p = 0; S.failed++; }
    force();
  };

  // Layout.
  const H = Math.max(240, n * 50 + 24);
  const lb = { x: 182, y: H / 2 };
  const cl = LB_CLIENTS.map((c, i) => ({ x: 40, y: (H / LB_CLIENTS.length) * (i + 0.5) }));
  const boxH = Math.min(58, H / n - 10);
  const sv = S.servers.map((_, i) => ({ x: 284, y: (H / n) * (i + 0.5) - boxH / 2, w: 110, h: boxH }));
  const maxHandled = Math.max(1, ...S.servers.map((s) => s.handled));
  const totalHandled = S.servers.reduce((a, s) => a + s.handled, 0);
  const inFlight = S.reqs.filter((q) => q.phase === "in" || q.phase === "out" || q.phase === "serve").length;
  const sticky = algo === "ip-hash";
  const dotColor = (q) => (sticky ? LB_CLIENTS[q.client].color : q.server >= 0 ? PALETTE[q.server % PALETTE.length] : "#e2e8f0");

  // Serving requests sit in a row inside their server's box.
  const slot = new Array(n).fill(0);
  const dots = S.reqs.map((q) => {
    const c = cl[q.client], s = sv[q.server];
    let x, y;
    if (q.phase === "in") {
      const e = ease(clamp(q.p, 0, 1));
      x = lerp(c.x + 30, lb.x - 26, e);
      y = lerp(c.y, lb.y, e);
    } else if (q.phase === "out") {
      const e = ease(clamp(q.p, 0, 1));
      x = lerp(lb.x + 26, s.x, e);
      y = lerp(lb.y, s.y + s.h / 2, e);
    } else if (q.phase === "serve") {
      const k = slot[q.server]++;
      if (k >= 10) return null;
      x = s.x + 12 + k * 9.5;
      y = s.y + s.h / 2 + 1;
    } else if (q.phase === "fail") {
      x = s ? s.x : lb.x;
      y = s ? s.y + s.h / 2 : lb.y;
    } else {
      x = s.x + s.w - 10;
      y = s.y + s.h / 2 + 1;
    }
    return { q, x, y };
  });

  return (
    <Card
      title="Load balancer"
      params={params}
      caption="Requests flow from clients through the load balancer to the servers. Switch algorithms and compare the 'handled' bars: round robin takes turns, weighted sends 3× to S1, least connections avoids servers stuck on slow requests, and IP hash pins each client (colour) to one server. Click a server to crash it: until the health check notices, requests still go there and fail."
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        {LB_ALGOS.map(([k, label]) => (
          <Button key={k} primary={k === algo} onClick={() => pickAlgo(k)}>{label}</Button>
        ))}
      </div>
      <svg viewBox={`0 0 400 ${H}`} className="w-full h-auto select-none">
        {/* wiring */}
        {cl.map((c, i) => <line key={`c${i}`} x1={c.x + 30} y1={c.y} x2={lb.x - 26} y2={lb.y} stroke={C.axis} strokeOpacity="0.6" />)}
        {sv.map((s, i) => {
          const srv = S.servers[i];
          const pooled = inPool(srv, S.t);
          return (
            <line key={`w${i}`} x1={lb.x + 26} y1={lb.y} x2={s.x} y2={s.y + s.h / 2} stroke={pooled ? (srv.down ? C.amber : C.axis) : C.rose} strokeOpacity={pooled ? 0.7 : 0.5} strokeDasharray={pooled ? undefined : "3 4"} />
          );
        })}
        {/* clients */}
        {cl.map((c, i) => (
          <g key={`cl${i}`}>
            <rect x={c.x - 32} y={c.y - 13} width="62" height="26" rx="5" fill="#191c2c" stroke={sticky ? LB_CLIENTS[i].color : C.axis} />
            <text x={c.x - 1} y={c.y + 3.5} textAnchor="middle" fontSize="8.5" fontFamily="ui-monospace, monospace" fill={sticky ? LB_CLIENTS[i].color : C.text}>{LB_CLIENTS[i].ip}</text>
          </g>
        ))}
        {/* the load balancer */}
        <rect x={lb.x - 26} y={lb.y - 26} width="52" height="52" rx="8" fill="#191c2c" stroke={C.brandL} strokeWidth="1.5" />
        <text x={lb.x} y={lb.y + 1} textAnchor="middle" fontSize="12" fontWeight="700" fill="#e2e8f0">LB</text>
        <text x={lb.x} y={lb.y + 14} textAnchor="middle" fontSize="7.5" fill={C.dim}>health checks</text>
        <text x={lb.x} y={lb.y - 33} textAnchor="middle" fontSize="9" fill={C.brandL}>{LB_ALGOS.find(([k]) => k === algo)?.[1]}</text>
        {/* servers */}
        {sv.map((s, i) => {
          const srv = S.servers[i];
          const pooled = inPool(srv, S.t);
          const col = PALETTE[i % PALETTE.length];
          const status = srv.down ? (pooled ? "health check failing…" : "removed from pool") : pooled ? null : "rejoining…";
          const barW = s.w - 44;
          return (
            <g key={`s${i}`} className="cursor-pointer" onClick={() => toggle(i)}>
              <title>{srv.down ? "Click to bring this server back up" : "Click to crash this server"}</title>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="6" fill={srv.down ? "rgba(251,113,133,0.08)" : "#191c2c"} stroke={srv.down ? C.rose : col} strokeOpacity={srv.down ? 0.9 : 0.65} strokeWidth="1.5" />
              <text x={s.x + 8} y={s.y + 12} fontSize="10.5" fontWeight="700" fill={srv.down ? C.rose : col}>
                S{i + 1}{algo === "weighted" ? <tspan fontSize="8.5" fontWeight="400" fill={C.dim}> w={lbWeight(i)}</tspan> : null}
              </text>
              <text x={s.x + s.w - 7} y={s.y + 12} textAnchor="end" fontSize="9" fill={C.text}>{Math.max(0, srv.active)} active</text>
              <rect x={s.x + 8} y={s.y + s.h - 9} width={barW} height="4" rx="2" fill={C.grid} />
              <rect x={s.x + 8} y={s.y + s.h - 9} width={(barW * srv.handled) / maxHandled} height="4" rx="2" fill={col} opacity={srv.down ? 0.4 : 0.9} style={{ transition: "width 0.3s" }} />
              <text x={s.x + s.w - 7} y={s.y + s.h - 4.5} textAnchor="end" fontSize="8.5" fontFamily="ui-monospace, monospace" fill={C.text}>{srv.handled}</text>
              {srv.down && (
                <g stroke={C.rose} strokeWidth="3" strokeLinecap="round">
                  <line x1={s.x + s.w / 2 - 12} y1={s.y + s.h / 2 - 10} x2={s.x + s.w / 2 + 12} y2={s.y + s.h / 2 + 10} />
                  <line x1={s.x + s.w / 2 + 12} y1={s.y + s.h / 2 - 10} x2={s.x + s.w / 2 - 12} y2={s.y + s.h / 2 + 10} />
                </g>
              )}
              {status && (
                <text x={s.x - 4} y={s.y - 3} textAnchor="end" fontSize="8.5" fill={srv.down && !pooled ? C.rose : C.amber}>{status}</text>
              )}
            </g>
          );
        })}
        {/* requests */}
        {dots.map((d) => {
          if (!d) return null;
          const { q, x, y } = d;
          if (q.phase === "fail") {
            const r = 4 + q.p * 8;
            return (
              <g key={q.id} stroke={C.rose} strokeWidth="2" opacity={1 - q.p}>
                <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
                <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} />
              </g>
            );
          }
          if (q.phase === "done") return <circle key={q.id} cx={x} cy={y} r={3 + q.p * 7} fill="none" stroke={C.emerald} strokeWidth="1.5" opacity={1 - q.p} />;
          return <circle key={q.id} cx={x} cy={y} r="3.6" fill={dotColor(q)} stroke={DARK} strokeWidth="0.8" />;
        })}
      </svg>
      <Row>
        <Button primary onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Play"}</Button>
        <Button onClick={() => restart(false)}>Reset</Button>
        <Slider label="speed" value={speed} min={0.25} max={3} step={0.25} onChange={setSpeed} display={`${speed}×`} />
      </Row>
      <Row>
        <Stat label="handled" value={totalHandled} color="text-emerald-300" />
        <Stat label="failed" value={S.failed} color={S.failed ? "text-rose-300" : "text-slate-200"} />
        <Stat label="in flight" value={inFlight} color="text-sky-300" />
        <span className="text-[11px] text-slate-500">tip: click a server box to crash / revive it</span>
      </Row>
    </Card>
  );
}

/* ---------- cache: LRU / LFU / FIFO eviction ---------- */

const CACHE_KEYS = "ABCDEFGHIJ".split("");
const CACHE_W = CACHE_KEYS.map((_, i) => 1 / (i + 1) ** 1.1); // Zipf-like: A is hottest
const CACHE_CUM = (() => {
  const tot = CACHE_W.reduce((a, b) => a + b, 0);
  let acc = 0;
  return CACHE_W.map((w) => (acc += w / tot));
})();
const HIT_MS = 1, MISS_MS = 50;
const CACHE_POLICIES = [["lru", "LRU"], ["lfu", "LFU"], ["fifo", "FIFO"]];
const CACHE_ORDER_LABEL = {
  lru: "most recently used → least recently used (evicted next)",
  lfu: "most frequently used → least frequently used (evicted next)",
  fifo: "newest → oldest insertion (evicted next)",
};

function zipfKey(rnd) {
  const u = rnd();
  const i = CACHE_CUM.findIndex((c) => u < c);
  return CACHE_KEYS[i < 0 ? CACHE_KEYS.length - 1 : i];
}

/** Entries sorted so the next victim is last. */
function cacheOrder(entries, policy) {
  const e = [...entries];
  if (policy === "lfu") e.sort((a, b) => b.count - a.count || b.last - a.last);
  else if (policy === "fifo") e.sort((a, b) => b.born - a.born);
  else e.sort((a, b) => b.last - a.last);
  return e;
}

function cacheInit(seed) {
  return { entries: [], clock: 0, hits: 0, misses: 0, ms: 0, hist: [], log: [], queue: [], pending: null, flash: null, wait: 0, rnd: mulberry32(seed) };
}

function cacheBegin(sim, key, policy, cap) {
  const hit = sim.entries.some((e) => e.key === key);
  const ord = cacheOrder(sim.entries, policy);
  const victim = !hit && sim.entries.length >= cap ? ord[ord.length - 1].key : null;
  // Where the key will sit once the request finishes (token flies there).
  const after = hit
    ? sim.entries.map((e) => (e.key === key ? { ...e, count: e.count + 1, last: sim.clock + 1 } : e))
    : [...sim.entries.filter((e) => e.key !== victim), { key, count: 1, last: sim.clock + 1, born: sim.clock + 1 }];
  const target = Math.max(0, cacheOrder(after, policy).findIndex((e) => e.key === key));
  const from = Math.max(0, ord.findIndex((e) => e.key === key));
  sim.pending = { key, hit, victim, target, from, p: 0, dur: hit ? 0.6 : 1.4 };
}

function cacheCommit(sim) {
  const { key, hit, victim } = sim.pending;
  sim.clock++;
  if (hit) {
    const e = sim.entries.find((x) => x.key === key);
    if (e) { e.count++; e.last = sim.clock; }
    sim.hits++;
    sim.ms += HIT_MS;
  } else {
    if (victim) sim.entries = sim.entries.filter((x) => x.key !== victim);
    sim.entries.push({ key, count: 1, last: sim.clock, born: sim.clock });
    sim.misses++;
    sim.ms += MISS_MS;
  }
  sim.hist.push(sim.hits / (sim.hits + sim.misses));
  if (sim.hist.length > 300) sim.hist.shift();
  sim.log.push({ key, hit, n: sim.clock });
  if (sim.log.length > 16) sim.log.shift();
  sim.flash = { key, hit, t: 0.6 };
  sim.pending = null;
  sim.wait = 0.2;
}

export function Cache({ params = {} }) {
  const prm = obj(params);
  const seed = Math.round(num(prm.seed, 11));
  const want = String(prm.policy || "lru").toLowerCase();
  const [policy, setPolicy] = useState(CACHE_POLICIES.some(([k]) => k === want) ? want : "lru");
  const [cap, setCap] = useState(() => Math.round(clamp(num(prm.capacity, 4), 1, 8)));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const force = useForce();
  const sim = useRef(null);
  if (!sim.current) sim.current = cacheInit(seed);
  const S = sim.current;
  const id = useSvgId();

  const busy = running || !!S.pending || S.queue.length > 0 || !!S.flash;
  useLoop(busy, (dt) => {
    const s = sim.current;
    dt *= speed;
    if (s.flash && (s.flash.t -= dt) <= 0) s.flash = null;
    if (s.pending) {
      s.pending.p += dt / s.pending.dur;
      if (s.pending.p >= 1) cacheCommit(s);
    } else {
      s.wait -= dt;
      if (s.queue.length) cacheBegin(s, s.queue.shift(), policy, cap);
      else if (running && s.wait <= 0) cacheBegin(s, zipfKey(s.rnd), policy, cap);
    }
    force();
  });

  // Same seed after a reset, so each policy sees the identical request stream.
  const reset = (opts = {}) => {
    sim.current = cacheInit(seed);
    if (opts.policy) setPolicy(opts.policy);
    if (opts.cap) setCap(opts.cap);
    force();
  };
  const request = (k) => {
    if (S.queue.length < 6) S.queue.push(k);
    force();
  };

  // Geometry: app on the left, cache slots in the middle, database below.
  const app = { x: 14, y: 50, w: 70, h: 52 };
  const area = { x: 104, y: 26, w: 290, h: 88 };
  const slotW = Math.min(64, (area.w - 16) / cap);
  const slot0 = area.x + 8 + (area.w - 16 - slotW * cap) / 2;
  const slotC = (i) => ({ x: slot0 + slotW * (i + 0.5), y: area.y + 50 });
  const db = { x: 290, y: 152, w: 104, h: 50 };
  const ord = cacheOrder(S.entries, policy);
  const P = S.pending;
  let tok = null;
  if (P) {
    const a = { x: app.x + app.w / 2, y: app.y + app.h / 2 };
    const door = { x: area.x + 4, y: area.y + 50 };
    const dbc = { x: db.x + db.w / 2, y: db.y + db.h / 2 };
    const seg = (A, B, t) => ({ x: lerp(A.x, B.x, ease(clamp(t, 0, 1))), y: lerp(A.y, B.y, ease(clamp(t, 0, 1))) });
    let pos, color, label;
    if (P.hit) {
      pos = P.p < 0.35 ? seg(a, door, P.p / 0.35) : seg(door, slotC(P.from), (P.p - 0.35) / 0.65);
      color = P.p < 0.35 ? "#e2e8f0" : C.emerald;
      label = P.p < 0.35 ? "lookup…" : "HIT · 1 ms";
    } else if (P.p < 0.28) {
      pos = seg(a, door, P.p / 0.28);
      color = "#e2e8f0";
      label = "lookup…";
    } else if (P.p < 0.62) {
      pos = seg(door, dbc, (P.p - 0.28) / 0.34);
      color = C.rose;
      label = "MISS → database · 50 ms";
    } else {
      pos = seg(dbc, slotC(P.target), (P.p - 0.62) / 0.38);
      color = C.rose;
      label = P.victim ? `insert ${P.key}, evict ${P.victim}` : `insert ${P.key}`;
    }
    tok = { ...pos, color, label };
  }
  const total = S.hits + S.misses;
  const ratio = total ? S.hits / total : 0;
  const hp = plot([Math.max(0, total - S.hist.length), Math.max(20, total)], [0, 1], { h: 120, t: 18, b: 26 });
  const sub = (e) => (policy === "lfu" ? `×${e.count}` : policy === "fifo" ? `in t${e.born}` : `t${e.last}`);

  return (
    <Card
      title={`Cache eviction: ${CACHE_POLICIES.find(([k]) => k === policy)?.[1] || "LRU"}`}
      params={params}
      caption="Press Play for a stream of requests where a few keys are hot (the bars under the key buttons show popularity), or tap a key to request it yourself. A hit is served from memory in about 1 ms. A miss goes to the database (about 50 ms) and is then cached, evicting the slot on the right. Reset replays the same stream, so you can compare policies and capacities fairly."
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {CACHE_POLICIES.map(([k, label]) => (
          <Button key={k} primary={k === policy} onClick={() => reset({ policy: k })}>{label}</Button>
        ))}
        <span className="ml-1 text-[11px] text-slate-500">{policy === "lru" ? "evict the least recently used" : policy === "lfu" ? "evict the least frequently used" : "evict the oldest insert"}</span>
      </div>
      <svg viewBox="0 0 400 212" className="w-full h-auto select-none">
        <defs>
          <Arrow id={`${id}a`} color={C.dim} />
        </defs>
        {/* app server */}
        <rect x={app.x} y={app.y} width={app.w} height={app.h} rx="7" fill="#191c2c" stroke={C.brandL} strokeWidth="1.5" />
        <text x={app.x + app.w / 2} y={app.y + 24} textAnchor="middle" fontSize="11" fontWeight="700" fill="#e2e8f0">App</text>
        <text x={app.x + app.w / 2} y={app.y + 38} textAnchor="middle" fontSize="8.5" fill={C.dim}>request</text>
        <line x1={app.x + app.w} y1={app.y + app.h / 2} x2={area.x - 2} y2={app.y + app.h / 2} stroke={C.axis} strokeWidth="1.5" markerEnd={`url(#${id}a)`} />
        {/* cache */}
        <rect x={area.x} y={area.y} width={area.w} height={area.h} rx="8" fill="#11131f" stroke={C.emerald} strokeOpacity="0.5" />
        <text x={area.x + 8} y={area.y - 6} fontSize="10" fontWeight="600" fill={C.emerald}>cache (in memory) · {S.entries.length}/{cap} slots · hit ≈ 1 ms</text>
        <text x={area.x + 8} y={area.y + 14} fontSize="8.5" fill={C.dim}>{CACHE_ORDER_LABEL[policy]}</text>
        {Array.from({ length: cap }, (_, i) => (
          <rect key={`e${i}`} x={slot0 + slotW * i + 3} y={area.y + 24} width={slotW - 6} height="52" rx="5" fill="none" stroke={C.axis} strokeDasharray="3 3" />
        ))}
        {ord.map((e, i) => {
          const victim = P && P.victim === e.key && P.p > 0.5;
          const fl = S.flash && S.flash.key === e.key ? S.flash : null;
          const hitNow = P && P.hit && P.key === e.key && P.p > 0.35;
          const stroke = victim ? C.rose : fl ? (fl.hit ? C.emerald : C.amber) : hitNow ? C.emerald : C.axis;
          return (
            <g key={e.key} style={{ transform: `translate(${slot0 + slotW * i}px, ${area.y + 24}px)`, transition: "transform 0.45s cubic-bezier(.4,0,.2,1)" }}>
              <rect x="3" y="0" width={slotW - 6} height="52" rx="5" fill={victim ? "rgba(251,113,133,0.15)" : "#191c2c"} stroke={stroke} strokeWidth={stroke === C.axis ? 1 : 2.2} opacity={victim ? 0.5 + 0.5 * (1 - P.p) : 1} />
              <text x={slotW / 2} y="27" textAnchor="middle" fontSize={slotW < 40 ? 14 : 18} fontWeight="700" fontFamily="ui-monospace, monospace" fill={victim ? C.rose : "#e2e8f0"}>{e.key}</text>
              <text x={slotW / 2} y="43" textAnchor="middle" fontSize="8.5" fontFamily="ui-monospace, monospace" fill={C.dim}>{victim ? "evict" : sub(e)}</text>
            </g>
          );
        })}
        {/* database */}
        <path d={`M${db.x + db.w / 2},${area.y + area.h} V${db.y - 2}`} stroke={C.axis} strokeWidth="1.5" strokeDasharray="4 3" markerEnd={`url(#${id}a)`} />
        <ellipse cx={db.x + db.w / 2} cy={db.y + 7} rx={db.w / 2} ry="7" fill="#191c2c" stroke={C.amber} strokeOpacity="0.7" />
        <path d={`M${db.x},${db.y + 7} V${db.y + db.h - 7} A${db.w / 2},7 0 0 0 ${db.x + db.w},${db.y + db.h - 7} V${db.y + 7}`} fill="#191c2c" stroke={C.amber} strokeOpacity="0.7" />
        <text x={db.x + db.w / 2} y={db.y + 30} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#e2e8f0">Database</text>
        <text x={db.x + db.w / 2} y={db.y + 43} textAnchor="middle" fontSize="8.5" fill={C.amber}>slow: ≈ 50 ms</text>
        {/* request log */}
        <text x="14" y="140" fontSize="9" fill={C.dim}>recent requests</text>
        {S.log.slice(-12).map((r, i) => (
          <g key={r.n}>
            <rect x={14 + (i % 6) * 22} y={146 + Math.floor(i / 6) * 22} width="19" height="18" rx="3" fill={r.hit ? "rgba(52,211,153,0.18)" : "rgba(251,113,133,0.18)"} />
            <text x={23.5 + (i % 6) * 22} y={159 + Math.floor(i / 6) * 22} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fill={r.hit ? C.emerald : C.rose}>{r.key}</text>
          </g>
        ))}
        {/* the request in flight */}
        {tok && (
          <g>
            <circle cx={tok.x} cy={tok.y} r="11" fill={tok.color} stroke={DARK} strokeWidth="1.5" />
            <text x={tok.x} y={tok.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={DARK}>{P.key}</text>
            <text x={160} y={140} fontSize="10" fontWeight="600" fill={tok.color === "#e2e8f0" ? C.text : tok.color}>{tok.label}</text>
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-end gap-1">
        <span className="mr-1 self-center text-[11px] text-slate-500">request key</span>
        {CACHE_KEYS.map((k, i) => (
          <button key={k} type="button" onClick={() => request(k)} className="flex w-8 flex-col items-center rounded-md bg-ink-700 px-1 pb-1 pt-0.5 font-mono text-xs text-white transition-colors hover:bg-ink-600">
            {k}
            <span className="mt-0.5 h-1 rounded-full bg-amber-400" style={{ width: `${Math.max(12, (CACHE_W[i] / CACHE_W[0]) * 100)}%` }} />
          </button>
        ))}
      </div>
      <Row>
        <Button primary onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Play"}</Button>
        <Button onClick={() => request(zipfKey(S.rnd))} disabled={running}>Step</Button>
        <Button onClick={() => { setRunning(false); reset(); }}>Reset</Button>
        <Slider label="capacity" value={cap} min={1} max={8} step={1} onChange={(v) => reset({ cap: Math.round(clamp(v, 1, 8)) })} display={cap} />
        <Slider label="speed" value={speed} min={0.5} max={4} step={0.5} onChange={setSpeed} display={`${speed}×`} />
      </Row>
      <Row>
        <Stat label="hits" value={S.hits} color="text-emerald-300" />
        <Stat label="misses" value={S.misses} color="text-rose-300" />
        <Stat label="hit ratio" value={total ? `${(ratio * 100).toFixed(1)}%` : "—"} color="text-sky-300" />
        <Stat label="avg latency" value={total ? `${(S.ms / total).toFixed(1)} ms` : "—"} color="text-amber-300" />
      </Row>
      <svg viewBox={`0 0 ${hp.w} ${hp.h}`} className="mt-3 w-full h-auto">
        <Axes p={hp} yticks={[0, 0.5, 1]} yfmt={(v) => `${v * 100}%`} xticks={niceTicks(hp.xd[1], 4).filter((v) => v >= hp.xd[0])} />
        <text x={hp.x0} y="11" fontSize="10" fill={C.text}>hit ratio over time</text>
        <text x={hp.x1} y={hp.y0 + 24} textAnchor="end" fontSize="9" fill={C.dim}>requests →</text>
        {S.hist.length > 1 && (
          <polyline
            points={S.hist.map((v, i) => `${hp.sx(total - S.hist.length + i + 1).toFixed(1)},${hp.sy(v).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={C.sky}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        {total > 0 && <circle cx={hp.sx(total)} cy={hp.sy(ratio)} r="3.5" fill={C.sky} stroke="#fff" strokeWidth="1" />}
      </svg>
    </Card>
  );
}

/* ---------- consistent-hashing: the hash ring ---------- */

const RING_NAMES = "ABCDEFGH".split("");
const TURN = 2 ** 32;
const RING_SALT = "node2826-"; // fixed name prefix; picked so the vnode effect is easy to see with ~24 keys

/** Ring points: one per (node, virtual replica), sorted clockwise. */
function ringOf(n, v) {
  const pts = [];
  for (let i = 0; i < n; i++) for (let r = 0; r < v; r++) pts.push({ node: i, rep: r, pos: hash32(`${RING_SALT}${RING_NAMES[i]}#${r}`) / TURN });
  return pts.sort((a, b) => a.pos - b.pos);
}
/** Owner of each key = the first ring point clockwise from it. */
function ringOwners(ring, keys) {
  return keys.map((k) => (ring.find((p) => p.pos >= k.pos) || ring[0]).node);
}
/** Point on a circle; f is a fraction of a turn clockwise from 12 o'clock. */
const polar = (cx, cy, r, f) => [cx + r * Math.sin(2 * Math.PI * f), cy - r * Math.cos(2 * Math.PI * f)];
function arcPath(cx, cy, r, f0, f1) {
  let span = f1 - f0;
  if (span <= 0) span += 1;
  if (span >= 0.9999) {
    const [ax, ay] = polar(cx, cy, r, f0), [bx, by] = polar(cx, cy, r, f0 + 0.5);
    return `M${ax},${ay} A${r},${r} 0 1 1 ${bx},${by} A${r},${r} 0 1 1 ${ax},${ay}`;
  }
  const [ax, ay] = polar(cx, cy, r, f0), [bx, by] = polar(cx, cy, r, f0 + span);
  return `M${ax.toFixed(2)},${ay.toFixed(2)} A${r},${r} 0 ${span > 0.5 ? 1 : 0} 1 ${bx.toFixed(2)},${by.toFixed(2)}`;
}

export function ConsistentHashing({ params = {} }) {
  const prm = obj(params);
  const N = Math.round(clamp(num(prm.keys, 24), 8, 64));
  const [n, setN] = useState(() => Math.round(clamp(num(prm.nodes, 3), 1, 8)));
  const [v, setV] = useState(() => Math.round(clamp(num(prm.vnodes, 1), 1, 8)));
  const [last, setLast] = useState(null); // what the most recent change did

  const keys = useMemo(
    () => Array.from({ length: N }, (_, i) => {
      const h = hash32(`key-${i + 1}`);
      return { name: `key-${i + 1}`, h, pos: h / TURN };
    }),
    [N]
  );
  const ring = useMemo(() => ringOf(n, v), [n, v]);
  const owners = useMemo(() => ringOwners(ring, keys), [ring, keys]);
  const counts = Array.from({ length: n }, (_, i) => owners.filter((o) => o === i).length);
  // Fraction of the ring each node owns: what virtual nodes actually even out.
  const shares = new Array(n).fill(0);
  ring.forEach((pt, i) => {
    let d = pt.pos - ring[(i - 1 + ring.length) % ring.length].pos;
    if (d <= 0) d += 1;
    shares[pt.node] += d;
  });
  const ideal = N / n;

  const change = (nn, nv, kind) => {
    nn = clamp(nn, 1, 8);
    nv = clamp(nv, 1, 8);
    if (nn === n && nv === v) return;
    const after = ringOwners(ringOf(nn, nv), keys);
    const movedIdx = keys.map((_, i) => i).filter((i) => after[i] !== owners[i]);
    const mod = kind === "nodes" ? keys.filter((k) => k.h % n !== k.h % nn).length : null;
    setLast({ kind, moved: movedIdx.length, movedIdx, mod, from: n, to: nn });
    setN(nn);
    setV(nv);
  };

  const cx = 128, cy = 130, R = 98;
  const movedSet = new Set(last?.movedIdx || []);
  const bx0 = 282, bMax = 70, bScale = bMax / Math.max(1, ...counts, Math.ceil(ideal));
  const rowH = Math.min(24, 190 / n);

  return (
    <Card
      title="Consistent hashing"
      params={params}
      caption="Nodes and keys are hashed onto the same ring; each key belongs to the first node clockwise from it (arcs show each node's range). Add or remove a node: only the keys in one arc move, compared with most keys under hash(key) % N. Raise the virtual nodes so each server owns many small arcs and the load evens out."
    >
      <svg viewBox="0 0 400 262" className="w-full h-auto">
        {/* the ring and each point's owned range (previous point, this point] */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.grid} strokeWidth="10" />
        {ring.map((pt, i) => {
          const prev = ring[(i - 1 + ring.length) % ring.length];
          return (
            <path key={`a${pt.node}-${pt.rep}`} d={arcPath(cx, cy, R, prev.pos, pt.pos)} fill="none" stroke={PALETTE[pt.node]} strokeWidth="7" strokeOpacity="0.55" />
          );
        })}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill="#e2e8f0">hash ring</text>
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize="8.5" fill={C.dim}>0 … 2³² − 1</text>
        <text x={cx} y={cy + 19} textAnchor="middle" fontSize="8.5" fill={C.dim}>keys go clockwise ↻</text>
        {/* keys */}
        {keys.map((k, i) => {
          const [x, y] = polar(cx, cy, R - 17, k.pos);
          const moved = movedSet.has(i);
          return (
            <circle key={k.name} cx={x} cy={y} r={moved ? 5 : 4} stroke={moved ? C.amber : DARK} strokeWidth={moved ? 1.8 : 1} style={{ fill: PALETTE[owners[i]], transition: "fill 0.6s ease" }}>
              <title>{`${k.name} → node ${RING_NAMES[owners[i]]}${moved ? " (moved)" : ""}`}</title>
            </circle>
          );
        })}
        {/* nodes: big marker for the real node, small ones for its virtual replicas */}
        {ring.map((pt) => {
          const [x, y] = polar(cx, cy, R, pt.pos);
          const col = PALETTE[pt.node];
          if (pt.rep > 0) return <circle key={`n${pt.node}-${pt.rep}`} cx={x} cy={y} r="4.5" fill={col} stroke={DARK} strokeWidth="1.2" />;
          const [lx, ly] = polar(cx, cy, R + 17, pt.pos);
          return (
            <g key={`n${pt.node}`}>
              <circle cx={x} cy={y} r="9" fill={col} stroke={DARK} strokeWidth="1.5" />
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill={DARK}>{RING_NAMES[pt.node]}</text>
              <text x={lx} y={ly + 3} textAnchor="middle" fontSize="8.5" fill={C.text}>node {RING_NAMES[pt.node]}</text>
            </g>
          );
        })}
        {/* keys per node */}
        <text x="262" y="20" fontSize="10" fill={C.text}>keys per node · <tspan fill={C.dim}>% of ring</tspan></text>
        {counts.map((c, i) => {
          const y = 32 + i * rowH;
          return (
            <g key={`b${i}`}>
              <text x="262" y={y + rowH / 2 + 3} fontSize="10" fontWeight="700" fill={PALETTE[i]}>{RING_NAMES[i]}</text>
              <rect x={bx0 - 6} y={y + 3} width={c * bScale + 0.5} height={Math.max(4, rowH - 7)} rx="2" fill={PALETTE[i]} opacity="0.85" style={{ transition: "width 0.5s ease" }} />
              <text x={bx0 - 6 + c * bScale + 4} y={y + rowH / 2 + 3} fontSize="9" fontFamily="ui-monospace, monospace" fill={C.text}>{c}<tspan fill={C.dim}> · {Math.round(shares[i] * 100)}%</tspan></text>
            </g>
          );
        })}
        <line x1={bx0 - 6 + ideal * bScale} x2={bx0 - 6 + ideal * bScale} y1="28" y2={34 + n * rowH} stroke={C.text} strokeDasharray="3 3" />
        <text x={bx0 - 6 + ideal * bScale} y={46 + n * rowH} textAnchor="middle" fontSize="8.5" fill={C.text}>ideal {sig(ideal, 2)}</text>
      </svg>
      <Row>
        <Button primary onClick={() => change(n + 1, v, "nodes")} disabled={n >= 8}>Add node</Button>
        <Button onClick={() => change(n - 1, v, "nodes")} disabled={n <= 1}>Remove node</Button>
        <Slider label="virtual nodes" value={v} min={1} max={8} step={1} onChange={(x) => change(n, Math.round(x), "vnodes")} display={`${v}/node`} />
      </Row>
      <Row>
        {last ? (
          <>
            <Stat label="keys moved" value={`${last.moved} of ${N}`} color="text-amber-300" />
            {last.mod != null ? (
              <Stat label={`hash % N (${last.from}→${last.to}) would move`} value={`${last.mod} of ${N}`} color="text-rose-300" />
            ) : (
              <span className="text-[11px] text-slate-500">changing virtual nodes reshuffles the ring layout</span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-slate-500">Add or remove a node to count how many keys have to move.</span>
        )}
        <Stat label="busiest node" value={`${sig(Math.max(...counts) / ideal, 2)}× ideal`} color="text-sky-300" />
      </Row>
    </Card>
  );
}

export const WIDGETS_C = {
  "latency-numbers": LatencyNumbers,
  availability: Availability,
  estimation: Estimation,
  scaling: Scaling,
  "load-balancer": LoadBalancer,
  cache: Cache,
  "consistent-hashing": ConsistentHashing,
};
