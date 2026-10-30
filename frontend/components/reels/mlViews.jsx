"use client";

// Reel views for machine-learning ideas: `plot` (points, lines, curves on
// axes) and `graph` (nodes and arrows: decision trees, neural networks).
// Both are drawn for the ~312×290 stage and glide smoothly between steps.
import { useEffect, useMemo, useRef, useState } from "react";

const W = 312;
const H = 280;
const PAD = { l: 30, r: 10, t: 12, b: 28 };
const GROUP = ["#38bdf8", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb7185"];
const ease = (t) => 1 - Math.pow(1 - t, 3);

/** Numbers that glide from their previous value to `target` over `ms`. */
function useTween(target, ms = 650) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const key = JSON.stringify(target);
  useEffect(() => {
    const start = from.current;
    const same = Array.isArray(start) && Array.isArray(target) && start.length === target.length;
    if (!same || !target?.length) {
      from.current = target;
      setValue(target);
      return;
    }
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const p = ease(Math.min(1, (now - t0) / ms));
      const v = target.map((x, i) => start[i] + (x - start[i]) * p);
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

const NAMED = {
  sigmoid: (x) => 1 / (1 + Math.exp(-x)),
  parabola: (x) => x * x,
  bell: (x) => Math.exp(-(x * x) / 2),
  relu: (x) => Math.max(0, x),
  tanh: (x) => Math.tanh(x),
};

/** A named curve sampled over the x-range, or the given points. Always 60 points so it can morph. */
function curvePoints(curve, [x0, x1]) {
  if (!curve) return [];
  const xs = Array.from({ length: 60 }, (_, i) => x0 + ((x1 - x0) * i) / 59);
  if (typeof curve === "string") return xs.flatMap((x) => [x, NAMED[curve](x)]);
  // Resample a hand-written polyline to 60 points.
  const pts = [...curve].sort((a, b) => a[0] - b[0]);
  return xs.flatMap((x) => {
    if (x <= pts[0][0]) return [x, pts[0][1]];
    const j = pts.findIndex((p) => p[0] >= x);
    if (j === -1) return [x, pts[pts.length - 1][1]];
    const [a, b] = [pts[j - 1], pts[j]];
    return [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1)];
  });
}

const ticks = ([a, b]) => {
  const span = b - a;
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100].find((s) => span / s <= 5) || span / 4;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
};

export function PlotView({ anim, step }) {
  const [x0, x1] = anim.xRange || [0, 10];
  const [y0, y1] = anim.yRange || [0, 10];
  const sx = (x) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (y) => H - PAD.b - ((y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const clipY = (y) => Math.max(y0 - (y1 - y0), Math.min(y1 + (y1 - y0), y));

  const line = useTween(step.line || null);
  const curve = useTween(useMemo(() => curvePoints(step.curve, [x0, x1]), [step.curve, x0, x1]));
  const marker = useTween(step.marker || null);
  const centroids = useTween(step.centroids ? step.centroids.flatMap(([x, y]) => [x, y]) : null);
  const query = useTween(step.query || null);
  const radius = useTween(step.radius ? [step.radius] : null);
  const hi = new Set(step.highlight || []);

  const path = (flat) => {
    let d = "";
    for (let i = 0; i < flat.length; i += 2) d += `${i ? "L" : "M"}${sx(flat[i]).toFixed(1)},${sy(clipY(flat[i + 1])).toFixed(1)}`;
    return d;
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1117]/85 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible">
        <defs>
          <clipPath id="plot-area">
            <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
          </clipPath>
          <filter id="plot-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid and axes */}
        {ticks([x0, x1]).map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.06)" />
            <text x={sx(t)} y={H - PAD.b + 13} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">{t}</text>
          </g>
        ))}
        {ticks([y0, y1]).map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="rgba(255,255,255,0.06)" />
            <text x={PAD.l - 5} y={sy(t) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.4)">{t}</text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="rgba(255,255,255,0.35)" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.35)" />
        {anim.xLabel && <text x={W - PAD.r} y={H - 2} textAnchor="end" fontSize="10" fontWeight="700" fill="rgba(186,230,253,0.8)">{anim.xLabel}</text>}
        {anim.yLabel && <text x={PAD.l + 4} y={PAD.t + 9} fontSize="10" fontWeight="700" fill="rgba(186,230,253,0.8)">{anim.yLabel}</text>}

        <g clipPath="url(#plot-area)">
          {step.shade && (
            <rect
              x={sx(step.shade[0])}
              y={PAD.t}
              width={Math.max(0, sx(step.shade[1]) - sx(step.shade[0]))}
              height={H - PAD.t - PAD.b}
              fill="rgba(139,92,246,0.16)"
              style={{ transition: "all 0.6s ease-out" }}
            />
          )}
          {(step.segments || []).map(([a, b, c, d], i) => (
            <line key={i} x1={sx(a)} y1={sy(b)} x2={sx(c)} y2={sy(d)} stroke="#fb7185" strokeWidth="1.5" strokeDasharray="3 3" className="reel-fade-up" />
          ))}
          {curve?.length > 0 && <path d={path(curve)} fill="none" stroke="#a78bfa" strokeWidth="3.5" filter="url(#plot-glow)" strokeLinecap="round" />}
          {line && (
            <path d={path([x0, line[0] * x0 + line[1], x1, line[0] * x1 + line[1]])} stroke="#fbbf24" strokeWidth="3.5" filter="url(#plot-glow)" strokeLinecap="round" />
          )}
          {query && radius && (
            <circle cx={sx(query[0])} cy={sy(query[1])} r={Math.abs(sx(x0 + radius[0]) - sx(x0))} fill="rgba(251,191,36,0.08)" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="5 4" />
          )}
        </g>

        {/* Points glide to new places and colours */}
        {(step.points || []).map(([x, y, g = 0], i) => (
          <g key={i} style={{ transform: `translate(${sx(x)}px, ${sy(y)}px)`, transition: "transform 0.6s cubic-bezier(0.2,0.8,0.2,1)" }}>
            {hi.has(i) && <circle r="10" fill="none" stroke="#fde68a" strokeWidth="2" className="reel-pop" />}
            <circle r="5.5" fill={GROUP[g]} stroke="rgba(0,0,0,0.5)" strokeWidth="1" style={{ transition: "fill 0.5s" }} />
          </g>
        ))}

        {centroids &&
          step.centroids.map(([, , g = 0], i) => (
            <g key={`c${i}`} transform={`translate(${sx(centroids[i * 2])}, ${sy(centroids[i * 2 + 1])})`}>
              <circle r="11" fill={GROUP[g]} opacity="0.25" filter="url(#plot-glow)" />
              <path d="M-7,-7L7,7M7,-7L-7,7" stroke={GROUP[g]} strokeWidth="3.5" strokeLinecap="round" />
              <path d="M-7,-7L7,7M7,-7L-7,7" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          ))}

        {query && (
          <g transform={`translate(${sx(query[0])}, ${sy(query[1])})`}>
            <path d="M0,-10L2.9,-3.1L10,-3.1L4.3,1.5L6.2,9L0,4.6L-6.2,9L-4.3,1.5L-10,-3.1L-2.9,-3.1Z" fill="#fbbf24" stroke="white" strokeWidth="1" filter="url(#plot-glow)" />
          </g>
        )}

        {marker && (
          <g transform={`translate(${sx(marker[0])}, ${sy(clipY(marker[1]))})`}>
            <circle r="13" fill="rgba(251,191,36,0.3)" className="reel-glow" />
            <circle r="8" fill="#fbbf24" stroke="white" strokeWidth="2" filter="url(#plot-glow)" />
          </g>
        )}

        {step.label && (
          <g key={step.label} className="reel-fade-up">
            <rect x={W - PAD.r - 8 - step.label.length * 6.2} y={PAD.t + 2} width={step.label.length * 6.2 + 12} height="20" rx="6" fill="rgba(0,0,0,0.6)" stroke="rgba(167,139,250,0.6)" />
            <text x={W - PAD.r - 2} y={PAD.t + 16} textAnchor="end" fontSize="11" fontFamily="ui-monospace, monospace" fontWeight="700" fill="#fde68a">
              {step.label}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* ---------- graph ---------- */

/** Nodes and edges from layer sizes: ids "layer-index", spread evenly. */
function layerGraph(layers) {
  const nodes = [];
  const edges = [];
  layers.forEach((n, l) => {
    for (let i = 0; i < n; i++) {
      nodes.push({ id: `${l}-${i}`, label: "", shape: "circle", x: 8 + (84 * l) / (layers.length - 1), y: 50 + (i - (n - 1) / 2) * Math.min(17, 84 / n) });
      if (l > 0) for (let j = 0; j < layers[l - 1]; j++) edges.push([`${l - 1}-${j}`, `${l}-${i}`]);
    }
  });
  return { nodes, edges };
}

export function GraphView({ anim, step }) {
  const { nodes, edges } = useMemo(
    () => (anim.layers ? layerGraph(anim.layers) : { nodes: anim.nodes || [], edges: anim.edges || [] }),
    [anim],
  );
  const net = !!anim.layers;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const active = new Set(step.active || []);
  const done = new Set(step.done || []);
  const key = (a, b) => `${a}>${b}`;
  const lit = new Set(
    (step.path || []).map(([a, b]) => key(a, b)).concat(
      step.flow && !step.path
        ? edges.filter(([a, b]) => (step.flow === "forward" ? active.has(b) : active.has(a))).map(([a, b]) => key(a, b))
        : [],
    ),
  );
  const px = (n) => [(n.x / 100) * W, (n.y / 100) * H];
  const boxW = (n) => Math.min(128, Math.max(46, n.label.length * 6.6 + 18));

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1117]/85 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible">
        <defs>
          <filter id="graph-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" fill="rgba(255,255,255,0.4)" />
          </marker>
          <marker id="graph-arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" fill="#fbbf24" />
          </marker>
        </defs>

        {edges.map(([a, b, label]) => {
          const na = byId.get(a);
          const nb = byId.get(b);
          if (!na || !nb) return null;
          const [x1, y1] = px(na);
          const [x2, y2] = px(nb);
          const on = lit.has(key(a, b));
          // Stop arrows at the edge of the target box.
          const shorten = net ? 9 : 14;
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          const ex = x2 - ((x2 - x1) / len) * shorten;
          const ey = y2 - ((y2 - y1) / len) * shorten;
          const back = step.flow === "backward";
          return (
            <g key={key(a, b)}>
              <line
                x1={x1}
                y1={y1}
                x2={net ? x2 : ex}
                y2={net ? y2 : ey}
                stroke={on ? (back ? "#fb7185" : "#fbbf24") : "rgba(255,255,255,0.18)"}
                strokeWidth={on ? 2.6 : net ? 0.8 : 1.6}
                markerEnd={net ? undefined : on ? "url(#graph-arrow-lit)" : "url(#graph-arrow)"}
                style={{ transition: "stroke 0.4s, stroke-width 0.4s" }}
              />
              {on && step.flow && (
                <circle r="3.5" fill={back ? "#fb7185" : "#fde68a"} filter="url(#graph-glow)">
                  <animateMotion dur="0.9s" repeatCount="indefinite" path={back ? `M${x2},${y2}L${x1},${y1}` : `M${x1},${y1}L${x2},${y2}`} />
                </circle>
              )}
              {label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={on ? "#fde68a" : "rgba(255,255,255,0.55)"}>
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map((n) => {
          const [x, y] = px(n);
          const on = active.has(n.id);
          const ok = done.has(n.id);
          const fill = ok ? "rgba(16,185,129,0.55)" : on ? "rgba(245,158,11,0.6)" : "rgba(30,41,59,0.95)";
          const stroke = ok ? "#6ee7b7" : on ? "#fde68a" : "rgba(255,255,255,0.3)";
          const value = step.values?.[n.id];
          return (
            <g key={n.id} transform={`translate(${x}, ${y})`}>
              {n.shape === "circle" ? (
                <circle r={net ? 9 : 16} fill={fill} stroke={stroke} strokeWidth="2" filter={on ? "url(#graph-glow)" : undefined} style={{ transition: "fill 0.4s, stroke 0.4s" }} />
              ) : (
                <rect
                  x={-boxW(n) / 2}
                  y={-13}
                  width={boxW(n)}
                  height={26}
                  rx="8"
                  fill={fill}
                  stroke={stroke}
                  strokeWidth="2"
                  filter={on ? "url(#graph-glow)" : undefined}
                  style={{ transition: "fill 0.4s, stroke 0.4s" }}
                />
              )}
              {n.label && (
                <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
                  {n.label}
                </text>
              )}
              {value !== undefined && (
                <text key={value} y={net ? 21 : 26} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fontWeight="700" fill="#fde68a" className="reel-fade-up">
                  {value}
                </text>
              )}
            </g>
          );
        })}

        {net &&
          anim.layers.map((_, l) => (
            <text key={l} x={((8 + (84 * l) / (anim.layers.length - 1)) / 100) * W} y={H - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="rgba(255,255,255,0.45)">
              {l === 0 ? "INPUT" : l === anim.layers.length - 1 ? "OUTPUT" : "HIDDEN"}
            </text>
          ))}
      </svg>
    </div>
  );
}
