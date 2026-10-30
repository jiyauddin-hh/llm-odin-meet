"use client";

// Interactive ML teaching diagrams (set B). Each widget is pure React + inline
// SVG, uses seeded data so server and client render the same thing, and takes
// an optional `params` object from the lesson's ```diagram block.

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

/* ---------- shared helpers ---------- */

const PALETTE = ["#38bdf8", "#fbbf24", "#34d399", "#e879f9", "#fb7185"]; // sky, amber, emerald, fuchsia, rose
const POS = "#34d399"; // actual positive
const NEG = "#fb7185"; // actual negative
const BRAND = "#8b5cf6";
const BRAND_LIGHT = "#a78bfa";
const AMBER = "#fbbf24";
const INK = { 950: "#0a0b14", 900: "#11131f", 800: "#191c2c", 700: "#262a3f", 600: "#363b56" };
const MUTED = "#64748b";
const EASE = "cubic-bezier(.4,0,.2,1)";

/** Small deterministic PRNG: same seed, same numbers on server and client. */
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

/** Standard normal sample (Box–Muller). */
function gauss(rand) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const num = (v, d) => (Number.isFinite(v) ? v : d);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const tr = (x, y) => `translate(${x}px, ${y}px)`;

/** Pointer event → viewBox coordinates of the svg it was attached to. */
function svgPoint(e) {
  const svg = e.currentTarget.ownerSVGElement || e.currentTarget;
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** Runs onFrame(dtMs) every animation frame while `running` is true. */
function useLoop(running, onFrame) {
  const cb = useRef(onFrame);
  cb.current = onFrame;
  useEffect(() => {
    if (!running) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      cb.current(Math.min(64, now - last));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** A number that glides to its target instead of jumping. */
function useTweened(target, ms = 450) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const a = from.current;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const v = lerp(a, target, ease(p));
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Card({ title, caption, children }) {
  return (
    <figure className="not-prose mx-auto my-6 w-full max-w-[640px] rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
        <span className="text-sm font-semibold tracking-wide text-white">{title}</span>
      </div>
      {children}
      <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">{caption}</figcaption>
    </figure>
  );
}

function Btn({ primary, className = "", ...rest }) {
  const tone = primary ? "bg-brand-500 hover:bg-brand-600" : "bg-ink-700 hover:bg-ink-600";
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${className}`}
      {...rest}
    />
  );
}

function Slider({ label, value, display, ...rest }) {
  return (
    <label className="flex min-w-[150px] flex-1 items-center gap-2 text-xs text-slate-300">
      <span className="shrink-0">{label}</span>
      <input type="range" className="w-full min-w-[80px] accent-brand-500" value={value} {...rest} />
      <span className="w-10 shrink-0 text-right font-mono text-brand-400">{display ?? value}</span>
    </label>
  );
}

const Row = ({ children, className = "" }) => <div className={`mt-3 flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;

function Stat({ label, children, color }) {
  return (
    <span className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 font-mono text-[11px] text-slate-300">
      <span className="text-slate-500">{label} </span>
      <span style={{ color: color || "#fff" }}>{children}</span>
    </span>
  );
}

/** Dark rounded stage holding a responsive svg. */
function Stage({ w, h, children, className = "", ...rest }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-800 bg-ink-950">
      <svg viewBox={`0 0 ${w} ${h}`} className={`block h-auto w-full select-none ${className}`} {...rest}>
        {children}
      </svg>
    </div>
  );
}

/** Faint background grid. */
function Grid({ w, h, step = 40 }) {
  const lines = [];
  for (let x = step; x < w; x += step) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={h} />);
  for (let y = step; y < h; y += step) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={w} y2={y} />);
  return (
    <g stroke={INK[800]} strokeWidth={1}>
      {lines}
    </g>
  );
}

/* ---------- shared data: scored binary samples (confusion matrix + ROC) ---------- */

function makeScores(seed, n, sep) {
  const r = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const y = i % 2 === 0 ? 1 : 0;
    const mu = y ? 0.5 + sep / 2 : 0.5 - sep / 2;
    return { s: clamp(mu + gauss(r) * 0.17, 0.02, 0.98), y, j: r() };
  });
}

function countAt(data, th) {
  const c = { TP: 0, FP: 0, FN: 0, TN: 0 };
  for (const d of data) {
    const pred = d.s >= th;
    if (d.y && pred) c.TP++;
    else if (d.y) c.FN++;
    else if (pred) c.FP++;
    else c.TN++;
  }
  return c;
}

/** Horizontal strip of samples by score; tap it to move the threshold. */
function ScoreStrip({ data, th, onPick }) {
  const W = 360;
  const X = (s) => 14 + s * (W - 28);
  const pick = (e) => {
    const p = svgPoint(e);
    if (p) onPick(+clamp((p.x - 14) / (W - 28), 0, 1).toFixed(2));
  };
  return (
    <Stage w={W} h={88} onPointerDown={pick} onPointerMove={(e) => e.buttons & 1 && e.pointerType === "mouse" && pick(e)} className="cursor-pointer">
      {/* predicted-positive zone right of the threshold */}
      <g style={{ transform: tr(X(th), 0), transition: "transform 150ms ease-out" }}>
        <rect x={0} y={4} width={W} height={62} fill={BRAND} opacity={0.12} />
        <line x1={0} y1={2} x2={0} y2={68} stroke={BRAND_LIGHT} strokeWidth={2} />
        <text x={-4} y={78} textAnchor="end" fontSize={8} fill={BRAND_LIGHT}>
          predict −
        </text>
        <text x={4} y={78} fontSize={8} fill={BRAND_LIGHT}>
          predict +
        </text>
      </g>
      <line x1={14} y1={68} x2={W - 14} y2={68} stroke={INK[600]} />
      {[0, 0.5, 1].map((t) => (
        <text key={t} x={X(t)} y={86} textAnchor="middle" fontSize={8} fill={MUTED}>
          {t}
        </text>
      ))}
      <text x={4} y={12} fontSize={7} fill={POS}>actual +</text>
      <text x={4} y={64} fontSize={7} fill={NEG}>actual −</text>
      {data.map((d, i) => {
        const on = d.s >= th;
        const c = d.y ? POS : NEG;
        return (
          <circle
            key={i}
            cx={X(d.s)}
            cy={(d.y ? 14 : 40) + d.j * 16}
            r={4}
            stroke={c}
            strokeWidth={1.5}
            style={{ fill: on ? c : INK[950], transition: "fill 250ms" }}
          />
        );
      })}
    </Stage>
  );
}

/* ====================================================================== */
/* 1. k-means                                                              */
/* ====================================================================== */

const KM = { W: 320, H: 220, U: 32 }; // U px = 1 data unit (for inertia)

function makeBlobs(seed, n) {
  const r = mulberry32(seed);
  const centers = [[85, 70], [235, 85], [150, 165]];
  return Array.from({ length: n }, (_, i) => {
    const [cx, cy] = centers[i % 3];
    return { x: clamp(cx + gauss(r) * 26, 10, KM.W - 10), y: clamp(cy + gauss(r) * 21, 10, KM.H - 10) };
  });
}

const nearest = (p, cs) => cs.reduce((best, c, j) => (dist2(p, c) < dist2(p, cs[best]) ? j : best), 0);

function kmStart(k, seed) {
  const r = mulberry32(seed * 97 + k);
  const cents = Array.from({ length: k }, () => ({ x: 30 + r() * 260, y: 25 + r() * 170 }));
  return { cents, assign: null, phase: "assign", iter: 0, done: false, lines: false };
}

function kmReducer(s, a) {
  if (a.type === "reset") return kmStart(a.k, a.seed);
  if (a.type === "hide") return { ...s, lines: false };
  if (s.done) return s;
  const pts = a.pts;
  if (s.phase === "assign") {
    // every point joins its nearest centroid
    const assign = pts.map((p) => nearest(p, s.cents));
    if (s.assign && assign.every((c, i) => c === s.assign[i])) return { ...s, done: true, lines: false };
    return { ...s, assign, phase: "update", lines: true };
  }
  // every centroid moves to the mean of its points (empty clusters stay put)
  const cents = s.cents.map((c, j) => {
    const mine = pts.filter((_, i) => s.assign[i] === j);
    if (!mine.length) return c;
    return { x: mine.reduce((t, p) => t + p.x, 0) / mine.length, y: mine.reduce((t, p) => t + p.y, 0) / mine.length };
  });
  return { ...s, cents, phase: "assign", iter: s.iter + 1, lines: false };
}

function KMeans({ params = {} }) {
  const seed = num(params.seed, 7);
  const n = clamp(Math.round(num(params.points, 45)), 9, 120);
  const pts = useMemo(() => makeBlobs(seed, n), [seed, n]);
  const [k, setK] = useState(clamp(Math.round(num(params.k, 3)), 2, 5));
  const [s, dispatch] = useReducer(kmReducer, null, () => kmStart(k, seed));
  const [playing, setPlaying] = useState(false);

  const reset = () => {
    setPlaying(false);
    dispatch({ type: "reset", k, seed });
  };
  useEffect(reset, [k, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // autoplay: one step every ~0.85s until converged
  useEffect(() => {
    if (!playing) return;
    if (s.done) return setPlaying(false);
    const id = setTimeout(() => dispatch({ type: "step", pts }), 850);
    return () => clearTimeout(id);
  }, [playing, s, pts]);

  // assignment lines flash briefly
  useEffect(() => {
    if (!s.lines) return;
    const id = setTimeout(() => dispatch({ type: "hide" }), 700);
    return () => clearTimeout(id);
  }, [s.lines]);

  const inertia = s.assign ? pts.reduce((t, p, i) => t + dist2(p, s.cents[s.assign[i]]), 0) / KM.U ** 2 : null;
  const status = s.done
    ? "Converged — no point changed cluster."
    : s.phase === "assign"
      ? "Next: assign each point to its nearest centroid."
      : "Next: move each centroid to the mean of its points.";

  return (
    <Card title="k-means clustering" caption="Press Step to alternate Assign and Update, or Play to run to convergence. Try different k and watch the inertia.">
      <Stage w={KM.W} h={KM.H}>
        <Grid w={KM.W} h={KM.H} />
        {/* lines from each point to its centroid, shown right after Assign */}
        <g style={{ opacity: s.lines ? 0.45 : 0, transition: "opacity 300ms" }}>
          {s.assign &&
            pts.map((p, i) => {
              const c = s.cents[s.assign[i]];
              return <line key={i} x1={p.x} y1={p.y} x2={c.x} y2={c.y} stroke={PALETTE[s.assign[i]]} strokeWidth={0.8} />;
            })}
        </g>
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            stroke={INK[950]}
            strokeWidth={1}
            style={{ fill: s.assign ? PALETTE[s.assign[i]] : MUTED, transition: "fill 400ms" }}
          />
        ))}
        {s.cents.map((c, j) => (
          <g key={j} style={{ transform: tr(c.x, c.y), transition: `transform 700ms ${EASE}` }}>
            <circle r={11} fill={PALETTE[j]} opacity={0.18} />
            <path d="M-7 0 L0 -7 L7 0 L0 7 Z" fill={PALETTE[j]} stroke="#fff" strokeWidth={1.5} />
          </g>
        ))}
      </Stage>
      <p className={`mt-2 text-xs ${s.done ? "text-emerald-400" : "text-slate-400"}`}>{status}</p>
      <Row>
        <Btn primary disabled={s.done || playing} onClick={() => dispatch({ type: "step", pts })}>
          Step: {s.phase === "assign" ? "Assign" : "Update"}
        </Btn>
        <Btn disabled={s.done} onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </Btn>
        <Btn onClick={reset}>Reset</Btn>
        <Slider label="k" min={2} max={5} step={1} value={k} onChange={(e) => setK(+e.target.value)} />
      </Row>
      <Row>
        <Stat label="iteration">{s.iter}</Stat>
        <Stat label="inertia">{inertia === null ? "—" : inertia.toFixed(2)}</Stat>
        {s.done && <Stat color={POS}>converged ✓</Stat>}
      </Row>
    </Card>
  );
}

/* ====================================================================== */
/* 2. k-nearest neighbours                                                 */
/* ====================================================================== */

const KNN_W = 320;
const KNN_H = 220;
const KNN_CLASS = [
  { name: "Class A", color: "#38bdf8" },
  { name: "Class B", color: AMBER },
];

function makeTwoClass(seed, n) {
  const r = mulberry32(seed);
  const centers = [[115, 90], [205, 130]];
  return Array.from({ length: n }, (_, i) => {
    const c = i % 2;
    return {
      x: clamp(centers[c][0] + gauss(r) * 40, 10, KNN_W - 10),
      y: clamp(centers[c][1] + gauss(r) * 34, 10, KNN_H - 10),
      c,
    };
  });
}

function KNN({ params = {} }) {
  const seed = num(params.seed, 11);
  const pts = useMemo(() => makeTwoClass(seed, clamp(num(params.points, 44), 10, 120)), [seed, params.points]);
  const odd = (v) => clamp(Math.round(v) | 1, 1, 15);
  const [k, setK] = useState(odd(num(params.k, 5)));
  const [q, setQ] = useState({ x: 160, y: 110 });

  const nb = useMemo(
    () => pts.map((p, i) => ({ i, d: Math.hypot(p.x - q.x, p.y - q.y) })).sort((a, b) => a.d - b.d).slice(0, k),
    [pts, q, k]
  );
  const isNb = new Set(nb.map((n) => n.i));
  const votes = [0, 0];
  nb.forEach((n) => votes[pts[n.i].c]++);
  const pred = votes[1] > votes[0] ? 1 : 0;
  const R = nb[nb.length - 1].d + 6;

  const move = (e) => {
    const p = svgPoint(e);
    if (p) setQ({ x: clamp(p.x, 4, KNN_W - 4), y: clamp(p.y, 4, KNN_H - 4) });
  };

  return (
    <Card title="k-nearest neighbours" caption="Tap anywhere to move the query point (★). The circle reaches its k-th nearest neighbour; the majority vote decides the class.">
      <Stage
        w={KNN_W}
        h={KNN_H}
        className="cursor-crosshair"
        onPointerDown={move}
        onPointerMove={(e) => e.buttons & 1 && e.pointerType === "mouse" && move(e)}
      >
        <Grid w={KNN_W} h={KNN_H} />
        {nb.map((n) => (
          <line key={n.i} x1={q.x} y1={q.y} x2={pts[n.i].x} y2={pts[n.i].y} stroke={KNN_CLASS[pts[n.i].c].color} strokeWidth={0.8} opacity={0.5} />
        ))}
        <g style={{ transform: tr(q.x, q.y), transition: "transform 250ms ease-out" }}>
          <circle
            r={1}
            vectorEffect="non-scaling-stroke"
            stroke={KNN_CLASS[pred].color}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            style={{ fill: KNN_CLASS[pred].color, fillOpacity: 0.07, transform: `scale(${R})`, transition: `transform 350ms ${EASE}, stroke 300ms` }}
          />
        </g>
        {pts.map((p, i) => (
          <g key={i}>
            {isNb.has(i) && <circle cx={p.x} cy={p.y} r={7.5} fill="none" stroke="#fff" strokeWidth={1.2} />}
            <circle cx={p.x} cy={p.y} r={4} fill={KNN_CLASS[p.c].color} opacity={isNb.has(i) ? 1 : 0.55} />
          </g>
        ))}
        <g style={{ transform: tr(q.x, q.y), transition: "transform 250ms ease-out" }}>
          <path
            d="M0 -9 L2.6 -3 L9 -2.8 L4 1.4 L5.6 8 L0 4.3 L-5.6 8 L-4 1.4 L-9 -2.8 L-2.6 -3 Z"
            stroke="#fff"
            strokeWidth={1.2}
            style={{ fill: KNN_CLASS[pred].color, transition: "fill 300ms" }}
          />
        </g>
      </Stage>
      <Row>
        <Slider label="k" min={1} max={15} step={2} value={k} onChange={(e) => setK(odd(+e.target.value))} />
      </Row>
      <div className="mt-3 grid gap-1.5">
        {KNN_CLASS.map((c, j) => (
          <div key={j} className="flex items-center gap-2 text-xs text-slate-300">
            <span className="w-16 shrink-0" style={{ color: c.color }}>{c.name}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(votes[j] / k) * 100}%`, background: c.color }} />
            </div>
            <span className="w-14 shrink-0 text-right font-mono">{votes[j]} vote{votes[j] === 1 ? "" : "s"}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-300">
        Predicted: <span className="font-semibold" style={{ color: KNN_CLASS[pred].color }}>{KNN_CLASS[pred].name}</span>{" "}
        <span className="text-slate-500">({votes[pred]} of {k} neighbours)</span>
      </p>
    </Card>
  );
}

/* ====================================================================== */
/* 3. decision tree                                                        */
/* ====================================================================== */

const TREES = {
  tennis: {
    title: "Decision tree · will they play tennis?",
    metric: "H",
    good: "Play",
    fmt: (k, v) => v,
    rows: [
      { name: "Day 1", v: { Outlook: "Sunny", Humidity: "High", Wind: "Weak" } },
      { name: "Day 3", v: { Outlook: "Overcast", Humidity: "High", Wind: "Weak" } },
      { name: "Day 4", v: { Outlook: "Rain", Humidity: "High", Wind: "Weak" } },
      { name: "Day 6", v: { Outlook: "Rain", Humidity: "Normal", Wind: "Strong" } },
      { name: "Day 9", v: { Outlook: "Sunny", Humidity: "Normal", Wind: "Weak" } },
    ],
    tree: {
      q: "Overcast?", attr: "Outlook", test: (v) => v.Outlook === "Overcast", imp: 0.94, n: 14,
      yes: { leaf: "Play", imp: 0, n: 4 },
      no: {
        q: "Sunny?", attr: "Outlook", test: (v) => v.Outlook === "Sunny", imp: 1.0, n: 10,
        yes: {
          q: "Humidity high?", attr: "Humidity", test: (v) => v.Humidity === "High", imp: 0.971, n: 5,
          yes: { leaf: "Don't play", imp: 0, n: 3 },
          no: { leaf: "Play", imp: 0, n: 2 },
        },
        no: {
          q: "Windy?", attr: "Wind", test: (v) => v.Wind === "Strong", imp: 0.971, n: 5,
          yes: { leaf: "Don't play", imp: 0, n: 2 },
          no: { leaf: "Play", imp: 0, n: 3 },
        },
      },
    },
  },
  loan: {
    title: "Decision tree · approve the loan?",
    metric: "Gini",
    good: "Approve",
    fmt: (k, v) => (k === "Income" ? `$${v}k` : k === "Debt" ? `${v}%` : v),
    rows: [
      { name: "Asha", v: { Income: 72, Credit: 710, Collateral: "No", Debt: 25 } },
      { name: "Ben", v: { Income: 64, Credit: 600, Collateral: "No", Debt: 35 } },
      { name: "Chen", v: { Income: 40, Credit: 680, Collateral: "Yes", Debt: 20 } },
      { name: "Dana", v: { Income: 35, Credit: 640, Collateral: "No", Debt: 45 } },
      { name: "Eli", v: { Income: 58, Credit: 620, Collateral: "Yes", Debt: 30 } },
    ],
    tree: {
      q: "Income ≥ 50k?", attr: "Income", test: (v) => v.Income >= 50, imp: 0.48, n: 20,
      yes: {
        q: "Credit ≥ 650?", attr: "Credit", test: (v) => v.Credit >= 650, imp: 0.32, n: 10,
        yes: { leaf: "Approve", imp: 0, n: 6 },
        no: {
          q: "Collateral?", attr: "Collateral", test: (v) => v.Collateral === "Yes", imp: 0.5, n: 4,
          yes: { leaf: "Approve", imp: 0, n: 2 },
          no: { leaf: "Reject", imp: 0, n: 2 },
        },
      },
      no: {
        q: "Debt < 30%?", attr: "Debt", test: (v) => v.Debt < 30, imp: 0.42, n: 10,
        yes: { leaf: "Approve", imp: 0.44, n: 3 },
        no: { leaf: "Reject", imp: 0, n: 7 },
      },
    },
  },
};

/** Flatten a tree into positioned nodes: leaves get consecutive x slots, parents sit between children. */
function flattenTree(root) {
  const nodes = [];
  let leaves = 0;
  let depth = 0;
  const walk = (node, id, d, parent, edge) => {
    const item = { id, node, depth: d, parent, edge };
    nodes.push(item);
    depth = Math.max(depth, d);
    if (node.leaf) item.x = leaves++;
    else item.x = (walk(node.yes, id + "y", d + 1, id, "yes").x + walk(node.no, id + "n", d + 1, id, "no").x) / 2;
    return item;
  };
  walk(root, "r", 0, null, null);
  return { nodes, leaves, depth };
}

function treePath(root, v) {
  const ids = ["r"];
  let node = root;
  let id = "r";
  while (!node.leaf) {
    const yes = node.test(v);
    id += yes ? "y" : "n";
    node = yes ? node.yes : node.no;
    ids.push(id);
  }
  return ids;
}

function DecisionTree({ params = {} }) {
  const [ex, setEx] = useState(TREES[params.example] ? params.example : "tennis");
  const T = TREES[ex];
  const W = 400;
  const H = 250;
  const { nodes, leaves, depth } = useMemo(() => flattenTree(T.tree), [T]);
  const pos = (n) => ({ x: (n.x + 0.5) * (W / leaves), y: 24 + n.depth * ((H - 48) / depth) });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const [row, setRow] = useState(null);
  const [step, setStep] = useState(0);
  const path = row === null ? [] : treePath(T.tree, T.rows[row].v);

  // walk one level down every 750ms
  useEffect(() => {
    if (row === null || step >= path.length - 1) return;
    const id = setTimeout(() => setStep((s) => s + 1), 750);
    return () => clearTimeout(id);
  }, [row, step, path.length]);

  const visited = new Set(path.slice(0, step + 1));
  const cur = row === null ? null : byId[path[step]];
  const curPos = cur ? pos(cur) : pos(nodes[0]);
  const v = row === null ? null : T.rows[row].v;
  const done = row !== null && step === path.length - 1;

  const pick = (i) => {
    setRow(i);
    setStep(0);
  };
  const switchEx = (k) => {
    setEx(k);
    setRow(null);
    setStep(0);
  };

  let note = "Pick a sample to send it down the tree.";
  if (cur && !cur.node.leaf) {
    const yes = cur.node.test(v);
    note = `${cur.node.q}  ${cur.node.attr} = ${T.fmt(cur.node.attr, v[cur.node.attr])} → ${yes ? "yes" : "no"}`;
  } else if (cur) note = `Prediction: ${cur.node.leaf}`;

  return (
    <Card title={T.title} caption="Pick a sample: it walks from the root, answering one yes/no question per node. Small numbers show each node's impurity and sample count.">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {Object.keys(TREES).map((k) => (
          <Btn key={k} primary={k === ex} onClick={() => switchEx(k)}>
            {k === "tennis" ? "Tennis" : "Loan"}
          </Btn>
        ))}
      </div>
      <Stage w={W} h={H}>
        {/* edges */}
        {nodes
          .filter((n) => n.parent)
          .map((n) => {
            const a = pos(byId[n.parent]);
            const b = pos(n);
            const on = visited.has(n.id) && visited.has(n.parent);
            return (
              <g key={n.id}>
                <line
                  x1={a.x}
                  y1={a.y + 15}
                  x2={b.x}
                  y2={b.y - 15}
                  style={{ stroke: on ? AMBER : INK[600], strokeWidth: on ? 2.5 : 1.2, transition: "stroke 300ms, stroke-width 300ms" }}
                />
                <text x={(a.x + b.x) / 2 + (n.edge === "yes" ? -6 : 6)} y={(a.y + b.y) / 2 + 3} textAnchor={n.edge === "yes" ? "end" : "start"} fontSize={8} fill={on ? AMBER : MUTED}>
                  {n.edge}
                </text>
              </g>
            );
          })}
        {/* nodes */}
        {nodes.map((n) => {
          const p = pos(n);
          const isCur = cur && cur.id === n.id;
          const leaf = n.node.leaf;
          const tint = leaf ? (leaf === T.good ? POS : NEG) : BRAND_LIGHT;
          const stroke = isCur ? AMBER : visited.has(n.id) ? tint : INK[600];
          return (
            <g key={n.id} style={{ transform: tr(p.x, p.y) }}>
              <rect
                x={-38}
                y={-15}
                width={76}
                height={30}
                rx={leaf ? 15 : 6}
                fill={leaf ? `${tint}22` : INK[800]}
                style={{ stroke, strokeWidth: isCur ? 2.2 : 1.2, transition: "stroke 300ms" }}
              />
              <text y={-1} textAnchor="middle" fontSize={leaf ? 9.5 : 8.5} fontWeight={600} fill={leaf ? tint : "#fff"}>
                {leaf || n.node.q}
              </text>
              <text y={10} textAnchor="middle" fontSize={7} fill={MUTED}>
                {T.metric} = {n.node.imp.toFixed(2)} · n={n.node.n}
              </text>
            </g>
          );
        })}
        {/* travelling token */}
        {row !== null && (
          <circle r={5} fill={AMBER} stroke="#fff" strokeWidth={1.5} style={{ transform: tr(curPos.x, curPos.y - 15), transition: `transform 600ms ${EASE}` }} />
        )}
      </Stage>
      <p className={`mt-2 min-h-[1rem] text-xs ${done ? "font-semibold text-amber-400" : "text-slate-300"}`}>{note}</p>
      <Row>
        <span className="text-xs text-slate-500">Sample:</span>
        {T.rows.map((r, i) => (
          <Btn key={r.name} primary={row === i} onClick={() => pick(i)}>
            {r.name}
          </Btn>
        ))}
      </Row>
      {v && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(v).map(([key, val]) => {
            const asked = cur && !cur.node.leaf && cur.node.attr === key;
            return (
              <span
                key={key}
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${asked ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-ink-700 bg-ink-800 text-slate-300"}`}
              >
                {key}: {T.fmt(key, val)}
              </span>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ====================================================================== */
/* 4. neural network                                                       */
/* ====================================================================== */

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function makeNet(layers, seed) {
  const r = mulberry32(seed);
  const W = layers.slice(0, -1).map((n, l) => Array.from({ length: n }, () => Array.from({ length: layers[l + 1] }, () => (r() * 2 - 1) * 1.6)));
  const B = layers.slice(1).map((n) => Array.from({ length: n }, () => (r() * 2 - 1) * 0.5));
  const x = Array.from({ length: layers[0] }, () => +(0.15 + r() * 0.8).toFixed(2));
  return { W, B, x };
}

function forward({ W, B, x }) {
  const acts = [x];
  W.forEach((Wl, l) => {
    const prev = acts[l];
    acts.push(B[l].map((b, j) => sigmoid(b + prev.reduce((t, a, i) => t + a * Wl[i][j], 0))));
  });
  return acts;
}

/** One step of gradient descent on squared error (sigmoid everywhere). */
function trainStep(net, acts, target, lr = 1.2) {
  const L = acts.length;
  const deltas = Array(L);
  deltas[L - 1] = acts[L - 1].map((a, j) => (a - target[j]) * a * (1 - a));
  for (let l = L - 2; l >= 1; l--) {
    deltas[l] = acts[l].map((a, i) => net.W[l][i].reduce((t, w, j) => t + w * deltas[l + 1][j], 0) * a * (1 - a));
  }
  const W = net.W.map((Wl, l) => Wl.map((row, i) => row.map((w, j) => w - lr * acts[l][i] * deltas[l + 1][j])));
  const B = net.B.map((Bl, l) => Bl.map((b, j) => b - lr * deltas[l + 1][j]));
  return { ...net, W, B };
}

function NeuralNetwork({ params = {} }) {
  const layersKey = JSON.stringify(params.layers ?? null); // stable even if params is re-parsed
  const layers = useMemo(() => {
    const ok = Array.isArray(params.layers) && params.layers.length >= 2 && params.layers.length <= 6;
    return (ok ? params.layers : [3, 4, 4, 2]).map((n) => clamp(Math.round(num(+n, 3)), 1, 8));
  }, [layersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const seed = num(params.seed, 5);
  const L = layers.length;
  const SEG = 750; // ms per layer
  const target = Array.from({ length: layers[L - 1] }, (_, j) => (j === 0 ? 1 : 0)); // one-hot: first output should fire

  const [net, setNet] = useState(() => makeNet(layers, seed));
  const [mode, setMode] = useState("idle"); // idle | fwd | back
  const [t, setT] = useState(0); // progress through layers, 0..L-1
  const [lit, setLit] = useState(false); // forward pass has completed
  const [epoch, setEpoch] = useState(0);
  const acts = useMemo(() => forward(net), [net]);

  useLoop(mode !== "idle", (dt) => setT((v) => Math.min(L - 1, v + dt / SEG)));
  useEffect(() => {
    if (mode === "idle" || t < L - 1) return;
    if (mode === "fwd") setLit(true);
    if (mode === "back") {
      setNet((n) => trainStep(n, forward(n), target));
      setEpoch((e) => e + 1);
    }
    setMode("idle");
  }, [mode, t, L]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (m) => {
    setT(0);
    setMode(m);
    if (m === "fwd") setLit(false);
  };
  const reset = () => {
    setNet(makeNet(layers, seed));
    setMode("idle");
    setT(0);
    setLit(false);
    setEpoch(0);
  };
  useEffect(reset, [layers, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // geometry
  const W = 360;
  const H = 240;
  const maxN = Math.max(...layers);
  const gap = Math.min(44, (H - 70) / Math.max(1, maxN - 1));
  const r = Math.max(6, Math.min(13, gap * 0.34));
  const X = (l) => 44 + (l * (W - 88)) / (L - 1);
  const Y = (l, i) => (H - 24) / 2 + (i - (layers[l] - 1) / 2) * gap;

  // how "filled" each layer is during the forward pass
  const fill = (l) => {
    if (l === 0) return 1;
    if (mode === "fwd") return clamp((t - (l - 1) - 0.7) / 0.3);
    return lit ? 1 : 0;
  };
  const seg = Math.min(L - 2, Math.floor(t)); // edge layer currently carrying pulses
  const frac = ease(t - seg);
  const backSeg = L - 2 - seg; // backprop travels from the output side
  const loss = acts[L - 1].reduce((s, a, j) => s + (a - target[j]) ** 2, 0) / layers[L - 1];
  const label = (l) => (l === 0 ? "Input" : l === L - 1 ? "Output" : L > 3 ? `Hidden ${l}` : "Hidden");

  return (
    <Card title="Neural network · forward pass & backprop" caption="Play sends signals forward layer by layer. Then Backprop sends the error back and nudges every weight — repeat and watch the loss fall.">
      <Stage w={W} h={H}>
        {/* edges: colour = sign, thickness = |weight| */}
        {net.W.map((Wl, l) =>
          Wl.map((row, i) =>
            row.map((w, j) => {
              const active = mode !== "idle" && (mode === "fwd" ? seg : backSeg) === l;
              return (
                <line
                  key={`${l}-${i}-${j}`}
                  x1={X(l)}
                  y1={Y(l, i)}
                  x2={X(l + 1)}
                  y2={Y(l + 1, j)}
                  style={{
                    stroke: w >= 0 ? "#38bdf8" : NEG,
                    strokeWidth: 0.4 + Math.min(3, Math.abs(w)) * 0.9,
                    opacity: active ? 0.75 : 0.28,
                    transition: "stroke-width 500ms, opacity 300ms, stroke 500ms",
                  }}
                />
              );
            })
          )
        )}
        {/* pulses travelling along the active edge layer */}
        {mode !== "idle" &&
          (() => {
            const l = mode === "fwd" ? seg : backSeg;
            const out = [];
            for (let i = 0; i < layers[l]; i++)
              for (let j = 0; j < layers[l + 1]; j++) {
                const p = mode === "fwd" ? frac : 1 - frac;
                const x = lerp(X(l), X(l + 1), p);
                const y = lerp(Y(l, i), Y(l + 1, j), p);
                const c = mode === "fwd" ? AMBER : "#f472b6";
                const strength = mode === "fwd" ? 0.35 + 0.65 * acts[l][i] : 0.8;
                out.push(
                  <g key={`${i}-${j}`} opacity={strength}>
                    <circle cx={x} cy={y} r={6} fill={c} opacity={0.25} />
                    <circle cx={x} cy={y} r={2.4} fill={c} />
                  </g>
                );
              }
            return out;
          })()}
        {/* neurons */}
        {layers.map((n, l) =>
          Array.from({ length: n }, (_, i) => {
            const a = acts[l][i];
            const f = fill(l);
            const hit = mode === "back" && t >= L - 1 - l - 0.15 && t < L - 1 - l + 0.85;
            return (
              <g key={`${l}-${i}`} style={{ transform: tr(X(l), Y(l, i)) }}>
                <circle r={r + 4} fill="none" stroke="#f472b6" strokeWidth={2} style={{ opacity: hit ? 0.9 : 0, transition: "opacity 200ms" }} />
                <circle r={r} fill={INK[800]} stroke={f > 0.5 ? BRAND_LIGHT : INK[600]} strokeWidth={1.5} />
                <circle r={r} fill={BRAND} style={{ fillOpacity: f * (0.15 + 0.85 * a), transition: "fill-opacity 400ms" }} />
                {r >= 10 && f > 0.5 && (
                  <text y={3} textAnchor="middle" fontSize={7.5} fill="#fff">
                    {a.toFixed(2)}
                  </text>
                )}
                {l === L - 1 && (
                  <text x={r + 6} y={3} fontSize={8} fill={MUTED}>
                    y={target[i]}
                  </text>
                )}
              </g>
            );
          })
        )}
        {layers.map((_, l) => (
          <text key={l} x={X(l)} y={H - 8} textAnchor="middle" fontSize={9} fill={l === 0 ? "#38bdf8" : l === L - 1 ? POS : BRAND_LIGHT}>
            {label(l)}
          </text>
        ))}
      </Stage>
      <Row>
        <Btn primary disabled={mode !== "idle"} onClick={() => run("fwd")}>
          ▶ Play forward
        </Btn>
        <Btn disabled={mode !== "idle" || !lit} onClick={() => run("back")} className="!bg-rose-500/80 hover:!bg-rose-500">
          ◀ Backprop
        </Btn>
        <Btn onClick={reset}>Reset</Btn>
      </Row>
      <Row>
        <Stat label="output">{lit ? acts[L - 1].map((a) => a.toFixed(2)).join(", ") : "—"}</Stat>
        <Stat label="target">{target.join(", ")}</Stat>
        <Stat label="loss" color={AMBER}>{lit ? loss.toFixed(4) : "—"}</Stat>
        <Stat label="updates">{epoch}</Stat>
      </Row>
      <p className="mt-2 text-[11px] text-slate-500">
        <span className="text-sky-400">blue</span> = positive weight, <span className="text-rose-400">red</span> = negative; thicker = larger magnitude.
      </p>
    </Card>
  );
}

/* ====================================================================== */
/* 5. confusion matrix                                                     */
/* ====================================================================== */

function Cell({ label, value, max, good, sub }) {
  const v = useTweened(value);
  const c = good ? "52,211,153" : "251,113,133";
  return (
    <div
      className="rounded-lg border p-2 text-center transition-colors duration-300"
      style={{ background: `rgba(${c},${0.06 + (0.4 * value) / Math.max(1, max)})`, borderColor: `rgba(${c},0.45)` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgb(${c})` }}>
        {label}
      </div>
      <div className="font-mono text-2xl font-bold text-white">{Math.round(v)}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}

function Metric({ name, formula, value }) {
  const v = useTweened(Number.isFinite(value) ? value : 0);
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-800 p-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-white">{name}</span>
        <span className="font-mono text-sm text-brand-400">{Number.isFinite(value) ? v.toFixed(2) : "—"}</span>
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-slate-400">{formula}</div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-950">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

function ConfusionMatrix({ params = {} }) {
  const data = useMemo(
    () => makeScores(num(params.seed, 3), clamp(Math.round(num(params.n, 40)), 6, 200), clamp(num(params.separation, 0.32), 0, 0.9)),
    [params.seed, params.n, params.separation]
  );
  const [th, setTh] = useState(clamp(num(params.threshold, 0.5)));
  const c = countAt(data, th);
  const max = Math.max(c.TP, c.FP, c.FN, c.TN);
  const N = data.length;
  const precision = c.TP / (c.TP + c.FP);
  const recall = c.TP / (c.TP + c.FN);
  const f1 = (2 * precision * recall) / (precision + recall);

  return (
    <Card title="Confusion matrix & threshold" caption="Drag the threshold (or tap the strip). Samples right of it are predicted positive — watch errors trade between FP and FN.">
      <ScoreStrip data={data} th={th} onPick={setTh} />
      <Row>
        <Slider label="threshold" min={0} max={1} step={0.01} value={th} display={th.toFixed(2)} onChange={(e) => setTh(+e.target.value)} />
      </Row>
      <div className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-1.5 text-xs">
        <div />
        <div className="text-center text-[10px] uppercase tracking-wider text-slate-500">Predicted +</div>
        <div className="text-center text-[10px] uppercase tracking-wider text-slate-500">Predicted −</div>
        <div className="flex items-center pr-1 text-[10px] uppercase tracking-wider text-emerald-400">Actual +</div>
        <Cell label="TP" value={c.TP} max={max} good sub="true positive" />
        <Cell label="FN" value={c.FN} max={max} sub="missed" />
        <div className="flex items-center pr-1 text-[10px] uppercase tracking-wider text-rose-400">Actual −</div>
        <Cell label="FP" value={c.FP} max={max} sub="false alarm" />
        <Cell label="TN" value={c.TN} max={max} good sub="true negative" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <Metric name="Accuracy" formula="(TP + TN) / total" value={(c.TP + c.TN) / N} />
        <Metric name="Precision" formula="TP / (TP + FP)" value={precision} />
        <Metric name="Recall" formula="TP / (TP + FN)" value={recall} />
        <Metric name="F1 score" formula="2 · P · R / (P + R)" value={f1} />
      </div>
    </Card>
  );
}

/* ====================================================================== */
/* 6. SVM margin                                                           */
/* ====================================================================== */

const SVM_W = 320;
const SVM_H = 220;

function makeSeparable(seed) {
  const r = mulberry32(seed);
  const phi = -0.45; // line direction (screen radians)
  const dir = { x: Math.cos(phi), y: Math.sin(phi) };
  const nrm = { x: -dir.y, y: dir.x };
  const c = { x: SVM_W / 2, y: SVM_H / 2 };
  const pts = [];
  let guard = 0;
  while (pts.length < 36 && guard++ < 2000) {
    const y = pts.length % 2 ? 1 : -1;
    const t = (r() - 0.5) * 320;
    const d = y * (14 + Math.abs(gauss(r)) * 34);
    const p = { x: c.x + t * dir.x + d * nrm.x, y: c.y + t * dir.y + d * nrm.y, cls: y, d };
    if (p.x > 12 && p.x < SVM_W - 12 && p.y > 12 && p.y < SVM_H - 12) pts.push(p);
  }
  // centre the line between the closest point of each class (hard margin)
  const dPos = Math.min(...pts.filter((p) => p.cls > 0).map((p) => p.d));
  const dNeg = Math.min(...pts.filter((p) => p.cls < 0).map((p) => -p.d));
  const off = (dPos - dNeg) / 2;
  pts.forEach((p) => (p.d -= off));
  return { pts, phi, nrm, center: { x: c.x + off * nrm.x, y: c.y + off * nrm.y }, hard: (dPos + dNeg) / 2 };
}

function SvmMargin({ params = {} }) {
  const { pts, phi, nrm, center, hard } = useMemo(() => makeSeparable(num(params.seed, 21)), [params.seed]);
  const [logC, setLogC] = useState(clamp(Math.log10(Math.max(1e-3, num(params.C, 100))), -2, 2));
  const C = 10 ** logC;
  // illustrative soft margin: small C → wider margin, more points allowed inside
  const s = (logC + 2) / 4;
  const m = hard * (1 + 2.4 * (1 - s) ** 1.5);
  const cls = { 1: { color: "#38bdf8", name: "+1" }, "-1": { color: AMBER, name: "−1" } };

  const info = pts.map((p) => {
    const yd = p.cls * p.d; // distance on own side
    return { inside: yd < m - 0.5, sv: yd <= m + 0.5 };
  });
  const nSv = info.filter((i) => i.sv).length;
  const nIn = info.filter((i) => i.inside).length;
  const band = { transition: `transform 450ms ${EASE}` };

  return (
    <Card title="Support vector machine · the margin" caption="Slide C. Large C = hard margin, set by a few support vectors. Small C = a wider, softer margin that lets points inside (red slack lines).">
      <Stage w={SVM_W} h={SVM_H}>
        <Grid w={SVM_W} h={SVM_H} />
        <g style={{ transform: `${tr(center.x, center.y)} rotate(${phi}rad)` }}>
          <rect x={-400} y={-1} width={800} height={2} fill={BRAND} opacity={0.13} style={{ ...band, transform: `scaleY(${m})` }} />
          <g style={{ ...band, transform: `translateY(${-m}px)` }}>
            <line x1={-400} x2={400} stroke={AMBER} strokeWidth={1.2} strokeDasharray="5 4" />
          </g>
          <g style={{ ...band, transform: `translateY(${m}px)` }}>
            <line x1={-400} x2={400} stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="5 4" />
          </g>
          <line x1={-400} x2={400} stroke={BRAND_LIGHT} strokeWidth={2} />
        </g>
        {/* slack: how far an inside point is from its own margin line */}
        {pts.map((p, i) => {
          if (!info[i].inside) return null;
          const k = p.cls * m - p.d;
          return <line key={`s${i}`} x1={p.x} y1={p.y} x2={p.x + k * nrm.x} y2={p.y + k * nrm.y} stroke={NEG} strokeWidth={1.2} />;
        })}
        {pts.map((p, i) => (
          <g key={i}>
            {info[i].sv && (
              <circle cx={p.x} cy={p.y} r={8} fill="none" stroke={info[i].inside ? NEG : "#fff"} strokeWidth={1.3} strokeDasharray={info[i].inside ? "2 2" : undefined} />
            )}
            <circle cx={p.x} cy={p.y} r={4.2} fill={cls[p.cls].color} stroke={INK[950]} />
          </g>
        ))}
      </Stage>
      <Row>
        <Slider label="C" min={-2} max={2} step={0.05} value={logC} display={C >= 10 ? C.toFixed(0) : C.toFixed(2)} onChange={(e) => setLogC(+e.target.value)} />
      </Row>
      <Row>
        <Stat label="margin width">{((2 * m) / (2 * hard)).toFixed(2)}× hard</Stat>
        <Stat label="support vectors" color="#fff">{nSv}</Stat>
        <Stat label="inside margin" color={NEG}>{nIn}</Stat>
      </Row>
    </Card>
  );
}

/* ====================================================================== */
/* 7. PCA                                                                  */
/* ====================================================================== */

const PCA_W = 320;
const PCA_H = 230;
const PCA_PLOT = 60; // height of the variance-vs-angle mini chart

function makeCorrelated(seed) {
  const r = mulberry32(seed);
  const a0 = 0.6; // true principal angle
  return Array.from({ length: 50 }, () => {
    const a = gauss(r) * 50;
    const b = gauss(r) * 14;
    return { x: PCA_W / 2 + a * Math.cos(a0) - b * Math.sin(a0), y: PCA_H / 2 - (a * Math.sin(a0) + b * Math.cos(a0)) };
  });
}

function PCA({ params = {} }) {
  const pts = useMemo(() => makeCorrelated(num(params.seed, 9)), [params.seed]);
  const stats = useMemo(() => {
    const n = pts.length;
    const mx = pts.reduce((t, p) => t + p.x, 0) / n;
    const my = pts.reduce((t, p) => t + p.y, 0) / n;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    pts.forEach((p) => {
      sxx += (p.x - mx) ** 2 / n;
      syy += (p.y - my) ** 2 / n;
      sxy += ((p.x - mx) * (p.y - my)) / n;
    });
    // u(θ) = (cos θ, −sin θ) since screen y points down
    const varAt = (th) => sxx * Math.cos(th) ** 2 + syy * Math.sin(th) ** 2 - 2 * sxy * Math.cos(th) * Math.sin(th);
    let pc1 = 0.5 * Math.atan2(-2 * sxy, sxx - syy);
    pc1 = ((pc1 % Math.PI) + Math.PI) % Math.PI;
    return { mx, my, varAt, pc1, total: sxx + syy };
  }, [pts]);

  const [theta, setTheta] = useState(0);
  const [mode, setMode] = useState("idle"); // idle | scan | snap
  const [proj, setProj] = useState(false);

  // scan sweeps 0→180°, then glides back to the best angle (PC1)
  useLoop(mode !== "idle", (dt) => {
    if (mode === "scan") setTheta((v) => Math.min(Math.PI, v + (dt * Math.PI) / 4200));
    else setTheta((v) => v + (stats.pc1 - v) * Math.min(1, dt / 140));
  });
  useEffect(() => {
    if (mode === "scan" && theta >= Math.PI) setMode("snap");
    if (mode === "snap" && Math.abs(stats.pc1 - theta) < 0.003) {
      setTheta(stats.pc1);
      setMode("idle");
    }
  }, [mode, theta, stats.pc1]);

  const isPC1 = Math.abs(((theta - stats.pc1 + Math.PI * 1.5) % Math.PI) - Math.PI / 2) < 0.026;
  const u = { x: Math.cos(theta), y: -Math.sin(theta) };
  const share = stats.varAt(theta) / stats.total;
  const pc1Share = stats.varAt(stats.pc1) / stats.total;
  const axisColor = isPC1 ? AMBER : BRAND_LIGHT;
  const projected = pts.map((p) => {
    const t = (p.x - stats.mx) * u.x + (p.y - stats.my) * u.y;
    return { x: stats.mx + t * u.x, y: stats.my + t * u.y };
  });

  // mini chart geometry
  const cx = (th) => 20 + (th / Math.PI) * (PCA_W - 40);
  const cy = (sh) => PCA_H + PCA_PLOT - 10 - sh * (PCA_PLOT - 22);
  const curve = Array.from({ length: 61 }, (_, i) => {
    const th = (i / 60) * Math.PI;
    return `${cx(th).toFixed(1)},${cy(stats.varAt(th) / stats.total).toFixed(1)}`;
  }).join(" ");

  const scan = () => {
    setProj(false);
    setTheta(0);
    setMode("scan");
  };
  const toggleProject = () => {
    if (!proj) {
      setMode("idle");
      setTheta(stats.pc1);
    }
    setProj(!proj);
  };

  return (
    <Card title="PCA · finding the direction of most variance" caption="Scan rotates a candidate axis and projects every point onto it; the spread of the projections peaks at PC1. Then collapse the data to 1-D.">
      <Stage w={PCA_W} h={PCA_H + PCA_PLOT}>
        <Grid w={PCA_W} h={PCA_H} />
        {/* PC2, perpendicular, once PC1 is found */}
        <g style={{ transform: `${tr(stats.mx, stats.my)} rotate(${-stats.pc1 - Math.PI / 2}rad)`, opacity: isPC1 ? 0.8 : 0, transition: "opacity 400ms" }}>
          <line x1={-300} x2={300} stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="5 4" />
          <text x={52} y={-5} fontSize={9} fill="#38bdf8">PC2</text>
        </g>
        {/* candidate axis */}
        <g style={{ transform: `${tr(stats.mx, stats.my)} rotate(${-theta}rad)` }}>
          <line x1={-300} x2={300} stroke={axisColor} strokeWidth={isPC1 ? 2.5 : 1.6} />
          <text x={110} y={-6} fontSize={9} fill={axisColor}>{isPC1 ? "PC1" : "axis"}</text>
        </g>
        {/* drop lines + projected dots */}
        <g style={{ opacity: proj ? 0 : 1, transition: "opacity 300ms" }}>
          {pts.map((p, i) => (
            <line key={`l${i}`} x1={p.x} y1={p.y} x2={projected[i].x} y2={projected[i].y} stroke={axisColor} strokeWidth={0.6} opacity={0.35} />
          ))}
          {projected.map((q, i) => (
            <circle key={`q${i}`} cx={q.x} cy={q.y} r={2.2} fill={axisColor} />
          ))}
        </g>
        {pts.map((p, i) => {
          const q = proj ? projected[i] : p;
          return (
            <circle
              key={i}
              r={4}
              fill="#e879f9"
              fillOpacity={0.85}
              stroke={INK[950]}
              style={{ transform: tr(q.x, q.y), transition: mode === "idle" ? `transform 900ms ${EASE}` : "none" }}
            />
          );
        })}
        {/* variance vs angle */}
        <rect x={0} y={PCA_H} width={PCA_W} height={PCA_PLOT} fill={INK[900]} />
        <text x={20} y={PCA_H + 11} fontSize={8} fill={MUTED}>variance captured vs. axis angle</text>
        <polyline points={curve} fill="none" stroke={BRAND} strokeWidth={1.5} />
        <line x1={cx(stats.pc1)} y1={PCA_H + 14} x2={cx(stats.pc1)} y2={PCA_H + PCA_PLOT - 6} stroke={AMBER} strokeDasharray="2 3" opacity={0.6} />
        <circle cx={cx(theta)} cy={cy(share)} r={4} fill={axisColor} stroke="#fff" strokeWidth={1} />
      </Stage>
      <Row>
        <Btn primary disabled={mode !== "idle"} onClick={scan}>
          Scan for PC1
        </Btn>
        <Btn onClick={toggleProject}>{proj ? "Back to 2D" : "Project to 1D"}</Btn>
        <Slider
          label="angle"
          min={0}
          max={179}
          step={1}
          value={Math.round((theta * 180) / Math.PI) % 180}
          display={`${Math.round((theta * 180) / Math.PI) % 180}°`}
          onChange={(e) => {
            setMode("idle");
            setProj(false);
            setTheta((+e.target.value * Math.PI) / 180);
          }}
        />
      </Row>
      <Row>
        <Stat label="variance on axis" color={axisColor}>{(share * 100).toFixed(1)}%</Stat>
        <Stat label="PC1 max">{(pc1Share * 100).toFixed(1)}%</Stat>
        {isPC1 && <Stat color={AMBER}>PC1 found ✓</Stat>}
      </Row>
    </Card>
  );
}

/* ====================================================================== */
/* 8. ROC curve                                                            */
/* ====================================================================== */

function rocCurve(data) {
  const P = data.filter((d) => d.y).length;
  const N = data.length - P;
  const sorted = [...data].sort((a, b) => b.s - a.s);
  const pts = [{ fpr: 0, tpr: 0 }];
  let tp = 0;
  let fp = 0;
  sorted.forEach((d, i) => {
    if (d.y) tp++;
    else fp++;
    if (i === sorted.length - 1 || sorted[i + 1].s !== d.s) pts.push({ fpr: fp / N, tpr: tp / P });
  });
  let auc = 0;
  for (let i = 1; i < pts.length; i++) auc += (pts[i].fpr - pts[i - 1].fpr) * (pts[i].tpr + pts[i - 1].tpr) / 2;
  return { pts, auc, P, N };
}

function RocCurve({ params = {} }) {
  const data = useMemo(
    () => makeScores(num(params.seed, 3), clamp(Math.round(num(params.n, 40)), 6, 200), clamp(num(params.separation, 0.32), 0, 0.9)),
    [params.seed, params.n, params.separation]
  );
  const { pts, auc, P, N } = useMemo(() => rocCurve(data), [data]);
  const [th, setTh] = useState(clamp(num(params.threshold, 0.5)));
  const c = countAt(data, th);
  const tpr = c.TP / P;
  const fpr = c.FP / N;

  const W = 300;
  const H = 262;
  const x0 = 46;
  const y0 = 14;
  const S = 210;
  const X = (f) => x0 + f * S;
  const Y = (t) => y0 + (1 - t) * S;
  const line = pts.map((p) => `${X(p.fpr).toFixed(1)},${Y(p.tpr).toFixed(1)}`).join(" ");
  const area = `${line} ${X(1)},${Y(0)} ${X(0)},${Y(0)}`;

  return (
    <Card title="ROC curve & AUC" caption="Move the threshold: the dot slides along the ROC curve. Lower thresholds catch more positives (TPR ↑) but raise false alarms (FPR ↑).">
      <Stage w={W} h={H}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={X(t)} y1={Y(0)} x2={X(t)} y2={Y(1)} stroke={INK[800]} />
            <line x1={X(0)} y1={Y(t)} x2={X(1)} y2={Y(t)} stroke={INK[800]} />
            {t % 0.5 === 0 && (
              <>
                <text x={X(t)} y={Y(0) + 12} textAnchor="middle" fontSize={8} fill={MUTED}>{t}</text>
                <text x={X(0) - 5} y={Y(t) + 3} textAnchor="end" fontSize={8} fill={MUTED}>{t}</text>
              </>
            )}
          </g>
        ))}
        <rect x={X(0)} y={Y(1)} width={S} height={S} fill="none" stroke={INK[600]} />
        <polygon points={area} fill={BRAND} opacity={0.22} />
        <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} stroke={MUTED} strokeDasharray="4 4" />
        <text x={X(0.62)} y={Y(0.52)} fontSize={8} fill={MUTED} transform={`rotate(-45 ${X(0.62)} ${Y(0.52)})`}>random guess</text>
        <polyline points={line} fill="none" stroke={BRAND_LIGHT} strokeWidth={2.2} strokeLinejoin="round" />
        <text x={X(0.55)} y={Y(0.12)} fontSize={13} fontWeight={700} fill="#fff">AUC = {auc.toFixed(3)}</text>
        {/* current operating point */}
        <g style={{ transform: tr(X(fpr), Y(tpr)), transition: `transform 250ms ${EASE}` }}>
          <line x1={0} y1={0} x2={0} y2={S} stroke={AMBER} strokeDasharray="2 3" opacity={0.6} />
          <line x1={0} y1={0} x2={-S} y2={0} stroke={AMBER} strokeDasharray="2 3" opacity={0.6} />
          <circle r={9} fill={AMBER} opacity={0.25} />
          <circle r={5} fill={AMBER} stroke="#fff" strokeWidth={1.5} />
        </g>
        <text x={X(0.5)} y={H - 6} textAnchor="middle" fontSize={9} fill="#cbd5e1">False positive rate (FPR)</text>
        <text x={12} y={Y(0.5)} textAnchor="middle" fontSize={9} fill="#cbd5e1" transform={`rotate(-90 12 ${Y(0.5)})`}>True positive rate (TPR)</text>
      </Stage>
      <div className="mt-3">
        <ScoreStrip data={data} th={th} onPick={setTh} />
      </div>
      <Row>
        <Slider label="threshold" min={0} max={1} step={0.01} value={th} display={th.toFixed(2)} onChange={(e) => setTh(+e.target.value)} />
      </Row>
      <Row>
        <Stat label="TPR = TP/P" color={POS}>{fmt(tpr)}</Stat>
        <Stat label="FPR = FP/N" color={NEG}>{fmt(fpr)}</Stat>
        <Stat label="AUC" color={BRAND_LIGHT}>{auc.toFixed(3)}</Stat>
      </Row>
    </Card>
  );
}

export const WIDGETS_B = { kmeans: KMeans, knn: KNN, "decision-tree": DecisionTree, "neural-network": NeuralNetwork, "confusion-matrix": ConfusionMatrix, "svm-margin": SvmMargin, pca: PCA, "roc-curve": RocCurve };
