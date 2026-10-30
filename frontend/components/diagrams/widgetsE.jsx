"use client";

// Interactive FastAPI teaching diagrams (set E). Each widget is rendered from a
// ```diagram fenced block in a lesson and receives optional JSON `params`.
// Everything is plain React + inline SVG; any randomness is seeded so server
// and client renders match, and animations only start on the client.

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
  teal: "#2dd4bf",
  orange: "#fb923c",
  grid: "#191c2c",
  axis: "#363b56",
  text: "#94a3b8",
  dim: "#64748b",
  ink950: "#07080f",
  ink900: "#0d0f1a",
  ink800: "#161a28",
  ink700: "#232a3d",
  ink600: "#313a52",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

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
/** A param that must be one of `opts` (case-insensitive, with aliases), else the default. */
function oneOf(v, opts, d, aliases = {}) {
  const k = typeof v === "string" ? v.toLowerCase().trim() : "";
  const key = aliases[k] || k;
  return opts.includes(key) ? key : d;
}

/** 3 significant digits without trailing noise: 1.0742 → "1.07". */
const sig = (v, p = 3) => (Number.isFinite(v) ? String(Number(v.toPrecision(p))) : "—");
/** Milliseconds → "850 ms" / "1.07 s". */
const fmtMs = (ms) => (!Number.isFinite(ms) ? "—" : ms < 1000 ? `${Math.round(ms)} ms` : `${sig(ms / 1000)} s`);

/** "Nice" axis ticks from 0 to just above max (steps of 1, 2 or 5 × 10^k). */
function niceTicks(max, n = 4) {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = 0; v <= max + 1e-9 && out.length < 12; v += step) out.push(v);
  return out;
}

/** A unique id that is safe inside url(#...). */
function useSvgId() {
  return "e" + useId().replace(/[^a-zA-Z0-9]/g, "");
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

/** Animations live in refs; this re-renders on demand. */
function useForce() {
  const [, set] = useState(0);
  return () => set((n) => (n + 1) % 1e9);
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

/** Segmented choice: one button per option, the active one filled. */
function Choice({ options, value, onChange, tones = {} }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, label]) => {
        const on = k === value;
        const t = tones[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              on ? (t === "rose" ? "border-rose-400 bg-rose-500/20 text-rose-200" : "border-brand-400 bg-brand-500/25 text-white") : "border-ink-600 bg-ink-800 text-slate-300 hover:bg-ink-700"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, display }) {
  return (
    <label className="flex min-w-[150px] flex-1 items-center gap-2 text-xs text-slate-400">
      <span className="shrink-0">{label}</span>
      <input type="range" className="w-full accent-brand-500" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-16 shrink-0 text-right font-mono text-slate-200">{display ?? value}</span>
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

const Legend = ({ color, label, dashed, hatch }) => (
  <span className="flex items-center gap-1 text-[11px] text-slate-400">
    <span
      className={`inline-block h-2.5 w-2.5 rounded-sm ${dashed ? "border border-dashed" : ""}`}
      style={dashed ? { borderColor: color } : hatch ? { background: `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 4px)`, border: `1px solid ${color}` } : { background: color }}
    />
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

/* ---------- tiny syntax highlighters for the code / HTTP / JSON panels ---------- */

const PY_KW = new Set("def async await return class if else elif raise yield try finally except import from not is in and or with as for while lambda pass".split(" "));
const PY_CONST = new Set(["None", "True", "False"]);
const PY_TYPES = new Set(["str", "int", "float", "bool", "list", "dict", "BaseModel", "Field", "EmailStr", "ConfigDict", "Depends", "HTTPException", "Session", "User", "Settings", "Item", "ItemIn", "ItemOut", "Order", "OAuth2PasswordBearer", "SessionLocal", "asyncio", "time", "lru_cache"]);
const PY_TOK = /(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(@[\w.]+)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

/** One line of Python → array of strings and coloured spans. */
function pyLine(line) {
  const out = [];
  const re = new RegExp(PY_TOK.source, "g");
  let last = 0, m, prevDef = false;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const t = m[0];
    let cls = null;
    if (m[1]) cls = "italic text-slate-500";
    else if (m[2]) cls = "text-emerald-300";
    else if (m[3]) cls = "text-amber-300";
    else if (m[4]) cls = "text-orange-300";
    else if (PY_KW.has(t)) cls = "text-fuchsia-300";
    else if (PY_CONST.has(t)) cls = "text-orange-300";
    else if (prevDef) cls = "text-sky-300";
    else if (PY_TYPES.has(t)) cls = "text-teal-300";
    if (m[5]) prevDef = t === "def" || t === "class";
    out.push(cls ? <span key={m.index} className={cls}>{t}</span> : t);
    last = m.index + t.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

const MARK = {
  brand: "border-brand-400 bg-brand-500/15",
  rose: "border-rose-400 bg-rose-500/15",
  amber: "border-amber-400 bg-amber-500/10",
  emerald: "border-emerald-400 bg-emerald-500/10",
  sky: "border-sky-400 bg-sky-500/10",
};

/** Python snippet; `marks` maps a line index to a highlight tone. */
function Code({ lines, marks = {}, label, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-ink-700 bg-ink-950 ${className}`}>
      {label && <div className="border-b border-ink-700 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>}
      <pre className="overflow-x-auto py-1.5 font-mono text-[11px] leading-[1.6] text-slate-300">
        <div className="min-w-max">
          {lines.map((ln, i) => (
            <div key={i} className={`whitespace-pre border-l-2 pl-2.5 pr-3 transition-colors duration-300 ${MARK[marks[i]] || "border-transparent"}`}>
              {ln ? pyLine(ln) : " "}
            </div>
          ))}
        </div>
      </pre>
    </div>
  );
}

const JSON_TOK = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
/** JSON text with keys / strings / literals coloured. */
function jsonSpans(text) {
  const out = [];
  const re = new RegExp(JSON_TOK.source, "g");
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(<span key={m.index} className={m[2] ? "text-sky-300" : "text-emerald-300"}>{m[1]}</span>);
      if (m[2]) out.push(m[2]);
    } else if (m[3]) out.push(<span key={m.index} className="text-orange-300">{m[3]}</span>);
    else out.push(<span key={m.index} className="text-amber-300">{m[4]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** An HTTP message: start line, headers, blank line, body (JSON-coloured). */
function HttpText({ text }) {
  const [head, ...rest] = String(text).split("\n\n");
  const body = rest.join("\n\n");
  const hl = head.split("\n");
  return (
    <>
      <div className="font-semibold text-white">{hl[0]}</div>
      {hl.slice(1).map((h, i) => {
        const k = h.indexOf(":");
        return (
          <div key={i}>
            <span className="text-fuchsia-300">{k > 0 ? h.slice(0, k) : h}</span>
            {k > 0 && <span className="text-slate-300">{h.slice(k)}</span>}
          </div>
        );
      })}
      {body && <div className="mt-2">{jsonSpans(body)}</div>}
    </>
  );
}

/** Status line colour by class: 2xx green, 4xx amber, 5xx red. */
const statusTone = (code) => (code >= 500 ? "text-rose-300" : code >= 400 ? "text-amber-300" : "text-emerald-300");
const statusColor = (code) => (code >= 500 ? C.rose : code >= 400 ? C.amber : C.emerald);

/* ---------- request-lifecycle: one request through a FastAPI app ---------- */

// The pipeline is drawn as a "U": the request travels right along the top row,
// drops into your function, and the response travels left along the bottom row,
// so the two halves of each layer (middleware, Uvicorn) sit above each other.
const RL_STAGES = {
  client: { label: "Client", sub: "browser / httpx", col: 0, row: 0 },
  uvicorn: { label: "Uvicorn", sub: "ASGI server", col: 1, row: 0 },
  "mw-in": { label: "Middleware", sub: "CORS · timing", col: 2, row: 0 },
  router: { label: "Router", sub: "path match", col: 3, row: 0 },
  deps: { label: "Depends()", sub: "auth · db", col: 4, row: 0 },
  valid: { label: "Validation", sub: "Pydantic", col: 5, row: 0 },
  handler: { label: "Your code", sub: "update_item()", col: 5, row: 2 },
  resp: { label: "Response", sub: "response_model", col: 4, row: 2 },
  exc: { label: "Exceptions", sub: "handlers", col: 3, row: 1 },
  "mw-out": { label: "Middleware", sub: "adds headers", col: 2, row: 2 },
  "uv-out": { label: "Uvicorn", sub: "writes bytes", col: 1, row: 2 },
  "client-out": { label: "Client", sub: "gets response", col: 0, row: 2 },
};
const RL_HAPPY = ["client", "uvicorn", "mw-in", "router", "deps", "valid", "handler", "resp", "mw-out", "uv-out", "client-out"];
const RL_TAIL = ["exc", "mw-out", "uv-out", "client-out"];
const RL_LINES = [
  '@app.put("/items/{item_id}", response_model=ItemOut)',
  "async def update_item(",
  "    item_id: int,                # path parameter",
  "    item: ItemIn,                # JSON body",
  "    notify: bool = False,        # query parameter",
  "    user: User = Depends(get_current_user),",
  "    db: Session = Depends(get_db),",
  "):",
  "    row = db.get(Item, item_id)",
  "    if row is None:",
  '        raise HTTPException(status_code=404, detail="Item not found")',
  "    row.name, row.price = item.name, item.price",
  "    row.unit_cost = row.price / row.stock   # stock is 0 for item 7!",
  "    return row                   # ItemOut drops owner_secret",
];

const RL_BASE_REQ = (path, auth, body) =>
  `PUT ${path} HTTP/1.1\nhost: api.example.com\norigin: https://app.example.com${auth ? "\nauthorization: Bearer eyJhbGciOiJIUzI1NiJ9…" : ""}\ncontent-type: application/json\n\n${body}`;
const RL_HEADERS = "content-type: application/json\nx-process-time: 0.0042\naccess-control-allow-origin: https://app.example.com";

const RL_SCENARIOS = {
  ok: {
    label: "OK",
    route: RL_HAPPY,
    code: 200,
    req: RL_BASE_REQ("/items/42?notify=true", true, '{"name": "Laptop", "price": 999.5}'),
    res: `HTTP/1.1 200 OK\n${RL_HEADERS}\n\n{"id": 42, "name": "Laptop", "price": 999.5}`,
    marks: { handler: { 8: "brand", 11: "brand", 12: "brand", 13: "brand" } },
    say: {},
  },
  invalid: {
    label: "Invalid body",
    route: ["client", "uvicorn", "mw-in", "router", "deps", "valid", ...RL_TAIL],
    fail: "valid",
    code: 422,
    req: RL_BASE_REQ("/items/42", true, '{"name": "Laptop", "price": "cheap"}'),
    res: `HTTP/1.1 422 Unprocessable Entity\n${RL_HEADERS.replace("0.0042", "0.0019")}\n\n{"detail": [{"type": "float_parsing", "loc": ["body", "price"], "msg": "Input should be a valid number, unable to parse string as a number", "input": "cheap"}]}`,
    marks: {},
    say: {
      valid: 'price = "cheap" cannot be parsed as a float, so Pydantic raises RequestValidationError. Your function never runs.',
      exc: "FastAPI's handler for RequestValidationError turns the error list into a 422 response.",
      "client-out": "422 Unprocessable Entity, with every validation error listed under detail.",
    },
  },
  unauthorized: {
    label: "Unauthorized",
    route: ["client", "uvicorn", "mw-in", "router", "deps", ...RL_TAIL],
    fail: "deps",
    code: 401,
    req: RL_BASE_REQ("/items/42", false, '{"name": "Laptop", "price": 999.5}'),
    res: `HTTP/1.1 401 Unauthorized\nwww-authenticate: Bearer\n${RL_HEADERS.replace("0.0042", "0.0007")}\n\n{"detail": "Not authenticated"}`,
    marks: { deps: { 5: "rose" } },
    say: {
      client: "Sends the request without an Authorization header.",
      deps: "OAuth2PasswordBearer finds no Authorization header and raises HTTPException(401). Validation and your function are skipped.",
      exc: "The HTTPException handler returns {\"detail\": ...} as JSON and keeps the WWW-Authenticate header.",
      "client-out": "401 Unauthorized: the client should log in and retry with a token.",
    },
  },
  "not-found": {
    label: "Not found",
    route: ["client", "uvicorn", "mw-in", "router", "deps", "valid", "handler", ...RL_TAIL],
    fail: "handler",
    code: 404,
    req: RL_BASE_REQ("/items/999", true, '{"name": "Laptop", "price": 999.5}'),
    res: `HTTP/1.1 404 Not Found\n${RL_HEADERS.replace("0.0042", "0.0031")}\n\n{"detail": "Item not found"}`,
    marks: { handler: { 8: "brand", 9: "brand", 10: "rose" } },
    say: {
      handler: "db.get(Item, 999) returns None, so the function raises HTTPException(status_code=404). Raising stops it right there.",
      exc: "The HTTPException handler turns the exception into a JSON 404 response.",
      "client-out": "404 Not Found with your detail message.",
    },
  },
  error: {
    label: "Server error",
    route: ["client", "uvicorn", "mw-in", "router", "deps", "valid", "handler", ...RL_TAIL],
    fail: "handler",
    code: 500,
    req: RL_BASE_REQ("/items/7", true, '{"name": "Laptop", "price": 999.5}'),
    res: "HTTP/1.1 500 Internal Server Error\ncontent-type: text/plain; charset=utf-8\n\nInternal Server Error",
    marks: { handler: { 8: "brand", 11: "brand", 12: "rose" } },
    say: {
      handler: "row.price / row.stock divides by zero: an unexpected ZeroDivisionError escapes your function.",
      exc: "No exception handler is registered for ZeroDivisionError, so it is re-raised and keeps going up.",
      "mw-out": "The exception bubbles up through your middleware, so no x-process-time or CORS headers are added. A browser may report this as a CORS error.",
      "uv-out": "Starlette's ServerErrorMiddleware, the outermost layer, logs the traceback and sends a plain 500.",
      "client-out": "500 Internal Server Error. The traceback stays in your server logs and is not sent to the client.",
    },
  },
};
const RL_KEYS = Object.keys(RL_SCENARIOS);

/** What happens at each stage on the happy path (scenarios override some). */
const RL_SAY = {
  client: "Sends PUT /items/42 with a JSON body and a bearer token.",
  uvicorn: "Parses the raw HTTP bytes into an ASGI scope dict and awaits app(scope, receive, send).",
  "mw-in": "Middleware runs outermost to innermost: CORS checks the Origin and a timing middleware starts a clock.",
  router: 'Matches method + path against your routes: PUT /items/{item_id} → update_item. No match would mean 404 {"detail": "Not Found"}.',
  deps: "Runs the Depends(...) parameters first: get_current_user decodes the token into a User and get_db opens a Session.",
  valid: "Pydantic converts item_id to an int, notify to a bool, and the JSON body to an ItemIn. All errors are collected together.",
  handler: "Your function runs with typed, validated arguments and returns the ORM row.",
  resp: "response_model=ItemOut serialises the row to JSON and keeps only ItemOut's fields, so owner_secret is never sent.",
  exc: "Skipped: nothing was raised.",
  "mw-out": "On the way out the middleware adds headers: x-process-time and access-control-allow-origin.",
  "uv-out": "Uvicorn writes the status line, headers and body bytes back to the socket.",
  "client-out": "200 OK with the JSON body.",
};
/** Code lines to highlight while the packet sits at a stage. */
const RL_MARKS = { router: { 0: "brand" }, deps: { 5: "brand", 6: "brand" }, valid: { 2: "brand", 3: "brand", 4: "brand" }, resp: { 0: "brand", 13: "brand" } };

const RL_COLW = 84, RL_BW = 74, RL_BH = 38;
const rlPos = (id) => {
  const s = RL_STAGES[id];
  return { x: 6 + s.col * RL_COLW + RL_BW / 2, y: 26 + s.row * 62 + RL_BH / 2 };
};

/** Line end points for an edge: box edge to box edge, with hand-placed anchors
    for the diagonal exception edges so they pass between boxes, not through them. */
function rlEdge(f, t) {
  const p = rlPos(f), q = rlPos(t);
  const hw = RL_BW / 2, hh = RL_BH / 2;
  if (t === "exc" && f === "valid") return [p.x - hw + 6, p.y + hh, q.x + hw, q.y - hh + 8];
  if (t === "exc" && f === "handler") return [p.x - hw + 6, p.y - hh, q.x + hw, q.y + hh - 8];
  if (t === "exc" && f === "deps") return [p.x - 14, p.y + hh, q.x + hw - 12, q.y - hh - 2];
  if (f === "exc") return [p.x - hw + 14, p.y + hh, q.x + hw - 14, q.y - hh - 2];
  // Default: shorten the centre-to-centre line so the arrow stops at the box edge.
  const dx = q.x - p.x, dy = q.y - p.y;
  const kx = Math.abs(dx) > 1e-6 ? (hw + 2) / Math.abs(dx) : Infinity;
  const ky = Math.abs(dy) > 1e-6 ? (hh + 2) / Math.abs(dy) : Infinity;
  const k = Math.min(kx, ky, 0.45);
  return [p.x + dx * k, p.y + dy * k, q.x - dx * k, q.y - dy * k];
}

export function RequestLifecycle({ params = {} }) {
  const prm = obj(params);
  const [scn, setScn] = useState(() => oneOf(prm.scenario, RL_KEYS, "ok", { invalid_body: "invalid", "invalid-body": "invalid", "401": "unauthorized", "404": "not-found", notfound: "not-found", "422": "invalid", "500": "error", "server-error": "error" }));
  const [playing, setPlaying] = useState(false);
  const force = useForce();
  const st = useRef({ at: 0, p: 0, moving: false, dwell: 0 });
  const S = st.current;
  const id = useSvgId();
  const sc = RL_SCENARIOS[scn];
  const route = sc.route;
  const last = route.length - 1;

  useLoop(playing || S.moving, (dt) => {
    const s = st.current;
    if (s.moving) {
      s.p += dt / 0.6;
      if (s.p >= 1) {
        s.at = Math.min(last, s.at + 1);
        s.moving = false;
        s.p = 0;
        s.dwell = 0;
      }
    } else if (playing) {
      s.dwell += dt;
      if (s.at >= last) setPlaying(false);
      else if (s.dwell >= 1.3) s.moving = true;
    }
    force();
  });

  const reset = () => {
    st.current = { at: 0, p: 0, moving: false, dwell: 0 };
    setPlaying(false);
    force();
  };
  const step = () => {
    const s = st.current;
    if (s.moving) {
      s.at = Math.min(last, s.at + 1);
      s.moving = false;
      s.p = 0;
    } else if (s.at < last) s.moving = true;
    setPlaying(false);
    force();
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (st.current.at >= last) st.current = { at: 0, p: 0, moving: false, dwell: 0 };
    st.current.dwell = 1; // start moving promptly
    setPlaying(true);
    force();
  };
  const pick = (k) => {
    setScn(k);
    st.current = { at: 0, p: 0, moving: false, dwell: 0 };
    setPlaying(false);
    force();
  };

  const at = clamp(S.at, 0, last);
  const cur = route[at];
  const done = at === last && !S.moving;
  const failIdx = sc.fail ? route.indexOf(sc.fail) : -1;
  const excIdx = route.indexOf("exc");
  const respIdx = route.indexOf("resp");
  // What the moving dot is carrying right now: the request, an exception, or the response.
  const turn = respIdx >= 0 ? respIdx : excIdx;
  const carrying = at >= turn && turn >= 0 ? "res" : failIdx >= 0 && at >= failIdx ? "exc" : "req";
  const pktColor = carrying === "res" ? statusColor(sc.code) : carrying === "exc" ? C.rose : C.sky;
  const pktLabel = carrying === "res" ? String(sc.code) : carrying === "exc" ? "raise" : "PUT";

  const a = rlPos(route[at]);
  const b = rlPos(route[Math.min(last, at + 1)]);
  const e = S.moving ? ease(clamp(S.p, 0, 1)) : 0;
  const pkt = { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) };

  // Edges: the success path, plus dashed "exception" edges into the handlers box.
  const happyEdges = RL_HAPPY.slice(0, -1).map((f, i) => [f, RL_HAPPY[i + 1]]).filter(([f, t]) => !(f === "resp" && t === "mw-out"));
  const edges = [
    ...happyEdges.map(([f, t]) => ({ f, t, kind: "ok" })),
    { f: "resp", t: "mw-out", kind: "ok" },
    ...["router", "deps", "valid", "handler"].map((f) => ({ f, t: "exc", kind: "err" })),
    { f: "exc", t: "mw-out", kind: "err" },
  ];
  const used = new Set(route.slice(0, -1).map((f, i) => `${f}>${route[i + 1]}`));
  const passed = new Set(route.slice(0, at).map((f, i) => `${f}>${route[i + 1]}`));

  const say = sc.say[cur] || (cur === "exc" ? RL_SAY.exc : RL_SAY[cur]);
  const marks = (sc.marks[cur] || RL_MARKS[cur] || {});
  const stageTone = cur === sc.fail ? "text-rose-300" : cur === "client-out" ? statusTone(sc.code) : "text-sky-300";
  const W = 6 + 5 * RL_COLW + RL_BW + 6;

  return (
    <Card
      title="The life of a FastAPI request"
      params={params}
      caption="Press Play (or Step) to follow one request through the app. Then switch scenario: a bad body stops at validation (422), a missing token stops inside a dependency (401), and an unexpected exception skips your middleware entirely (500). Watch which boxes the packet never reaches."
    >
      <Choice options={RL_KEYS.map((k) => [k, RL_SCENARIOS[k].label])} value={scn} onChange={pick} tones={{ error: "rose" }} />
      <svg viewBox={`0 0 ${W} 204`} className="mt-3 h-auto w-full select-none">
        <defs>
          <Arrow id={`${id}a`} color={C.axis} />
          <Arrow id={`${id}b`} color={C.sky} />
          <Arrow id={`${id}r`} color={C.rose} />
          <filter id={`${id}g`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {/* lane labels */}
        <text x={W - 6} y={14} textAnchor="end" fontSize="9" fill={C.dim}>request →</text>
        <text x={W - 6} y={200} textAnchor="end" fontSize="9" fill={C.dim}>← response</text>
        {edges.map(({ f, t, kind }) => {
          const [x1, y1, x2, y2] = rlEdge(f, t);
          const key = `${f}>${t}`;
          const isUsed = used.has(key);
          const lit = passed.has(key);
          const col = kind === "err" ? (isUsed ? C.rose : C.ink600) : lit ? C.sky : C.axis;
          return (
            <line
              key={key}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={col}
              strokeWidth={lit ? 2 : 1.2}
              strokeDasharray={kind === "err" ? "4 3" : undefined}
              opacity={isUsed ? 1 : 0.55}
              markerEnd={`url(#${id}${kind === "err" ? (isUsed ? "r" : "a") : lit ? "b" : "a"})`}
              style={{ transition: "stroke 0.3s" }}
            />
          );
        })}
        {Object.entries(RL_STAGES).map(([sid, s]) => {
          const p = rlPos(sid);
          const idx = route.indexOf(sid);
          const onRoute = idx >= 0;
          const visited = onRoute && idx <= at;
          const isCur = sid === cur && !S.moving;
          const failed = sid === sc.fail && visited;
          const stroke = failed ? C.rose : isCur ? C.sky : visited ? "#475569" : C.ink600;
          const fill = failed ? "#3b1622" : isCur ? "#0c2a3d" : visited ? C.ink800 : C.ink900;
          return (
            <g key={sid} opacity={onRoute ? 1 : 0.35} style={{ transition: "opacity 0.3s" }}>
              {isCur && <rect x={p.x - RL_BW / 2 - 2} y={p.y - RL_BH / 2 - 2} width={RL_BW + 4} height={RL_BH + 4} rx="9" fill={failed ? C.rose : C.sky} opacity="0.35" filter={`url(#${id}g)`} />}
              <rect x={p.x - RL_BW / 2} y={p.y - RL_BH / 2} width={RL_BW} height={RL_BH} rx="7" fill={fill} stroke={stroke} strokeWidth={isCur || failed ? 1.6 : 1} style={{ transition: "fill 0.3s, stroke 0.3s" }} />
              <text x={p.x} y={p.y - 2} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={visited ? "#e2e8f0" : C.text}>{s.label}</text>
              <text x={p.x} y={p.y + 11} textAnchor="middle" fontSize="8.5" fill={failed ? C.rose : C.dim} fontFamily={s.sub.includes("_") || s.sub.includes("()") ? MONO : undefined}>{s.sub}</text>
            </g>
          );
        })}
        {/* the packet */}
        <g transform={`translate(${pkt.x} ${pkt.y - RL_BH / 2 - 1})`}>
          <rect x="-15" y="-8" width="30" height="15" rx="7.5" fill={pktColor} stroke={C.ink950} strokeWidth="1.5" />
          <text y="3" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={C.ink950} fontFamily={MONO}>{pktLabel}</text>
        </g>
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Legend color={C.sky} label="request" />
        <Legend color={C.rose} label="exception" />
        <Legend color={statusColor(sc.code)} label={`response (${sc.code})`} />
        <Legend color={C.rose} dashed label="exception path" />
      </div>
      <div className="mt-3 min-h-[58px] rounded-lg bg-ink-800 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">
          Stage {at + 1} / {route.length} · <span className={stageTone}>{RL_STAGES[cur].label}</span>
          {S.moving && <span className="normal-case tracking-normal text-slate-500"> → {RL_STAGES[route[Math.min(last, at + 1)]].label}</span>}
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-slate-300">{say}</div>
      </div>
      <Row>
        <Button primary onClick={play}>{playing ? "Pause" : done ? "Replay" : "Play"}</Button>
        <Button onClick={step} disabled={done}>Step</Button>
        <Button onClick={reset}>Reset</Button>
        <span className="ml-auto">
          <Stat label="status" value={done ? sc.code : "…"} color={done ? statusTone(sc.code) : "text-slate-500"} />
        </span>
      </Row>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-ink-700 bg-ink-950">
          <div className="border-b border-ink-700 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">HTTP request</div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[10.5px] leading-[1.55] text-slate-300"><HttpText text={sc.req} /></pre>
        </div>
        <div className="min-w-0 rounded-lg border border-ink-700 bg-ink-950">
          <div className="border-b border-ink-700 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">HTTP response</div>
          <pre className={`overflow-x-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[10.5px] leading-[1.55] text-slate-300 transition-opacity duration-500 ${done ? "opacity-100" : "opacity-40"}`}>
            {done ? <HttpText text={sc.res} /> : <span className="text-slate-500">waiting for the response…</span>}
          </pre>
        </div>
      </div>
      <Code className="mt-2" label="main.py" lines={RL_LINES} marks={marks} />
    </Card>
  );
}

/* ---------- event-loop: async def vs def vs blocking inside async def ---------- */

const EL_MODES = [
  ["async", "async def + await"],
  ["threadpool", "def (threadpool)"],
  ["blocking", "async def + time.sleep ⚠"],
];
const EL_POOL_DEFAULT = 9; // slider stop 9 stands for AnyIO's real default of 40 threads
const elPool = (v) => (v >= 9 ? 40 : v);
const EL_KIND = {
  wait: { color: "#475569", label: "waiting (queued)", hatch: true },
  cpu: { color: C.brand, label: "running Python (CPU)" },
  io: { color: C.sky, label: "awaiting I/O (loop is free)" },
  thread: { color: C.teal, label: "sleeping in a worker thread" },
  block: { color: C.rose, label: "blocking sleep (loop frozen)" },
};

/**
 * Discrete-event simulation of n requests that each do: a little CPU work on the
 * event loop (parse + validate), `io` ms of waiting, then a little CPU work to
 * build the response. The modes differ only in *where* the waiting happens.
 */
function elSimulate(mode, n, io, pool) {
  const rnd = mulberry32(17 + n * 31);
  const reqs = Array.from({ length: n }, (_, i) => ({
    i,
    arrive: i * 12,
    pre: 16 + Math.round(rnd() * 14),
    post: 10 + Math.round(rnd() * 8),
    segs: [],
    end: 0,
    thread: -1,
  }));
  const loop = [];
  const threads = new Array(Math.max(1, pool)).fill(0);
  const jobs = reqs.map((r) => ({ t: r.arrive, r, ph: 0 }));
  let free = 0; // when the event loop is next free
  let guard = 0;
  while (jobs.length && guard++ < 100) {
    // The loop always picks the job that became ready first (FIFO).
    jobs.sort((a, b) => a.t - b.t || a.r.i - b.r.i);
    const j = jobs.shift();
    const r = j.r;
    const s = Math.max(free, j.t);
    if (s > j.t + 0.5) r.segs.push({ s: j.t, e: s, k: "wait" });
    if (mode === "blocking") {
      // time.sleep inside async def: the loop cannot switch tasks until it returns.
      const a = s + r.pre, b = a + io, c = b + r.post;
      r.segs.push({ s, e: a, k: "cpu" }, { s: a, e: b, k: "block" }, { s: b, e: c, k: "cpu" });
      loop.push({ s, e: a, k: "cpu" }, { s: a, e: b, k: "block" }, { s: b, e: c, k: "cpu" });
      free = r.end = c;
    } else if (j.ph === 0) {
      r.segs.push({ s, e: s + r.pre, k: "cpu" });
      loop.push({ s, e: s + r.pre, k: "cpu" });
      free = s + r.pre;
      if (mode === "async") {
        // await hands control back to the loop; it resumes us when the I/O is done.
        r.segs.push({ s: free, e: free + io, k: "io" });
        jobs.push({ t: free + io, r, ph: 1 });
      } else {
        // A plain def endpoint is sent to the threadpool; it may queue for a thread.
        let ti = 0;
        for (let k = 1; k < threads.length; k++) if (threads[k] < threads[ti]) ti = k;
        const ts = Math.max(free, threads[ti]);
        if (ts > free + 0.5) r.segs.push({ s: free, e: ts, k: "wait" });
        r.segs.push({ s: ts, e: ts + io, k: "thread" }, { s: ts + io, e: ts + io + r.post, k: "cpu" });
        threads[ti] = r.end = ts + io + r.post;
        r.thread = ti;
      }
    } else {
      r.segs.push({ s, e: s + r.post, k: "cpu" });
      loop.push({ s, e: s + r.post, k: "cpu" });
      free = r.end = s + r.post;
    }
  }
  const total = Math.max(1, ...reqs.map((r) => r.end));
  const busy = loop.reduce((a, g) => a + g.e - g.s, 0);
  const blocked = loop.filter((g) => g.k === "block").reduce((a, g) => a + g.e - g.s, 0);
  const threadsUsed = new Set(reqs.map((r) => r.thread).filter((t) => t >= 0)).size;
  return { reqs, loop, total, busy, blocked, threadsUsed };
}

const EL_CODE = {
  async: (s) => ['@app.get("/report")', "async def report():", `    await asyncio.sleep(${s})   # yields: the loop serves others`, '    return {"ok": True}'],
  threadpool: (s) => ['@app.get("/report")', "def report():                 # plain def → runs in a worker thread", `    time.sleep(${s})            # blocks only this thread`, '    return {"ok": True}'],
  blocking: (s) => ['@app.get("/report")', "async def report():", `    time.sleep(${s})            # BUG: freezes the whole event loop!`, '    return {"ok": True}'],
};

export function EventLoop({ params = {} }) {
  const prm = obj(params);
  const [mode, setMode] = useState(() => oneOf(prm.mode, ["async", "threadpool", "blocking"], "async", { def: "threadpool", sync: "threadpool", thread: "threadpool", block: "blocking" }));
  const [n, setN] = useState(() => Math.round(clamp(num(prm.requests, 4), 1, 8)));
  const [io, setIo] = useState(() => Math.round(clamp(num(prm.io, 1000), 100, 3000) / 100) * 100);
  const [poolStop, setPoolStop] = useState(() => {
    const v = num(prm.pool, 40);
    return v >= 9 ? EL_POOL_DEFAULT : Math.round(clamp(v, 1, 8));
  });
  const pool = elPool(poolStop);
  const id = useSvgId();

  const sim = useMemo(() => elSimulate(mode, n, io, pool), [mode, n, io, pool]);
  // Common x scale: the blocking version is always the slowest, so every mode is
  // drawn against it and the difference is visible at a glance.
  const worst = useMemo(() => elSimulate("blocking", n, io, pool).total, [n, io, pool]);
  const ticks = niceTicks(worst / 1000, 5);
  const xMax = Math.max(worst, ticks[ticks.length - 1] * 1000);

  // Animated playhead (ms of simulated time). Restarts whenever an input changes.
  const [now, setNow] = useState(0);
  const [run, setRun] = useState(false);
  const nowRef = useRef(0);
  const replay = () => {
    nowRef.current = 0;
    setNow(0);
    setRun(true);
  };
  useEffect(replay, [mode, n, io, pool]);
  useLoop(run, (dt) => {
    // The whole x axis takes ~2.6 s to sweep, so faster modes visibly finish first.
    nowRef.current = Math.min(sim.total, nowRef.current + (dt * xMax) / 2.6);
    if (nowRef.current >= sim.total) setRun(false);
    setNow(nowRef.current);
  });
  const finished = !run && now >= sim.total - 1e-6;

  // Layout.
  const W = 480, L = 66, R = 12, top = 22, rowH = 21, gap = 12;
  const loopY = top + n * rowH + gap;
  const axisY = loopY + rowH + 4;
  const H = axisY + 22;
  const sx = (ms) => L + (clamp(ms, 0, xMax) / xMax) * (W - L - R);
  const clip = (g) => (now <= g.s ? null : { x: sx(g.s), w: Math.max(0.6, sx(Math.min(g.e, now)) - sx(g.s)) });
  const segLabel = { io: "await asyncio.sleep", thread: "time.sleep in thread", block: "time.sleep: loop blocked" };

  const secs = sig(io / 1000);
  const ideal = io + 40; // one request on its own: its I/O plus ~40 ms of CPU
  // Where the loop sits idle in async / threadpool mode: after the last request was dispatched.
  const idleFrom = sim.reqs.reduce((a, r) => Math.max(a, r.arrive + r.pre), 0) + 20;
  const idleTo = Math.min(now, sim.total - 60);
  const tone = mode === "blocking" ? "text-rose-300" : mode === "async" ? "text-emerald-300" : "text-teal-300";
  const say = {
    async: `All ${n} requests start almost at once. Each one hits await, hands the loop back, and the loop starts the next. The waits overlap, so ${n} × ${fmtMs(io)} of I/O finishes in about ${fmtMs(sim.total)}.`,
    threadpool: `FastAPI runs a plain def endpoint in a threadpool so its blocking call can't freeze the loop. With ${pool} thread${pool === 1 ? "" : "s"}, up to ${Math.min(pool, n)} request${Math.min(pool, n) === 1 ? "" : "s"} sleep at the same time; the rest queue for a free thread. Total: ${fmtMs(sim.total)}.`,
    blocking: `time.sleep never yields. The single event loop is stuck inside request 1 for the whole ${fmtMs(io)}, so every other request (and every other endpoint!) waits. The requests run one after another: ${fmtMs(sim.total)} in total.`,
  }[mode];

  return (
    <Card
      title="async def, def, and the event loop"
      params={params}
      caption="Each request waits on ~1 s of I/O. With async def + await the waits overlap on one event loop. With plain def, FastAPI runs the function in a threadpool: drag the pool size down to 2 to see requests queue. Calling time.sleep (or requests.get) inside async def is the classic bug: it blocks the event loop, so requests run one at a time."
    >
      <Choice options={EL_MODES} value={mode} onChange={setMode} tones={{ blocking: "rose" }} />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <Slider label="requests" value={n} min={1} max={8} onChange={setN} />
        <Slider label="I/O per request" value={io} min={100} max={3000} step={100} onChange={setIo} display={fmtMs(io)} />
        {mode === "threadpool" && <Slider label="thread pool" value={poolStop} min={1} max={9} onChange={setPoolStop} display={pool === 40 ? "40 (def.)" : pool} />}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full select-none">
        <defs>
          {Object.entries(EL_KIND).map(([k, v]) =>
            v.hatch ? (
              <pattern key={k} id={`${id}h`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill={C.ink800} />
                <line x1="0" y1="0" x2="0" y2="5" stroke={v.color} strokeWidth="2" />
              </pattern>
            ) : null,
          )}
        </defs>
        {/* time grid */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={sx(t * 1000)} x2={sx(t * 1000)} y1={top - 4} y2={axisY} stroke={C.grid} />
            <text x={sx(t * 1000)} y={axisY + 12} textAnchor="middle" fontSize="9.5" fill={C.dim}>{`${sig(t)}s`}</text>
          </g>
        ))}
        {/* request rows */}
        {sim.reqs.map((r, i) => {
          const y = top + i * rowH;
          const ended = now >= r.end;
          return (
            <g key={i}>
              <rect x={L} y={y + 2} width={W - L - R} height={rowH - 4} rx="3" fill={C.ink800} opacity="0.5" />
              <text x={L - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize="11" fill={C.text} fontFamily={MONO}>{`req ${i + 1}`}</text>
              {r.segs.map((g, k) => {
                const c = clip(g);
                if (!c) return null;
                const kind = EL_KIND[g.k];
                return (
                  <g key={k}>
                    <rect x={c.x} y={y + 3} width={c.w} height={rowH - 6} rx="2.5" fill={kind.hatch ? `url(#${id}h)` : kind.color} opacity={g.k === "cpu" ? 1 : 0.85} />
                    {segLabel[g.k] && c.w > segLabel[g.k].length * 5.3 + 10 && (
                      <text x={c.x + 5} y={y + rowH / 2 + 3} fontSize="8.5" fill={C.ink950} fontWeight="600" fontFamily={MONO}>{segLabel[g.k]}</text>
                    )}
                    {g.k === "wait" && c.w > 80 && (
                      <text x={c.x + 5} y={y + rowH / 2 + 3} fontSize="8.5" fill="#e2e8f0" fontFamily={MONO}>{mode === "threadpool" && k > 0 ? "no free thread" : "waiting"}</text>
                    )}
                  </g>
                );
              })}
              {ended && (
                <g transform={`translate(${sx(r.end) + 6} ${y + rowH / 2})`}>
                  <circle r="5" fill={C.emerald} />
                  <path d="M-2.4,0.2 L-0.6,2 L2.6,-1.8" stroke={C.ink950} strokeWidth="1.5" fill="none" />
                </g>
              )}
            </g>
          );
        })}
        {/* the event loop lane */}
        <line x1={4} x2={W - R} y1={loopY - gap / 2} y2={loopY - gap / 2} stroke={C.axis} strokeDasharray="2 3" />
        <rect x={L} y={loopY + 2} width={W - L - R} height={rowH - 4} rx="3" fill={mode === "blocking" ? "#2a1320" : "#0f2a24"} opacity="0.6" />
        <text x={L - 8} y={loopY + rowH / 2 + 3.5} textAnchor="end" fontSize="11" fontWeight="600" fill={mode === "blocking" ? C.rose : C.emerald}>event loop</text>
        {sim.loop.map((g, k) => {
          const c = clip(g);
          if (!c) return null;
          return (
            <g key={k}>
              <rect x={c.x} y={loopY + 3} width={c.w} height={rowH - 6} rx="2.5" fill={EL_KIND[g.k].color} />
              {g.k === "block" && c.w > 70 && <text x={c.x + 5} y={loopY + rowH / 2 + 3} fontSize="8.5" fontWeight="600" fill={C.ink950} fontFamily={MONO}>frozen</text>}
            </g>
          );
        })}
        {mode !== "blocking" && sx(idleTo) - sx(idleFrom) > 150 && (
          <text x={(sx(idleFrom) + sx(idleTo)) / 2} y={loopY + rowH / 2 + 3} textAnchor="middle" fontSize="8.5" fill={C.emerald} fontFamily={MONO}>idle: free to accept new requests</text>
        )}
        {/* playhead / finish line */}
        {!finished && now > 0 && <line x1={sx(now)} x2={sx(now)} y1={top - 6} y2={loopY + rowH} stroke="#e2e8f0" strokeWidth="1" opacity="0.6" />}
        {finished && (
          <g>
            <line x1={sx(sim.total)} x2={sx(sim.total)} y1={top - 6} y2={loopY + rowH} stroke={mode === "blocking" ? C.rose : C.emerald} strokeDasharray="3 3" />
            <text x={clamp(sx(sim.total), L + 40, W - R - 40)} y={top - 9} textAnchor="middle" fontSize="10" fontWeight="600" fill={mode === "blocking" ? C.rose : C.emerald}>{`all done: ${fmtMs(sim.total)}`}</text>
          </g>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {Object.entries(EL_KIND)
          .filter(([k]) => k === "wait" || k === "cpu" || (mode === "async" ? k === "io" : mode === "threadpool" ? k === "thread" : k === "block"))
          .map(([k, v]) => <Legend key={k} color={v.color} label={v.label} hatch={v.hatch} />)}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile label="total time" value={finished ? fmtMs(sim.total) : fmtMs(now)} color={tone} sub={`ideal ≈ ${fmtMs(ideal)}`} />
        <Tile label="req / s" value={sig(n / (sim.total / 1000), 2)} sub={`${n} request${n === 1 ? "" : "s"}`} />
        <Tile
          label={mode === "threadpool" ? "threads used" : "loop blocked"}
          value={mode === "threadpool" ? `${sim.threadsUsed} / ${pool}` : fmtMs(sim.blocked)}
          color={mode === "blocking" ? "text-rose-300" : "text-slate-200"}
          sub={mode === "threadpool" ? "AnyIO default: 40" : mode === "blocking" ? "nothing else can run" : "loop never stalls"}
        />
      </div>
      <div className="mt-3 rounded-lg bg-ink-800 px-3 py-2 text-xs leading-relaxed text-slate-300">
        <span className={`font-semibold ${tone}`}>{EL_MODES.find(([k]) => k === mode)[1].replace(" ⚠", "")}: </span>
        {say}
        {mode === "blocking" && (
          <div className="mt-1 text-slate-400">
            Fix: use <code className="text-emerald-300">await asyncio.sleep</code> or an async client such as <code className="text-emerald-300">httpx.AsyncClient</code>, or declare the endpoint with plain <code className="text-emerald-300">def</code> so FastAPI runs it in the threadpool.
          </div>
        )}
      </div>
      <Code className="mt-2" label={mode === "blocking" ? "main.py (buggy)" : "main.py"} lines={EL_CODE[mode](secs)} marks={{ 2: mode === "blocking" ? "rose" : "emerald", 1: mode === "threadpool" ? "emerald" : undefined }} />
      <Row>
        <Button onClick={replay}>Replay</Button>
        <Stat label="mode" value={mode === "async" ? "1 loop, waits overlap" : mode === "threadpool" ? `${pool}-thread pool` : "1 loop, blocked"} color={tone} />
      </Row>
    </Card>
  );
}

/* ---------- pydantic-validator: a mini Pydantic v2 playground ---------- */

/** A Python float in the output: 20 prints as 20.0, like Pydantic's JSON. */
class PyFloat {
  constructor(v) {
    this.v = v;
  }
}
const pyNum = (v) => (!Number.isFinite(v) ? (Number.isNaN(v) ? "NaN" : v > 0 ? "Infinity" : "-Infinity") : Number.isInteger(v) && Math.abs(v) < 1e16 ? v.toFixed(1) : String(v));

/** JSON with 2-space indent; arrays of scalars stay on one line (like ["body", "name"]). */
function dumps(v, ind = "") {
  if (v instanceof PyFloat) return pyNum(v.v);
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    if (v.every((x) => x === null || typeof x !== "object" || x instanceof PyFloat)) return `[${v.map((x) => dumps(x)).join(", ")}]`;
    const i2 = ind + "  ";
    return `[\n${v.map((x) => i2 + dumps(x, i2)).join(",\n")}\n${ind}]`;
  }
  if (typeof v === "object") {
    const ks = Object.keys(v);
    if (!ks.length) return "{}";
    const i2 = ind + "  ";
    return `{\n${ks.map((k) => `${i2}${JSON.stringify(k)}: ${dumps(v[k], i2)}`).join(",\n")}\n${ind}}`;
  }
  return JSON.stringify(v);
}
/** Short one-line rendering of an input value for notes like  "42" → 42. */
const brief = (v) => {
  const s = v instanceof PyFloat ? pyNum(v.v) : JSON.stringify(v);
  return s && s.length > 28 ? s.slice(0, 26) + "…" : s ?? "null";
};

/**
 * A small JSON parser that fails like Python's json module ("Expecting value",
 * "Expecting ',' delimiter", …) and reports the character offset, which is
 * exactly what FastAPI puts in a json_invalid error.
 */
function parseJson(src) {
  let i = 0;
  const fail = (msg, pos = i) => {
    throw { jsonError: true, msg, pos };
  };
  const ws = () => {
    while (i < src.length && " \t\n\r".includes(src[i])) i++;
  };
  const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let depth = 0;
  function value() {
    ws();
    const c = src[i];
    if (c === "{") return object();
    if (c === "[") return array();
    if (c === '"') return string();
    if (c === "-" || (c >= "0" && c <= "9")) {
      NUM.lastIndex = i;
      const m = NUM.exec(src);
      if (!m) fail("Expecting value");
      i += m[0].length;
      return Number(m[0]);
    }
    for (const [w, v] of [["true", true], ["false", false], ["null", null]]) {
      if (src.startsWith(w, i)) {
        i += w.length;
        return v;
      }
    }
    return fail("Expecting value");
  }
  function string() {
    const start = i++;
    let out = "";
    for (;;) {
      if (i >= src.length) fail("Unterminated string starting at", start);
      const c = src[i];
      if (c === '"') {
        i++;
        return out;
      }
      if (c < " ") fail("Invalid control character at");
      if (c === "\\") {
        const e = src[i + 1];
        const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (e in map) {
          out += map[e];
          i += 2;
        } else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
          i += 6;
        } else fail("Invalid \\escape");
      } else {
        out += c;
        i++;
      }
    }
  }
  function object() {
    if (++depth > 64) fail("Nesting too deep");
    i++;
    const o = {};
    ws();
    if (src[i] === "}") {
      i++;
      depth--;
      return o;
    }
    for (;;) {
      ws();
      if (src[i] !== '"') fail("Expecting property name enclosed in double quotes");
      const k = string();
      ws();
      if (src[i] !== ":") fail("Expecting ':' delimiter");
      i++;
      // defineProperty so a "__proto__" key is just a key; duplicates: last one wins (like Python).
      Object.defineProperty(o, k, { value: value(), enumerable: true, writable: true, configurable: true });
      ws();
      if (src[i] === ",") {
        i++;
        continue;
      }
      if (src[i] === "}") {
        i++;
        depth--;
        return o;
      }
      fail("Expecting ',' delimiter");
    }
  }
  function array() {
    if (++depth > 64) fail("Nesting too deep");
    i++;
    const a = [];
    ws();
    if (src[i] === "]") {
      i++;
      depth--;
      return a;
    }
    for (;;) {
      a.push(value());
      ws();
      if (src[i] === ",") {
        i++;
        continue;
      }
      if (src[i] === "]") {
        i++;
        depth--;
        return a;
      }
      fail("Expecting ',' delimiter");
    }
  }
  const v = value();
  ws();
  if (i < src.length) fail("Extra data");
  return v;
}

/* Field validators, following Pydantic v2's lax-mode conversion table. Each
   returns { v } on success (with `note` when the input was coerced) or pushes
   errors and returns null. */

const perr = (type, loc, msg, input, ctx) => (ctx ? { type, loc, msg, input, ctx } : { type, loc, msg, input });
const BOOL_TRUE = ["1", "on", "t", "true", "y", "yes"];
const BOOL_FALSE = ["0", "off", "f", "false", "n", "no"];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function vStr(v, f, loc, errs) {
  if (typeof v !== "string") return errs.push(perr("string_type", loc, "Input should be a valid string", v)), null;
  const len = [...v].length;
  if (f.min != null && len < f.min) return errs.push(perr("string_too_short", loc, `String should have at least ${plural(f.min, "character")}`, v, { min_length: f.min })), null;
  if (f.max != null && len > f.max) return errs.push(perr("string_too_long", loc, `String should have at most ${plural(f.max, "character")}`, v, { max_length: f.max })), null;
  return { v };
}

/** ge / gt / le bounds shared by int and float. */
function bounds(n, f, loc, input, errs) {
  if (f.gt != null && !(n > f.gt)) return errs.push(perr("greater_than", loc, `Input should be greater than ${f.gt}`, input, { gt: f.gt })), false;
  if (f.ge != null && !(n >= f.ge)) return errs.push(perr("greater_than_equal", loc, `Input should be greater than or equal to ${f.ge}`, input, { ge: f.ge })), false;
  if (f.le != null && !(n <= f.le)) return errs.push(perr("less_than_equal", loc, `Input should be less than or equal to ${f.le}`, input, { le: f.le })), false;
  return true;
}

function vInt(v, f, loc, errs) {
  let n, note = null;
  if (typeof v === "boolean") {
    n = v ? 1 : 0;
    note = `${v} → ${n}`;
  } else if (typeof v === "number") {
    if (!Number.isInteger(v)) return errs.push(perr("int_from_float", loc, "Input should be a valid integer, got a number with a fractional part", v)), null;
    n = v;
  } else if (typeof v === "string") {
    // Numeric strings are accepted in lax mode ("42", " 7 ", "3.0"), anything else is not.
    const s = v.trim();
    if (!/^[+-]?\d+(\.0*)?$/.test(s)) return errs.push(perr("int_parsing", loc, "Input should be a valid integer, unable to parse string as an integer", v)), null;
    n = parseInt(s, 10);
    note = `${JSON.stringify(v)} → ${n}`;
  } else return errs.push(perr("int_type", loc, "Input should be a valid integer", v)), null;
  return bounds(n, f, loc, v, errs) ? { v: n, note } : null;
}

function vFloat(v, f, loc, errs) {
  let n, note = null;
  if (typeof v === "boolean") {
    n = v ? 1 : 0;
    note = `${v} → ${pyNum(n)}`;
  } else if (typeof v === "number") {
    n = v;
    if (Number.isInteger(v)) note = `${v} → ${pyNum(v)}`; // int → float
  } else if (typeof v === "string") {
    const s = v.trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) && !/^[+-]?(inf|infinity|nan)$/i.test(s)) return errs.push(perr("float_parsing", loc, "Input should be a valid number, unable to parse string as a number", v)), null;
    n = /nan/i.test(s) ? NaN : /inf/i.test(s) ? (s.startsWith("-") ? -Infinity : Infinity) : Number(s);
    note = `${JSON.stringify(v)} → ${pyNum(n)}`;
  } else return errs.push(perr("float_type", loc, "Input should be a valid number", v)), null;
  return bounds(n, f, loc, v, errs) ? { v: new PyFloat(n), note } : null;
}

function vBool(v, f, loc, errs) {
  if (typeof v === "boolean") return { v };
  if (typeof v === "number") {
    if (v === 0 || v === 1) return { v: v === 1, note: `${v} → ${v === 1}` };
    return errs.push(perr("bool_parsing", loc, "Input should be a valid boolean, unable to interpret input", v)), null;
  }
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (BOOL_TRUE.includes(s)) return { v: true, note: `${JSON.stringify(v)} → true` };
    if (BOOL_FALSE.includes(s)) return { v: false, note: `${JSON.stringify(v)} → false` };
    return errs.push(perr("bool_parsing", loc, "Input should be a valid boolean, unable to interpret input", v)), null;
  }
  return errs.push(perr("bool_type", loc, "Input should be a valid boolean", v)), null;
}

/** The checks email-validator makes, with its wording, for the common mistakes. */
function emailProblem(s) {
  const at = s.split("@").length - 1;
  if (at === 0) return "An email address must have an @-sign.";
  if (at > 1) return "The email address is not valid. It must have exactly one @-sign.";
  const [local, domain] = s.split("@");
  if (!local) return "There must be something before the @-sign.";
  if (!domain) return "There must be something after the @-sign.";
  if (/\s/.test(local)) return "The email address contains invalid characters before the @-sign: SPACE.";
  if (/\s/.test(domain)) return "The part after the @-sign contains invalid characters: SPACE.";
  if (!domain.includes(".")) return "The part after the @-sign is not valid. It should have a period.";
  if (/^\.|\.$|\.\./.test(domain)) return "An email address cannot have a period immediately after the @-sign.";
  return null;
}
function vEmail(v, f, loc, errs) {
  if (typeof v !== "string") return errs.push(perr("string_type", loc, "Input should be a valid string", v)), null;
  const s = v.trim();
  const why = emailProblem(s);
  if (why) return errs.push(perr("value_error", loc, `value is not a valid email address: ${why}`, v, { reason: why })), null;
  const k = s.lastIndexOf("@");
  const norm = s.slice(0, k) + "@" + s.slice(k + 1).toLowerCase(); // the domain is normalised to lower case
  return { v: norm, note: norm !== v ? `${JSON.stringify(v)} → ${JSON.stringify(norm)}` : null };
}

function vList(v, f, loc, errs) {
  if (!Array.isArray(v)) return errs.push(perr("list_type", loc, "Input should be a valid list", v)), null;
  const out = [];
  const before = errs.length;
  v.forEach((x, k) => {
    const r = vStr(x, {}, [...loc, k], errs);
    if (r) out.push(r.v);
  });
  if (errs.length > before) return null;
  if (f.min != null && out.length < f.min) {
    errs.push(perr("too_short", loc, `List should have at least ${plural(f.min, "item")} after validation, not ${out.length}`, v, { field_type: "List", min_length: f.min, actual_length: out.length }));
    return null;
  }
  return { v: out };
}

const VALIDATE = { str: vStr, int: vInt, float: vFloat, bool: vBool, email: vEmail, list: vList };

/** The three example models: source line, kind, constraints, default. */
const PV_MODELS = {
  user: {
    cls: "User",
    route: '@app.post("/users")',
    fn: "async def create_user(user: User):",
    ret: "    return user",
    fields: [
      { name: "name", kind: "str", min: 2, max: 50, src: "name: str = Field(min_length=2, max_length=50)" },
      { name: "age", kind: "int", ge: 0, le: 150, src: "age: int = Field(ge=0, le=150)" },
      { name: "email", kind: "email", src: "email: EmailStr" },
      { name: "tags", kind: "list", def: [], src: "tags: list[str] = []" },
      { name: "is_active", kind: "bool", def: true, src: "is_active: bool = True" },
    ],
    presets: [
      ["valid", "valid", { name: "Ada Lovelace", age: 36, email: "ada@example.com", tags: ["math", "poetry"] }],
      ["type", "wrong type", { name: "Ada", age: "thirty-six", email: "ada@example", tags: "math" }],
      ["missing", "missing field", { name: "Ada" }],
      ["coerce", 'coercion: "42" → 42', { name: "Ada", age: "42", email: "Ada@Example.COM", tags: ["x"], is_active: "yes" }],
      ["limits", "too short / out of range", { name: "A", age: -5, email: "ada@example.com" }],
      ["extra", "extra field", { name: "Ada", age: 36, email: "ada@example.com", nickname: "countess", is_admin: true }],
    ],
  },
  item: {
    cls: "Item",
    route: '@app.post("/items")',
    fn: "async def create_item(item: Item):",
    ret: "    return item",
    fields: [
      { name: "name", kind: "str", min: 1, src: "name: str = Field(min_length=1)" },
      { name: "price", kind: "float", gt: 0, src: "price: float = Field(gt=0)" },
      { name: "quantity", kind: "int", ge: 1, def: 1, src: "quantity: int = Field(default=1, ge=1)" },
      { name: "description", kind: "str", nullable: true, def: null, src: "description: str | None = None" },
      { name: "in_stock", kind: "bool", def: true, src: "in_stock: bool = True" },
    ],
    presets: [
      ["valid", "valid", { name: "Mechanical keyboard", price: 89.99, quantity: 2 }],
      ["type", "wrong type", { name: 42, price: "cheap", quantity: 2.5, in_stock: "maybe" }],
      ["missing", "missing field", { quantity: 3 }],
      ["coerce", "coercion: 20 → 20.0", { name: "Mouse", price: 20, quantity: "3", description: null, in_stock: "no" }],
      ["limits", "too short / out of range", { name: "", price: 0, quantity: 0 }],
      ["extra", "extra field", { name: "Mouse", price: 20, discount: 0.5, id: 999 }],
    ],
  },
  order: {
    cls: "Order",
    route: '@app.post("/orders")',
    fn: "async def place_order(order: Order):",
    ret: "    return order",
    fields: [
      { name: "order_id", kind: "int", src: "order_id: int" },
      { name: "customer_email", kind: "email", src: "customer_email: EmailStr" },
      { name: "items", kind: "list", min: 1, src: "items: list[str] = Field(min_length=1)" },
      { name: "total", kind: "float", ge: 0, src: "total: float = Field(ge=0)" },
      { name: "express", kind: "bool", def: false, src: "express: bool = False" },
    ],
    presets: [
      ["valid", "valid", { order_id: 1001, customer_email: "sam@shop.io", items: ["sku-1", "sku-2"], total: 49.9 }],
      ["type", "wrong type", { order_id: "A-1001", customer_email: "sam.shop.io", items: ["sku-1", 7], total: "free" }],
      ["missing", "missing field", { items: ["sku-1"] }],
      ["coerce", 'coercion: "1001" → 1001', { order_id: "1001", customer_email: "Sam@SHOP.io", items: ["sku-1"], total: "49.90", express: 1 }],
      ["limits", "too short / out of range", { order_id: 1001, customer_email: "sam@shop.io", items: [], total: -5 }],
      ["extra", "extra field", { order_id: 1001, customer_email: "sam@shop.io", items: ["sku-1"], total: 49.9, coupon: "FREE100", paid: true }],
    ],
  },
};
const PV_TYPE_LABEL = { str: "str", int: "int", float: "float", bool: "bool", email: "EmailStr", list: "list[str]" };

/**
 * Validate a request body the way FastAPI + Pydantic v2 would. Returns
 * { ok, status, body, fields: {name: {state, note}}, extras: [...] }.
 */
function pvValidate(model, text, forbid) {
  const fields = {};
  const raw = typeof text === "string" ? text : "";
  if (!raw.trim()) {
    return { ok: false, status: 422, body: { detail: [perr("missing", ["body"], "Field required", null)] }, fields, extras: [], whole: "Empty body: the whole body is required." };
  }
  let data;
  try {
    data = parseJson(raw);
  } catch (e) {
    const pos = e && e.jsonError ? e.pos : 0;
    const msg = e && e.jsonError ? e.msg : "Expecting value";
    return { ok: false, status: 422, body: { detail: [perr("json_invalid", ["body", pos], "JSON decode error", {}, { error: msg })] }, fields, extras: [], whole: `Invalid JSON at character ${pos}: ${msg}.`, jsonPos: pos };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status: 422, body: { detail: [perr("model_attributes_type", ["body"], "Input should be a valid dictionary or object to extract fields from", data)] }, fields, extras: [], whole: "The body must be a JSON object." };
  }
  const errs = [];
  const out = {};
  for (const f of model.fields) {
    const loc = ["body", f.name];
    const has = Object.prototype.hasOwnProperty.call(data, f.name);
    if (!has) {
      if ("def" in f) {
        out[f.name] = f.kind === "float" ? new PyFloat(f.def) : f.def;
        fields[f.name] = { state: "default", note: `default ${f.def === null ? "None" : typeof f.def === "boolean" ? (f.def ? "True" : "False") : JSON.stringify(f.def)}` };
      } else {
        errs.push(perr("missing", loc, "Field required", data));
        fields[f.name] = { state: "error", note: "missing" };
      }
      continue;
    }
    const v = data[f.name];
    if (v === null && f.nullable) {
      out[f.name] = null;
      fields[f.name] = { state: "ok", note: "None" };
      continue;
    }
    const before = errs.length;
    const r = VALIDATE[f.kind](v, f, loc, errs);
    if (r) {
      out[f.name] = r.v;
      fields[f.name] = r.note ? { state: "coerced", note: r.note } : { state: "ok", note: brief(r.v) };
    } else fields[f.name] = { state: "error", note: errs[before] ? errs[before].type : "error" };
  }
  const extras = Object.keys(data).filter((k) => !model.fields.some((f) => f.name === k));
  if (forbid) for (const k of extras) errs.push(perr("extra_forbidden", ["body", k], "Extra inputs are not permitted", data[k]));
  if (errs.length) return { ok: false, status: 422, body: { detail: errs }, fields, extras };
  return { ok: true, status: 200, body: out, fields, extras };
}

const PV_STATE = {
  ok: { icon: "✓", cls: "text-emerald-300", row: "" },
  coerced: { icon: "⇄", cls: "text-amber-300", row: "bg-amber-500/10" },
  default: { icon: "∅", cls: "text-slate-400", row: "" },
  error: { icon: "✕", cls: "text-rose-300", row: "bg-rose-500/15 ring-1 ring-inset ring-rose-500/40" },
};

const pvText = (data) => JSON.stringify(data, null, 2);

export function PydanticValidator({ params = {} }) {
  const prm = obj(params);
  const [mk, setMk] = useState(() => oneOf(prm.model, Object.keys(PV_MODELS), "user", { users: "user", items: "item", orders: "order" }));
  const model = PV_MODELS[mk];
  const [preset, setPreset] = useState("valid");
  const [text, setText] = useState(() => pvText(model.presets[0][2]));
  const [forbid, setForbid] = useState(prm.forbid === true);

  const res = useMemo(() => pvValidate(model, text, forbid), [model, text, forbid]);

  const pickModel = (k) => {
    setMk(k);
    setPreset("valid");
    setText(pvText(PV_MODELS[k].presets[0][2]));
  };
  const pickPreset = (k) => {
    const p = model.presets.find(([pk]) => pk === k);
    if (!p) return;
    setPreset(k);
    setText(pvText(p[2]));
  };

  // Model source, remembering which line declares which field.
  const lines = ["from pydantic import BaseModel, ConfigDict, EmailStr, Field", "", `class ${model.cls}(BaseModel):`];
  if (forbid) lines.push('    model_config = ConfigDict(extra="forbid")');
  const lineOf = {};
  for (const f of model.fields) {
    lineOf[f.name] = lines.length;
    lines.push("    " + f.src);
  }
  lines.push("", model.route, model.fn, model.ret);
  const marks = {};
  for (const f of model.fields) {
    const s = res.fields[f.name]?.state;
    if (s === "error") marks[lineOf[f.name]] = "rose";
    else if (s === "coerced") marks[lineOf[f.name]] = "amber";
  }
  if (forbid && res.extras.length) marks[3] = "rose";
  const nErr = res.ok ? 0 : res.body.detail.length;

  return (
    <Card
      title="Pydantic validation playground"
      params={params}
      caption={'Edit the JSON or pick a preset. Valid input shows the parsed model, including lax-mode coercions such as "42" → 42 and 20 → 20.0. Invalid input shows the exact 422 body FastAPI sends: one error per problem, each with type, loc, msg and input. Try breaking the JSON syntax too, and switch on extra="forbid" with the extra-field preset.'}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Choice options={Object.keys(PV_MODELS).map((k) => [k, PV_MODELS[k].cls])} value={mk} onChange={pickModel} />
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" className="accent-brand-500" checked={forbid} onChange={(e) => setForbid(e.target.checked)} />
          <span className="font-mono">extra=&quot;forbid&quot;</span>
        </label>
      </div>
      <Code className="mt-3" label="models.py" lines={lines} marks={marks} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {model.presets.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => pickPreset(k)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${preset === k ? "border-brand-400 bg-brand-500/25 text-white" : "border-ink-600 bg-ink-800 text-slate-300 hover:bg-ink-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
            <span>request body (editable)</span>
            {res.jsonPos != null && <span className="normal-case tracking-normal text-rose-300">error at char {res.jsonPos}</span>}
          </div>
          <textarea
            value={text}
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              setPreset("");
            }}
            rows={9}
            aria-label="JSON request body"
            className={`w-full resize-y rounded-lg border bg-ink-950 p-2.5 font-mono text-[11px] leading-[1.55] text-slate-200 outline-none focus:border-brand-400 ${res.jsonPos != null ? "border-rose-500/60" : "border-ink-700"}`}
          />
          {/* every model field with what happened to it */}
          <div className="mt-1.5 space-y-1">
            {model.fields.map((f) => {
              const st = res.fields[f.name];
              const look = st ? PV_STATE[st.state] : null;
              return (
                <div key={f.name} className={`flex items-center gap-2 rounded-md px-2 py-0.5 font-mono text-[11px] transition-colors ${look ? look.row : ""}`}>
                  <span className={`w-3 text-center ${look ? look.cls : "text-slate-600"}`}>{look ? look.icon : "·"}</span>
                  <span className="text-slate-200">{f.name}</span>
                  <span className="text-teal-300/80">{PV_TYPE_LABEL[f.kind]}{f.nullable ? " | None" : ""}</span>
                  <span className={`ml-auto truncate ${look ? look.cls : "text-slate-600"}`}>{st ? st.note : "not checked"}</span>
                </div>
              );
            })}
            {res.extras.map((k) => (
              <div key={`x-${k}`} className={`flex items-center gap-2 rounded-md px-2 py-0.5 font-mono text-[11px] ${forbid ? PV_STATE.error.row : ""}`}>
                <span className={`w-3 text-center ${forbid ? "text-rose-300" : "text-slate-500"}`}>{forbid ? "✕" : "−"}</span>
                <span className="text-slate-400 line-through decoration-slate-600">{k}</span>
                <span className={`ml-auto ${forbid ? "text-rose-300" : "text-slate-500"}`}>{forbid ? "extra_forbidden" : "ignored (extra field)"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
            <span>{res.ok ? `response: ${model.cls.toLowerCase()}.model_dump()` : "response body"}</span>
            <span className={`rounded px-1.5 py-px font-mono normal-case tracking-normal ${res.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
              {res.ok ? "200 OK" : "422 Unprocessable Entity"}
            </span>
          </div>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] leading-[1.55] text-slate-300">{jsonSpans(dumps(res.body))}</pre>
          <div className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            {res.ok
              ? Object.values(res.fields).some((f) => f.state === "coerced")
                ? "Valid after coercion: the amber fields were converted to the declared types."
                : res.extras.length && !forbid
                  ? "Valid. The extra keys were silently dropped (extra='ignore' is the default), so clients can't sneak in fields like is_admin."
                  : "Valid: every field matched its declared type and constraints."
              : res.whole || `${nErr} error${nErr === 1 ? "" : "s"}. Pydantic reports every problem at once, not just the first; loc tells the client exactly which field to fix.`}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- dependency-graph: how FastAPI resolves Depends() ---------- */

// Graph for  GET /users/me/orders . Arrows point from a function to what it
// depends on. Coordinates are in the SVG's 520-wide viewBox.
const DG_NODES = {
  read_orders: { x: 300, y: 30, w: 150, sub: "path operation" },
  get_current_active_user: { x: 150, y: 96, w: 176, sub: "dependency" },
  get_current_user: { x: 150, y: 162, w: 140, sub: "dependency" },
  oauth2_scheme: { x: 68, y: 236, w: 118, sub: "OAuth2PasswordBearer" },
  get_settings: { x: 222, y: 236, w: 112, sub: "@lru_cache" },
  get_db: { x: 400, y: 236, w: 104, sub: "yield Session" },
  get_db2: { x: 448, y: 140, w: 104, sub: "yield Session", label: "get_db" },
};
const DG_H = 34;

const DG_CODE = (noCache) => [
  "@lru_cache",
  "def get_settings() -> Settings:",
  "    return Settings()                  # reads env vars once",
  "",
  'oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")',
  "",
  "def get_db():",
  "    db = SessionLocal()",
  "    try:",
  "        yield db                       # value injected here",
  "    finally:",
  "        db.close()                     # teardown after the response",
  "",
  "async def get_current_user(token: str = Depends(oauth2_scheme),",
  "                           db: Session = Depends(get_db),",
  "                           settings: Settings = Depends(get_settings)):",
  "    return load_user(token, db, settings.secret_key)",
  "",
  "async def get_current_active_user(user: User = Depends(get_current_user)):",
  "    if not user.is_active:",
  '        raise HTTPException(status_code=400, detail="Inactive user")',
  "    return user",
  "",
  '@app.get("/users/me/orders")',
  "async def read_orders(current_user: User = Depends(get_current_active_user),",
  noCache ? "                      db: Session = Depends(get_db, use_cache=False)):" : "                      db: Session = Depends(get_db)):",
  "    return db.query(Order).filter_by(owner_id=current_user.id).all()",
];
/** Code lines that belong to each node (highlighted while it is active). */
const DG_LINES = {
  get_settings: [0, 1, 2],
  oauth2_scheme: [4],
  get_db: [6, 7, 8, 9],
  get_db2: [6, 7, 8, 9, 25],
  get_current_user: [13, 14, 15, 16],
  get_current_active_user: [18, 19, 20, 21],
  read_orders: [23, 24, 25, 26],
};

/**
 * The ordered list of things FastAPI does for one request. FastAPI walks the
 * parameters depth-first in declaration order, so the leaves run first; a
 * dependency already solved in this request is reused instead of being called again.
 */
function dgEvents(noCache, missing, reqNo) {
  const ev = [];
  const add = (k, n, log, say, extra = {}) => ev.push({ k, n, log, say, ...extra });
  add("enter", "read_orders", "GET /users/me/orders → resolve read_orders' params", "FastAPI matched the route. Before it can call read_orders it must solve every Depends() in its signature, starting with current_user.", { via: null });
  add("enter", "get_current_active_user", "solve current_user → get_current_active_user", "get_current_active_user has its own dependency, so FastAPI goes one level deeper first.", { via: "read_orders" });
  add("enter", "get_current_user", "solve user → get_current_user", "get_current_user needs three things: a token, a db session and the settings. They are solved in parameter order.", { via: "get_current_active_user" });
  if (missing) {
    add("raise", "oauth2_scheme", "oauth2_scheme() ✕ raise HTTPException(401)", "There is no Authorization: Bearer header, so OAuth2PasswordBearer raises HTTPException(401). Nothing below it runs: no session is opened and the endpoint is never called.", { via: "get_current_user" });
    add("abort", "get_current_user", "  ↳ get_current_user, get_current_active_user, read_orders: skipped", "The exception propagates up the chain. FastAPI's exception handler turns it into the response.");
    add("response", "read_orders", '← 401 {"detail": "Not authenticated"}', 'The client gets 401 with header WWW-Authenticate: Bearer. Because get_db never ran, there is no teardown to do.', { status: 401 });
    return ev;
  }
  add("call", "oauth2_scheme", 'oauth2_scheme() → "eyJhbGciOi…"', "OAuth2PasswordBearer reads the Authorization: Bearer <token> header and returns the token string.", { via: "get_current_user", note: '"eyJhbG…"' });
  add("yield", "get_db", "get_db() → runs to yield → Session#1", "get_db opens a session and pauses at yield. The yielded Session is injected; the code after yield waits until the response is done.", { via: "get_current_user", note: "Session#1 open" });
  add(
    "call",
    "get_settings",
    reqNo > 1 ? "get_settings() → lru_cache hit (same Settings)" : "get_settings() → Settings() built",
    reqNo > 1 ? "FastAPI calls get_settings every request, but @lru_cache returns the Settings object built on the first request. That cache lives across requests; Depends' cache only lasts one request." : "The first request builds Settings() (reading environment variables). @lru_cache keeps it for every later request: press Next request to see.",
    { via: "get_current_user", note: reqNo > 1 ? "lru_cache hit" : "Settings()" },
  );
  add("call", "get_current_user", "get_current_user(token, db, settings) → User(ada)", "All three inputs are ready, so get_current_user runs and loads the user from the token.", { note: "User(id=7)" });
  add("call", "get_current_active_user", "get_current_active_user(user) → User(ada)", "The user is active, so it is returned unchanged.", { note: "is_active ✓" });
  if (noCache) {
    add("yield", "get_db2", "get_db() called AGAIN → Session#2", "use_cache=False tells FastAPI not to reuse the value: get_db runs a second time and the endpoint gets a different session (and a different transaction) from get_current_user.", { via: "read_orders", note: "Session#2 open" });
  } else {
    add("cached", "get_db", "solve db → get_db already solved: reuse Session#1", "read_orders also depends on get_db, but it was already solved in this request. With use_cache=True (the default) FastAPI reuses the same Session instead of calling get_db again.", { via: "read_orders", note: "reused ×2" });
  }
  add("call", "read_orders", "read_orders(current_user, db) → [Order, Order]", "Every parameter is ready, so your path operation finally runs and returns the user's orders.", { note: "2 orders" });
  add("response", "read_orders", "← 200 [{\"id\": 1, …}, {\"id\": 2, …}]", "The return value is serialised and the response is sent.", { status: 200 });
  if (noCache) {
    add("teardown", "get_db2", "get_db #2 resumes after yield → db.close()", "Now the code after yield runs, in reverse order of setup (last opened, first closed): Session#2 closes first…", { note: "closed" });
  }
  add("teardown", "get_db", "get_db resumes after yield → db.close()", noCache ? "…then Session#1. Exit code runs like a stack of context managers." : "The code after yield runs: the finally block closes the session. With several yield dependencies, their exit code runs in reverse order, like nested with-blocks.", { note: "closed" });
  return ev;
}

/** Each node's state after applying events 0..upto. */
function dgState(events, upto) {
  const s = {};
  for (const k of Object.keys(DG_NODES)) s[k] = { st: "idle", note: "", calls: 0 };
  for (let i = 0; i <= upto && i < events.length; i++) {
    const e = events[i];
    const n = s[e.n];
    if (!n) continue;
    if (e.k === "enter") Object.assign(n, { st: "resolving", note: "solving params…" });
    else if (e.k === "call") Object.assign(n, { st: "done", note: e.note || "", calls: n.calls + 1 });
    else if (e.k === "yield") Object.assign(n, { st: "open", note: e.note || "", calls: n.calls + 1 });
    else if (e.k === "cached") Object.assign(n, { st: "open", note: e.note || "" });
    else if (e.k === "raise") Object.assign(n, { st: "error", note: "401 raised" });
    else if (e.k === "abort") {
      for (const k of ["get_current_user", "get_current_active_user", "read_orders"]) Object.assign(s[k], { st: "skipped", note: "skipped" });
    } else if (e.k === "teardown") Object.assign(n, { st: "closed", note: e.note || "" });
    else if (e.k === "response") Object.assign(n, { st: e.status >= 400 ? "error" : "done", note: e.status >= 400 ? `${e.status} sent` : "200 sent" });
  }
  return s;
}

const DG_LOOK = {
  idle: { fill: C.ink900, stroke: C.ink600, text: C.text, label: "not called yet" },
  resolving: { fill: "#2a2410", stroke: C.amber, text: "#fde68a", label: "solving its dependencies" },
  done: { fill: "#0f2a22", stroke: C.emerald, text: "#a7f3d0", label: "called, returned a value" },
  open: { fill: "#0c2a3d", stroke: C.sky, text: "#bae6fd", label: "paused at yield (resource open)" },
  closed: { fill: C.ink800, stroke: "#475569", text: C.text, label: "teardown ran (closed)" },
  error: { fill: "#3b1622", stroke: C.rose, text: "#fecdd3", label: "raised an exception" },
  skipped: { fill: C.ink900, stroke: C.ink700, text: C.dim, label: "skipped" },
};

export function DependencyGraph({ params = {} }) {
  const prm = obj(params);
  const [noCache, setNoCache] = useState(prm.use_cache === false || prm.useCache === false);
  const [missing, setMissing] = useState(prm.missing === true || prm.missingToken === true);
  const [reqNo, setReqNo] = useState(1);
  const [stepI, setStepI] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const id = useSvgId();
  const events = useMemo(() => dgEvents(noCache, missing, reqNo), [noCache, missing, reqNo]);
  const last = events.length - 1;
  const cur = stepI >= 0 ? events[Math.min(stepI, last)] : null;
  const state = dgState(events, stepI);
  const done = stepI >= last;
  const logRef = useRef(null);

  // Advance one event per ~1.1 s while playing.
  const acc = useRef(0);
  const stepRef = useRef(stepI);
  stepRef.current = stepI;
  useLoop(playing, (dt) => {
    acc.current += dt;
    if (acc.current < 1.1) return;
    acc.current = 0;
    const nx = Math.min(last, stepRef.current + 1);
    stepRef.current = nx;
    setStepI(nx);
    if (nx >= last) setPlaying(false);
  });
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [stepI]);

  const restart = () => {
    setStepI(-1);
    setPlaying(false);
  };
  const toggle = (setter) => (e) => {
    setter(e.target.checked);
    restart();
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (done) {
      // A finished run: the next press sends another request (lru_cache is now warm).
      setReqNo((r) => r + 1);
      setStepI(-1);
    }
    acc.current = 1.1; // first step immediately
    setPlaying(true);
  };

  // Edges (dependent → dependency).
  const edgeList = [
    ["read_orders", "get_current_active_user"],
    ["get_current_active_user", "get_current_user"],
    ["get_current_user", "oauth2_scheme"],
    ["get_current_user", "get_db"],
    ["get_current_user", "get_settings"],
    ["read_orders", noCache ? "get_db2" : "get_db"],
  ];
  const activeEdge = cur && cur.via ? `${cur.via}>${cur.n}` : null;
  const status = (events.find((e) => e.k === "response") || { status: 200 }).status;
  const marks = {};
  if (cur) for (const l of DG_LINES[cur.n] || []) marks[l] = cur.k === "raise" ? "rose" : cur.k === "teardown" ? "sky" : cur.k === "cached" ? "sky" : "brand";
  if (cur && cur.k === "teardown") {
    marks[10] = "sky";
    marks[11] = "sky";
  }
  if (cur && cur.k === "cached") marks[25] = "sky";
  const nodes = Object.entries(DG_NODES).filter(([k]) => k !== "get_db2" || noCache);
  const dbCalls = state.get_db.calls + state.get_db2.calls;

  return (
    <Card
      title="Dependency injection: how Depends() is resolved"
      params={params}
      caption="Press Play to watch FastAPI solve the dependency graph for one request: leaves first, the endpoint last, then the code after yield runs on the way out. Notice get_db is needed twice but called once. Then tick use_cache=False to get two sessions, or missing token to see the chain stop at a 401."
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" className="accent-brand-500" checked={noCache} onChange={toggle(setNoCache)} />
          <span className="font-mono">use_cache=False</span>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" className="accent-rose-500" checked={missing} onChange={toggle(setMissing)} />
          missing token
        </label>
        <span className="ml-auto">
          <Stat label="request" value={`#${reqNo}`} />
        </span>
      </div>
      <svg viewBox="0 0 520 262" className="mt-3 h-auto w-full select-none">
        <defs>
          <Arrow id={`${id}a`} color={C.ink600} />
          <Arrow id={`${id}l`} color={C.amber} />
          <Arrow id={`${id}c`} color={C.sky} />
        </defs>
        {edgeList.map(([f, t]) => {
          const a = DG_NODES[f], b = DG_NODES[t];
          const key = `${f}>${t}`;
          const on = key === activeEdge;
          const cached = on && cur.k === "cached";
          const x1 = a.x, y1 = a.y + DG_H / 2, x2 = b.x, y2 = b.y - DG_H / 2 - 2;
          return (
            <g key={key}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? (cached ? C.sky : C.amber) : C.ink600} strokeWidth={on ? 2.2 : 1.3} strokeDasharray={cached ? "5 4" : undefined} markerEnd={`url(#${id}${on ? (cached ? "c" : "l") : "a"})`} style={{ transition: "stroke 0.3s" }} />
              {cached && (
                <text x={(x1 + x2) / 2 + 8} y={(y1 + y2) / 2} fontSize="9.5" fill={C.sky} fontWeight="600">cache hit</text>
              )}
            </g>
          );
        })}
        {nodes.map(([k, n]) => {
          const s = state[k];
          const look = DG_LOOK[s.st] || DG_LOOK.idle;
          const isCur = cur && cur.n === k;
          return (
            <g key={k} style={{ transition: "opacity 0.3s" }} opacity={s.st === "skipped" ? 0.5 : 1}>
              {isCur && <rect x={n.x - n.w / 2 - 3} y={n.y - DG_H / 2 - 3} width={n.w + 6} height={DG_H + 6} rx="9" fill="none" stroke={look.stroke} strokeOpacity="0.45" strokeWidth="3" />}
              <rect x={n.x - n.w / 2} y={n.y - DG_H / 2} width={n.w} height={DG_H} rx="7" fill={look.fill} stroke={look.stroke} strokeWidth={isCur ? 1.8 : 1.1} style={{ transition: "fill 0.3s, stroke 0.3s" }} />
              <text x={n.x} y={n.y - 3} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily={MONO} fill={look.text}>{n.label || k}</text>
              <text x={n.x} y={n.y + 11} textAnchor="middle" fontSize="9" fill={s.note ? look.text : C.dim} opacity={s.note ? 0.9 : 1}>{s.note || n.sub}</text>
              {s.calls > 0 && (
                <g transform={`translate(${n.x + n.w / 2 - 2} ${n.y - DG_H / 2 + 1})`}>
                  <circle r="8" fill={C.ink950} stroke={look.stroke} />
                  <text y="3" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={look.text} fontFamily={MONO}>{`×${s.calls}`}</text>
                </g>
              )}
            </g>
          );
        })}
        <text x="514" y="14" textAnchor="end" fontSize="9" fill={C.dim}>A → B: A depends on B</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {["resolving", "done", "open", "closed", "error"].map((k) => <Legend key={k} color={DG_LOOK[k].stroke} label={DG_LOOK[k].label} />)}
      </div>
      <Row>
        <Button primary onClick={play}>{playing ? "Pause" : done ? "Next request" : "Play"}</Button>
        <Button
          onClick={() => {
            setPlaying(false);
            setStepI((i) => Math.min(last, i + 1));
          }}
          disabled={done}
        >
          Step
        </Button>
        <Button
          onClick={() => {
            restart();
            setReqNo(1);
          }}
        >
          Reset
        </Button>
        <span className="ml-auto flex flex-wrap gap-2">
          <Stat label="get_db calls" value={dbCalls} color={dbCalls > 1 ? "text-amber-300" : "text-sky-300"} />
          <Stat label="response" value={done ? status : "…"} color={done ? statusTone(status) : "text-slate-500"} />
        </span>
      </Row>
      <div className="mt-3 min-h-[56px] rounded-lg bg-ink-800 px-3 py-2 text-xs leading-relaxed text-slate-300">
        {cur ? cur.say : "FastAPI builds this graph from the function signatures when the app starts. On each request it walks it: dependencies first, your endpoint last."}
      </div>
      <div className="mt-3 min-w-0">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">call log</div>
        <ol ref={logRef} className="max-h-[190px] min-h-[64px] space-y-0.5 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[10.5px] leading-snug">
          {stepI < 0 && <li className="text-slate-500">Press Play or Step to send GET /users/me/orders.</li>}
          {events.slice(0, stepI + 1).map((e, i) => {
            const tone = e.k === "raise" || (e.k === "response" && e.status >= 400) ? "text-rose-300" : e.k === "teardown" ? "text-sky-300" : e.k === "cached" ? "text-sky-300" : e.k === "enter" ? "text-amber-200/80" : e.k === "response" ? "text-emerald-300" : "text-slate-200";
            return (
              <li key={i} className={`flex gap-1.5 rounded px-1 ${i === stepI ? "bg-brand-500/15" : ""}`}>
                <span className="w-4 shrink-0 text-right text-slate-600">{i + 1}</span>
                <span className={`${tone} break-words`}>{e.log}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <Code className="mt-3" label="deps.py" lines={DG_CODE(noCache)} marks={marks} />
    </Card>
  );
}

export const WIDGETS_E = {
  "request-lifecycle": RequestLifecycle,
  "event-loop": EventLoop,
  "pydantic-validator": PydanticValidator,
  "dependency-graph": DependencyGraph,
};
