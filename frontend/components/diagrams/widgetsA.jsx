"use client";

// Interactive ML teaching diagrams (set A). Each widget is rendered from a
// ```diagram fenced block in a lesson and receives optional JSON `params`.
// Everything is plain React + inline SVG with seeded (deterministic) data so
// server and client renders match.

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

/** Standard normal sample from a uniform PRNG (Box–Muller). */
function gauss(rnd) {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "∞");

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

/** SVG path through fn sampled across the x domain. */
function curvePath(fn, p, n = 160, from = p.xd[0], to = p.xd[1]) {
  let d = "";
  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n;
    const y = clamp(p.sy(fn(x)), -2000, 2000);
    d += `${i ? "L" : "M"}${p.sx(x).toFixed(2)},${y.toFixed(2)}`;
  }
  return d;
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
  return (
    <figure className="not-prose my-6 mx-auto max-w-[640px] rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="mb-3 text-sm font-semibold text-white">{params.title || title}</div>
      {children}
      <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">{params.caption || caption}</figcaption>
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
      <span className="w-10 shrink-0 text-right font-mono text-slate-200">{display ?? value}</span>
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

/** Arrowhead marker definition. */
function Arrow({ id, color }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  );
}

/* ---------- gradient-descent: a ball rolling down a loss curve ---------- */

const GD_CURVES = {
  parabola: { f: (x) => x * x, df: (x) => 2 * x, yd: [-0.5, 10], yticks: [0, 2, 4, 6, 8], start: 2.8 },
  // Global minimum near x≈-2.05, local minimum near x≈1.8.
  bumpy: {
    f: (x) => 0.08 * x ** 4 - 0.6 * x * x + 0.3 * x + 1.5,
    df: (x) => 0.32 * x ** 3 - 1.2 * x + 0.3,
    yd: [-0.8, 5],
    yticks: [0, 1, 2, 3, 4],
    start: 2.9,
  },
};

export function GradientDescent({ params = {} }) {
  const curve = GD_CURVES[params.curve] || GD_CURVES.parabola;
  const start = params.start ?? curve.start;
  const p = plot([-3.2, 3.2], curve.yd);
  const id = useSvgId();
  const [lr, setLr] = useState(clamp(params.lr ?? 0.1, 0.01, 1.1));
  const [xs, setXs] = useState([start]); // history of x positions
  const [running, setRunning] = useState(false);

  const x = xs[xs.length - 1];
  const diverged = !Number.isFinite(x) || Math.abs(x) > 3.2;
  const converged = !diverged && Math.abs(lr * curve.df(x)) < 1e-4;

  const step = () => {
    setXs((h) => {
      const cur = h[h.length - 1];
      if (!Number.isFinite(cur) || Math.abs(cur) > 3.2) return h;
      return [...h, cur - lr * curve.df(cur)];
    });
  };
  useTicker(running, step, 450);
  useEffect(() => {
    if (diverged || converged) setRunning(false);
  }, [diverged, converged]);

  const reset = () => {
    setRunning(false);
    setXs([start]);
  };

  // Ball position (clamped so a diverged ball stays on the edge of the chart).
  const bx = clamp(x, -3.2, 3.2);
  const by = curve.f(bx);
  const slope = curve.df(bx);
  const px = p.sx(bx), py = p.sy(Math.min(by, curve.yd[1]));
  // Tangent drawn in pixel space so it looks right regardless of axis ratio.
  const kx = (p.x1 - p.x0) / 6.4, ky = (p.y0 - p.y1) / (curve.yd[1] - curve.yd[0]);
  const len = Math.hypot(kx, slope * ky);
  const tx = (kx / len) * 45, ty = (-slope * ky / len) * 45;
  const nx = bx - lr * slope;
  const trail = xs.slice(-40).filter((v) => Math.abs(v) <= 3.2);

  return (
    <Card
      title="Gradient descent"
      params={params}
      caption="Press Play or Step: each step moves x by −learning rate × slope. Try a tiny rate (slow), then something above 1.0 (it overshoots and diverges)."
    >
      <svg viewBox={`0 0 ${p.w} ${p.h}`} className="w-full h-auto">
        <defs>
          <Arrow id={`${id}a`} color={C.amber} />
          <clipPath id={`${id}c`}><rect x={p.x0} y={p.y1} width={p.x1 - p.x0} height={p.y0 - p.y1} /></clipPath>
        </defs>
        <Axes p={p} xticks={[-3, -2, -1, 0, 1, 2, 3]} yticks={curve.yticks} xlabel="x (weight)" ylabel="loss" />
        <g clipPath={`url(#${id}c)`}>
          <path d={curvePath(curve.f, p)} fill="none" stroke={C.brandL} strokeWidth="2.5" />
          {/* zig-zag trail of previous steps */}
          <polyline points={trail.map((v) => `${p.sx(v)},${p.sy(curve.f(v))}`).join(" ")} fill="none" stroke={C.fuchsia} strokeOpacity="0.45" strokeWidth="1.2" />
          {trail.map((v, i) => (
            <circle key={i} cx={p.sx(v)} cy={p.sy(curve.f(v))} r="2.5" fill={C.fuchsia} opacity={0.25 + (0.6 * i) / trail.length} />
          ))}
          {/* tangent line = slope at the current point */}
          <line x1={px - tx} y1={py - ty} x2={px + tx} y2={py + ty} stroke={C.sky} strokeWidth="2" strokeDasharray="4 3" />
        </g>
        {/* next step arrow along the x axis */}
        {!diverged && Math.abs(nx - bx) > 0.02 && (
          <g>
            <line x1={px} y1={p.y0 - 8} x2={p.sx(clamp(nx, -3.2, 3.2))} y2={p.y0 - 8} stroke={C.amber} strokeWidth="2" markerEnd={`url(#${id}a)`} />
            <line x1={px} y1={py} x2={px} y2={p.y0 - 8} stroke={C.amber} strokeOpacity="0.3" strokeDasharray="2 3" />
          </g>
        )}
        <circle cx={px} cy={py} r="7" fill={C.amber} stroke="#fff" strokeWidth="1.5" style={{ transition: "cx 0.35s ease, cy 0.35s ease" }} />
        <text x={p.x1 - 4} y={p.y1 + 12} textAnchor="end" fontSize="10" fill={C.sky}>slope {fmt(slope)}</text>
        {diverged && (
          <text x={(p.x0 + p.x1) / 2} y={p.y1 + 30} textAnchor="middle" fontSize="14" fontWeight="700" fill={C.rose}>Diverged! Learning rate too large</text>
        )}
        {converged && xs.length > 1 && (
          <text x={(p.x0 + p.x1) / 2} y={p.y1 + 30} textAnchor="middle" fontSize="13" fontWeight="700" fill={C.emerald}>Converged</text>
        )}
      </svg>
      <Row>
        <Slider label="learning rate" value={lr} min={0.01} max={1.1} step={0.01} onChange={(v) => { setLr(v); }} display={lr.toFixed(2)} />
      </Row>
      <Row>
        <Button primary onClick={() => setRunning((r) => !r)} disabled={diverged || converged}>{running ? "Pause" : "Play"}</Button>
        <Button onClick={step} disabled={running || diverged || converged}>Step</Button>
        <Button onClick={reset}>Reset</Button>
        <Stat label="step" value={xs.length - 1} />
        <Stat label="x" value={fmt(x)} color="text-amber-300" />
        <Stat label="loss" value={diverged ? "—" : fmt(curve.f(x), 3)} color="text-brand-400" />
      </Row>
    </Card>
  );
}

/* ---------- linear-regression: fitting a line with gradient descent ---------- */

export function LinearRegression({ params = {} }) {
  const n = clamp(params.points ?? 12, 4, 40);
  const lr = params.lr ?? 0.5;
  const pts = useMemo(() => {
    const rnd = mulberry32(params.seed ?? 7);
    return Array.from({ length: n }, (_, i) => {
      const x = 0.5 + (i * 9) / (n - 1) + (rnd() - 0.5) * 0.6;
      return { x, y: clamp(0.8 * x + 2 + gauss(rnd) * 1.2, 0.3, 11.7) };
    });
  }, [n, params.seed]);

  // Internally x is scaled to x/10 so one learning rate suits both m and b.
  const [w, setW] = useState({ M: 0, b: 0, iter: 0 });
  const [running, setRunning] = useState(false);
  const m = w.M / 10;
  const mse = pts.reduce((s, q) => s + (m * q.x + w.b - q.y) ** 2, 0) / n;

  const step = () =>
    setW(({ M, b, iter }) => {
      let gM = 0, gb = 0;
      for (const q of pts) {
        const e = M * (q.x / 10) + b - q.y;
        gM += (2 / n) * e * (q.x / 10);
        gb += (2 / n) * e;
      }
      return { M: M - lr * gM, b: b - lr * gb, iter: iter + 1, g: Math.hypot(gM, gb) };
    });
  useTicker(running, step, 120);
  const done = w.iter > 0 && (w.g < 2e-3 || w.iter >= 500);
  useEffect(() => {
    if (done) setRunning(false);
  }, [done]);

  const p = plot([0, 10], [0, 12]);
  const id = useSvgId();
  return (
    <Card title="Linear regression" params={params} caption="Press Play: gradient descent nudges slope m and intercept b to shrink the dashed residuals (and the mean squared error).">
      <svg viewBox={`0 0 ${p.w} ${p.h}`} className="w-full h-auto">
        <defs>
          <clipPath id={`${id}c`}><rect x={p.x0} y={p.y1} width={p.x1 - p.x0} height={p.y0 - p.y1} /></clipPath>
        </defs>
        <Axes p={p} xticks={[0, 2, 4, 6, 8, 10]} yticks={[0, 3, 6, 9, 12]} xlabel="x" ylabel="y" />
        <g clipPath={`url(#${id}c)`}>
          {pts.map((q, i) => (
            <line key={i} x1={p.sx(q.x)} y1={p.sy(q.y)} x2={p.sx(q.x)} y2={p.sy(m * q.x + w.b)} stroke={C.rose} strokeOpacity="0.7" strokeDasharray="3 3" />
          ))}
          <line x1={p.sx(0)} y1={p.sy(w.b)} x2={p.sx(10)} y2={p.sy(m * 10 + w.b)} stroke={C.brandL} strokeWidth="2.5" />
        </g>
        {pts.map((q, i) => (
          <circle key={i} cx={p.sx(q.x)} cy={p.sy(q.y)} r="4.5" fill={C.sky} stroke="#0a0b14" strokeWidth="1" />
        ))}
        <text x={p.x1 - 4} y={p.y1 + 12} textAnchor="end" fontSize="11" fill={C.brandL} fontFamily="ui-monospace, monospace">
          ŷ = {fmt(m)}·x + {fmt(w.b)}
        </text>
      </svg>
      <Row>
        <Button primary onClick={() => setRunning((r) => !r)} disabled={done}>{running ? "Pause" : "Play"}</Button>
        <Button onClick={step} disabled={running || done}>Step</Button>
        <Button onClick={() => { setRunning(false); setW({ M: 0, b: 0, iter: 0 }); }}>Reset</Button>
        <Stat label="iter" value={w.iter} />
        <Stat label="m" value={fmt(m)} color="text-brand-400" />
        <Stat label="b" value={fmt(w.b)} color="text-brand-400" />
        <Stat label="MSE" value={fmt(mse, 3)} color="text-rose-300" />
      </Row>
    </Card>
  );
}

/* ---------- sigmoid: squashing z into a probability ---------- */

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export function Sigmoid({ params = {} }) {
  const [z, setZ] = useState(params.z ?? 1.5);
  const [th, setTh] = useState(clamp(params.threshold ?? 0.5, 0.05, 0.95));
  const p = plot([-8, 8], [-0.05, 1.05], { h: 240 });
  const svgRef = useRef(null);
  const dragging = useRef(false);
  const zt = Math.log(th / (1 - th)); // z where σ(z) = threshold
  const s = sigmoid(z);
  const cls = s >= th ? 1 : 0;

  // Drag anywhere on the chart to move z.
  const moveTo = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * p.w;
    setZ(Math.round(clamp(p.sx.inv(vx), -8, 8) * 10) / 10);
  };
  const down = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moveTo(e);
  };

  return (
    <Card title="The sigmoid function" params={params} caption="Drag on the chart (or use the slider) to move z. Points above the threshold line are predicted class 1, below it class 0.">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${p.w} ${p.h}`}
        className="w-full h-auto cursor-ew-resize touch-none select-none"
        onPointerDown={down}
        onPointerMove={(e) => dragging.current && moveTo(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {/* class regions split at z where σ(z) = threshold */}
        <rect x={p.x0} y={p.y1} width={clamp(p.sx(zt), p.x0, p.x1) - p.x0} height={p.y0 - p.y1} fill={C.rose} opacity="0.08" />
        <rect x={clamp(p.sx(zt), p.x0, p.x1)} y={p.y1} width={p.x1 - clamp(p.sx(zt), p.x0, p.x1)} height={p.y0 - p.y1} fill={C.emerald} opacity="0.08" />
        <Axes p={p} xticks={[-8, -4, 0, 4, 8]} yticks={[0, 0.5, 1]} xlabel="z" ylabel="σ(z)" />
        <text x={p.x0 + 8} y={p.y1 + 30} fontSize="12" fontWeight="700" fill={C.rose}>class 0</text>
        <text x={p.x1 - 8} y={p.y0 - 30} fontSize="12" fontWeight="700" fill={C.emerald} textAnchor="end">class 1</text>
        <line x1={p.x0} x2={p.x1} y1={p.sy(th)} y2={p.sy(th)} stroke={C.amber} strokeDasharray="5 4" />
        <text x={p.x0 + 6} y={p.sy(th) - 5} fontSize="10" fill={C.amber}>threshold {th.toFixed(2)}</text>
        <path d={curvePath(sigmoid, p)} fill="none" stroke={C.brandL} strokeWidth="2.5" />
        {/* guide lines from the point to the axes */}
        <line x1={p.sx(z)} x2={p.sx(z)} y1={p.y0} y2={p.sy(s)} stroke={C.sky} strokeOpacity="0.6" strokeDasharray="3 3" />
        <line x1={p.x0} x2={p.sx(z)} y1={p.sy(s)} y2={p.sy(s)} stroke={C.sky} strokeOpacity="0.6" strokeDasharray="3 3" />
        <circle cx={p.sx(z)} cy={p.sy(s)} r="7" fill={cls ? C.emerald : C.rose} stroke="#fff" strokeWidth="1.5" />
      </svg>
      <Row>
        <Slider label="z" value={z} min={-8} max={8} step={0.1} onChange={setZ} display={z.toFixed(1)} />
        <Slider label="threshold" value={th} min={0.05} max={0.95} step={0.01} onChange={setTh} display={th.toFixed(2)} />
      </Row>
      <Row>
        <Stat label="σ(z)" value={s.toFixed(3)} color="text-sky-300" />
        <Stat label="prediction" value={`class ${cls}`} color={cls ? "text-emerald-300" : "text-rose-300"} />
      </Row>
    </Card>
  );
}

/* ---------- activation-functions: morph between common activations ---------- */

const ACTIVATIONS = {
  sigmoid: { name: "Sigmoid", f: sigmoid, formula: "σ(x) = 1 / (1 + e^(−x))", range: "(0, 1)", note: "Squashes to a probability; saturates for large |x|." },
  tanh: { name: "Tanh", f: Math.tanh, formula: "tanh(x) = (eˣ − e⁻ˣ) / (eˣ + e⁻ˣ)", range: "(−1, 1)", note: "Zero-centred version of the sigmoid." },
  relu: { name: "ReLU", f: (x) => Math.max(0, x), formula: "ReLU(x) = max(0, x)", range: "[0, ∞)", note: "Cheap and the default for hidden layers; zero gradient for x < 0." },
  "leaky-relu": { name: "Leaky ReLU", f: (x) => (x > 0 ? x : 0.1 * x), formula: "LeakyReLU(x) = max(0.1x, x)", range: "(−∞, ∞)", note: "Small slope for x < 0 so neurons never fully die." },
  softplus: { name: "Softplus", f: (x) => Math.log1p(Math.exp(x)), formula: "softplus(x) = ln(1 + eˣ)", range: "(0, ∞)", note: "A smooth version of ReLU." },
};
const ACT_ALIASES = { leaky: "leaky-relu", leakyrelu: "leaky-relu", leaky_relu: "leaky-relu" };
const ACT_N = 120;

export function ActivationFunctions({ params = {} }) {
  const keys = useMemo(() => {
    const want = (params.only || []).map((k) => String(k).toLowerCase()).map((k) => ACT_ALIASES[k] || k).filter((k) => ACTIVATIONS[k]);
    return want.length ? want : Object.keys(ACTIVATIONS);
  }, [params.only]);
  const p = plot([-4, 4], [-1.5, 4]);
  const sample = (k) => Array.from({ length: ACT_N + 1 }, (_, i) => ACTIVATIONS[k].f(-4 + (8 * i) / ACT_N));

  const [active, setActive] = useState(keys.includes(params.initial) ? params.initial : keys[0]);
  const [ys, setYs] = useState(() => sample(active));
  const ysRef = useRef(ys);
  ysRef.current = ys;

  // Animate from whatever is drawn now to the selected function.
  useEffect(() => {
    const from = ysRef.current, to = sample(active);
    let raf, t0;
    const tick = (now) => {
      t0 ??= now;
      const t = Math.min(1, (now - t0) / 600);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out
      setYs(from.map((v, i) => v + (to[i] - v) * e));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const a = ACTIVATIONS[active];
  const d = ys.map((y, i) => `${i ? "L" : "M"}${p.sx(-4 + (8 * i) / ACT_N).toFixed(2)},${clamp(p.sy(y), -500, 800).toFixed(2)}`).join("");
  const id = useSvgId();
  return (
    <Card title="Activation functions" params={params} caption="Switch between activations to watch the curve morph. Compare where each one is flat (vanishing gradient) and its output range.">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {keys.map((k) => (
          <Button key={k} primary={k === active} onClick={() => setActive(k)}>{ACTIVATIONS[k].name}</Button>
        ))}
      </div>
      <svg viewBox={`0 0 ${p.w} ${p.h}`} className="w-full h-auto">
        <defs>
          <clipPath id={`${id}c`}><rect x={p.x0} y={p.y1} width={p.x1 - p.x0} height={p.y0 - p.y1} /></clipPath>
        </defs>
        <Axes p={p} xticks={[-4, -2, 0, 2, 4]} yticks={[-1, 0, 1, 2, 3, 4]} xlabel="x" ylabel="f(x)" />
        <line x1={p.sx(0)} x2={p.sx(0)} y1={p.y1} y2={p.y0} stroke={C.axis} />
        <line x1={p.x0} x2={p.x1} y1={p.sy(0)} y2={p.sy(0)} stroke={C.axis} />
        <path d={d} fill="none" stroke={C.brandL} strokeWidth="3" clipPath={`url(#${id}c)`} strokeLinejoin="round" />
      </svg>
      <div className="mt-3 rounded-lg bg-ink-800 px-3 py-2">
        <div className="font-mono text-sm text-amber-300">{a.formula}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>range <span className="font-mono text-emerald-300">{a.range}</span></span>
          <span>{a.note}</span>
        </div>
      </div>
    </Card>
  );
}

/* ---------- normal-distribution: the 68–95–99.7 rule ---------- */

const pdf = (x, mu, sd) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

export function NormalDistribution({ params = {} }) {
  const [mu, setMu] = useState(clamp(params.mean ?? 0, -3, 3));
  const [sd, setSd] = useState(clamp(params.std ?? 1, 0.5, 2.5));
  const p = plot([-7, 7], [0, 0.85], { h: 300, b: 86 });
  const f = (x) => pdf(x, mu, sd);
  const bands = [
    { k: 3, pct: "99.7%", op: 0.15, color: C.sky },
    { k: 2, pct: "95%", op: 0.22, color: C.emerald },
    { k: 1, pct: "68%", op: 0.32, color: C.brandL },
  ];
  // Filled area under the curve between a and b (clipped to the axis).
  const area = (a, b) => {
    const lo = clamp(a, -7, 7), hi = clamp(b, -7, 7);
    return `${curvePath(f, p, 80, lo, hi)}L${p.sx(hi)},${p.y0}L${p.sx(lo)},${p.y0}Z`;
  };
  return (
    <Card title="The normal distribution" params={params} caption="Move the mean to shift the bell and the standard deviation to widen it. About 68% / 95% / 99.7% of values fall within 1 / 2 / 3 σ of the mean.">
      <svg viewBox={`0 0 ${p.w} ${p.h}`} className="w-full h-auto">
        <Axes p={p} xticks={[-6, -4, -2, 0, 2, 4, 6]} yticks={[0, 0.2, 0.4, 0.6, 0.8]} yfmt={(v) => v.toFixed(1)} />
        {bands.map((b) => (
          <path key={b.k} d={area(mu - b.k * sd, mu + b.k * sd)} fill={b.color} opacity={b.op} />
        ))}
        <path d={curvePath(f, p, 200)} fill="none" stroke={C.brandL} strokeWidth="2.5" />
        <line x1={p.sx(mu)} x2={p.sx(mu)} y1={p.y0} y2={p.sy(f(mu))} stroke={C.amber} strokeDasharray="4 3" />
        <text x={p.sx(mu)} y={Math.max(p.sy(f(mu)) - 6, p.y1 + 8)} textAnchor="middle" fontSize="10" fill={C.amber}>μ</text>
        {/* brackets under the axis: ±1σ, ±2σ, ±3σ */}
        {[...bands].reverse().map((b, i) => {
          const y = p.y0 + 30 + i * 19;
          const xa = clamp(p.sx(mu - b.k * sd), p.x0, p.x1), xb = clamp(p.sx(mu + b.k * sd), p.x0, p.x1);
          return (
            <g key={b.k} stroke={b.color} fill={b.color} fontSize="10">
              <path d={`M${xa},${y - 5}V${y}H${xb}V${y - 5}`} fill="none" strokeWidth="1.5" />
              <text x={(xa + xb) / 2} y={y + 12} textAnchor="middle" stroke="none">±{b.k}σ · {b.pct}</text>
            </g>
          );
        })}
      </svg>
      <Row>
        <Slider label="mean μ" value={mu} min={-3} max={3} step={0.1} onChange={setMu} display={mu.toFixed(1)} />
        <Slider label="std σ" value={sd} min={0.5} max={2.5} step={0.05} onChange={setSd} display={sd.toFixed(2)} />
      </Row>
    </Card>
  );
}

/* ---------- overfitting: polynomial degree vs train/test error ---------- */

/** Least-squares polynomial fit via the normal equations (tiny ridge for stability). */
function polyFit(xs, ys, deg) {
  const n = deg + 1;
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  xs.forEach((x, k) => {
    const pw = [1];
    for (let i = 1; i <= 2 * deg; i++) pw.push(pw[i - 1] * x);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += pw[i + j];
      A[i][n] += pw[i] * ys[k];
    }
  });
  for (let i = 0; i < n; i++) A[i][i] += 1e-9;
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = c + 1; r < n; r++) {
      const m = A[r][c] / A[c][c];
      for (let j = c; j <= n; j++) A[r][j] -= m * A[c][j];
    }
  }
  const w = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * w[j];
    w[i] = s / A[i][i];
  }
  return w;
}
const polyEval = (w, x) => w.reduceRight((acc, c) => acc * x + c, 0);

export function Overfitting({ params = {} }) {
  const truth = (x) => Math.sin(2 * Math.PI * x);
  const data = useMemo(() => {
    const rnd = mulberry32(params.seed ?? 4);
    const noise = params.noise ?? 0.25;
    const nTrain = clamp(params.train ?? 12, 6, 40), nTest = clamp(params.test ?? 12, 3, 40);
    const mk = (x) => ({ x, y: truth(x) + gauss(rnd) * noise });
    const train = Array.from({ length: nTrain }, (_, i) => mk(clamp((i + 0.5) / nTrain + (rnd() - 0.5) * 0.05, 0, 1)));
    const test = Array.from({ length: nTest }, (_, i) => mk(clamp((i + 0.5) / nTest + (rnd() - 0.5) * 0.06, 0.01, 0.99)));
    // Fit every degree once; x is scaled to [-1, 1] to keep the system well conditioned.
    const u = (x) => 2 * x - 1;
    const fits = [];
    for (let d = 1; d <= 12; d++) {
      const w = polyFit(train.map((q) => u(q.x)), train.map((q) => q.y), d);
      const err = (set) => set.reduce((s, q) => s + (polyEval(w, u(q.x)) - q.y) ** 2, 0) / set.length;
      fits.push({ d, w, train: err(train), test: err(test) });
    }
    const best = fits.reduce((a, b) => (b.test < a.test ? b : a));
    return { train, test, fits, best, u };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.seed, params.noise, params.train, params.test]);

  const [deg, setDeg] = useState(clamp(params.degree ?? 1, 1, 12));
  const fit = data.fits[deg - 1];
  // Good fit = test error close to the best degree's; overfit = memorising the training set.
  const close = fit.test <= data.best.test * 1.5 + 0.02;
  const memorising = fit.train < data.best.train * 0.4;
  const verdict =
    deg < data.best.d && !close ? { t: "underfit", c: "text-sky-300" }
    : deg > data.best.d && (!close || memorising) ? { t: "overfit", c: "text-rose-300" }
    : { t: "good fit", c: "text-emerald-300" };

  const p = plot([0, 1], [-1.8, 1.8]);
  const e = plot([1, 12], [-3, 1], { h: 120, t: 10, b: 24 }); // log10 error chart
  const ly = (v) => e.sy(clamp(Math.log10(Math.max(v, 1e-6)), -3, 1));
  const id = useSvgId();
  return (
    <Card title="Underfitting vs overfitting" params={params} caption="Slide the polynomial degree. Low degrees miss the pattern (underfit); high degrees chase the noise in the training points and do worse on the held-out test points (overfit).">
      <svg viewBox={`0 0 ${p.w} ${p.h}`} className="w-full h-auto">
        <defs>
          <clipPath id={`${id}c`}><rect x={p.x0} y={p.y1} width={p.x1 - p.x0} height={p.y0 - p.y1} /></clipPath>
        </defs>
        <Axes p={p} xticks={[0, 0.25, 0.5, 0.75, 1]} yticks={[-1.5, -0.75, 0, 0.75, 1.5]} />
        <g clipPath={`url(#${id}c)`}>
          <path d={curvePath(truth, p)} fill="none" stroke={C.dim} strokeWidth="1.5" strokeDasharray="5 4" />
          <path d={curvePath((x) => polyEval(fit.w, data.u(x)), p, 240)} fill="none" stroke={C.brandL} strokeWidth="2.5" />
        </g>
        {data.train.map((q, i) => <circle key={`a${i}`} cx={p.sx(q.x)} cy={p.sy(q.y)} r="4.5" fill={C.sky} stroke="#0a0b14" />)}
        {data.test.map((q, i) => <circle key={`b${i}`} cx={p.sx(q.x)} cy={p.sy(q.y)} r="4" fill="none" stroke={C.amber} strokeWidth="2" />)}
        <g fontSize="10">
          <circle cx={p.x0 + 10} cy={p.y1 + 8} r="4" fill={C.sky} /><text x={p.x0 + 18} y={p.y1 + 11} fill={C.text}>train</text>
          <circle cx={p.x0 + 60} cy={p.y1 + 8} r="3.5" fill="none" stroke={C.amber} strokeWidth="2" /><text x={p.x0 + 68} y={p.y1 + 11} fill={C.text}>test</text>
          <line x1={p.x0 + 104} x2={p.x0 + 120} y1={p.y1 + 8} y2={p.y1 + 8} stroke={C.dim} strokeDasharray="4 3" /><text x={p.x0 + 124} y={p.y1 + 11} fill={C.text}>true function</text>
        </g>
      </svg>
      <Row>
        <Slider label="degree" value={deg} min={1} max={12} step={1} onChange={setDeg} display={deg} />
      </Row>
      <Row>
        <span className={`rounded-md bg-ink-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${verdict.c}`}>{verdict.t}</span>
        <Stat label="train MSE" value={fmt(fit.train, 3)} color="text-sky-300" />
        <Stat label="test MSE" value={fit.test > 99 ? fit.test.toExponential(1) : fmt(fit.test, 3)} color="text-amber-300" />
      </Row>
      {/* error vs degree (log scale) */}
      <svg viewBox={`0 0 ${e.w} ${e.h}`} className="mt-3 w-full h-auto">
        <Axes p={e} xticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]} yticks={[-3, -2, -1, 0, 1]} yfmt={(v) => `1e${v}`} />
        <line x1={e.sx(deg)} x2={e.sx(deg)} y1={e.y1} y2={e.y0} stroke={C.brandL} strokeOpacity="0.6" strokeWidth="6" />
        <polyline points={data.fits.map((q) => `${e.sx(q.d)},${ly(q.train)}`).join(" ")} fill="none" stroke={C.sky} strokeWidth="2" />
        <polyline points={data.fits.map((q) => `${e.sx(q.d)},${ly(q.test)}`).join(" ")} fill="none" stroke={C.amber} strokeWidth="2" />
        <text x={e.x1 - 4} y={e.y1 + 10} textAnchor="end" fontSize="10" fill={C.text}>
          error vs degree: <tspan fill={C.sky}>train</tspan> / <tspan fill={C.amber}>test</tspan>
        </text>
      </svg>
    </Card>
  );
}

/* ---------- bias-variance: four dartboards ---------- */

const BV_BOARDS = [
  { label: "Low bias · Low variance", bias: 0, sd: 0.09, color: C.emerald },
  { label: "Low bias · High variance", bias: 0, sd: 0.32, color: C.sky },
  { label: "High bias · Low variance", bias: 0.5, sd: 0.09, color: C.amber },
  { label: "High bias · High variance", bias: 0.5, sd: 0.32, color: C.rose },
];

export function BiasVariance({ params = {} }) {
  const n = clamp(params.darts ?? 12, 3, 40);
  const [round, setRound] = useState(0);
  const [shown, setShown] = useState(0);
  const darts = useMemo(
    () =>
      BV_BOARDS.map((b, k) => {
        const rnd = mulberry32((params.seed ?? 3) * 100 + round * 10 + k);
        const ang = 0.7 + rnd() * 0.6; // direction of the systematic offset
        return Array.from({ length: n }, () => ({
          x: b.bias * Math.cos(ang) + gauss(rnd) * b.sd,
          y: -b.bias * Math.sin(ang) + gauss(rnd) * b.sd,
        }));
      }),
    [n, round, params.seed]
  );
  useTicker(shown < n, () => setShown((s) => Math.min(n, s + 1)), 160);
  const R = 72;
  return (
    <Card title="Bias vs variance" params={params} caption="Bias is how far the average throw lands from the bullseye; variance is how scattered the throws are. The amber + marks the average of each board.">
      <svg viewBox="0 0 400 410" className="w-full h-auto">
        {BV_BOARDS.map((b, k) => {
          const cx = 100 + (k % 2) * 200, cy = 98 + Math.floor(k / 2) * 205;
          const vis = darts[k].slice(0, shown);
          const mx = vis.reduce((s, d) => s + d.x, 0) / (vis.length || 1), my = vis.reduce((s, d) => s + d.y, 0) / (vis.length || 1);
          return (
            <g key={k}>
              {[1, 0.75, 0.5, 0.25].map((f, i) => (
                <circle key={f} cx={cx} cy={cy} r={R * f} fill={i % 2 ? "#191c2c" : "#262a3f"} stroke={C.axis} />
              ))}
              <circle cx={cx} cy={cy} r="4" fill={C.rose} />
              {vis.map((d, i) => (
                <circle
                  key={`${round}-${i}`}
                  cx={cx + clamp(d.x, -1.15, 1.15) * R}
                  cy={cy + clamp(d.y, -1.15, 1.15) * R}
                  r={i === shown - 1 && shown < n ? 5.5 : 3.8}
                  fill={b.color}
                  stroke="#0a0b14"
                  strokeWidth="1"
                  style={{ transition: "r 0.2s ease" }}
                />
              ))}
              {shown === n && (
                <path d={`M${cx + mx * R - 7},${cy + my * R}h14M${cx + mx * R},${cy + my * R - 7}v14`} stroke={C.amber} strokeWidth="2.5" />
              )}
              <text x={cx} y={cy + R + 20} textAnchor="middle" fontSize="12" fontWeight="600" fill={b.color}>{b.label}</text>
            </g>
          );
        })}
      </svg>
      <Row>
        <Button primary onClick={() => { setRound((r) => r + 1); setShown(0); }}>Throw again</Button>
        <Stat label="darts" value={`${shown}/${n}`} />
      </Row>
    </Card>
  );
}

/* ---------- kfold: k-fold cross-validation rounds ---------- */

export function KFold({ params = {} }) {
  const [k, setK] = useState(clamp(Math.round(params.folds ?? 5), 2, 10));
  const [done, setDone] = useState(0); // rounds completed
  const [running, setRunning] = useState(false);
  const metric = params.metric || "accuracy";
  const scores = useMemo(() => {
    const rnd = mulberry32((params.seed ?? 5) + k);
    return Array.from({ length: k }, () => 0.78 + rnd() * 0.14);
  }, [k, params.seed]);
  useTicker(running, () => setDone((d) => Math.min(k, d + 1)), 1100);
  useEffect(() => {
    if (done >= k) setRunning(false);
  }, [done, k]);

  const avg = scores.reduce((a, b) => a + b, 0) / k;
  const current = running || (done > 0 && done < k) ? done : -1; // row being evaluated next
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const reset = (nk = k) => { setRunning(false); setDone(0); setK(nk); };

  return (
    <Card title={`${k}-fold cross-validation`} params={params} caption="Press Play: each round holds out one fold for validation (amber) and trains on the rest (violet). The final score is the average over all rounds.">
      {/* the full dataset split into k folds */}
      <div className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">dataset</div>
      <div className="flex gap-0.5 overflow-hidden rounded-md">
        {scores.map((_, i) => (
          <div key={i} className="flex h-7 flex-1 items-center justify-center bg-ink-700 font-mono text-[10px] text-slate-300">{i + 1}</div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {scores.map((s, r) => {
          const shown = r < done;
          const active = r === current;
          return (
            <div key={r} className={`flex items-center gap-2 transition-opacity duration-500 ${shown || active ? "opacity-100" : "opacity-30"}`}>
              <span className={`w-14 shrink-0 text-[11px] ${active ? "text-white" : "text-slate-400"}`}>Round {r + 1}</span>
              <div className={`flex flex-1 gap-0.5 overflow-hidden rounded ${active ? "ring-1 ring-brand-400" : ""}`}>
                {scores.map((_, i) => (
                  <div
                    key={i}
                    className={`h-4 flex-1 transition-colors duration-500 ${i === r ? "bg-amber-400" : shown || active ? "bg-brand-500" : "bg-ink-700"}`}
                  />
                ))}
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-xs text-emerald-300">{shown ? pct(s) : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />train</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />validation</span>
        {done === k && (
          <span className="ml-auto rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-xs text-emerald-300">
            mean {metric} = {pct(avg)}
          </span>
        )}
      </div>
      <Row>
        <Button primary onClick={() => (done >= k ? (setDone(0), setRunning(true)) : setRunning((r) => !r))}>
          {running ? "Pause" : done >= k ? "Replay" : "Play"}
        </Button>
        <Button onClick={() => setDone((d) => Math.min(k, d + 1))} disabled={running || done >= k}>Step</Button>
        <Button onClick={() => reset()}>Reset</Button>
        <Slider label="k" value={k} min={2} max={10} step={1} onChange={(v) => reset(v)} display={k} />
      </Row>
    </Card>
  );
}

export const WIDGETS_A = { "gradient-descent": GradientDescent, "linear-regression": LinearRegression, sigmoid: Sigmoid, "activation-functions": ActivationFunctions, "normal-distribution": NormalDistribution, overfitting: Overfitting, "bias-variance": BiasVariance, kfold: KFold };
