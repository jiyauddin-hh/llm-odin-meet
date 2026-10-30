"use client";

// Interactive Go & Gin teaching widgets (set G). Each widget is rendered from a
// ```diagram fenced block in a lesson and receives optional JSON `params`.
// Everything is plain React + inline SVG. Nothing touches the network: requests
// are simulated in memory, every interleaving / schedule comes from a seeded
// PRNG or a fixed tick-based simulation, and the clock is fixed, so server and
// client renders match. Animations only start on the client.

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
/** The site's mono font has ligatures that turn Go's <- and <= into arrows; keep code literal. */
const NOLIG = { fontVariantLigatures: "none", fontFeatureSettings: '"calt" 0, "liga" 0' };

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
/** An integer param clamped to [lo, hi]. */
const int = (v, d, lo, hi) => clamp(Math.round(num(v, d)), lo, hi);
/** Lessons may pass anything as params (null, an array…): treat it as {}. */
const obj = (p) => (p && typeof p === "object" && !Array.isArray(p) ? p : {});
/** A param that must be one of `opts` (case-insensitive, with aliases), else the default. */
function oneOf(v, opts, d, aliases = {}) {
  const k = typeof v === "string" ? v.toLowerCase().trim() : "";
  const key = aliases[k] || k;
  return opts.includes(key) ? key : d;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** A unique id that is safe inside url(#...). */
function useSvgId() {
  return "g" + useId().replace(/[^a-zA-Z0-9]/g, "");
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
      // rAF timestamps can be slightly earlier than performance.now() taken in the effect: never pass a negative dt
      cb.current(clamp((now - last) / 1000, 0, 0.064));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}

/** Calls onTick() every `ms` milliseconds while `on` is true (cleared on unmount). */
function useInterval(on, ms, onTick) {
  const cb = useRef(onTick);
  cb.current = onTick;
  useEffect(() => {
    if (!on) return undefined;
    const h = setInterval(() => cb.current(), ms);
    return () => clearInterval(h);
  }, [on, ms]);
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
    <figure className="not-prose my-6 mx-auto max-w-[640px] rounded-xl border border-ink-700 bg-ink-900 p-4" style={NOLIG}>
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
function Choice({ options, value, onChange, tones = {}, mono }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map(([k, label]) => {
        const on = k === value;
        const t = tones[k];
        return (
          <button
            key={String(k)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(k)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${mono ? "font-mono" : ""} ${
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

/** Bigger number tile for headline results. */
function Tile({ label, value, sub, color = "text-slate-200" }) {
  return (
    <div className="min-w-0 rounded-lg bg-ink-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`truncate font-mono text-base font-semibold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{sub}</div>}
    </div>
  );
}

const Legend = ({ color, label, dashed }) => (
  <span className="flex items-center gap-1 text-[11px] text-slate-400">
    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${dashed ? "border border-dashed" : ""}`} style={dashed ? { borderColor: color } : { background: color }} />
    {label}
  </span>
);

/** Small on/off switch (a real checkbox underneath, so it is keyboard accessible). */
function Toggle({ label, on, onChange, disabled }) {
  return (
    <label className={`flex items-center gap-1.5 text-xs ${disabled ? "text-slate-600" : "text-slate-300"}`}>
      <input type="checkbox" className="accent-brand-500" checked={!!on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Small uppercase section label. */
const Label = ({ children, className = "" }) => <div className={`text-[10px] uppercase tracking-wider text-slate-500 ${className}`}>{children}</div>;

/** Monospace panel for raw HTTP, JSON and program output (wraps instead of scrolling the page). */
function Pre({ children, className = "" }) {
  return <pre style={NOLIG} className={`whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300 ${className}`}>{children}</pre>;
}

/** Arrowhead marker definition. */
function Arrow({ id, color }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  );
}

/* ---------- tiny Go highlighter for the code panels ---------- */

const GO_KW = new Set("func package import return if else for range go chan select case default defer var const type struct map interface break continue switch fallthrough goto".split(" "));
const GO_CONST = new Set(["nil", "true", "false", "iota"]);
const GO_BUILTIN = new Set(["make", "len", "cap", "append", "copy", "close", "panic", "recover", "new", "delete", "print", "println", "min", "max"]);
const GO_TYPES = new Set(["int", "int8", "int64", "uint", "string", "float64", "bool", "error", "any", "byte", "rune"]);
const GO_PKGS = new Set(["gin", "http", "context", "time", "sync", "fmt", "log", "strconv", "errors", "atomic", "os"]);
const GO_TOK = /(\/\/.*$)|("(?:\\.|[^"\\])*"|`[^`]*`|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

/** One line of Go → array of strings and coloured spans. */
function goLine(line) {
  const out = [];
  const re = new RegExp(GO_TOK.source, "g");
  let last = 0, m, prevFunc = false;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const t = m[0];
    let cls = null;
    if (m[1]) cls = "italic text-slate-500";
    else if (m[2]) cls = t[0] === "`" ? "text-amber-200" : "text-emerald-300";
    else if (m[3]) cls = "text-orange-300";
    else if (GO_KW.has(t)) cls = "text-fuchsia-300";
    else if (GO_CONST.has(t)) cls = "text-orange-300";
    else if (prevFunc) cls = "text-sky-300";
    else if (GO_BUILTIN.has(t)) cls = "text-sky-300";
    else if (GO_TYPES.has(t) || GO_PKGS.has(t)) cls = "text-teal-300";
    if (m[4]) prevFunc = t === "func" || t === "type";
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
  dim: "border-transparent opacity-40",
};

/** Go snippet; `marks` maps a line index to a highlight tone. */
function Code({ lines, marks = {}, label, className = "" }) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-lg border border-ink-700 bg-ink-950 ${className}`}>
      {label && <div className="border-b border-ink-700 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>}
      <pre className="overflow-x-auto py-1.5 font-mono text-[11px] leading-[1.6] text-slate-300" style={NOLIG}>
        <div className="min-w-max">
          {lines.map((ln, i) => (
            <div key={i} className={`whitespace-pre border-l-2 pl-2.5 pr-3 transition-colors duration-300 ${MARK[marks[i]] || "border-transparent"}`}>
              {ln ? goLine(ln) : " "}
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

/** HTTP status → reason phrase and colour by class. */
const REASONS = {
  200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently", 307: "Temporary Redirect", 400: "Bad Request", 401: "Unauthorized",
  403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 429: "Too Many Requests", 500: "Internal Server Error",
};
const statusTone = (s) => (s >= 500 ? "text-rose-300" : s >= 400 ? "text-amber-300" : s >= 300 ? "text-sky-300" : "text-emerald-300");
const statusColor = (s) => (s >= 500 ? C.rose : s >= 400 ? C.amber : s >= 300 ? C.sky : C.emerald);
function StatusPill({ code }) {
  return (
    <span className="rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold" style={{ color: statusColor(code), background: `${statusColor(code)}1f` }}>
      {code} {REASONS[code] || ""}
    </span>
  );
}

/** An HTTP message: start line, headers, blank line, body (JSON-coloured unless plain text). */
function HttpText({ text, plain }) {
  const [head, ...rest] = String(text).split("\n\n");
  const body = rest.join("\n\n");
  const hl = head.split("\n");
  const m = hl[0].match(/^HTTP\/1\.1 (\d{3})/);
  return (
    <>
      <div className={`font-semibold ${m ? statusTone(Number(m[1])) : "text-white"}`}>{hl[0]}</div>
      {hl.slice(1).map((h, i) => {
        const k = h.indexOf(":");
        return (
          <div key={i}>
            <span className="text-fuchsia-300">{k > 0 ? h.slice(0, k) : h}</span>
            {k > 0 && <span className="text-slate-300">{h.slice(k)}</span>}
          </div>
        );
      })}
      {body && <div className="mt-2">{plain ? body : jsonSpans(body)}</div>}
    </>
  );
}

/** Byte length of an ASCII/UTF-8 string (for Content-Length). */
function byteLen(s) {
  let n = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

const GIN_DATE = "Mon, 05 Jan 2026 09:00:00 GMT"; // fixed clock so SSR and client agree
const GIN_LOGTIME = "2026/01/05 - 09:00:00";

/** One line of gin.Logger() output (colours off). */
function ginLog(status, latency, method, path) {
  return `[GIN] ${GIN_LOGTIME} | ${status} | ${latency.padStart(13)} | ${"127.0.0.1".padStart(15)} | ${method.padEnd(7)} ${JSON.stringify(path)}`;
}

/* ---------- gin-lifecycle: one request through net/http and a gin.Engine ---------- */

// Drawn as an onion: net/http ⊃ Engine ⊃ (router) + Logger ⊃ Recovery ⊃ Auth ⊃ handler.
// The request travels down the left edge of every layer (code before c.Next())
// and the response climbs back up the right edge (code after c.Next()).
const GL_BOX = {
  server: { x: 4, y: 40, w: 332, h: 274 },
  engine: { x: 14, y: 62, w: 312, h: 244 },
  router: { x: 24, y: 86, w: 292, h: 24 },
  logger: { x: 24, y: 118, w: 292, h: 180 },
  recovery: { x: 38, y: 140, w: 264, h: 150 },
  auth: { x: 52, y: 162, w: 236, h: 120 },
  handler: { x: 66, y: 184, w: 208, h: 90 },
};
const GL_POS = {
  "client-in": [90, 17],
  server: [30, 51],
  engine: [30, 74],
  router: [40, 98],
  "logger-in": [40, 129],
  "recovery-in": [54, 151],
  "auth-in": [68, 173],
  bind: [84, 222],
  act: [256, 247],
  "auth-out": [272, 173],
  "recovery-out": [286, 151],
  "logger-out": [300, 129],
  "engine-out": [310, 74],
  "client-out": [250, 17],
};

const GL_SNIP = {
  main: [
    "func main() {",
    "    r := gin.Default()               // gin.New() + Logger() + Recovery()",
    "    api := r.Group(\"/\", AuthRequired()) // Auth only for this group",
    "    api.POST(\"/books\", createBook)",
    "    r.Run(\":8080\")                   // http.ListenAndServe(\":8080\", r)",
    "}",
    "",
    "// net/http: one goroutine per connection, then for each request:",
    "//     handler.ServeHTTP(w, req)     // handler is the *gin.Engine",
  ],
  engine: [
    "func (engine *Engine) ServeHTTP(w http.ResponseWriter, req *http.Request) {",
    "    c := engine.pool.Get().(*Context) // reuse a Context (sync.Pool)",
    "    c.writermem.reset(w)",
    "    c.Request = req",
    "    c.reset()",
    "",
    "    engine.handleHTTPRequest(c)",
    "",
    "    engine.pool.Put(c)               // c is recycled for the next request!",
    "}",
  ],
  router: [
    "// inside engine.handleHTTPRequest(c)",
    "t := engine.trees",
    "for i := range t {",
    "    if t[i].method != httpMethod { continue }",
    "    value := t[i].root.getValue(rPath, c.params, c.skippedNodes, unescape)",
    "    if value.handlers != nil {",
    "        c.handlers = value.handlers  // [Logger, Recovery, AuthRequired, createBook]",
    "        c.fullPath = value.fullPath",
    "        c.Next()",
    "        c.writermem.WriteHeaderNow()",
    "        return",
    "    }",
    "}",
    "c.handlers = engine.allNoRoute       // only the global middleware",
    "serveError(c, http.StatusNotFound, default404Body)",
  ],
  logger: [
    "func Logger() gin.HandlerFunc {     // simplified gin.Logger()",
    "    return func(c *gin.Context) {",
    "        start := time.Now()",
    "        c.Next()                     // run the rest of the chain",
    "        log.Printf(\"[GIN] %d | %v | %s %q\", c.Writer.Status(),",
    "            time.Since(start), c.Request.Method, c.Request.URL.Path)",
    "    }",
    "}",
  ],
  recovery: [
    "func Recovery() gin.HandlerFunc {   // simplified gin.Recovery()",
    "    return func(c *gin.Context) {",
    "        defer func() {",
    "            if err := recover(); err != nil {",
    "                log.Printf(\"panic recovered: %v\", err)",
    "                c.AbortWithStatus(http.StatusInternalServerError)",
    "            }",
    "        }()",
    "        c.Next()",
    "    }",
    "}",
  ],
  auth: [
    "func AuthRequired() gin.HandlerFunc {",
    "    return func(c *gin.Context) {",
    "        if c.GetHeader(\"Authorization\") != \"Bearer secret-token\" {",
    "            c.AbortWithStatusJSON(http.StatusUnauthorized,",
    "                gin.H{\"error\": \"unauthorized\"})",
    "            return",
    "        }",
    "        c.Set(\"user\", \"alice\")",
    "        c.Next()                     // nothing runs after this line",
    "    }",
    "}",
  ],
  handler: [
    "type Book struct {",
    "    ID     int     `json:\"id\"`",
    "    Title  string  `json:\"title\" binding:\"required\"`",
    "    Author string  `json:\"author\" binding:\"required\"`",
    "    Price  float64 `json:\"price\"`",
    "}",
    "",
    "func createBook(c *gin.Context) {",
    "    var book Book",
    "    if err := c.ShouldBindJSON(&book); err != nil {",
    "        c.JSON(http.StatusBadRequest, gin.H{\"error\": err.Error()})",
    "        return",
    "    }",
    "    book.ID = nextID()",
    "    c.JSON(http.StatusCreated, book)",
    "}",
  ],
  panic: [
    "var stock map[string]int             // declared, never made: nil map",
    "",
    "func createBook(c *gin.Context) {",
    "    var book Book",
    "    if err := c.ShouldBindJSON(&book); err != nil {",
    "        c.JSON(http.StatusBadRequest, gin.H{\"error\": err.Error()})",
    "        return",
    "    }",
    "    stock[book.Title]++              // panic: assignment to entry in nil map",
    "    book.ID = nextID()",
    "    c.JSON(http.StatusCreated, book)",
    "}",
  ],
};
const GL_FILE = { main: "main.go", engine: "gin/gin.go (v1.10)", router: "gin/gin.go: handleHTTPRequest", logger: "middleware.go", recovery: "middleware.go", auth: "middleware.go", handler: "handlers.go", panic: "handlers.go" };

const GL_BODY_OK = '{"title":"Dune","author":"Frank Herbert","price":9.99}';
const GL_SCN = {
  happy: {
    label: "Happy path",
    method: "POST", path: "/books", auth: true, body: GL_BODY_OK,
    status: 201, resBody: '{"id":3,"title":"Dune","author":"Frank Herbert","price":9.99}', latency: "183.2µs",
  },
  "not-found": {
    label: "404 no route",
    method: "POST", path: "/bookz", auth: true, body: GL_BODY_OK,
    status: 404, resBody: "404 page not found", plain: true, latency: "4.1µs",
  },
  "auth-fail": {
    label: "401 auth fails",
    method: "POST", path: "/books", auth: false, body: GL_BODY_OK,
    status: 401, resBody: '{"error":"unauthorized"}', latency: "12.6µs",
  },
  panic: {
    label: "panic → 500",
    method: "POST", path: "/books", auth: true, body: GL_BODY_OK,
    status: 500, resBody: "", latency: "1.204ms",
  },
  "bind-error": {
    label: "400 bind error",
    method: "POST", path: "/books", auth: true, body: '{"author":"Frank Herbert","price":9.99}',
    status: 400, resBody: '{"error":"Key: \'Book.Title\' Error:Field validation for \'Title\' failed on the \'required\' tag"}', latency: "61.7µs",
  },
};
const GL_KEYS = Object.keys(GL_SCN);

/** The ordered steps for a scenario: where the packet is, which box glows, what to say, which code to show. */
function glSteps(k) {
  const s = GL_SCN[k];
  const S = (at, box, say, snip, mark = [], tone = "brand", carry = "req") => ({ at, box, say, snip, mark, tone, carry });
  const start = [
    S("client-in", "client", `The client sends ${s.method} ${s.path}${s.auth ? " with a bearer token" : " without an Authorization header"} and a JSON body.`, "main", [3]),
    S("server", "server", "Go's net/http server accepted the TCP connection and runs one goroutine per connection. It parses the request line and headers into an *http.Request and calls the Handler you gave it: r.Run(\":8080\") is just http.ListenAndServe(\":8080\", r), and *gin.Engine implements http.Handler.", "main", [4, 7, 8]),
    S("engine", "engine", "Engine.ServeHTTP takes a *gin.Context from a sync.Pool (no allocation per request), resets it, wires in the ResponseWriter and *http.Request, and calls handleHTTPRequest. When the request is finished the Context goes back into the pool, which is why you must not keep c in a goroutine (use c.Copy()).", "engine", [1, 2, 3, 4, 6]),
  ];
  if (k === "not-found") {
    return [
      ...start,
      S("router", "router", "The router picks the radix tree for POST and walks it for /bookz. No node matches, so there is no handler chain. Gin falls back to engine.allNoRoute: only the global middleware from r.Use() / gin.Default() (Logger, Recovery). Auth was attached to the group, so it is not in that list.", "router", [1, 2, 3, 4, 13, 14], "rose"),
      S("logger-in", "logger", "serveError sets the status to 404 and calls c.Next(). Logger still runs: it records the start time and calls c.Next().", "logger", [2, 3]),
      S("recovery-in", "recovery", "Recovery installs its deferred recover() and calls c.Next(). There are no more handlers in the chain, so c.Next() returns straight away.", "recovery", [2, 8]),
      S("recovery-out", "recovery", "Recovery's function returns; its deferred func runs and recover() returns nil.", "recovery", [2, 3], "brand", "res"),
      S("logger-out", "logger", "Logger's code after c.Next() runs and logs status 404 (already set by serveError).", "logger", [4, 5], "brand", "res"),
      S("engine-out", "engine", "Back in serveError: nothing was written, so Gin writes the default body \"404 page not found\" as text/plain. (With r.HandleMethodNotAllowed = true, a path that exists for another method would get 405 instead.)", "router", [14], "amber", "res"),
      S("client-out", "client", "404 Not Found with the plain-text body. Register r.NoRoute(...) to return JSON instead.", "router", [13, 14], "amber", "res"),
    ];
  }
  const chainIn = [
    S("router", "router", `The router picks the radix tree for ${s.method} and finds /books. c.handlers becomes the full chain [Logger, Recovery, AuthRequired, createBook] (global middleware first, then the group's, then the handler), and handleHTTPRequest calls c.Next().`, "router", [1, 2, 3, 4, 5, 6, 7, 8]),
    S("logger-in", "logger", "Logger's code before c.Next() runs: it records start := time.Now(), then calls c.Next() to run everything inside it.", "logger", [2, 3]),
    S("recovery-in", "recovery", "Recovery defers a function that calls recover(), then calls c.Next(). Any panic further in will unwind to this defer.", "recovery", [2, 3, 8]),
  ];
  const out = (fromAuth) => [
    ...(fromAuth ? [S("auth-out", "auth", "c.Next() returns into AuthRequired. It has no code after c.Next(), so it just returns.", "auth", [8], "brand", "res")] : []),
    S("recovery-out", "recovery", k === "panic" ? "" : "Recovery's c.Next() returns normally. Its deferred func runs, recover() returns nil, nothing to do.", "recovery", [2, 3], "brand", "res"),
    S("logger-out", "logger", `Logger's code after c.Next() runs on the way out: it measures time.Since(start) and logs status ${s.status}.${k === "auth-fail" ? " The handler never ran, but this after-Next code still does." : ""}`, "logger", [4, 5], "brand", "res"),
    S("engine-out", "engine", "handleHTTPRequest calls WriteHeaderNow (a no-op if the response was already written), returns, and the Context goes back to the pool. net/http flushes the response and keeps the connection open for the next request.", "engine", [6, 8], "brand", "res"),
    S("client-out", "client", { happy: "201 Created with the new book as JSON.", "auth-fail": "401 Unauthorized with {\"error\":\"unauthorized\"}.", panic: "500 Internal Server Error with an empty body. The server stays up and the next request is served normally.", "bind-error": "400 Bad Request with the validator's message." }[k], "main", [], "brand", "res"),
  ];
  if (k === "auth-fail") {
    return [
      ...start,
      ...chainIn,
      S("auth-in", "auth", "No valid Authorization header, so AuthRequired calls c.AbortWithStatusJSON(401, …) and returns. Abort sets c.index past the end of the chain, so createBook will never run. The JSON body is written now. Note: Abort does not stop the current function; that is what the return is for.", "auth", [2, 3, 4, 5], "rose"),
      ...out(false).map((x) => (x.at === "recovery-out" ? { ...x, say: "Recovery's c.Next() returns (the chain was aborted). Its deferred recover() finds no panic." } : x)),
    ];
  }
  const authOk = S("auth-in", "auth", "AuthRequired finds \"Bearer secret-token\", stores the user with c.Set(\"user\", \"alice\") for later handlers (c.GetString(\"user\")), and calls c.Next().", "auth", [2, 7, 8]);
  if (k === "bind-error") {
    return [
      ...start, ...chainIn, authOk,
      S("bind", "handler", "c.ShouldBindJSON(&book) decodes the JSON into Book and then runs the validator on the binding tags. \"title\" is missing, so Title is \"\" and fails binding:\"required\". The error message: Key: 'Book.Title' Error:Field validation for 'Title' failed on the 'required' tag.", "handler", [2, 9], "rose"),
      S("act", "handler", "The handler answers 400 itself with c.JSON(http.StatusBadRequest, gin.H{\"error\": err.Error()}) and returns. (c.BindJSON would also abort with 400, but as text/plain and with a warning; ShouldBind* lets you shape the error.)", "handler", [10, 11], "amber", "res"),
      ...out(true),
    ];
  }
  if (k === "panic") {
    return [
      ...start, ...chainIn, authOk,
      S("bind", "handler", "ShouldBindJSON succeeds: title and author are present.", "panic", [3, 4]),
      S("act", "handler", "stock is a nil map, and writing to a nil map panics: \"assignment to entry in nil map\". The handler stops right here and the panic starts unwinding the call stack.", "panic", [0, 8], "rose", "panic"),
      S("auth-out", "auth", "The panic unwinds through AuthRequired's c.Next() call. Code after c.Next() in any middleware between the panic and Recovery would be skipped.", "auth", [8], "rose", "panic"),
      S("recovery-out", "recovery", "Recovery's deferred func runs during unwinding, recover() returns the panic value, the stack trace is logged, and c.AbortWithStatus(500) sets the status. The panic stops here, so the server keeps running.", "recovery", [2, 3, 4, 5], "rose", "res"),
      ...out(false).slice(1),
    ];
  }
  return [
    ...start, ...chainIn, authOk,
    S("bind", "handler", "c.ShouldBindJSON(&book) decodes the JSON body into the struct (keys matched by the json tags) and validates the binding:\"required\" tags. Everything is present, so err is nil.", "handler", [1, 2, 3, 4, 9]),
    S("act", "handler", "c.JSON(http.StatusCreated, book) sets Content-Type: application/json; charset=utf-8, writes the 201 status and the encoded struct. Once the body is written, headers set later (even in middleware after c.Next()) are ignored.", "handler", [13, 14], "emerald", "res"),
    ...out(true),
  ];
}

function glRequest(s) {
  return `${s.method} ${s.path} HTTP/1.1\nHost: localhost:8080${s.auth ? "\nAuthorization: Bearer secret-token" : ""}\nContent-Type: application/json\nContent-Length: ${byteLen(s.body)}\n\n${s.body}`;
}
function glResponse(s) {
  const hs = [];
  if (s.resBody) hs.push(`Content-Type: ${s.plain ? "text/plain" : "application/json; charset=utf-8"}`);
  hs.push(`Date: ${GIN_DATE}`, `Content-Length: ${byteLen(s.resBody)}`);
  return `HTTP/1.1 ${s.status} ${REASONS[s.status]}\n${hs.join("\n")}${s.resBody ? `\n\n${s.resBody}` : ""}`;
}

export function GinLifecycle({ params = {} }) {
  const prm = obj(params);
  const [scn, setScn] = useState(() =>
    oneOf(prm.scenario, GL_KEYS, "happy", { ok: "happy", "200": "happy", "201": "happy", notfound: "not-found", "404": "not-found", auth: "auth-fail", "401": "auth-fail", "500": "panic", bind: "bind-error", "400": "bind-error", "bind-fail": "bind-error" }),
  );
  const [playing, setPlaying] = useState(false);
  const force = useForce();
  const st = useRef({ at: 0, p: 0, moving: false, dwell: 0 });
  const S = st.current;
  const id = useSvgId();
  const sc = GL_SCN[scn];
  const steps = useMemo(() => glSteps(scn), [scn]);
  const last = steps.length - 1;

  useLoop(playing || S.moving, (dt) => {
    const s = st.current;
    if (s.moving) {
      s.p += dt / 0.55;
      if (s.p >= 1) {
        s.at = Math.min(last, s.at + 1);
        s.moving = false;
        s.p = 0;
        s.dwell = 0;
      }
    } else if (playing) {
      s.dwell += dt;
      if (s.at >= last) setPlaying(false);
      else if (s.dwell >= 1.9) s.moving = true;
    }
    force();
  });

  const fresh = () => ({ at: 0, p: 0, moving: false, dwell: 0 });
  const reset = () => {
    st.current = fresh();
    setPlaying(false);
    force();
  };
  const step = (dir = 1) => {
    const s = st.current;
    if (dir < 0) {
      s.at = Math.max(0, s.at - (s.moving ? 0 : 1));
      s.moving = false;
      s.p = 0;
    } else if (s.moving) {
      s.at = Math.min(last, s.at + 1);
      s.moving = false;
      s.p = 0;
    } else if (s.at < last) s.moving = true;
    setPlaying(false);
    force();
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (st.current.at >= last) st.current = fresh();
    st.current.dwell = 1.5;
    setPlaying(true);
    force();
  };
  const pick = (k) => {
    setScn(k);
    st.current = fresh();
    setPlaying(false);
    force();
  };

  const at = clamp(S.at, 0, last);
  const cur = steps[at];
  const nxt = steps[Math.min(last, at + 1)];
  const done = at === last && !S.moving;
  const [ax, ay] = GL_POS[cur.at];
  const [bx, by] = GL_POS[nxt.at];
  const e = S.moving ? ease(clamp(S.p, 0, 1)) : 0;
  const px = lerp(ax, bx, e), py = lerp(ay, by, e);
  const carry = S.moving && e > 0.5 ? nxt.carry : cur.carry;
  const pktColor = carry === "panic" ? C.rose : carry === "res" ? statusColor(sc.status) : C.sky;
  const pktLabel = carry === "panic" ? "panic" : carry === "res" ? String(sc.status) : sc.method;

  // Which layers this scenario reaches at all (others are drawn faded).
  const reached = new Set(steps.map((x) => x.box));
  const visitedBoxes = new Set(steps.slice(0, at + 1).map((x) => x.box));
  const failBox = steps.find((x) => x.tone === "rose")?.box;
  const failIdx = steps.findIndex((x) => x.tone === "rose");

  const pts = steps.map((x) => GL_POS[x.at]);
  const handlerLines =
    scn === "panic" ? ["createBook(c)", "c.ShouldBindJSON(&book)", "stock[book.Title]++"] : scn === "bind-error" ? ["createBook(c)", "c.ShouldBindJSON(&book)", "c.JSON(400, gin.H{…})"] : ["createBook(c)", "c.ShouldBindJSON(&book)", "c.JSON(201, book)"];
  const layerLabel = { logger: "Logger()", recovery: "Recovery()", auth: "AuthRequired()" };

  const logLines = [];
  const loggerOutIdx = steps.findIndex((x) => x.at === "logger-out");
  if (scn === "panic" && at >= steps.findIndex((x) => x.at === "recovery-out")) {
    logLines.push(`[Recovery] ${GIN_LOGTIME} panic recovered:\nassignment to entry in nil map\ngoroutine 34 [running]: …`);
  }
  if (at >= loggerOutIdx) logLines.push(ginLog(sc.status, sc.latency, sc.method, sc.path));

  return (
    <Card
      title="The life of a Gin request"
      params={params}
      caption="Press Play (or Step) to follow one request through net/http, the gin.Engine, the router and the middleware chain. Then switch scenario: a missing route only runs the global middleware (404), a failed AuthRequired aborts before the handler but Logger still logs (401), a panic is caught by Recovery (500), and a bad body is rejected by ShouldBindJSON (400)."
    >
      <Choice options={GL_KEYS.map((k) => [k, GL_SCN[k].label])} value={scn} onChange={pick} tones={{ panic: "rose" }} />
      <svg viewBox="0 0 340 318" className="mt-3 h-auto w-full select-none" role="img" aria-label={`Gin request pipeline, step ${at + 1} of ${steps.length}`}>
        <defs>
          <filter id={`${id}g`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {/* client */}
        {(() => {
          const on = cur.box === "client";
          return (
            <g>
              <rect x="120" y="4" width="100" height="26" rx="7" fill={on ? "#0c2a3d" : C.ink800} stroke={on ? C.sky : C.ink600} strokeWidth={on ? 1.6 : 1} />
              <text x="170" y="15" textAnchor="middle" fontSize="10" fontWeight="600" fill="#e2e8f0">Client</text>
              <text x="170" y="25" textAnchor="middle" fontSize="7.5" fill={C.dim} fontFamily={MONO}>curl :8080</text>
              <text x="62" y="14" textAnchor="middle" fontSize="7.5" fill={C.dim}>request ↓</text>
              <text x="282" y="14" textAnchor="middle" fontSize="7.5" fill={C.dim}>↑ response</text>
            </g>
          );
        })()}
        {/* nested boxes */}
        {["server", "engine", "router", "logger", "recovery", "auth", "handler"].map((b) => {
          const r = GL_BOX[b];
          const isCur = cur.box === b && !S.moving;
          const hit = visitedBoxes.has(b);
          const fail = b === failBox && at >= failIdx;
          const faded = !reached.has(b);
          const stroke = fail ? C.rose : isCur ? C.sky : hit ? "#475569" : C.ink600;
          const fill = b === "router" || b === "handler" ? (fail ? "#3b1622" : isCur ? "#0c2a3d" : C.ink800) : isCur ? "#0c2a3d55" : b === "server" ? C.ink950 : "#161a2866";
          return (
            <g key={b} opacity={faded ? 0.35 : 1} style={{ transition: "opacity 0.3s" }}>
              {isCur && (b === "router" || b === "handler") && <rect x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} rx="9" fill={fail ? C.rose : C.sky} opacity="0.3" filter={`url(#${id}g)`} />}
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="8" fill={fill} stroke={stroke} strokeWidth={isCur || fail ? 1.6 : 1} strokeDasharray={b === "server" ? "5 3" : undefined} style={{ transition: "stroke 0.3s, fill 0.3s" }} />
            </g>
          );
        })}
        {/* the route of this scenario */}
        {pts.slice(0, -1).map(([x1, y1], i) => {
          const [x2, y2] = pts[i + 1];
          const lit = i < at || (i === at && S.moving);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lit ? C.sky : C.axis} strokeWidth={lit ? 1.2 : 1} strokeDasharray={lit ? undefined : "3 3"} opacity={lit ? 0.45 : 0.2} />;
        })}
        <text x="170" y="54" textAnchor="middle" fontSize="8.5" fill={C.text}><tspan fontWeight="600" fill="#e2e8f0">net/http</tspan> Server · goroutine per connection</text>
        <text x="170" y="77" textAnchor="middle" fontSize="8.5" fill={C.text}><tspan fontWeight="600" fill="#e2e8f0" fontFamily={MONO}>Engine.ServeHTTP</tspan> · Context from sync.Pool</text>
        <text x="170" y="101" textAnchor="middle" fontSize="8.5" fill={failBox === "router" && at >= failIdx ? C.rose : C.text} fontFamily={MONO}>
          {failBox === "router" && at >= failIdx ? `trees[POST] · ${sc.path} → no match` : `router · trees[${sc.method}] → ${sc.path}`}
        </text>
        {["logger", "recovery", "auth"].map((b) => {
          const r = GL_BOX[b];
          return (
            <g key={b} opacity={reached.has(b) ? 1 : 0.35}>
              <text x="170" y={r.y + 14} textAnchor="middle" fontSize="9" fontWeight="600" fill={b === failBox && at >= failIdx ? C.rose : "#e2e8f0"} fontFamily={MONO}>{layerLabel[b]}</text>
            </g>
          );
        })}
        <g opacity={reached.has("handler") ? 1 : 0.35}>
          {handlerLines.map((t, i) => {
            const hot = i > 0 && cur.box === "handler" && ((i === 1 && cur.at === "bind") || (i === 2 && cur.at === "act"));
            const y = [201, 225, 250][i];
            return (
              <g key={i}>
                {i > 0 && <rect x="96" y={y - 10} width="148" height="15" rx="4" fill={hot ? (cur.tone === "rose" ? "#3b1622" : "#0c2a3d") : "transparent"} />}
                <text x={170} y={y} textAnchor="middle" fontSize={i === 0 ? 9 : 8.5} fontWeight={i === 0 ? 600 : 400} fill={i === 0 ? "#e2e8f0" : hot && cur.tone === "rose" ? C.rose : C.text} fontFamily={MONO}>{t}</text>
              </g>
            );
          })}
        </g>
        <text x="16" y="310" fontSize="7.5" fill={C.dim}>↓ before c.Next()</text>
        <text x="324" y="310" textAnchor="end" fontSize="7.5" fill={C.dim}>after c.Next() ↑</text>
        {/* the packet */}
        <g transform={`translate(${px} ${py})`}>
          <rect x="-15" y="-6.5" width="30" height="13" rx="6.5" fill={pktColor} stroke={C.ink950} strokeWidth="1.5" />
          <text y="2.8" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={C.ink950} fontFamily={MONO}>{pktLabel}</text>
        </g>
      </svg>
      <div className="mt-2 min-h-[76px] rounded-lg bg-ink-800 px-3 py-2" aria-live="polite">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">
          Step {at + 1} / {steps.length} · <span className={cur.tone === "rose" ? "text-rose-300" : cur.tone === "amber" ? "text-amber-300" : "text-sky-300"}>{{ client: "Client", server: "net/http", engine: "gin.Engine", router: "Router", logger: "Logger", recovery: "Recovery", auth: "AuthRequired", handler: "Handler" }[cur.box]}</span>
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-slate-300">{cur.say}</div>
      </div>
      <Row>
        <Button primary onClick={play}>{playing ? "Pause" : done ? "Replay" : "Play"}</Button>
        <Button onClick={() => step(-1)} disabled={at === 0 && !S.moving} aria-label="Back one step">◀ Back</Button>
        <Button onClick={() => step(1)} disabled={done} aria-label="Step forward">Step ▶</Button>
        <Button onClick={reset}>Reset</Button>
        <span className="ml-auto">
          <Stat label="status" value={done ? sc.status : "…"} color={done ? statusTone(sc.status) : "text-slate-500"} />
        </span>
      </Row>
      <Code className="mt-3" label={GL_FILE[cur.snip]} lines={GL_SNIP[cur.snip]} marks={Object.fromEntries(cur.mark.map((i) => [i, cur.tone === "amber" ? "amber" : cur.tone]))} />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">HTTP request</Label>
          <Pre className="text-[10.5px]"><HttpText text={glRequest(sc)} /></Pre>
        </div>
        <div className="min-w-0">
          <Label className="mb-1">HTTP response</Label>
          <Pre className={`text-[10.5px] transition-opacity duration-500 ${done ? "" : "opacity-50"}`}>
            {done ? <HttpText text={glResponse(sc)} plain={sc.plain} /> : <span className="text-slate-500">waiting for the response…</span>}
          </Pre>
        </div>
      </div>
      <Label className="mb-1 mt-2">server log (stdout)</Label>
      <Pre className="min-h-[2.2rem] overflow-x-auto text-[10px]">{logLines.length ? logLines.join("\n") : <span className="text-slate-500">nothing logged yet</span>}</Pre>
    </Card>
  );
}

/* ---------- middleware-chain: the onion model, c.Next() and c.Abort() ---------- */

const MC_DEFAULT = ["Logger", "Auth", "Timer"];

/** Sanitised middleware names from params (Go identifiers, unique, 1–5 of them). */
function mcNames(raw) {
  if (!Array.isArray(raw)) return MC_DEFAULT;
  const out = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const n = v.trim().replace(/\(\)$/, "");
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,15}$/.test(n) || out.some((o) => o.toLowerCase() === n.toLowerCase())) continue;
    out.push(n);
    if (out.length === 5) break;
  }
  return out.length ? out : MC_DEFAULT;
}

/** What a middleware "does" before/after c.Next(), and how it aborts, guessed from its name. */
function mcKind(m) {
  if (/auth|jwt|token|login/i.test(m))
    return { status: 401, err: "unauthorized", cond: 'c.GetHeader("Authorization") == ""', before: [], after: [] };
  if (/rate|limit|throttle/i.test(m))
    return { status: 429, err: "too many requests", cond: "!limiter.Allow()", before: [], after: [] };
  if (/log/i.test(m))
    return { status: 403, err: "forbidden", cond: "blocked(c)", before: ["start := time.Now()"], after: ['log.Printf("%d in %v", c.Writer.Status(), time.Since(start))'] };
  if (/time|timer|latency|metric/i.test(m))
    return { status: 403, err: "forbidden", cond: "blocked(c)", before: ["start := time.Now()"], after: ['log.Println("took", time.Since(start))'] };
  if (/cors/i.test(m))
    return { status: 403, err: "origin not allowed", cond: "!allowed(c.GetHeader(\"Origin\"))", before: ['c.Header("Access-Control-Allow-Origin", "*")'], after: [] };
  if (/recover/i.test(m))
    return { status: 500, err: "internal error", cond: "broken(c)", before: ["defer func() { recover() }()"], after: [] };
  return { status: 403, err: "forbidden", cond: "blocked(c)", before: [], after: [] };
}

/**
 * Runs the chain exactly like gin.Context does: c.index starts at -1, c.Next()
 * increments it and calls handlers[index] while index < len(handlers), and
 * c.Abort() sets index to abortIndex (63) so the loop stops.
 */
function mcRun(mws, aborts, ret) {
  const ev = [];
  const n = mws.length + 1;
  let index = -1;
  let status = 200;
  let wrote = false;
  const call = (i) => {
    if (i === mws.length) {
      ev.push({ who: "handler", depth: i, kind: "handler", text: 'handler: c.JSON(200, gin.H{"message": "pong"})' });
      status = 200;
      wrote = true;
      return;
    }
    const m = mws[i];
    const k = mcKind(m);
    ev.push({ who: m, depth: i, kind: "before", text: `${m}: before Next` });
    if (aborts.has(m)) {
      ev.push({ who: m, depth: i, kind: "abort", text: `${m}: c.AbortWithStatusJSON(${k.status}, …)` });
      if (!wrote) {
        status = k.status;
        wrote = true;
      }
      index = 63; // abortIndex
      if (ret) {
        ev.push({ who: m, depth: i, kind: "return", text: `${m}: return (its after-Next code is skipped)` });
        return;
      }
    }
    next(m, i);
    ev.push({ who: m, depth: i, kind: "after", text: `${m}: after Next` });
  };
  const next = (m, i) => {
    index++;
    if (index >= n && m) ev.push({ who: m, depth: i, kind: "noop", text: `${m}: c.Next() returns at once (chain aborted)` });
    while (index < n) {
      call(index);
      index++;
    }
  };
  next(null, -1);
  const ran = new Set(ev.map((e) => e.who));
  return { ev, status, skipped: [...mws, "handler"].filter((w) => !ran.has(w)) };
}

function mcCode(m, aborts, ret) {
  const k = mcKind(m);
  const ab = aborts.has(m);
  const L = [];
  const sec = { before: [], abort: [], next: [], after: [], return: [] };
  const push = (s, line) => {
    if (s) sec[s].push(L.length);
    L.push(line);
  };
  push(null, `func ${m}() gin.HandlerFunc {`);
  push(null, "    return func(c *gin.Context) {");
  push(null, "        // ── before c.Next(): runs on the way in ──");
  push("before", `        fmt.Println("${m}: before Next")`);
  k.before.forEach((b) => push("before", `        ${b}`));
  if (ab) {
    push("abort", `        if ${k.cond} {`);
    push("abort", `            c.AbortWithStatusJSON(${k.status}, gin.H{"error": "${k.err}"})`);
    if (ret) push("return", "            return               // stop this function too");
    else push("abort", "            // no return: this function keeps going!");
    push("abort", "        }");
  }
  push("next", "        c.Next()                 // run the rest of the chain");
  push(null, "        // ── after c.Next(): runs on the way out ──");
  push("after", `        fmt.Println("${m}: after Next")`);
  k.after.forEach((a) => push("after", `        ${a}`));
  push(null, "    }");
  push(null, "}");
  return { lines: L, sec };
}

export function MiddlewareChain({ params = {} }) {
  const prm = obj(params);
  const mws = useMemo(() => mcNames(prm.middlewares), [JSON.stringify(prm.middlewares ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const initAbort = typeof prm.abortAt === "string" ? mws.find((m) => m.toLowerCase() === prm.abortAt.trim().toLowerCase()) : null;
  const [aborts, setAborts] = useState(() => new Set(initAbort ? [initAbort] : []));
  const [ret, setRet] = useState(true);
  const [sel, setSel] = useState(initAbort || mws[0]);
  const [shown, setShown] = useState(0); // how many log lines are revealed
  const [playing, setPlaying] = useState(false);
  const run = useMemo(() => mcRun(mws, aborts, ret), [mws, aborts, ret]);
  const total = run.ev.length;

  useInterval(playing, 650, () => {
    setShown((s) => {
      if (s >= total) {
        setPlaying(false);
        return s;
      }
      return s + 1;
    });
  });
  useEffect(() => {
    if (playing && shown >= total) setPlaying(false);
  }, [playing, shown, total]);

  const restart = () => {
    setShown(0);
    setPlaying(false);
  };
  const toggleAbort = (m, on) => {
    setAborts((a) => {
      const b = new Set(a);
      if (on) b.add(m);
      else b.delete(m);
      return b;
    });
    setSel(m);
    restart();
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (shown >= total) setShown(0);
    setPlaying(true);
  };

  const cur = shown > 0 ? run.ev[shown - 1] : null;
  const done = shown >= total;
  const n = mws.length;
  const H = 12 + n * 30 + 44;
  const layer = (i) => ({ x: 6 + i * 16, y: 6 + i * 24, w: 328 - 2 * i * 16, h: H - 12 - i * 30 });
  const ranSoFar = new Set(run.ev.slice(0, shown).map((e) => e.who));
  const skipped = new Set(run.skipped);
  const code = mcCode(sel, aborts, ret);
  const curInSel = cur && cur.who === sel ? cur.kind : null;
  const marks = {};
  if (curInSel) {
    const k = curInSel === "noop" ? "next" : curInSel;
    (code.sec[k] || []).forEach((i) => (marks[i] = k === "abort" || k === "return" ? "rose" : k === "after" ? "emerald" : "sky"));
    if (curInSel === "before") code.sec.next.forEach((i) => (marks[i] = "sky"));
  }
  const firstAbort = mws.find((m) => aborts.has(m) && !skipped.has(m));

  // Packet position: left lane on the way in, right lane on the way out.
  let dot = null;
  if (cur) {
    const L = layer(cur.depth);
    if (cur.kind === "handler") dot = { x: 170, y: L.y + 26, c: C.emerald };
    else if (cur.kind === "after") dot = { x: L.x + L.w - 12, y: L.y + 13, c: C.emerald };
    else if (cur.kind === "abort" || cur.kind === "return" || cur.kind === "noop") dot = { x: L.x + 12, y: L.y + 13, c: C.rose };
    else dot = { x: L.x + 12, y: L.y + 13, c: C.sky };
  }

  return (
    <Card
      title="Middleware is an onion: c.Next() and c.Abort()"
      params={params}
      caption="Press Run to send one request through r.Use(…) middleware. Code before c.Next() runs on the way in (outer → inner), code after it runs on the way out (inner → outer). Tick c.Abort() on a middleware: the handlers inside it never run, but the code after c.Next() in the layers outside it still does. Untick “return after Abort” to see that Abort does not stop the current function."
    >
      <svg viewBox={`0 0 340 ${H}`} className="h-auto w-full select-none" role="img" aria-label="Nested middleware layers">
        {mws.map((m, i) => {
          const L = layer(i);
          const isCur = cur && cur.who === m;
          const sk = skipped.has(m);
          const ab = aborts.has(m) && !sk;
          const ran = ranSoFar.has(m);
          return (
            <g key={m} opacity={sk && done ? 0.35 : 1} style={{ transition: "opacity 0.3s" }}>
              <rect x={L.x} y={L.y} width={L.w} height={L.h} rx="9" fill={i % 2 ? "#161a2899" : "#0d0f1acc"} stroke={isCur ? (cur.kind === "after" ? C.emerald : ab ? C.rose : C.sky) : ab ? `${C.rose}aa` : ran ? "#475569" : C.ink600} strokeWidth={isCur ? 1.8 : 1} strokeDasharray={ab ? "5 3" : undefined} style={{ transition: "stroke 0.3s" }} />
              <text x="170" y={L.y + 16} textAnchor="middle" fontSize="10" fontWeight="600" fill={ab ? C.rose : "#e2e8f0"} fontFamily={MONO}>
                {m}(){ab ? " · Abort()" : ""}
              </text>
              <text x={L.x + 22} y={L.y + 16} fontSize="8" fill={C.dim}>↓</text>
              <text x={L.x + L.w - 22} y={L.y + 16} textAnchor="end" fontSize="8" fill={C.dim}>↑</text>
            </g>
          );
        })}
        {(() => {
          const L = layer(n);
          const isCur = cur && cur.who === "handler";
          const sk = skipped.has("handler");
          return (
            <g opacity={sk && done ? 0.35 : 1}>
              <rect x={L.x} y={L.y} width={L.w} height={L.h} rx="8" fill={isCur ? "#0b2e24" : C.ink800} stroke={isCur ? C.emerald : sk ? C.ink600 : "#475569"} strokeWidth={isCur ? 1.8 : 1} />
              <text x="170" y={L.y + 17} textAnchor="middle" fontSize="10" fontWeight="600" fill="#e2e8f0" fontFamily={MONO}>handler</text>
              <text x="170" y={L.y + 30} textAnchor="middle" fontSize="8" fill={sk ? C.rose : C.dim} fontFamily={MONO}>{sk ? "never runs" : "c.JSON(200, …)"}</text>
            </g>
          );
        })()}
        {dot && (
          <circle cx={dot.x} cy={dot.y} r="5" fill={dot.c} stroke={C.ink950} strokeWidth="1.5" style={{ transition: "cx 0.35s, cy 0.35s" }} />
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3">
        <Legend color={C.sky} label="before c.Next() (left, going in)" />
        <Legend color={C.emerald} label="after c.Next() (right, coming out)" />
        <Legend color={C.rose} dashed label="calls c.Abort()" />
      </div>
      <Row>
        <span className="text-xs text-slate-400">c.Abort() in:</span>
        {mws.map((m) => (
          <Toggle key={m} label={<span className="font-mono">{m}</span>} on={aborts.has(m)} onChange={(v) => toggleAbort(m, v)} />
        ))}
        <span className="mx-1 hidden h-4 w-px bg-ink-600 sm:inline-block" />
        <Toggle label="return after Abort" on={ret} onChange={(v) => { setRet(v); restart(); }} disabled={aborts.size === 0} />
      </Row>
      <Row>
        <Button primary onClick={play}>{playing ? "Pause" : done ? "Run again" : shown ? "Resume" : "Run request"}</Button>
        <Button onClick={() => { setPlaying(false); setShown((s) => Math.min(total, s + 1)); }} disabled={done}>Step</Button>
        <Button onClick={() => { setPlaying(false); setShown(total); }} disabled={done}>Show all</Button>
        <Button onClick={restart}>Reset</Button>
        <span className="ml-auto">
          <Stat label="status" value={done ? run.status : "…"} color={done ? statusTone(run.status) : "text-slate-500"} />
        </span>
      </Row>
      <div className="mt-3 grid gap-2 sm:grid-cols-[3fr_2fr]">
        <div className="min-w-0">
          <Label className="mb-1">execution log (stdout)</Label>
          <ol className="min-h-[9rem] space-y-0.5 rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px]" aria-live="polite">
            {run.ev.slice(0, shown).map((e, i) => {
              const tone = e.kind === "handler" ? "text-emerald-300" : e.kind === "after" ? "text-teal-200" : e.kind === "before" ? "text-sky-300" : "text-rose-300";
              return (
                <li key={i} className={`flex gap-2 rounded px-1 ${i === shown - 1 ? "bg-ink-800" : ""}`}>
                  <span className="w-4 shrink-0 text-right text-slate-600">{i + 1}</span>
                  <span className={`${tone} break-all`}>{"  ".repeat(Math.min(e.depth, 5))}{e.text}</span>
                </li>
              );
            })}
            {shown === 0 && <li className="text-slate-500">Press “Run request”.</li>}
            {done && run.skipped.length > 0 && (
              <li className="mt-1 border-t border-ink-700 pt-1 text-slate-500">never ran: <span className="text-rose-300">{run.skipped.join(", ")}</span></li>
            )}
          </ol>
        </div>
        <div className="min-w-0">
          <Label className="mb-1">main.go</Label>
          <Pre className="text-[10.5px]">
            {`r := gin.New()\nr.Use(${mws.map((m) => `${m}()`).join(",\n      ")})\nr.GET("/ping", handler)`}
            {firstAbort ? <span className="text-slate-500">{`\n// ${firstAbort} aborts → ${mcKind(firstAbort).status} ${REASONS[mcKind(firstAbort).status]}`}</span> : null}
          </Pre>
        </div>
      </div>
      <div className="mb-1 mt-3 flex flex-wrap items-center gap-1">
        <Label className="mr-1">code of</Label>
        <Choice options={mws.map((m) => [m, m])} value={sel} onChange={setSel} mono />
      </div>
      <Code lines={code.lines} marks={marks} />
    </Card>
  );
}

/* ---------- router-tree: Gin's radix tree, insertion and lookup ---------- */

const RT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const RT_DEFAULT = ["GET /users", "GET /users/:id", "GET /users/:id/orders", "GET /static/*filepath", "POST /users"];

/** "/users/:id/orders" → static / param / catch-all tokens, or { error } like Gin's panics. */
function rtTokens(path) {
  const toks = [];
  let s = "";
  for (let i = 0; i < path.length; ) {
    const ch = path[i];
    if (ch === ":" || ch === "*") {
      let j = i + 1;
      while (j < path.length && path[j] !== "/") j++;
      const name = path.slice(i + 1, j);
      if (!name) return { error: `wildcards must be named with a non-empty name in path '${path}'` };
      if (/[:*]/.test(name)) return { error: `only one wildcard per path segment is allowed in '${path}'` };
      if (ch === "*") {
        if (j !== path.length) return { error: `catch-all routes are only allowed at the end of the path in '${path}'` };
        if (!s.endsWith("/")) return { error: `no / before catch-all in path '${path}'` };
        s = s.slice(0, -1);
        if (s) toks.push({ t: "s", v: s });
        toks.push({ t: "c", v: name });
        return { toks };
      }
      if (s) toks.push({ t: "s", v: s });
      s = "";
      toks.push({ t: "p", v: name });
      i = j;
      continue;
    }
    s += ch;
    i++;
  }
  if (s) toks.push({ t: "s", v: s });
  return { toks };
}

/** Insert one route into a (cloned) tree. Throws Gin-style messages on conflicts. */
function rtInsert(root, method, path, ctx) {
  const { toks, error } = rtTokens(path);
  if (error) throw new Error(error);
  const mk = (kind, label) => ({ id: ctx.id++, kind, label, children: [], route: null });
  let n = root;
  for (const tk of toks) {
    if (tk.t === "s") {
      let s = tk.v;
      while (s.length) {
        if (n.children.some((c) => c.kind === "c")) throw new Error(`'${path}' conflicts with the catch-all wildcard already registered here`);
        const child = n.children.find((c) => c.kind === "s" && c.label[0] === s[0]);
        if (!child) {
          const nn = mk("s", s);
          const w = n.children.findIndex((c) => c.kind !== "s");
          if (w < 0) n.children.push(nn);
          else n.children.splice(w, 0, nn); // wildcard child stays last, like Gin
          n = nn;
          s = "";
          break;
        }
        let l = 0;
        while (l < child.label.length && l < s.length && child.label[l] === s[l]) l++;
        if (l < child.label.length) {
          // split the edge: child keeps the common prefix, the rest moves one level down
          const tail = mk("s", child.label.slice(l));
          tail.children = child.children;
          tail.route = child.route;
          child.label = child.label.slice(0, l);
          child.children = [tail];
          child.route = null;
        }
        n = child;
        s = s.slice(l);
      }
    } else if (tk.t === "p") {
      if (n.children.some((c) => c.kind === "c")) throw new Error(`':${tk.v}' in '${path}' conflicts with an existing catch-all wildcard`);
      let p = n.children.find((c) => c.kind === "p");
      if (p && p.label !== `:${tk.v}`) throw new Error(`':${tk.v}' in new path '${path}' conflicts with existing wildcard '${p.label}'`);
      if (!p) {
        p = mk("p", `:${tk.v}`);
        n.children.push(p);
      }
      n = p;
    } else {
      if (n.children.length) throw new Error(`catch-all wildcard '*${tk.v}' in new path '${path}' conflicts with existing path segments`);
      const c = mk("c", `/*${tk.v}`);
      n.children.push(c);
      n = c;
    }
  }
  if (n.route) throw new Error(`handlers are already registered for path '${path}'`);
  n.route = `${method} ${path}`;
}

/** Build one tree per method from "METHOD /path" strings; bad routes become warnings. */
function rtBuild(raw) {
  const list = Array.isArray(raw) ? raw : RT_DEFAULT;
  const trees = {};
  const routes = [];
  const warnings = [];
  const ctx = { id: 1 };
  for (const r of list.slice(0, 14)) {
    if (typeof r !== "string") continue;
    const m = r.trim().match(/^([A-Za-z]+)\s+(\/\S*)$/);
    if (!m || !RT_METHODS.includes(m[1].toUpperCase())) {
      warnings.push(`skipped "${String(r).slice(0, 40)}": use "METHOD /path"`);
      continue;
    }
    const method = m[1].toUpperCase();
    const path = m[2].slice(0, 60);
    const tree = trees[method] || { id: ctx.id++, kind: "root", label: method, children: [], route: null };
    const clone = JSON.parse(JSON.stringify(tree));
    try {
      rtInsert(clone, method, path, ctx);
      trees[method] = clone;
      routes.push({ method, path });
    } catch (e) {
      warnings.push(`panic: ${e.message}`);
    }
  }
  if (!routes.length) return rtBuild(RT_DEFAULT);
  return { trees, routes, warnings };
}

/** Walk the tree like getValue: static children first, then :param, then *catchAll, backtracking on failure. */
function rtLookup(root, path) {
  const trace = [];
  const params = [];
  const stack = [];
  const visit = (n, rest) => {
    const r = step(n, rest);
    if (!r && stack[stack.length - 1] === n.id) stack.pop();
    return r;
  };
  const step = (n, rest) => {
    if (n.kind === "s") {
      if (!rest.startsWith(n.label)) {
        trace.push({ id: n.id, ok: false, note: `"${n.label}" does not match "${rest.slice(0, n.label.length) || "(end)"}"` });
        return null;
      }
      rest = rest.slice(n.label.length);
      stack.push(n.id);
      trace.push({ id: n.id, ok: true, note: `matched "${n.label}"${rest ? `, left: "${rest}"` : ""}` });
    } else if (n.kind === "p") {
      let j = rest.indexOf("/");
      if (j < 0) j = rest.length;
      const v = rest.slice(0, j);
      if (!v) {
        trace.push({ id: n.id, ok: false, note: `${n.label} needs a non-empty segment` });
        return null;
      }
      params.push([n.label.slice(1), v]);
      rest = rest.slice(j);
      stack.push(n.id);
      trace.push({ id: n.id, ok: true, note: `${n.label} = "${v}"${rest ? `, left: "${rest}"` : ""}` });
    } else if (n.kind === "c") {
      if (!rest.startsWith("/")) {
        trace.push({ id: n.id, ok: false, note: `${n.label} needs the path to continue with "/"` });
        return null;
      }
      params.push([n.label.slice(2), rest]);
      stack.push(n.id);
      trace.push({ id: n.id, ok: true, note: `${n.label.slice(1)} = "${rest}" (the rest of the path)` });
      rest = "";
    }
    if (rest === "" && n.kind !== "root") {
      if (n.route) return n;
      trace.push({ id: n.id, ok: false, note: "path ends here, but no handler is registered on this node" });
      return null;
    }
    const order = [...n.children.filter((c) => c.kind === "s" && c.label[0] === rest[0]), ...n.children.filter((c) => c.kind === "p"), ...n.children.filter((c) => c.kind === "c")];
    for (const c of order) {
      const saved = params.length;
      const r = visit(c, rest);
      if (r) return r;
      params.length = saved;
    }
    return null;
  };
  const hit = root ? visit(root, path) : null;
  return { hit, trace, params: hit ? params.slice() : [], onPath: hit ? stack.slice() : [] };
}

/** Full Gin answer for method + path: match, trailing-slash redirect, or 404. */
function rtResolve(trees, method, rawPath) {
  let path = String(rawPath || "").trim().split("?")[0] || "/";
  if (!path.startsWith("/")) path = "/" + path;
  const root = trees[method];
  const res = rtLookup(root, path);
  if (res.hit) return { ...res, path, status: 200, route: res.hit.route };
  if (root && path !== "/") {
    const alt = path.endsWith("/") ? path.slice(0, -1) : path + "/";
    if (rtLookup(root, alt).hit) return { ...res, path, status: method === "GET" ? 301 : 307, location: alt };
  }
  const others = Object.keys(trees).filter((m) => m !== method && rtLookup(trees[m], path).hit);
  return { ...res, path, status: 404, others, noTree: !root };
}

/** Flatten a tree into rows for the indented drawing. */
function rtRows(tree) {
  const rows = [];
  const walk = (n, depth, parentRow) => {
    const row = { n, depth, parentRow, i: rows.length };
    rows.push(row);
    n.children.forEach((c) => walk(c, depth + 1, row.i));
  };
  walk(tree, 0, -1);
  return rows;
}

const RT_KIND = {
  root: { stroke: C.brandL, text: "#e2e8f0", tag: "" },
  s: { stroke: "#475569", text: "#e2e8f0", tag: "" },
  p: { stroke: C.amber, text: "#fcd34d", tag: "param" },
  c: { stroke: C.fuchsia, text: "#f0abfc", tag: "catchAll" },
};

export function RouterTree({ params = {} }) {
  const prm = obj(params);
  const { trees, routes, warnings } = useMemo(() => rtBuild(prm.routes), [JSON.stringify(prm.routes ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const methods = Object.keys(trees);
  const firstParam = routes.find((r) => r.path.includes(":"));
  const firstCatch = routes.find((r) => r.path.includes("*"));
  const fill = (p, v1, v2) => p.replace(/:[^/]+/g, () => v1).replace(/\/\*.+$/, v2);
  const presets = useMemo(() => {
    const out = [];
    const add = (m, p) => !out.some((o) => o[0] === m && o[1] === p) && out.length < 7 && out.push([m, p]);
    if (firstParam) add(firstParam.method, fill(firstParam.path, "42", "/a/b"));
    routes.filter((r) => r.path.includes(":") && r !== firstParam).slice(0, 1).forEach((r) => add(r.method, fill(r.path, "42", "/a/b")));
    if (firstCatch) add(firstCatch.method, fill(firstCatch.path, "42", "/css/app.css"));
    const stat = routes.find((r) => !/[:*]/.test(r.path) && r.path !== "/");
    if (stat) add(stat.method, stat.path + "/");
    if (firstParam) {
      const pp = fill(firstParam.path, "42", "");
      const miss = ["DELETE", ...RT_METHODS].find((mm) => !trees[mm] || !rtLookup(trees[mm], pp).hit);
      if (miss) add(miss, pp);
    }
    add(routes[0].method, "/nope");
    return out;
  }, [routes]); // eslint-disable-line react-hooks/exhaustive-deps

  const [method, setMethod] = useState(presets[0] ? presets[0][0] : routes[0].method);
  const [path, setPath] = useState(presets[0] ? presets[0][1] : routes[0].path);
  const [query, setQuery] = useState(null); // { method, path } being animated
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const result = useMemo(() => (query ? rtResolve(trees, query.method, query.path) : null), [trees, query]);
  const total = result ? result.trace.length : 0;

  useInterval(playing, 520, () => setShown((s) => s + 1));
  useEffect(() => {
    if (playing && shown >= total) setPlaying(false);
  }, [playing, shown, total]);

  const go = (m = method, p = path) => {
    setMethod(m);
    setPath(p);
    setQuery({ method: m, path: p });
    setShown(0);
    setPlaying(true);
  };
  const done = result && shown >= total;
  const seen = result ? result.trace.slice(0, shown) : [];
  const state = new Map();
  seen.forEach((t) => state.set(t.id, t.ok ? "ok" : "fail"));
  const curId = seen.length ? seen[seen.length - 1].id : null;
  const hitId = done && result.hit ? result.hit.id : null;
  // nodes on the final successful path
  const onPath = new Set(done && result.hit ? result.onPath : []);

  // Layout: each method tree as an indented list.
  const ROW = 21, IND = 15;
  const blocks = [];
  let y = 4;
  for (const m of methods) {
    const rows = rtRows(trees[m]);
    blocks.push({ m, rows, y });
    y += rows.length * ROW + 10;
  }
  const H = y;
  // viewBox only as wide as the widest row, so small trees are drawn larger on phones
  let VW = 200;
  for (const { m, rows } of blocks) {
    for (const r of rows) {
      const label = r.n.kind === "root" ? `${m} tree` : r.n.label;
      const w = Math.max(22, label.length * 6.1 + 12);
      const tag = RT_KIND[r.n.kind].tag;
      const extra = (tag ? tag.length + 1 : 0) + (r.n.route ? r.n.route.split(" ")[1].length + 2 : 0);
      VW = Math.max(VW, 4 + r.depth * IND + w + (extra ? 6 + extra * 5.2 : 0) + 6);
    }
  }
  VW = Math.min(420, Math.ceil(VW));
  const active = query ? query.method : null;

  const status = result ? result.status : null;
  const routeLines = routes.map((r) => `r.${r.method}("${r.path}", handler)`);
  const hitIdx = result && result.route ? routes.findIndex((r) => `${r.method} ${r.path}` === result.route) : -1;
  const codeLines = ["r := gin.New()", ...routeLines];
  if (done && result.hit) {
    codeLines.push("", "// inside the matched handler:");
    codeLines.push(`c.FullPath()          // "${result.route.split(" ")[1]}"`);
    result.params.forEach(([k, v]) => codeLines.push(`c.Param("${k}")${" ".repeat(Math.max(1, 13 - k.length))}// "${v}"`));
  }

  return (
    <Card
      title="Gin's router: one radix tree per HTTP method"
      params={params}
      caption="Gin stores routes in a compressed prefix (radix) tree, one per method: shared prefixes like “/users” are stored once, :param matches one path segment and *catchAll matches the rest, including its leading slash. Pick a request (or type one) and watch the lookup: static children are tried first, then :param, then *catchAll. Try the trailing-slash request (Gin redirects) and a method with no route (404: Gin only answers 405 if you set r.HandleMethodNotAllowed = true)."
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(RT_METHODS.includes(e.target.value) ? e.target.value : "GET")}
          className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-slate-200 outline-none focus:border-brand-500"
          aria-label="HTTP method"
        >
          {RT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value.slice(0, 60))}
          onKeyDown={(e) => e.key === "Enter" && go()}
          aria-label="request path"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-slate-200 outline-none focus:border-brand-500"
        />
        <Button primary onClick={() => go()}>Look up</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        {presets.map(([m, p]) => (
          <button
            key={m + p}
            type="button"
            onClick={() => go(m, p)}
            className={`rounded px-1.5 py-0.5 font-mono transition-colors ${query && query.method === m && query.path === p ? "bg-brand-500/25 text-brand-200" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
          >
            {m} {p}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${VW} ${H}`} className="mx-auto mt-3 block h-auto w-full select-none" style={{ maxWidth: `${Math.round(VW * 1.7)}px` }} role="img" aria-label="Radix trees">
        {blocks.map(({ m, rows, y: by }) => {
          const dimTree = active && active !== m;
          return (
            <g key={m} opacity={dimTree ? 0.4 : 1} style={{ transition: "opacity 0.3s" }}>
              {rows.map((r) => {
                const ry = by + r.i * ROW;
                const x = 4 + r.depth * IND;
                const n = r.n;
                const st = state.get(n.id);
                const K = RT_KIND[n.kind];
                const isCur = n.id === curId && !done;
                const isHit = n.id === hitId;
                const good = onPath.has(n.id);
                const label = n.kind === "root" ? `${m} tree` : n.label;
                const w = Math.max(22, label.length * 6.1 + 12);
                const stroke = isHit || good ? C.emerald : st === "fail" ? C.rose : st === "ok" ? C.sky : K.stroke;
                const fillC = isHit ? "#0b2e24" : st === "fail" ? "#3b1622" : st === "ok" ? "#0c2a3d" : n.kind === "root" ? "#1e1638" : C.ink800;
                const parent = r.parentRow >= 0 ? rows[r.parentRow] : null;
                return (
                  <g key={n.id}>
                    {parent && (
                      <path
                        d={`M${4 + parent.depth * IND + 7} ${by + parent.i * ROW + 16} V${ry + 8} H${x}`}
                        fill="none"
                        stroke={st === "ok" || good ? C.sky : C.axis}
                        strokeWidth={st === "ok" || good ? 1.4 : 1}
                      />
                    )}
                    {isCur && <rect x={x - 2.5} y={ry - 2.5} width={w + 5} height="21" rx="6" fill="none" stroke={st === "fail" ? C.rose : C.sky} strokeOpacity="0.5" strokeWidth="3" />}
                    <rect x={x} y={ry} width={w} height="16" rx="4" fill={fillC} stroke={stroke} strokeWidth={isCur || isHit ? 1.6 : 1} style={{ transition: "fill 0.25s, stroke 0.25s" }} />
                    <text x={x + w / 2} y={ry + 11.5} textAnchor="middle" fontSize="9.5" fontWeight={n.kind === "root" ? 700 : 500} fill={K.text} fontFamily={MONO}>{label}</text>
                    {(K.tag || n.route) && (
                      <text x={x + w + 6} y={ry + 11.5} fontSize="8.5" fill={n.route ? (isHit ? C.emerald : C.text) : C.dim} fontFamily={MONO}>
                        {K.tag ? <tspan fill={K.stroke} fillOpacity="0.85">{K.tag}{n.route ? " " : ""}</tspan> : null}
                        {n.route ? `● ${n.route.split(" ")[1]}` : ""}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3">
        <Legend color="#475569" label="static prefix" />
        <Legend color={C.amber} label=":param (one segment)" />
        <Legend color={C.fuchsia} label="*catchAll (rest of path)" />
        <Legend color={C.emerald} label="● has a handler" />
      </div>
      {warnings.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 font-mono text-[10.5px] text-amber-200">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">lookup trace{query ? ` · ${query.method} ${result.path}` : ""}</Label>
          <ol className="min-h-[7rem] space-y-0.5 rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[10.5px]" aria-live="polite">
            {!query && <li className="text-slate-500">Pick a request above.</li>}
            {query && result.noTree && <li className="text-amber-300">No {query.method} routes registered: there is no {query.method} tree to search.</li>}
            {seen.map((t, i) => (
              <li key={i} className={`break-words ${t.ok ? "text-sky-300" : "text-rose-300"}`}>
                {t.ok ? "✓" : "✗"} {t.note}
              </li>
            ))}
            {done && (
              <li className="mt-1 border-t border-ink-700 pt-1">
                <StatusPill code={status} />{" "}
                <span className="text-slate-300">
                  {status === 200 && `→ ${result.route}`}
                  {(status === 301 || status === 307) && `→ Location: ${result.location} (RedirectTrailingSlash)`}
                  {status === 404 && (result.others && result.others.length ? `404 page not found (but ${result.others.join(", ")} ${result.path} exists)` : "404 page not found")}
                </span>
              </li>
            )}
          </ol>
          {done && result.hit && result.params.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.params.map(([k, v]) => (
                <Stat key={k} label={`c.Param("${k}") =`} value={JSON.stringify(v)} color="text-amber-300" />
              ))}
            </div>
          )}
        </div>
        <Code lines={codeLines} marks={hitIdx >= 0 && done ? { [hitIdx + 1]: "emerald" } : {}} label="routes.go" />
      </div>
    </Card>
  );
}

/* ---------- gin-playground: a mock Gin CRUD API with an in-memory store ---------- */

// Field definitions per resource. `tag` is the binding:"…" tag (go-playground/validator).
const GP_RES = {
  books: {
    fields: [
      { go: "Title", json: "title", type: "string", tag: "required" },
      { go: "Author", json: "author", type: "string", tag: "required" },
      { go: "Price", json: "price", type: "float64", tag: "gte=0" },
    ],
    seed: [
      { title: "Dune", author: "Frank Herbert", price: 9.99 },
      { title: "Neuromancer", author: "William Gibson", price: 7.5 },
    ],
    post: { title: "Learning Go", author: "Jon Bodner", price: 39.99 },
    put: { title: "Dune", author: "Frank Herbert", price: 12.5 },
    missing: { author: "Jon Bodner", price: 39.99 },
    wrong: { title: "Learning Go", author: "Jon Bodner", price: "cheap" },
  },
  users: {
    fields: [
      { go: "Name", json: "name", type: "string", tag: "required" },
      { go: "Email", json: "email", type: "string", tag: "required,email" },
      { go: "Age", json: "age", type: "int", tag: "gte=0" },
    ],
    seed: [
      { name: "Alice", email: "alice@example.com", age: 31 },
      { name: "Bob", email: "bob@example.com", age: 27 },
    ],
    post: { name: "Carol", email: "carol@example.com", age: 45 },
    put: { name: "Bob", email: "bob@work.example", age: 28 },
    missing: { email: "not-an-email", age: 45 },
    wrong: { name: "Carol", email: "carol@example.com", age: "forty" },
  },
  todos: {
    fields: [
      { go: "Title", json: "title", type: "string", tag: "required" },
      { go: "Done", json: "done", type: "bool", tag: "" },
    ],
    seed: [
      { title: "Write handlers", done: true },
      { title: "Add tests", done: false },
    ],
    post: { title: "Deploy", done: false },
    put: { title: "Add tests", done: true },
    missing: { done: true },
    wrong: { title: "Deploy", done: "yes" },
  },
};
const GP_GENERIC = {
  fields: [
    { go: "Name", json: "name", type: "string", tag: "required" },
    { go: "Price", json: "price", type: "float64", tag: "gte=0" },
  ],
  seed: [{ name: "Keyboard", price: 49.9 }, { name: "Mouse", price: 19.5 }],
  post: { name: "Monitor", price: 189 },
  put: { name: "Mouse", price: 24.5 },
  missing: { price: 189 },
  wrong: { name: "Monitor", price: "cheap" },
};

/** Resource naming from params.resource: "books" → Book, /books, "book not found". */
function gpNames(raw) {
  const r = typeof raw === "string" && /^[a-z][a-z0-9_]{0,19}$/i.test(raw.trim()) ? raw.trim().toLowerCase() : "books";
  const one = r.length > 1 && r.endsWith("s") ? r.slice(0, -1) : r;
  const Cls = one.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
  const Plural = r.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
  const def = GP_RES[r] || GP_GENERIC;
  return { r, one, Cls, Plural, def };
}

/** Go's strconv.Quote-ish rendering of a single character for json error messages. */
const goQuoteChar = (ch) => (ch === "'" ? "'\\''" : ch === "\n" ? "'\\n'" : ch === "\t" ? "'\\t'" : `'${ch}'`);

/**
 * A small JSON parser that reports syntax errors with encoding/json's wording
 * (json.Decoder.Decode: reads one value and ignores what follows it).
 */
function goJsonParse(src) {
  let i = 0;
  const s = String(src);
  const err = (m) => {
    throw new Error(m);
  };
  const ws = () => {
    while (i < s.length && " \t\n\r".includes(s[i])) i++;
  };
  const eof = () => i >= s.length && err("unexpected EOF");
  const value = (ctx) => {
    ws();
    eof();
    const ch = s[i];
    if (ch === "{") {
      i++;
      const o = {};
      ws();
      eof();
      if (s[i] === "}") {
        i++;
        return o;
      }
      for (;;) {
        ws();
        eof();
        if (s[i] !== '"') err(`invalid character ${goQuoteChar(s[i])} looking for beginning of object key string`);
        const k = str();
        ws();
        eof();
        if (s[i] !== ":") err(`invalid character ${goQuoteChar(s[i])} after object key`);
        i++;
        o[k] = value();
        ws();
        eof();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "}") {
          i++;
          return o;
        }
        err(`invalid character ${goQuoteChar(s[i])} after object key:value pair`);
      }
    }
    if (ch === "[") {
      i++;
      const a = [];
      ws();
      eof();
      if (s[i] === "]") {
        i++;
        return a;
      }
      for (;;) {
        a.push(value());
        ws();
        eof();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === "]") {
          i++;
          return a;
        }
        err(`invalid character ${goQuoteChar(s[i])} after array element`);
      }
    }
    if (ch === '"') return str();
    for (const [lit, v] of [["true", true], ["false", false], ["null", null]]) {
      if (ch === lit[0]) {
        for (let k = 1; k < lit.length; k++) {
          if (i + k >= s.length) err("unexpected EOF");
          if (s[i + k] !== lit[k]) err(`invalid character ${goQuoteChar(s[i + k])} in literal ${lit} (expecting ${goQuoteChar(lit[k])})`);
        }
        i += lit.length;
        return v;
      }
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const m = s.slice(i).match(/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/);
      if (!m) {
        if (i + 1 >= s.length) err("unexpected EOF");
        err(`invalid character ${goQuoteChar(s[i + 1])} in numeric literal`);
      }
      i += m[0].length;
      return Number(m[0]);
    }
    err(`invalid character ${goQuoteChar(ch)} looking for beginning of value`);
    return ctx;
  };
  const str = () => {
    i++;
    let out = "";
    for (;;) {
      if (i >= s.length) err("unexpected EOF");
      const ch = s[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch < " ") err(`invalid character ${goQuoteChar(ch)} in string literal`);
      if (ch === "\\") {
        const e = s[i + 1];
        if (e === undefined) err("unexpected EOF");
        const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (e in map) {
          out += map[e];
          i += 2;
        } else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
          out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16));
          i += 6;
        } else err(`invalid character ${goQuoteChar(e)} in string escape code`);
        continue;
      }
      out += ch;
      i++;
    }
  };
  ws();
  if (i >= s.length) err("EOF");
  return value();
}

/** Go's json.Marshal: compact, struct field order, and <, >, & escaped. */
function goJson(v, fields) {
  const esc = (x) => JSON.stringify(x).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  if (Array.isArray(v)) return `[${v.map((x) => goJson(x, fields)).join(",")}]`;
  if (v && typeof v === "object") {
    if (fields) return `{${[["id", "int"], ...fields.map((f) => [f.json, f.type])].map(([k]) => `"${k}":${goJson(v[k])}`).join(",")}}`;
    return `{${Object.keys(v).sort().map((k) => `${esc(k)}:${goJson(v[k])}`).join(",")}}`; // gin.H is a map: keys sorted
  }
  if (typeof v === "string") return esc(v);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return "null";
}

const jsKind = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : typeof v === "boolean" ? "bool" : typeof v === "number" ? "number" : "string");

/**
 * c.ShouldBindJSON(&x): decode (type errors like encoding/json, first one wins,
 * keys matched case-insensitively, unknown keys ignored), then validate the
 * binding tags (all failures, joined with "\n" like validator.ValidationErrors).
 */
function gpBind(text, N) {
  let body;
  try {
    body = goJsonParse(text);
  } catch (e) {
    return { err: e.message };
  }
  const { fields } = N.def;
  const out = { id: 0 };
  fields.forEach((f) => (out[f.json] = f.type === "string" ? "" : f.type === "bool" ? false : 0));
  if (body === null) body = {};
  const k = jsKind(body);
  if (k !== "object") return { err: `json: cannot unmarshal ${k} into Go value of type main.${N.Cls}` };
  const all = [{ go: "ID", json: "id", type: "int" }, ...fields];
  let typeErr = null;
  for (const key of Object.keys(body)) {
    const f = all.find((x) => x.json === key) || all.find((x) => x.json.toLowerCase() === key.toLowerCase());
    if (!f) continue;
    const v = body[key];
    if (v === null) continue; // null leaves the Go field unchanged
    const vk = jsKind(v);
    const bad = (what) => !typeErr && (typeErr = `json: cannot unmarshal ${what} into Go struct field ${N.Cls}.${f.json} of type ${f.type}`);
    if (f.type === "string") vk === "string" ? (out[f.json] = v) : bad(vk);
    else if (f.type === "bool") vk === "bool" ? (out[f.json] = v) : bad(vk);
    else if (f.type === "float64") vk === "number" ? (out[f.json] = v) : bad(vk);
    else if (vk !== "number") bad(vk);
    else if (!Number.isInteger(v) || Math.abs(v) > 9007199254740991) bad(`number ${v}`);
    else out[f.json] = v;
  }
  if (typeErr) return { err: typeErr };
  const errs = [];
  for (const f of fields) {
    const v = out[f.json];
    for (const rule of f.tag ? f.tag.split(",") : []) {
      let fail = false;
      if (rule === "required") fail = v === "" || v === 0 || v === false;
      else if (rule === "email") fail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      else if (rule === "gte=0") fail = v < 0;
      if (fail) {
        errs.push(`Key: '${N.Cls}.${f.go}' Error:Field validation for '${f.go}' failed on the '${rule.split("=")[0]}' tag`);
        break; // validator stops at the first failing tag of a field
      }
    }
  }
  if (errs.length) return { err: errs.join("\n") };
  return { val: out };
}

const GP_EPS = [
  ["list", "GET", ""],
  ["get", "GET", "/:id"],
  ["create", "POST", ""],
  ["update", "PUT", "/:id"],
  ["delete", "DELETE", "/:id"],
];

function gpSeed(N) {
  return { next: N.def.seed.length + 1, rows: N.def.seed.map((x, i) => ({ id: i + 1, ...x })) };
}

/** Handle one call. Pure: returns { db, status, body, lines } where lines names the code path taken. */
function gpHandle(db, ep, idRaw, text, N) {
  const nf = { error: `${N.one} not found` };
  const res = (status, body, path, extra = {}) => ({ db, status, body, path, ...extra });
  if (ep === "list") return res(200, db.rows, "ok");
  const needsId = ep !== "create";
  let id = null;
  if (needsId) {
    const t = String(idRaw);
    if (!/^[+-]?\d+$/.test(t) || Math.abs(Number(t)) > 9223372036854775807) return res(400, { error: "invalid id" }, "idErr");
    id = Number(t);
  }
  let val = null;
  if (ep === "create" || ep === "update") {
    const b = gpBind(text, N);
    if (b.err) return res(400, { error: b.err }, "bindErr");
    val = b.val;
  }
  const idx = needsId ? db.rows.findIndex((r) => r.id === id) : -1;
  if (ep === "create") {
    const row = { ...val, id: db.next };
    return { db: { next: db.next + 1, rows: [...db.rows, row] }, status: 201, body: row, path: "ok", touched: row.id };
  }
  if (idx < 0) return res(404, nf, "nf");
  if (ep === "get") return res(200, db.rows[idx], "ok", { touched: id });
  if (ep === "delete") return { db: { ...db, rows: db.rows.filter((r) => r.id !== id) }, status: 204, body: undefined, path: "ok" };
  const row = { ...val, id };
  return { db: { ...db, rows: db.rows.map((r) => (r.id === id ? row : r)) }, status: 200, body: row, path: "ok", touched: id };
}

/** Go source for the struct and each handler; every line tagged with the code path it belongs to. */
function gpCode(ep, N) {
  const { r, one, Cls, Plural } = N;
  const L = [];
  const add = (t, tag = "") => L.push([t, tag]);
  const atoi = () => {
    add('    id, err := strconv.Atoi(c.Param("id"))');
    add("    if err != nil {", "idErr");
    add('        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})', "idErr");
    add("        return", "idErr");
    add("    }");
  };
  const bind = (v) => {
    add(`    var ${v} ${Cls}`);
    add(`    if err := c.ShouldBindJSON(&${v}); err != nil {`, "bind");
    add('        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})', "bindErr");
    add("        return", "bindErr");
    add("    }");
  };
  const nf = () => {
    add(`    c.JSON(http.StatusNotFound, gin.H{"error": "${one} not found"})`, "nf");
  };
  if (ep === "list") {
    add(`r.GET("/${r}", list${Plural})`);
    add("");
    add(`func list${Plural}(c *gin.Context) {`);
    add(`    c.JSON(http.StatusOK, ${r})   // ${r} := []${Cls}{}: an empty slice encodes as [], a nil one as null`, "ok");
    add("}");
  } else if (ep === "get") {
    add(`r.GET("/${r}/:id", get${Cls})`);
    add("");
    add(`func get${Cls}(c *gin.Context) {`);
    atoi();
    add(`    for _, x := range ${r} {`);
    add("        if x.ID == id {");
    add("            c.JSON(http.StatusOK, x)", "ok");
    add("            return", "ok");
    add("        }");
    add("    }");
    nf();
    add("}");
  } else if (ep === "create") {
    add(`r.POST("/${r}", create${Cls})`);
    add("");
    add(`func create${Cls}(c *gin.Context) {`);
    bind(one);
    add(`    ${one}.ID = nextID`, "ok");
    add("    nextID++", "ok");
    add(`    ${r} = append(${r}, ${one})`, "ok");
    add(`    c.JSON(http.StatusCreated, ${one})`, "ok");
    add("}");
  } else if (ep === "update") {
    add(`r.PUT("/${r}/:id", update${Cls})`);
    add("");
    add(`func update${Cls}(c *gin.Context) {`);
    atoi();
    bind("input");
    add(`    for i := range ${r} {`);
    add(`        if ${r}[i].ID == id {`);
    add("            input.ID = id", "ok");
    add(`            ${r}[i] = input           // PUT replaces every field`, "ok");
    add("            c.JSON(http.StatusOK, input)", "ok");
    add("            return", "ok");
    add("        }");
    add("    }");
    nf();
    add("}");
  } else {
    add(`r.DELETE("/${r}/:id", delete${Cls})`);
    add("");
    add(`func delete${Cls}(c *gin.Context) {`);
    atoi();
    add(`    for i, x := range ${r} {`);
    add("        if x.ID == id {");
    add(`            ${r} = append(${r}[:i], ${r}[i+1:]...)`, "ok");
    add("            c.Status(http.StatusNoContent)  // 204: no body", "ok");
    add("            return", "ok");
    add("        }");
    add("    }");
    nf();
    add("}");
  }
  return L;
}

function gpStruct(N) {
  const all = [{ go: "ID", json: "id", type: "int", tag: "" }, ...N.def.fields];
  const gw = Math.max(...all.map((f) => f.go.length));
  const tw = Math.max(...all.map((f) => f.type.length));
  return [
    `type ${N.Cls} struct {`,
    ...all.map((f) => `    ${f.go.padEnd(gw)} ${f.type.padEnd(tw)} \`json:"${f.json}"${f.tag ? ` binding:"${f.tag}"` : ""}\``),
    "}",
  ];
}

export function GinPlayground({ params = {} }) {
  const prm = obj(params);
  const N = useMemo(() => gpNames(prm.resource), [prm.resource]);
  const pretty = (o) => JSON.stringify(o, null, 1).replace(/\n\s*/g, " ").replace(/{ /g, "{").replace(/ }/g, "}");
  const [db, setDb] = useState(() => gpSeed(N));
  const [ep, setEp] = useState("list");
  const [idRaw, setIdRaw] = useState("1");
  const [bodies, setBodies] = useState(() => ({ create: pretty(N.def.post), update: pretty(N.def.put) }));
  const [last, setLast] = useState(null);
  const [hist, setHist] = useState([]);
  const histN = useRef(0);

  const epDef = GP_EPS.find((e) => e[0] === ep);
  const hasBody = ep === "create" || ep === "update";
  const urlFor = (e, id) => `/${N.r}${GP_EPS.find((x) => x[0] === e)[2] ? `/${String(id).trim()}` : ""}`;

  const send = () => {
    const text = hasBody ? bodies[ep] : "";
    const r = gpHandle(db, ep, String(idRaw).trim(), text, N);
    setDb(r.db);
    const req = { method: epDef[1], url: urlFor(ep, idRaw), body: hasBody ? text : "" };
    setLast({ ep, req, status: r.status, body: r.body, path: r.path, touched: r.touched });
    histN.current += 1;
    setHist((h) => [{ ep, id: idRaw, status: r.status, label: `${req.method} ${req.url}`, k: histN.current, text }, ...h].slice(0, 6));
  };
  const reset = () => {
    setDb(gpSeed(N));
    setLast(null);
    setHist([]);
  };
  const setBody = (kind) => setBodies((b) => ({ ...b, [ep]: kind === "valid" ? pretty(ep === "create" ? N.def.post : N.def.put) : pretty(N.def[kind]) }));

  let reqText = "";
  let resText = "";
  if (last) {
    const rq = last.req;
    reqText = `${rq.method} ${rq.url} HTTP/1.1\nHost: localhost:8080`;
    if (rq.body !== "") reqText += `\nContent-Type: application/json\nContent-Length: ${byteLen(rq.body)}\n\n${rq.body}`;
    const json = last.body === undefined ? "" : goJson(last.body, last.status < 300 && last.body && !last.body.error ? N.def.fields : null);
    const hs = [];
    if (json) hs.push("Content-Type: application/json; charset=utf-8");
    hs.push(`Date: ${GIN_DATE}`);
    if (json) hs.push(`Content-Length: ${byteLen(json)}`);
    resText = `HTTP/1.1 ${last.status} ${REASONS[last.status]}\n${hs.join("\n")}${json ? `\n\n${json}` : ""}`;
  }
  const code = gpCode(ep, N);
  const marks = {};
  if (last && last.ep === ep) {
    code.forEach(([, tag], i) => {
      if (!tag) return;
      if (tag === last.path) marks[i] = last.path === "ok" ? "emerald" : last.path === "nf" ? "amber" : "rose";
      else if (tag === "bind" && last.path === "bindErr") marks[i] = "rose";
    });
  }
  const cols = ["id", ...N.def.fields.map((f) => f.json)];
  const cell = (v) => (typeof v === "string" ? v : goJson(v));

  return (
    <Card
      title={`Gin playground: a CRUD API for /${N.r}`}
      params={params}
      caption={`A mock Gin app with an in-memory slice. Try: GET /${N.r}/99 (404), POST the “missing field” body (400 from the validator), the “wrong type” body (400 from encoding/json before validation even runs), DELETE twice (204, then 404) and GET /${N.r}/abc (strconv.Atoi fails → 400). Unknown JSON keys are silently ignored and key matching is case-insensitive, just like encoding/json.`}
    >
      <Choice options={GP_EPS.map(([k, m, p]) => [k, `${m} /${N.r}${p}`])} value={ep} onChange={setEp} mono />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-ink-800 px-2 py-1 font-mono text-xs text-slate-300">
          {epDef[1]} /{N.r}
          {epDef[2] ? "/" : ""}
        </span>
        {epDef[2] && (
          <input
            value={idRaw}
            onChange={(e) => setIdRaw(e.target.value.slice(0, 12))}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label=":id path parameter"
            spellCheck={false}
            className="w-20 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-amber-200 outline-none focus:border-brand-500"
          />
        )}
        <Button primary onClick={send}>Send</Button>
        <Button onClick={reset}>Reset store</Button>
      </div>
      {hasBody && (
        <div className="mt-2">
          <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
            <span>JSON body:</span>
            <button type="button" onClick={() => setBody("valid")} className="rounded bg-ink-800 px-1.5 py-0.5 text-emerald-300 hover:bg-ink-700">valid</button>
            <button type="button" onClick={() => setBody("missing")} className="rounded bg-ink-800 px-1.5 py-0.5 text-amber-300 hover:bg-ink-700">invalid: missing field</button>
            <button type="button" onClick={() => setBody("wrong")} className="rounded bg-ink-800 px-1.5 py-0.5 text-rose-300 hover:bg-ink-700">invalid: wrong type</button>
          </div>
          <textarea
            value={bodies[ep]}
            onChange={(e) => setBodies((b) => ({ ...b, [ep]: e.target.value.slice(0, 600) }))}
            rows={2}
            spellCheck={false}
            aria-label="JSON request body"
            className="w-full resize-y rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-slate-200 outline-none focus:border-brand-500"
          />
        </div>
      )}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">request</Label>
          <Pre className="min-h-[4.5rem] text-[10.5px]">{last ? <HttpText text={reqText} /> : <span className="text-slate-500">Pick a route, then Send.</span>}</Pre>
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Label>response</Label>
            {last && <StatusPill code={last.status} />}
          </div>
          <Pre className="min-h-[4.5rem] text-[10.5px]">{last ? <HttpText text={resText} /> : <span className="text-slate-500">—</span>}</Pre>
        </div>
      </div>
      <div className="mt-2">
        <div className="min-w-0">
          <Label className="mb-1">in-memory store ({N.r})</Label>
          <div className="overflow-x-auto rounded-lg border border-ink-700">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="bg-ink-800 text-slate-500">
                <tr>{cols.map((c) => <th key={c} className="px-2 py-1 font-normal">{c}</th>)}</tr>
              </thead>
              <tbody>
                {db.rows.length === 0 && (
                  <tr><td colSpan={cols.length} className="px-2 py-2 text-slate-500">empty: GET returns []</td></tr>
                )}
                {db.rows.map((row) => (
                  <tr key={row.id} className={`border-t border-ink-700 ${last && last.touched === row.id ? "bg-brand-500/15" : ""}`}>
                    {cols.map((c) => (
                      <td key={c} className={`max-w-[9rem] truncate px-2 py-1 ${c === "id" ? "text-slate-400" : typeof row[c] === "string" ? "text-slate-200" : "text-amber-300"}`}>{cell(row[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hist.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {hist.map((h) => (
                <button
                  key={h.k}
                  type="button"
                  title="load this request"
                  onClick={() => {
                    setEp(h.ep);
                    setIdRaw(h.id);
                    if (h.ep === "create" || h.ep === "update") setBodies((b) => ({ ...b, [h.ep]: h.text }));
                  }}
                  className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 hover:bg-ink-700"
                >
                  <span className={statusTone(h.status)}>{h.status}</span> {h.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <Code className="mt-2" lines={gpStruct(N)} label="model" />
      <Code className="mt-2" lines={code.map(([t]) => t)} marks={marks} label={last && last.ep === ep ? "handler (the lines that ran are highlighted)" : "handler"} />
    </Card>
  );
}

/* ---------- goroutine-channel: producers, consumers and a (buffered) channel ---------- */

const GC_ITEMS = 3; // values sent by each producer

function gcInit(cap, P, Cn) {
  const rnd = mulberry32(1000 + cap * 97 + P * 13 + Cn);
  const make = () => 1 + Math.floor(rnd() * 3); // ticks to "produce" a value
  const proc = () => 2 + Math.floor(rnd() * 3); // ticks to process one
  return {
    t: 0,
    cap,
    buf: [],
    closed: false,
    sendq: [],
    recvq: [],
    prods: Array.from({ length: P }, (_, i) => ({ i, n: 0, state: "work", timer: make(), tok: null })),
    cons: Array.from({ length: Cn }, (_, i) => ({ i, state: "recv", timer: 0, tok: null, got: 0 })),
    toks: {}, // id → { val, at: ["p", i] | ["b"] | ["c", i] }
    log: [],
    sent: 0,
    recv: 0,
    sBlock: 0,
    rBlock: 0,
    make,
    proc,
    finished: false,
  };
}

/** Advance the simulation one tick (mutates `s`). Follows the runtime's chansend / chanrecv rules. */
function gcStep(s) {
  if (s.finished) return;
  s.t++;
  const say = (m) => s.log.push(`t=${s.t} ${m}`);
  const handTo = (c, tok) => {
    c.state = "work";
    c.timer = s.proc();
    c.tok = tok;
    s.toks[tok].at = ["c", c.i];
    s.recv++;
    c.got++;
  };
  const advance = (p) => {
    p.tok = null;
    p.n++;
    s.sent++;
    if (p.n < GC_ITEMS) {
      p.state = "work";
      p.timer = s.make();
    } else {
      p.state = "done";
      say(`P${p.i + 1} done (wg.Done)`);
    }
  };
  const trySend = (p) => {
    const tok = p.tok;
    if (s.recvq.length) {
      const c = s.cons[s.recvq.shift()];
      handTo(c, tok);
      say(`P${p.i + 1} → C${c.i + 1}: ${s.toks[tok].val} (receiver was waiting)`);
      advance(p);
    } else if (s.buf.length < s.cap) {
      s.buf.push(tok);
      s.toks[tok].at = ["b"];
      say(`P${p.i + 1} sent ${s.toks[tok].val} into the buffer`);
      advance(p);
    } else {
      p.state = "blocked";
      s.sendq.push(p.i);
      say(`P${p.i + 1} blocks on ch <- ${s.toks[tok].val} (${s.cap ? "buffer full" : "no receiver ready"})`);
    }
  };
  const tryRecv = (c) => {
    if (s.buf.length) {
      const tok = s.buf.shift();
      handTo(c, tok);
      say(`C${c.i + 1} received ${s.toks[tok].val} from the buffer`);
      if (s.sendq.length) {
        const p = s.prods[s.sendq.shift()];
        s.buf.push(p.tok);
        s.toks[p.tok].at = ["b"];
        say(`P${p.i + 1} unblocks: ${s.toks[p.tok].val} moves into the freed slot`);
        advance(p);
      }
    } else if (s.sendq.length) {
      const p = s.prods[s.sendq.shift()];
      handTo(c, p.tok);
      say(`C${c.i + 1} ← P${p.i + 1}: ${s.toks[p.tok].val} (handed over directly)`);
      advance(p);
    } else if (s.closed) {
      c.state = "done";
      say(`C${c.i + 1}: channel closed and empty → range loop ends`);
    } else {
      c.state = "waiting";
      s.recvq.push(c.i);
    }
  };
  // 1. timers
  const sending = [];
  const receiving = [];
  for (const p of s.prods) {
    if (p.state === "work" && --p.timer <= 0) {
      const val = (p.i + 1) * 10 + p.n + 1;
      const id = `v${val}`;
      s.toks[id] = { val, at: ["p", p.i] };
      p.tok = id;
      p.state = "send";
      sending.push(p);
    }
  }
  for (const c of s.cons) {
    if (c.state === "work" && --c.timer <= 0) {
      s.toks[c.tok].at = ["gone", c.i];
      c.tok = null;
      c.state = "recv";
    }
    if (c.state === "recv") receiving.push(c);
  }
  // 2. channel operations (one at a time, like the channel's lock)
  sending.forEach(trySend);
  receiving.forEach(tryRecv);
  // 3. the closer goroutine: wg.Wait() returns once every producer is done
  if (!s.closed && s.prods.every((p) => p.state === "done")) {
    s.closed = true;
    say("all producers done → close(ch)");
    while (s.recvq.length) {
      const c = s.cons[s.recvq.shift()];
      c.state = "done";
      say(`C${c.i + 1} wakes: closed and empty → range loop ends`);
    }
  }
  s.sBlock += s.sendq.length;
  s.rBlock += s.recvq.length;
  // drop tokens that were fully processed a while ago
  if (s.cons.every((c) => c.state === "done")) {
    s.finished = true;
    say("every consumer returned: main's done.Wait() returns");
  }
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
}

function gcCode(cap, P, Cn) {
  return [
    cap ? `ch := make(chan int, ${cap})        // buffered: ${cap} value${cap === 1 ? "" : "s"} fit without a receiver` : "ch := make(chan int)           // unbuffered: send waits for a receiver",
    "var wg sync.WaitGroup",
    `for p := 1; p <= ${P}; p++ {         // producers`,
    "    wg.Add(1)",
    "    go func() {                  // Go 1.22: p is a new variable each iteration",
    "        defer wg.Done()",
    `        for i := 1; i <= ${GC_ITEMS}; i++ {`,
    "            ch <- p*10 + i       // blocks while the buffer is full",
    "        }",
    "    }()",
    "}",
    "go func() {",
    "    wg.Wait()",
    "    close(ch)                    // only the sender side closes",
    "}()",
    "var done sync.WaitGroup",
    `for c := 1; c <= ${Cn}; c++ {         // consumers`,
    "    done.Add(1)",
    "    go func() {",
    "        defer done.Done()",
    "        for v := range ch {      // blocks while empty; ends after close",
    '            fmt.Printf("C%d got %d\\n", c, v)',
    "        }",
    "    }()",
    "}",
    "done.Wait()",
  ];
}

export function GoroutineChannel({ params = {} }) {
  const prm = obj(params);
  const [cap, setCap] = useState(() => int(prm.buffer, 0, 0, 5));
  const [P, setP] = useState(() => int(prm.producers, 2, 1, 4));
  const [Cn, setCn] = useState(() => int(prm.consumers, 1, 1, 3));
  const [speed, setSpeed] = useState(2);
  const [playing, setPlaying] = useState(false);
  const sim = useRef(null);
  if (!sim.current) sim.current = gcInit(cap, P, Cn);
  const force = useForce();
  const s = sim.current;

  useInterval(playing, Math.round(1000 / speed), () => {
    gcStep(sim.current);
    if (sim.current.finished) setPlaying(false);
    force();
  });

  const restart = (c = cap, p = P, n = Cn) => {
    sim.current = gcInit(c, p, n);
    setPlaying(false);
    force();
  };

  const rows = Math.max(P, Cn, 2);
  const H = 34 + rows * 46;
  const py = (i, n) => 30 + ((i + 0.5) * (H - 40)) / n;
  const slotW = 24;
  const chW = Math.max(cap, 1) * slotW + 8;
  const chX = 170 - chW / 2;
  const chY = H / 2 - 16;
  const tokPos = (tk) => {
    const [k, i] = tk.at;
    if (k === "p") return [92, py(i, P)];
    if (k === "c") return [248, py(i, Cn)];
    if (k === "b") {
      const idx = s.buf.findIndex((x) => s.toks[x] === tk);
      return [chX + 4 + slotW * (idx + 0.5), chY + 16];
    }
    return [300, py(i, Cn)];
  };
  const live = Object.entries(s.toks).filter(([, tk]) => tk.at[0] !== "gone");
  const anyS = s.sendq.length > 0;
  const anyR = s.recvq.length > 0;
  const code = gcCode(cap, P, Cn);
  const marks = {};
  if (anyS) marks[7] = "rose";
  if (anyR) marks[20] = "amber";
  if (s.closed) marks[13] = "emerald";

  return (
    <Card
      title="Goroutines and channels: who blocks, and when"
      params={params}
      caption="Each producer goroutine sends 3 values into ch and each consumer ranges over it. With buffer 0 every send waits until a receiver takes the value (a rendezvous); with a buffer, senders only block when it is full and receivers only block when it is empty. When every producer is done, a closer goroutine calls close(ch) and the range loops end once the buffer is drained. Change the sliders and compare the blocked counters."
    >
      <svg viewBox={`0 0 340 ${H}`} className="h-auto w-full select-none" role="img" aria-label="Producers, channel and consumers">
        <text x="42" y="14" textAnchor="middle" fontSize="9" fill={C.dim}>producers</text>
        <text x="298" y="14" textAnchor="middle" fontSize="9" fill={C.dim}>consumers</text>
        {s.prods.map((p) => {
          const y = py(p.i, P);
          return <line key={p.i} x1="76" y1={y} x2={chX} y2={chY + 16} stroke={p.state === "blocked" ? C.rose : C.axis} strokeDasharray={p.state === "blocked" ? "3 3" : undefined} />;
        })}
        {s.cons.map((c) => {
          const y = py(c.i, Cn);
          return <line key={c.i} x1={chX + chW} y1={chY + 16} x2="264" y2={y} stroke={c.state === "waiting" ? C.amber : C.axis} strokeDasharray={c.state === "waiting" ? "3 3" : undefined} />;
        })}
        {/* channel */}
        <rect x={chX} y={chY} width={chW} height="32" rx="7" fill={C.ink950} stroke={s.closed ? C.dim : C.brandL} strokeDasharray={s.closed ? "4 3" : undefined} />
        {Array.from({ length: cap }, (_, k) => (
          <rect key={k} x={chX + 4 + slotW * k + 1} y={chY + 5} width={slotW - 2} height="22" rx="4" fill={C.ink800} stroke={C.ink600} />
        ))}
        {cap === 0 && <text x="170" y={chY + 19} textAnchor="middle" fontSize="7.5" fill={C.dim}>∅</text>}
        <text x="170" y={chY - 7} textAnchor="middle" fontSize="9" fontFamily={MONO} fill={s.closed ? C.dim : C.brandL}>
          ch · len {s.buf.length}/cap {cap}{s.closed ? " · closed" : ""}
        </text>
        <text x="170" y={chY + 46} textAnchor="middle" fontSize="8" fill={C.dim}>{cap === 0 ? "unbuffered: direct hand-off" : "buffer (FIFO)"}</text>
        {s.prods.map((p) => {
          const y = py(p.i, P);
          const st = p.state;
          const col = st === "blocked" ? C.rose : st === "done" ? C.dim : C.sky;
          return (
            <g key={p.i}>
              <rect x="8" y={y - 17} width="68" height="34" rx="7" fill={st === "blocked" ? "#3b1622" : C.ink800} stroke={col} strokeWidth={st === "blocked" ? 1.5 : 1} />
              <text x="42" y={y - 3} textAnchor="middle" fontSize="10" fontWeight="600" fill="#e2e8f0" fontFamily={MONO}>P{p.i + 1}</text>
              <text x="42" y={y + 10} textAnchor="middle" fontSize="7.5" fill={col}>
                {st === "work" ? `making ${(p.i + 1) * 10 + p.n + 1}` : st === "blocked" ? "blocked: send" : st === "send" ? "sending" : "done"}
              </text>
            </g>
          );
        })}
        {s.cons.map((c) => {
          const y = py(c.i, Cn);
          const st = c.state;
          const col = st === "waiting" ? C.amber : st === "done" ? C.dim : C.emerald;
          return (
            <g key={c.i}>
              <rect x="264" y={y - 17} width="68" height="34" rx="7" fill={st === "waiting" ? "#33260a" : C.ink800} stroke={col} strokeWidth={st === "waiting" ? 1.5 : 1} />
              <text x="298" y={y - 3} textAnchor="middle" fontSize="10" fontWeight="600" fill="#e2e8f0" fontFamily={MONO}>C{c.i + 1}</text>
              <text x="298" y={y + 10} textAnchor="middle" fontSize="7.5" fill={col}>
                {st === "work" ? "processing" : st === "waiting" ? "blocked: recv" : st === "done" ? `done · got ${c.got}` : "ready"}
              </text>
            </g>
          );
        })}
        {live.map(([id, tk]) => {
          const [x, y] = tokPos(tk);
          const blocked = tk.at[0] === "p" && s.prods[tk.at[1]].state === "blocked";
          return (
            <g key={id} style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 0.35s ease-out" }}>
              <circle r="9.5" fill={blocked ? C.rose : tk.at[0] === "c" ? C.emerald : C.sky} stroke={C.ink950} strokeWidth="1.5" />
              <text y="3.2" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={C.ink950} fontFamily={MONO}>{tk.val}</text>
            </g>
          );
        })}
      </svg>
      <Row>
        <Button primary onClick={() => (s.finished ? (restart(), setPlaying(true)) : setPlaying((v) => !v))}>{playing ? "Pause" : s.finished ? "Replay" : s.t ? "Resume" : "Play"}</Button>
        <Button onClick={() => { setPlaying(false); gcStep(s); force(); }} disabled={s.finished}>Step 1 tick</Button>
        <Button onClick={() => restart()}>Reset</Button>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <Stat label="t" value={s.t} />
          <Stat label="received" value={`${s.recv}/${P * GC_ITEMS}`} color="text-emerald-300" />
        </span>
      </Row>
      <Row>
        <Slider label="buffer" value={cap} min={0} max={5} onChange={(v) => { setCap(v); restart(v, P, Cn); }} />
        <Slider label="producers" value={P} min={1} max={4} onChange={(v) => { setP(v); restart(cap, v, Cn); }} />
        <Slider label="consumers" value={Cn} min={1} max={3} onChange={(v) => { setCn(v); restart(cap, P, v); }} />
        <Slider label="speed" value={speed} min={1} max={6} onChange={setSpeed} display={`${speed}/s`} />
      </Row>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="sender blocked" value={`${s.sBlock} ticks`} color={s.sBlock ? "text-rose-300" : "text-slate-200"} sub="waiting in ch <- v" />
        <Tile label="receiver blocked" value={`${s.rBlock} ticks`} color={s.rBlock ? "text-amber-300" : "text-slate-200"} sub="waiting in range ch" />
        <Tile label="in buffer" value={`${s.buf.length} / ${cap}`} sub="len(ch) / cap(ch)" />
        <Tile label="channel" value={s.closed ? "closed" : "open"} color={s.closed ? "text-slate-400" : "text-brand-300"} sub={s.closed ? "range ends when drained" : "close(ch) after wg.Wait()"} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">what happened</Label>
          <ol className="h-[12.5rem] space-y-0.5 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[10.5px]" aria-live="polite">
            {s.log.length === 0 && <li className="text-slate-500">Press Play or Step. One tick ≈ one scheduling moment.</li>}
            {s.log.slice(-12).reverse().map((l, i) => (
              <li key={s.log.length - i} className={`${/blocks/.test(l) ? "text-rose-300" : /close|ends|returns/.test(l) ? "text-slate-400" : /unblocks|directly|waiting\)/.test(l) ? "text-emerald-300" : "text-slate-300"} ${i === 0 ? "font-semibold" : ""}`}>{l}</li>
            ))}
          </ol>
        </div>
        <Code lines={code} marks={marks} label="main.go" />
      </div>
    </Card>
  );
}

/* ---------- mutex-race: counter++ is read-modify-write ---------- */

const MR_OPS = { race: ["LOAD", "ADD", "STORE"], mutex: ["LOCK", "LOAD", "ADD", "STORE", "UNLOCK"] };

/**
 * Goroutines running in parallel on separate cores. Each scheduler step every
 * running goroutine executes its next instruction (LOAD / ADD / STORE, plus
 * LOCK / UNLOCK with a mutex) in a random order, and sometimes stalls (cache
 * miss, preemption). Goroutines start a little apart, like real `go` statements.
 * Everything is driven by a seeded PRNG, so a given seed always gives the same run.
 */
function mrSim(G, K, mutex, seed) {
  const rnd = mulberry32(seed);
  const ops = MR_OPS[mutex ? "mutex" : "race"];
  const gs = Array.from({ length: G }, (_, i) => ({ i, done: 0, pc: 0, reg: 0, loadedAt: -1, start: i === 0 ? 0 : i * 36 + Math.floor(rnd() * 12) }));
  let counter = 0, lock = -1, step = 0, finished = 0, stale = 0;
  const total = G * K;
  const steps = [];
  const LIM = 4000;
  const raw = [[0, 0, 0]];
  while (finished < G) {
    const recs = [];
    const order = gs.filter((g) => g.done < K && step >= g.start);
    for (let j = order.length - 1; j > 0; j--) {
      const k = Math.floor(rnd() * (j + 1));
      [order[j], order[k]] = [order[k], order[j]];
    }
    for (const g of order) {
      if (rnd() < 0.15) continue; // stalled this step
      const op = ops[g.pc];
      const rec = { g: g.i, op, v: null, bad: false };
      if (op === "LOCK" && lock >= 0) {
        rec.op = "WAIT";
        recs.push(rec);
        continue;
      }
      if (op === "LOCK") lock = g.i;
      else if (op === "LOAD") {
        g.reg = counter;
        rec.v = counter;
        g.loadedAt = step;
      } else if (op === "ADD") {
        g.reg += 1;
        rec.v = g.reg;
      } else if (op === "STORE") {
        if (counter !== g.reg - 1) {
          rec.bad = true; // another goroutine stored since our LOAD: we overwrite it
          rec.over = counter;
          rec.from = g.loadedAt;
          stale++;
        }
        counter = g.reg;
        rec.v = counter;
      } else if (op === "UNLOCK") lock = -1;
      recs.push(rec);
      g.pc++;
      if (g.pc === ops.length) {
        g.pc = 0;
        g.done++;
        if (g.done === K) finished++;
      }
    }
    if (step < LIM) steps.push(recs);
    step++;
    if (step % 16 === 0) raw.push([step, counter, gs.reduce((a, x) => a + x.done, 0)]);
  }
  raw.push([step, counter, total]);
  const every = Math.max(1, Math.ceil(raw.length / 160));
  const curve = raw.filter((_, i) => i % every === 0 || i === raw.length - 1);
  return { counter, total, n: step, steps, curve, stale };
}

/** Pick 16 consecutive steps worth zooming into: a lost update, or a goroutine waiting on the lock. */
function mrWindow(steps, mutex) {
  const W = 16;
  for (let k = 0; k < steps.length; k++) {
    for (const r of steps[k]) {
      if (!mutex && r.bad && k - r.from <= W - 4) {
        const start = Math.max(0, r.from - 3);
        return { start, end: Math.min(steps.length, start + W), focus: k, rec: r };
      }
      if (mutex && r.op === "WAIT") {
        const start = Math.max(0, k - 6);
        return { start, end: Math.min(steps.length, start + W), focus: k, rec: r };
      }
    }
  }
  return { start: 0, end: Math.min(steps.length, W), focus: -1, rec: null };
}

const MR_TONE = { LOAD: C.sky, ADD: "#64748b", STORE: C.emerald, LOCK: C.brandL, UNLOCK: C.brandL, WAIT: C.amber };

export function MutexRace({ params = {} }) {
  const prm = obj(params);
  const [G, setG] = useState(() => int(prm.goroutines, 4, 1, 8));
  const [K, setK] = useState(() => int(prm.increments, 1000, 1, 10000));
  const [mutex, setMutex] = useState(() => prm.mutex === true);
  const [run, setRun] = useState(0);
  const [prog, setProg] = useState(1); // 0..1 progress of the animated run
  const [playing, setPlaying] = useState(false);
  const sim = useMemo(() => mrSim(G, K, mutex, 7 + run * 7919 + G * 31 + K), [G, K, mutex, run]);
  const win = useMemo(() => mrWindow(sim.steps, mutex), [sim, mutex]);
  // counter value after each step of the zoom window (and who holds the lock)
  const zoom = useMemo(() => {
    let ctr = 0, holder = -1, holderAtFocus = -1;
    const after = [];
    for (let k = 0; k < win.end; k++) {
      for (const r of sim.steps[k]) {
        if (r.op === "STORE") ctr = r.v;
        if (r.op === "LOCK") holder = r.g;
        if (r.op === "UNLOCK") holder = -1;
        if (k === win.focus && r.op === "WAIT" && holderAtFocus < 0) holderAtFocus = holder;
      }
      if (k >= win.start) after.push(ctr);
    }
    return { after, holderAtFocus };
  }, [sim, win]);

  useLoop(playing, (dt) => {
    setProg((p) => {
      const q = Math.min(1, p + dt / 1.6);
      if (q >= 1) setPlaying(false);
      return q;
    });
  });
  const start = (patch) => {
    patch && patch();
    setProg(0);
    setPlaying(true);
  };

  const idx = clamp(Math.floor(clamp(prog, 0, 1) * (sim.curve.length - 1)), 0, sim.curve.length - 1);
  const [, cNow, incNow] = sim.curve[idx];
  const done = prog >= 1;
  const lost = sim.total - sim.counter;

  // zoomed timeline geometry
  const cols = sim.steps.slice(win.start, win.end);
  const LW = 24, CW = (340 - LW - 4) / 16, RH = 17;
  const TH = 14 + G * RH + 22;
  const focus = win.rec;

  // curve chart
  const CH = 92;
  const cx = (i) => 30 + (i / sim.n) * 300;
  const cy = (v) => CH - 14 - (v / sim.total) * (CH - 24);
  const shownCurve = sim.curve.slice(0, idx + 1);

  const code = mutex
    ? ["var counter int", "var mu sync.Mutex", "var wg sync.WaitGroup", `for g := 0; g < ${G}; g++ {`, "    wg.Add(1)", "    go func() {", "        defer wg.Done()", `        for i := 0; i < ${K}; i++ {`, "            mu.Lock()            // one goroutine at a time", "            counter++", "            mu.Unlock()", "        }", "    }()", "}", "wg.Wait()", `fmt.Println(counter)           // always ${sim.total}`]
    : ["var counter int", "var wg sync.WaitGroup", `for g := 0; g < ${G}; g++ {`, "    wg.Add(1)", "    go func() {", "        defer wg.Done()", `        for i := 0; i < ${K}; i++ {`, "            counter++            // LOAD, ADD, STORE: not atomic!", "        }", "    }()", "}", "wg.Wait()", `fmt.Println(counter)           // ${sim.counter} this run, not ${sim.total}`];
  const marks = mutex ? { 8: "brand", 9: "emerald", 10: "brand" } : { 7: "rose", 12: G > 1 && lost ? "rose" : undefined };

  let story = "";
  if (focus && !mutex) {
    const n = focus.over - focus.v + 1;
    story = `Step ${focus.from + 1}: G${focus.g + 1} loaded ${focus.v - 1}. Before it stored, another goroutine stored, so counter became ${focus.over}. At step ${win.focus + 1}, G${focus.g + 1} stored its stale ${focus.v - 1} + 1 = ${focus.v}, overwriting that: ${n} increment${n === 1 ? "" : "s"} lost. Two goroutines did counter++ but the counter went up by less.`;
  } else if (focus && mutex) {
    story = `G${focus.g + 1} reached mu.Lock() while ${zoom.holderAtFocus >= 0 ? `G${zoom.holderAtFocus + 1}` : "another goroutine"} held the lock, so it waits until Unlock. Load, add and store of one goroutine can no longer interleave with another's, so no update is lost (at the cost of waiting).`;
  } else if (G === 1) story = "With a single goroutine there is nobody to interleave with, so counter++ is safe. Add goroutines.";
  else story = "No lost update in this run: each goroutine finished its loop before the next one really got going (starting a goroutine takes time). Raise the increments or press Rerun.";

  return (
    <Card
      title="Data race: why counter++ needs a mutex"
      params={params}
      caption="counter++ compiles to three steps: load the value, add 1, store it back. Press Run: without a mutex, two goroutines can both load the same value before either stores it, and the stale store wipes out other goroutines' increments, so the final count comes out too low (and different each run). Turn on sync.Mutex and the three steps become one critical section: the total is exact. Simplified model: goroutines on parallel cores executing one instruction per step in a random (seeded) order; real hardware adds caches and reordering, which only makes it worse. go run -race reports the bug even when the count happens to come out right."
    >
      <Row className="mt-0">
        <Toggle label={<span>use <span className="font-mono">sync.Mutex</span></span>} on={mutex} onChange={(v) => start(() => setMutex(v))} />
        <Button primary onClick={() => start()}>{playing ? "Running…" : "Run"}</Button>
        <Button onClick={() => start(() => setRun((r) => r + 1))}>Rerun (new schedule)</Button>
      </Row>
      <Row>
        <Slider label="goroutines" value={G} min={1} max={8} onChange={(v) => start(() => setG(v))} />
        <Slider label="increments" value={K} min={10} max={10000} step={10} onChange={(v) => start(() => setK(v))} />
      </Row>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile label="expected" value={sim.total.toLocaleString("en-US")} sub={`${G} × ${K.toLocaleString("en-US")}`} />
        <Tile label="counter" value={(done ? sim.counter : cNow).toLocaleString("en-US")} color={done ? (lost ? "text-rose-300" : "text-emerald-300") : "text-slate-200"} sub={done ? (lost ? "too low" : "exact") : "running…"} />
        <Tile label="lost updates" value={done ? lost.toLocaleString("en-US") : (incNow - cNow).toLocaleString("en-US")} color={lost ? "text-rose-300" : "text-emerald-300"} sub={`${((100 * (done ? lost : incNow - cNow)) / Math.max(1, sim.total)).toFixed(1)}% of increments`} />
      </div>
      <svg viewBox={`0 0 340 ${CH}`} className="mt-2 h-auto w-full select-none" role="img" aria-label="Counter value over time">
        <line x1="30" y1={CH - 14} x2="330" y2={CH - 14} stroke={C.axis} />
        <line x1="30" y1="10" x2="30" y2={CH - 14} stroke={C.axis} />
        <text x="26" y="13" textAnchor="end" fontSize="7.5" fill={C.dim}>{sim.total}</text>
        <text x="26" y={CH - 14} textAnchor="end" fontSize="7.5" fill={C.dim}>0</text>
        <text x="330" y={CH - 3} textAnchor="end" fontSize="7.5" fill={C.dim}>time (scheduler steps) →</text>
        <polyline fill="none" stroke={C.dim} strokeDasharray="3 3" strokeWidth="1.2" points={shownCurve.map(([i, , d]) => `${cx(i)},${cy(d)}`).join(" ")} />
        <polyline fill="none" stroke={lost ? C.rose : C.emerald} strokeWidth="1.8" points={shownCurve.map(([i, c]) => `${cx(i)},${cy(c)}`).join(" ")} />
        <text x="36" y="20" fontSize="8" fill={C.dim}>- - increments done</text>
        <text x="36" y="31" fontSize="8" fill={lost ? C.rose : C.emerald}>── counter value</text>
      </svg>
      <Label className="mb-1 mt-2">zoom: 16 consecutive steps{focus ? (mutex ? " around a wait for the lock" : " around a lost update") : ""} · one lane per goroutine</Label>
      <svg viewBox={`0 0 340 ${TH}`} className="h-auto w-full select-none" role="img" aria-label="Interleaving of goroutine steps">
        {Array.from({ length: G }, (_, g) => (
          <g key={g}>
            <text x="2" y={14 + g * RH + 11} fontSize="8.5" fontFamily={MONO} fill={C.text}>G{g + 1}</text>
            <line x1={LW} x2="338" y1={14 + g * RH + RH / 2} y2={14 + g * RH + RH / 2} stroke={C.grid} />
          </g>
        ))}
        <text x={LW} y="9" fontSize="7.5" fill={C.dim}>step {win.start + 1} →</text>
        {cols.map((recs, k) =>
          recs.map((r) => {
            const x = LW + k * CW;
            const y = 14 + r.g * RH;
            const isFocus = win.start + k === win.focus && focus && r.g === focus.g;
            const isFrom = focus && !mutex && win.start + k === focus.from && r.g === focus.g;
            const col = r.bad ? C.rose : MR_TONE[r.op];
            const lab = r.op === "LOAD" ? `R${r.v}` : r.op === "ADD" ? "+1" : r.op === "STORE" ? `W${r.v}` : r.op === "LOCK" ? "L" : r.op === "UNLOCK" ? "U" : "wait";
            return (
              <g key={`${k}-${r.g}`}>
                <rect x={x + 0.8} y={y + 1.5} width={CW - 1.6} height={RH - 3} rx="3" fill={`${col}${isFocus || isFrom ? "55" : "26"}`} stroke={col} strokeWidth={isFocus || isFrom ? 1.6 : 0.8} />
                <text x={x + CW / 2} y={y + RH / 2 + 3} textAnchor="middle" fontSize={lab.length > 3 ? 6 : 7.5} fontFamily={MONO} fill="#e2e8f0">{lab}</text>
              </g>
            );
          }),
        )}
        {/* counter after each step */}
        <text x="2" y={TH - 6} fontSize="7.5" fill={C.dim}>ctr</text>
        {zoom.after.map((v, k) => (
          <text key={k} x={LW + k * CW + CW / 2} y={TH - 6} textAnchor="middle" fontSize={String(v).length > 3 ? 6 : 7} fontFamily={MONO} fill={cols[k] && cols[k].some((r) => r.bad) ? C.rose : C.dim}>{v}</text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3">
        <Legend color={C.sky} label="R = load counter" />
        <Legend color={C.emerald} label="W = store" />
        <Legend color={C.rose} label="stale store (lost update)" />
        {mutex && <Legend color={C.brandL} label="L/U = Lock/Unlock" />}
        {mutex && <Legend color={C.amber} label="wait = blocked on Lock" />}
      </div>
      <div className="mt-2 rounded-lg bg-ink-800 px-3 py-2 text-xs leading-relaxed text-slate-300">{story}</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Code lines={code} marks={marks} label={mutex ? "with sync.Mutex" : "racy version"} />
        <Pre className="text-[10.5px]">
          <span className="text-slate-500">$ go run main.go{"\n"}</span>
          <span className={lost ? "text-rose-300" : "text-emerald-300"}>{done ? sim.counter : "…"}</span>
          {!mutex && G > 1 && (
            <>
              <span className="text-slate-500">{"\n\n$ go run -race main.go\n"}</span>
              <span className="text-amber-300">{"==================\nWARNING: DATA RACE\nRead at 0x00c000014098 by goroutine 8:\n  main.main.func1()\n      main.go:8 +0x4c\n\nPrevious write at 0x00c000014098 by goroutine 7:\n  main.main.func1()\n      main.go:8 +0x5c\n=================="}</span>
              <span className="text-slate-500">{"\n\n// alternatives: sync.Mutex, or\n// var counter atomic.Int64; counter.Add(1)"}</span>
            </>
          )}
        </Pre>
      </div>
    </Card>
  );
}

/* ---------- context-timeout: cancellation propagates down the context tree ---------- */

const CT_GOS = [
  { id: "g1", name: "fetchUser", parent: "a", dur: 120 },
  { id: "g2", name: "fetchAvatar", parent: "a", dur: 450 },
  { id: "g3", name: "fetchOrders", parent: "b", dur: 250 },
  { id: "g4", name: "fetchInvoices", parent: "b", dur: 600 },
];
const CT_CTX = {
  bg: { label: "context.Background()", short: "Background", parent: null },
  to: { label: "WithTimeout", short: "ctx", parent: "bg", cancel: "cancel()" },
  a: { label: "WithCancel", short: "usersCtx", parent: "to", cancel: "cancelUsers()" },
  b: { label: "WithCancel", short: "ordersCtx", parent: "to", cancel: "cancelOrders()" },
};
const ERR_TXT = { DeadlineExceeded: "context deadline exceeded", Canceled: "context canceled" };

/** When each context is done, and why, given the deadline and the manual cancel() calls. */
function ctResolve(T, cancels) {
  const out = { bg: { at: Infinity, err: null } };
  const own = (k) => (cancels[k] != null ? { at: cancels[k], err: "Canceled" } : { at: Infinity, err: null });
  const first = (...xs) => xs.reduce((m, x) => (x.at < m.at ? x : m), { at: Infinity, err: null });
  out.to = first({ at: T, err: "DeadlineExceeded" }, own("to"));
  out.a = first(out.to, own("a"));
  out.b = first(out.to, own("b"));
  const gos = {};
  for (const g of CT_GOS) {
    const p = out[g.parent];
    gos[g.id] = g.dur < p.at ? { at: g.dur, ok: true } : { at: p.at, ok: false, err: p.err };
  }
  return { ctx: out, gos };
}

export function ContextTimeout({ params = {} }) {
  const prm = obj(params);
  const [T, setT] = useState(() => Math.round(clamp(num(prm.timeoutMs, 300), 50, 1000) / 10) * 10);
  const [cancels, setCancels] = useState({});
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(0);
  const force = useForce();
  const END = clamp(Math.max(700, T + 100), 700, 1100);

  useLoop(playing, (dt) => {
    tRef.current = Math.min(END, tRef.current + dt * 1000 * 0.32);
    if (tRef.current >= END) setPlaying(false);
    force();
  });
  const t = tRef.current;
  const R = ctResolve(T, cancels);
  const reset = (nextT = T) => {
    tRef.current = 0;
    setCancels({});
    setPlaying(false);
    if (nextT !== T) setT(nextT);
    force();
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (tRef.current >= END) {
      tRef.current = 0;
      setCancels({});
    }
    setPlaying(true);
  };
  const cancelNode = (k) => {
    if (cancels[k] != null || R.ctx[k].at <= t) return;
    setCancels((c) => ({ ...c, [k]: Math.round(t) }));
  };
  const isDone = (k) => R.ctx[k].at <= t;
  const ended = t >= END;

  // tree layout
  const P = { bg: [170, 18], to: [170, 66], a: [85, 116], b: [255, 116] };
  const GX = [44, 127, 213, 296];
  const GY = 178;
  const nodeBox = (k) => {
    const [x, y] = P[k];
    const d = isDone(k);
    const err = R.ctx[k].err;
    const w = k === "bg" ? 130 : 118;
    const col = d ? (err === "DeadlineExceeded" ? C.amber : C.rose) : k === "bg" ? C.dim : C.brandL;
    return (
      <g key={k}>
        <rect x={x - w / 2} y={y - 15} width={w} height="30" rx="7" fill={d ? "#2a1620" : C.ink800} stroke={col} strokeWidth={d ? 1.5 : 1} style={{ transition: "fill 0.3s, stroke 0.3s" }} />
        <text x={x} y={y - 2} textAnchor="middle" fontSize="9" fontWeight="600" fill="#e2e8f0" fontFamily={MONO}>{k === "bg" ? CT_CTX[k].label : `${CT_CTX[k].short} · ${CT_CTX[k].label}`}</text>
        <text x={x} y={y + 9.5} textAnchor="middle" fontSize="7.5" fill={d ? col : C.dim} fontFamily={MONO}>
          {k === "bg" ? "never canceled" : d ? `Err: ${err === "DeadlineExceeded" ? "DeadlineExceeded" : "Canceled"}` : k === "to" ? `deadline in ${Math.max(0, Math.ceil(T - t))}ms` : "Done() open"}
        </text>
      </g>
    );
  };
  const edge = (from, to2, key) => {
    const d = isDone(from);
    return <line key={key} x1={from === "bg" ? P.bg[0] : P[from][0]} y1={P[from][1] + 15} x2={to2[0]} y2={to2[1] - 15} stroke={d ? C.rose : C.axis} strokeWidth={d ? 1.5 : 1} strokeDasharray={d ? "4 2" : undefined} />;
  };

  // timeline geometry
  const TLX = 92, TLW = 240;
  const tx = (ms) => TLX + (ms / END) * TLW;
  const printed = CT_GOS.map((g) => ({ g, r: R.gos[g.id] }))
    .filter(({ r }) => r.at <= t)
    .sort((x, y) => x.r.at - y.r.at)
    .map(({ g, r }) => (r.ok ? `${g.name}: ok` : `${g.name} ${ERR_TXT[r.err]}`));
  const anyCanceled = CT_GOS.some((g) => !R.gos[g.id].ok && R.gos[g.id].at <= t);
  const anyOk = CT_GOS.some((g) => R.gos[g.id].ok && R.gos[g.id].at <= t);
  const code = [
    `ctx, cancel := context.WithTimeout(context.Background(), ${T}*time.Millisecond)`,
    "defer cancel()                      // always release the timer",
    "usersCtx, cancelUsers := context.WithCancel(ctx)",
    "ordersCtx, cancelOrders := context.WithCancel(ctx)",
    "defer cancelUsers()",
    "defer cancelOrders()",
    "",
    ...CT_GOS.map((g) => `go worker(${CT_CTX[g.parent].short}, "${g.name}", ${g.dur}*time.Millisecond)`),
    "",
    "func worker(ctx context.Context, name string, d time.Duration) {",
    "    work := make(chan string, 1)    // buffered, so the sender never leaks",
    '    go func() { time.Sleep(d); work <- name + ": ok" }()',
    "    select {",
    "    case <-ctx.Done():",
    "        fmt.Println(name, ctx.Err()) // DeadlineExceeded or Canceled",
    "    case res := <-work:",
    "        fmt.Println(res)",
    "    }",
    "}",
  ];
  const marks = {};
  if (anyCanceled) [16, 17].forEach((i) => (marks[i] = "rose"));
  if (anyOk) [18, 19].forEach((i) => (marks[i] = "emerald"));
  if (isDone("to") && R.ctx.to.err === "DeadlineExceeded") marks[0] = "amber";

  return (
    <Card
      title="context: deadlines and cancellation flow down the tree"
      params={params}
      caption="Press Play: four goroutines do work of different lengths under one WithTimeout context. When the deadline fires, Done() closes on that context and on every context derived from it, so each unfinished goroutine's select takes the <-ctx.Done() branch and ctx.Err() is context.DeadlineExceeded. Click a cancel button while it runs: only that subtree stops, with context.Canceled. Cancellation never flows up to a parent. In a Gin handler, start from c.Request.Context(), which is also canceled when the client disconnects."
    >
      <svg viewBox="0 0 340 214" className="h-auto w-full select-none" role="img" aria-label="Context tree">
        {edge("bg", P.to, "e0")}
        {edge("to", P.a, "e1")}
        {edge("to", P.b, "e2")}
        {CT_GOS.map((g, i) => edge(g.parent, [GX[i], GY], g.id))}
        {["bg", "to", "a", "b"].map(nodeBox)}
        {CT_GOS.map((g, i) => {
          const r = R.gos[g.id];
          const fin = r.at <= t;
          const prog = clamp(Math.min(t, r.at) / g.dur, 0, 1);
          const col = fin ? (r.ok ? C.emerald : r.err === "DeadlineExceeded" ? C.amber : C.rose) : C.sky;
          const x = GX[i];
          return (
            <g key={g.id}>
              <rect x={x - 40} y={GY - 15} width="80" height="44" rx="7" fill={C.ink800} stroke={col} strokeWidth={fin ? 1.5 : 1} />
              <text x={x} y={GY - 2} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#e2e8f0" fontFamily={MONO}>{g.name}</text>
              <text x={x} y={GY + 9} textAnchor="middle" fontSize="7" fill={C.dim} fontFamily={MONO}>work {g.dur}ms</text>
              <rect x={x - 32} y={GY + 14} width="64" height="4" rx="2" fill={C.ink950} />
              <rect x={x - 32} y={GY + 14} width={64 * prog} height="4" rx="2" fill={col} />
              <text x={x} y={GY + 26} textAnchor="middle" fontSize="7" fill={col} fontFamily={MONO}>
                {!fin ? (t > 0 ? "working…" : "goroutine") : r.ok ? "result ✓" : r.err === "DeadlineExceeded" ? "DeadlineExceeded" : "Canceled"}
              </text>
            </g>
          );
        })}
      </svg>
      <svg viewBox="0 0 340 92" className="mt-1 h-auto w-full select-none" role="img" aria-label="Timeline">
        {CT_GOS.map((g, i) => {
          const r = R.gos[g.id];
          const y = 6 + i * 17;
          const end = Math.min(r.at, t);
          return (
            <g key={g.id}>
              <text x={TLX - 6} y={y + 9} textAnchor="end" fontSize="8" fill={C.text} fontFamily={MONO}>{g.name}</text>
              <rect x={tx(0)} y={y + 2} width={tx(g.dur) - tx(0)} height="9" rx="2" fill="none" stroke={C.ink600} strokeDasharray="2 2" />
              <rect x={tx(0)} y={y + 2} width={Math.max(0, tx(end) - tx(0))} height="9" rx="2" fill={r.at <= t ? (r.ok ? C.emerald : r.err === "DeadlineExceeded" ? C.amber : C.rose) : C.sky} opacity="0.75" />
            </g>
          );
        })}
        <line x1={tx(T)} x2={tx(T)} y1="2" y2="74" stroke={C.amber} strokeDasharray="3 2" />
        <text x={tx(T)} y="84" textAnchor="middle" fontSize="7.5" fill={C.amber}>deadline {T}ms</text>
        {Object.entries(cancels).map(([k, at]) => (
          <g key={k}>
            <line x1={tx(at)} x2={tx(at)} y1="2" y2="74" stroke={C.rose} strokeDasharray="2 2" />
            <text x={tx(at)} y="91" textAnchor="middle" fontSize="7" fill={C.rose}>{CT_CTX[k].cancel}</text>
          </g>
        ))}
        <line x1={tx(t)} x2={tx(t)} y1="0" y2="76" stroke="#e2e8f0" strokeWidth="1" />
        <text x={TLX} y="84" fontSize="7" fill={C.dim}>0</text>
        <text x={TLX + TLW} y="84" textAnchor="end" fontSize="7" fill={C.dim}>{END}ms</text>
      </svg>
      <Row>
        <Button primary onClick={play}>{playing ? "Pause" : ended ? "Replay" : t > 0 ? "Resume" : "Play"}</Button>
        <Button onClick={() => reset()}>Reset</Button>
        <span className="ml-auto"><Stat label="t" value={`${Math.round(t)}ms`} /></span>
      </Row>
      <Row>
        {["to", "a", "b"].map((k) => (
          <Button key={k} onClick={() => cancelNode(k)} disabled={isDone(k) || ended} className="font-mono" aria-label={`call ${CT_CTX[k].cancel}`}>
            {CT_CTX[k].cancel}
          </Button>
        ))}
        <Slider label="timeout" value={T} min={50} max={1000} step={10} onChange={(v) => reset(v)} display={`${T}ms`} />
      </Row>
      <div className="mt-3 overflow-x-auto rounded-lg border border-ink-700">
        <table className="w-full min-w-[300px] text-left font-mono text-[10.5px]">
          <thead className="bg-ink-800 text-slate-500">
            <tr>
              <th className="px-2 py-1 font-normal">goroutine</th>
              <th className="px-2 py-1 font-normal">select took</th>
              <th className="px-2 py-1 font-normal">ctx.Err()</th>
            </tr>
          </thead>
          <tbody>
            {CT_GOS.map((g) => {
              const r = R.gos[g.id];
              const fin = r.at <= t;
              return (
                <tr key={g.id} className="border-t border-ink-700">
                  <td className="px-2 py-1 text-slate-300">{g.name}</td>
                  <td className={`px-2 py-1 ${!fin ? "text-slate-500" : r.ok ? "text-emerald-300" : "text-rose-300"}`}>{!fin ? "waiting…" : r.ok ? `res := <-work @${r.at}ms` : `<-ctx.Done() @${r.at}ms`}</td>
                  <td className={`px-2 py-1 ${!fin ? "text-slate-500" : r.ok ? "text-slate-400" : r.err === "DeadlineExceeded" ? "text-amber-300" : "text-rose-300"}`}>{!fin ? "nil" : r.ok ? "nil" : `context.${r.err}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">stdout</Label>
          <Pre className="min-h-[5rem] text-[10.5px]">{printed.length ? printed.join("\n") : <span className="text-slate-500">nothing printed yet</span>}</Pre>
        </div>
        <div className="min-w-0 self-end rounded-lg bg-ink-800 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-slate-400">
            ctx.Err() returns <span className="font-mono text-amber-300">context.DeadlineExceeded</span> (prints “context deadline exceeded”) or <span className="font-mono text-rose-300">context.Canceled</span> (prints “context canceled”). A child inherits its parent's error, so usersCtx also reports DeadlineExceeded when ctx times out.
          </p>
        </div>
      </div>
      <Code className="mt-2" lines={code} marks={marks} label="main.go" />
    </Card>
  );
}

/* ---------- slice-growth: slice headers, shared backing arrays, append ---------- */

// Go 1.22 malloc size classes (bytes); an []int element is 8 bytes. Bigger allocations round up to whole 8 KiB pages.
const SIZE_CLASSES = [8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 352, 384, 416, 448, 480, 512, 576, 640, 704, 768, 896, 1024, 1152, 1280, 1408, 1536, 1792, 2048, 2304, 2688, 3072, 3200, 3456, 4096, 4864, 5376, 6144, 6528, 6784, 6912, 8192, 9472, 9728, 10240, 10880, 12288, 13568, 14336, 16384, 18432, 19072, 20480, 21760, 24576, 27264, 28672, 32768];

/** runtime.nextslicecap + roundupsize for 8-byte elements (Go 1.20+). */
function sgNextCap(oldCap, newLen) {
  let nc = oldCap;
  const dbl = nc + nc;
  if (newLen > dbl) nc = newLen;
  else if (oldCap < 256) nc = dbl;
  else {
    do nc += (nc + 3 * 256) >> 2;
    while (nc < newLen);
  }
  const bytes = nc * 8;
  const cls = SIZE_CLASSES.find((c) => c >= bytes) ?? Math.ceil(bytes / 8192) * 8192;
  return cls / 8;
}

const SG_VARS = { s: { col: C.sky, cls: "text-sky-300" }, t: { col: C.amber, cls: "text-amber-300" }, c: { col: C.emerald, cls: "text-emerald-300" } };
const SG_MAXCAP = 48;

function sgInit() {
  return {
    arrays: [{ id: 1, cells: [1, 2, 3] }],
    vars: { s: { arr: 1, off: 0, len: 3, cap: 3 } },
    nextArr: 2,
    nextVal: 4,
    tVal: 100,
    log: [{ code: "s := []int{1, 2, 3}", out: "[1 2 3] len=3 cap=3", tone: "" }],
    dead: null,
  };
}

const sgView = (st, h) => st.arrays.find((a) => a.id === h.arr).cells.slice(h.off, h.off + h.len);
const sgFmt = (st, name) => {
  const h = st.vars[name];
  return `${name} = [${sgView(st, h).join(" ")}] len=${h.len} cap=${h.cap}`;
};

/** Apply one action; returns a new state (pure). */
function sgDo(prev, act) {
  const st = JSON.parse(JSON.stringify(prev));
  const arr = (id) => st.arrays.find((a) => a.id === id);
  const outLines = [];
  let note = "";
  let tone = "";
  const append = (name, v) => {
    const h = st.vars[name];
    const A = arr(h.arr);
    if (h.len < h.cap) {
      const k = h.off + h.len;
      const old = A.cells[k];
      A.cells[k] = v;
      h.len++;
      const hit = Object.entries(st.vars).filter(([n, o]) => n !== name && o.arr === h.arr && k >= o.off && k < o.off + o.len);
      note = `len < cap, so append wrote ${v} into the existing array (index ${k}) without allocating.`;
      if (hit.length) {
        note += ` ${hit.map(([n, o]) => `${n}[${k - o.off}]`).join(" and ")} shared that slot: it was ${old}, now it is ${v}!`;
        tone = "rose";
      }
    } else {
      const nc = sgNextCap(h.cap, h.len + 1);
      const cells = sgView(st, h).concat([v]);
      while (cells.length < nc) cells.push(0);
      const id = st.nextArr++;
      st.arrays.push({ id, cells });
      const oldCap = h.cap;
      st.vars[name] = { arr: id, off: 0, len: h.len + 1, cap: nc };
      const others = Object.entries(st.vars).filter(([n, o]) => n !== name && o.arr === h.arr).map(([n]) => n);
      note = `len == cap (${oldCap}), so append allocated a new array with cap ${nc} (${oldCap < 256 ? "doubled" : "~1.25× + 192"}${nc !== Math.max(h.len + 1, oldCap * 2) && oldCap < 256 ? `, rounded up to a ${nc * 8}-byte size class` : ""}), copied ${h.len} element${h.len === 1 ? "" : "s"} and wrote ${v}.`;
      note += others.length ? ` ${others.join(", ")} still point${others.length === 1 ? "s" : ""} at the old array: from now on they no longer share data with ${name}.` : " The old array is now unreachable and will be garbage collected.";
      tone = "sky";
    }
  };
  let code = "";
  if (act === "appendS") {
    const v = st.nextVal++;
    code = `s = append(s, ${v})`;
    append("s", v);
    outLines.push(sgFmt(st, "s"));
  } else if (act === "reslice") {
    const h = st.vars.s;
    code = "s = s[1:3]";
    if (3 > h.cap) {
      outLines.push(`panic: runtime error: slice bounds out of range [:3] with capacity ${h.cap}`);
      note = "The high bound may go past len(s), but never past cap(s).";
      tone = "rose";
    } else {
      st.vars.s = { arr: h.arr, off: h.off + 1, len: 2, cap: h.cap - 1 };
      outLines.push(sgFmt(st, "s"));
      note = `No copy: s now starts one element later in the same array. cap shrinks to ${h.cap - 1} (from the new start to the end of the array).${h.len < 3 ? " s[1:3] reached past the old len(s): that is allowed up to cap(s), and it exposes the element that was hidden there." : ""}`;
    }
  } else if (act === "makeT") {
    const h = st.vars.s;
    code = `${st.vars.t ? "t = " : "t := "}s[:2]`;
    if (2 > h.cap) {
      outLines.push(`panic: runtime error: slice bounds out of range [:2] with capacity ${h.cap}`);
      tone = "rose";
    } else {
      st.vars.t = { arr: h.arr, off: h.off, len: 2, cap: h.cap };
      outLines.push(sgFmt(st, "t"));
      note = `t is a new header (ptr, len 2, cap ${h.cap}) over the same array as s. Nothing is copied.${h.cap > 2 ? ` Because cap(t) = ${h.cap} > len(t), appending to t will write into s's elements.` : ""}`;
    }
  } else if (act === "appendT") {
    const v = st.tVal;
    st.tVal += 100;
    code = `t = append(t, ${v})`;
    append("t", v);
    outLines.push(sgFmt(st, "t"), sgFmt(st, "s"));
  } else if (act === "setT") {
    code = "t[0] = -1";
    const h = st.vars.t;
    const A = arr(h.arr);
    A.cells[h.off] = -1;
    const hit = Object.entries(st.vars).filter(([n, o]) => n !== "t" && o.arr === h.arr && h.off >= o.off && h.off < o.off + o.len);
    outLines.push(sgFmt(st, "t"), sgFmt(st, "s"));
    note = hit.length ? `Same array: ${hit.map(([n, o]) => `${n}[${h.off - o.off}]`).join(", ")} changed too.` : "t no longer shares its array with s, so s is unaffected.";
    tone = hit.length ? "rose" : "emerald";
  } else if (act === "copy") {
    const h = st.vars.s;
    const id = st.nextArr++;
    const cells = sgView(st, h);
    st.arrays.push({ id, cells: cells.slice() });
    st.vars.c = { arr: id, off: 0, len: h.len, cap: h.len };
    code = `${prev.vars.c ? "c = " : "c := "}make([]int, len(s))\nn := copy(c, s)`;
    outLines.push(`n = ${h.len}`, sgFmt(st, "c"));
    note = "copy duplicates the elements into c's own array: later writes to s or t never show up in c. copy returns the number of elements copied, min(len(c), len(s)).";
    tone = "emerald";
  }
  // keep arrays that are referenced; remember the last one that just became garbage
  const used = new Set(Object.values(st.vars).map((h) => h.arr));
  const gone = st.arrays.filter((a) => !used.has(a.id));
  st.arrays = st.arrays.filter((a) => used.has(a.id));
  st.dead = gone.length ? gone[gone.length - 1] : null;
  st.log.push({ code, out: outLines.join("\n"), note, tone });
  if (st.log.length > 30) st.log.splice(0, st.log.length - 30);
  return st;
}

export function SliceGrowth({ params = {} }) {
  obj(params);
  const [st, setSt] = useState(sgInit);
  const logRef = useRef(null);
  const do_ = (a) => setSt((s) => sgDo(s, a));
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight; // keep the newest line in view
  }, [st]);
  const lastLog = st.log[st.log.length - 1];
  const hasT = !!st.vars.t;
  const sTooBig = st.vars.s.len >= st.vars.s.cap && sgNextCap(st.vars.s.cap, st.vars.s.len + 1) > SG_MAXCAP;
  const tTooBig = hasT && st.vars.t.len >= st.vars.t.cap && sgNextCap(st.vars.t.cap, st.vars.t.len + 1) > SG_MAXCAP;

  // layout: one block per array (live ones, then the newest garbage one, faded)
  const PER = 12, CW = 25, CH = 22, LM = 20;
  const blocks = [];
  let y = 4;
  const arrays = [...st.arrays.map((a) => ({ a, dead: false })), ...(st.dead ? [{ a: st.dead, dead: true }] : [])];
  for (const { a, dead } of arrays) {
    const rows = Math.ceil(a.cells.length / PER);
    const refs = Object.entries(st.vars).filter(([, h]) => h.arr === a.id);
    const rs = CH + 6 + refs.length * 6; // row stride: cells + one bracket lane per slice
    blocks.push({ a, dead, y, rows, refs, rs });
    y += 14 + rows * rs + 8;
  }
  const H = y;
  const cellXY = (b, k) => [LM + (k % PER) * CW, b.y + 14 + Math.floor(k / PER) * b.rs];

  return (
    <Card
      title="Slices: header, backing array, append and aliasing"
      params={params}
      caption="A slice is a small header (ptr, len, cap) pointing into a backing array. Try: append to s until it reallocates; then t := s[:2] and t = append(t, …): while cap allows, t writes straight into s's elements. Once an append exceeds cap, Go allocates a bigger array (doubling while cap < 256, then ~1.25× + 192, rounded up to a malloc size class) and the two slices stop sharing. Use copy for an independent slice."
    >
      <div className="flex flex-wrap gap-1.5">
        <Button primary onClick={() => do_("appendS")} disabled={sTooBig} className="font-mono">s = append(s, {st.nextVal})</Button>
        <Button onClick={() => do_("reslice")} className="font-mono">s = s[1:3]</Button>
        <Button onClick={() => do_("makeT")} className="font-mono">{hasT ? "t = s[:2]" : "t := s[:2]"}</Button>
        <Button onClick={() => do_("appendT")} disabled={!hasT || tTooBig} className="font-mono">t = append(t, {st.tVal})</Button>
        <Button onClick={() => do_("setT")} disabled={!hasT} className="font-mono">t[0] = -1</Button>
        <Button onClick={() => do_("copy")} className="font-mono">copy(c, s)</Button>
        <Button onClick={() => setSt(sgInit())}>Reset</Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(st.vars).map(([n, h]) => (
          <div key={n} className="rounded-lg border bg-ink-800 px-2.5 py-1.5 font-mono text-[11px]" style={{ borderColor: `${SG_VARS[n].col}88` }}>
            <span className={`font-semibold ${SG_VARS[n].cls}`}>{n}</span>
            <span className="text-slate-500"> {"{"}</span>
            <span className="text-slate-400">ptr</span>
            <span className="text-slate-300">: &amp;arr{h.arr}[{h.off}]</span>
            <span className="text-slate-400">, len</span>
            <span className="text-slate-200">: {h.len}</span>
            <span className="text-slate-400">, cap</span>
            <span className="text-slate-200">: {h.cap}</span>
            <span className="text-slate-500">{"}"}</span>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 324 ${H}`} className="mx-auto mt-2 block h-auto w-full max-w-[460px] select-none" role="img" aria-label="Backing arrays">
        {blocks.map((b) => {
          const covered = (k) => b.refs.filter(([, h]) => k >= h.off && k < h.off + h.len).map(([n]) => n);
          return (
            <g key={b.a.id} opacity={b.dead ? 0.35 : 1}>
              <text x={LM} y={b.y + 9} fontSize="8.5" fill={b.dead ? C.dim : C.text} fontFamily={MONO}>
                arr{b.a.id} · [{b.a.cells.length}]int{b.dead ? " · unreachable → garbage" : ""}
              </text>
              {b.a.cells.map((v, k) => {
                const [x, cy] = cellXY(b, k);
                const cov = covered(k);
                const inUse = cov.length > 0;
                const col = cov.length > 1 ? C.rose : cov.length ? SG_VARS[cov[0]].col : C.ink600;
                return (
                  <g key={k}>
                    <rect x={x} y={cy} width={CW - 3} height={CH} rx="3" fill={inUse ? `${col}22` : C.ink950} stroke={col} strokeWidth={cov.length > 1 ? 1.4 : 1} strokeDasharray={inUse ? undefined : "2 2"} />
                    <text x={x + (CW - 3) / 2} y={cy + 14} textAnchor="middle" fontSize={String(v).length > 3 ? 7.5 : 9.5} fontFamily={MONO} fill={inUse ? "#e2e8f0" : C.dim}>{v}</text>
                  </g>
                );
              })}
              {b.refs.map(([n, h], j) => {
                const laneY = (k) => cellXY(b, k)[1] + CH + 4 + j * 6;
                const segs = [];
                // draw len (solid) and cap (dashed) brackets per row segment
                const span = (from, to, dashed) => {
                  for (let k = from; k < to; ) {
                    const rowEnd = Math.min(to, (Math.floor(k / PER) + 1) * PER);
                    const [x1] = cellXY(b, k);
                    const [x2] = cellXY(b, rowEnd - 1);
                    const rowY = laneY(k);
                    segs.push(<line key={`${n}${k}${dashed}`} x1={x1 + 1} x2={x2 + CW - 4} y1={rowY} y2={rowY} stroke={SG_VARS[n].col} strokeWidth={dashed ? 1 : 2.4} strokeDasharray={dashed ? "2 2" : undefined} opacity={dashed ? 0.7 : 1} />);
                    k = rowEnd;
                  }
                };
                span(h.off, h.off + h.len, false);
                span(h.off + h.len, h.off + h.cap, true);
                const [px] = cellXY(b, h.off);
                return (
                  <g key={n}>
                    {segs}
                    <text x={px - 3} y={laneY(h.off) + 3} textAnchor="end" fontSize="8" fontWeight="700" fill={SG_VARS[n].col} fontFamily={MONO}>{n}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3">
        <Legend color={C.sky} label="s: len (solid) … cap (dashed)" />
        {hasT && <Legend color={C.amber} label="t" />}
        {st.vars.c && <Legend color={C.emerald} label="c" />}
        <Legend color={C.rose} label="shared by 2 slices" />
      </div>
      {lastLog.note && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${lastLog.tone === "rose" ? "bg-rose-500/10 text-rose-200" : "bg-ink-800 text-slate-300"}`} aria-live="polite">
          {lastLog.note}
        </div>
      )}
      <Label className="mb-1 mt-3">program so far · fmt.Println after each line</Label>
      <div ref={logRef} className="max-h-60 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px] leading-relaxed" style={NOLIG}>
        {st.log.map((l, i) => (
          <div key={i} className={`border-l-2 pl-2 ${i === st.log.length - 1 ? "border-brand-400" : "border-transparent"}`}>
            {l.code.split("\n").map((c, j) => <div key={j} className="whitespace-pre-wrap break-words">{goLine(c)}</div>)}
            <div className={`whitespace-pre-wrap break-words ${l.out.startsWith("panic") ? "text-rose-300" : "text-slate-500"}`}>{l.out.split("\n").map((o) => `// ${o}`).join("\n")}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export const WIDGETS_G = {
  "gin-lifecycle": GinLifecycle,
  "middleware-chain": MiddlewareChain,
  "router-tree": RouterTree,
  "gin-playground": GinPlayground,
  "goroutine-channel": GoroutineChannel,
  "mutex-race": MutexRace,
  "context-timeout": ContextTimeout,
  "slice-growth": SliceGrowth,
};
