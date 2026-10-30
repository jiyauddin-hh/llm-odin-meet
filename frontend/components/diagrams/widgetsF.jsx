"use client";

// Interactive FastAPI teaching widgets (set F). Each widget is rendered from a
// ```diagram fenced block in a lesson and receives optional JSON `params`.
// Everything is plain React + inline SVG. There is no real network: requests
// are simulated in memory, every "random" value (JWT signatures) is derived
// from a seeded hash, and the clock is fixed, so server and client renders match.

import { useEffect, useId, useRef, useState } from "react";

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
const BOX = "#191c2c"; // fill for boxes drawn inside the SVGs
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

/** 32-bit string hash (FNV-1a + murmur finaliser so similar strings spread out). */
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

/** UTF-8 bytes of a string (no TextEncoder needed, works the same on server and client). */
function utf8Bytes(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** Real base64url (RFC 4648 §5, no padding), exactly what a JWT uses. */
const B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function b64urlBytes(b) {
  let o = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    o += B64U[(n >> 18) & 63] + B64U[(n >> 12) & 63];
    if (i + 1 < b.length) o += B64U[(n >> 6) & 63];
    if (i + 2 < b.length) o += B64U[n & 63];
  }
  return o;
}
const b64url = (s) => b64urlBytes(utf8Bytes(s));

/** A unique id that is safe inside url(#...). */
function useSvgId() {
  return "d" + useId().replace(/[^a-zA-Z0-9]/g, "");
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

function Slider({ label, value, min, max, step = 0.01, onChange, display }) {
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

/** Small on/off switch (a real checkbox underneath, so it is keyboard accessible). */
function Toggle({ label, on, onChange, tone = "accent-brand-500", disabled }) {
  return (
    <label className={`flex items-center gap-1.5 text-xs ${disabled ? "text-slate-600" : "text-slate-300"}`}>
      <input type="checkbox" className={tone} checked={!!on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Segmented control: one of a few options. */
function Seg({ options, value, onChange }) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-ink-600">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-2.5 py-1 font-mono text-[11px] transition-colors ${v === value ? "bg-brand-500 text-white" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Small uppercase section label. */
const Label = ({ children, className = "" }) => <div className={`text-[10px] uppercase tracking-wider text-slate-500 ${className}`}>{children}</div>;

/** Monospace panel for raw HTTP, JSON and code (wraps instead of scrolling the page). */
function Pre({ children, className = "", code }) {
  const wrap = code ? "overflow-x-auto whitespace-pre" : "whitespace-pre-wrap break-words";
  return <pre className={`${wrap} rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300 ${className}`}>{children}</pre>;
}

/** Minimal Python highlighter: strings, keywords, decorators, comments, numbers. */
const PY_RE = /(#[^\n]*|"[^"\n]*"|'[^'\n]*'|@[\w.]+|\b(?:def|return|raise|if|not|in|from|import|class|None|True|False|async|await)\b|\b\d+(?:\.\d+)?\b)/g;
function PyCode({ code, className = "" }) {
  const parts = String(code).split(PY_RE);
  return (
    <Pre className={className} code>
      {parts.map((p, i) => {
        if (i % 2 === 0 || !p) return p;
        let cls = "text-sky-300"; // keywords
        if (p[0] === "#") cls = "text-slate-500 italic";
        else if (p[0] === '"' || p[0] === "'") cls = "text-emerald-300";
        else if (p[0] === "@") cls = "text-amber-300";
        else if (/^\d/.test(p)) cls = "text-fuchsia-300";
        else if (p === "None" || p === "True" || p === "False") cls = "text-fuchsia-300";
        return <span key={i} className={cls}>{p}</span>;
      })}
    </Pre>
  );
}

/** HTTP status → reason phrase and colour by class (2xx green, 3xx blue, 4xx amber, 5xx red). */
const REASONS = {
  200: "OK", 201: "Created", 204: "No Content", 307: "Temporary Redirect", 400: "Bad Request", 401: "Unauthorized",
  404: "Not Found", 405: "Method Not Allowed", 422: "Unprocessable Entity", 500: "Internal Server Error",
};
const statusHex = (s) => (s >= 500 ? C.rose : s >= 400 ? C.amber : s >= 300 ? C.sky : C.emerald);
const statusCls = (s) => (s >= 500 ? "text-rose-300" : s >= 400 ? "text-amber-300" : s >= 300 ? "text-sky-300" : "text-emerald-300");
function StatusPill({ code }) {
  return (
    <span className="rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold" style={{ color: statusHex(code), background: `${statusHex(code)}1f` }}>
      {code} {REASONS[code] || ""}
    </span>
  );
}

/** Arrowhead marker definition. */
function Arrow({ id, color }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  );
}

/**
 * JSON the way FastAPI's JSONResponse writes it: compact separators, and
 * `float` fields (price) keep their ".0" like Python does. `pretty` gives a
 * readable two-space layout, keeping short arrays such as `loc` on one line.
 */
const FLOAT_KEYS = new Set(["price"]);
function toJson(v, pretty = false, depth = 0, key = "", raw = false) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "null";
    return !raw && FLOAT_KEYS.has(key) && Number.isInteger(v) ? v.toFixed(1) : String(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return JSON.stringify(v);
  const sp = pretty ? " " : "";
  const ind = "  ".repeat(depth + 1);
  const close = "  ".repeat(depth);
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    const parts = v.map((x) => toJson(x, pretty, depth + 1, key, raw));
    if (!pretty || v.every((x) => x === null || typeof x !== "object")) return `[${parts.join("," + sp)}]`;
    return `[\n${parts.map((p) => ind + p).join(",\n")}\n${close}]`;
  }
  const ks = Object.keys(v);
  if (!ks.length) return "{}";
  // Anything under "input" is the client's raw value echoed back, so no float formatting.
  const parts = ks.map((k) => `${JSON.stringify(k)}:${sp}${toJson(v[k], pretty, depth + 1, k, raw || k === "input")}`);
  if (!pretty) return `{${parts.join(",")}}`;
  return `{\n${parts.map((p) => ind + p).join(",\n")}\n${close}}`;
}

/* ---------- jwt-auth: OAuth2 password flow + JWT bearer tokens ---------- */

// The FastAPI docs' example SECRET_KEY. The signature below is a deterministic
// stand-in for HMAC-SHA256 (same input → same bytes, any change → new bytes).
const JWT_SECRET = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7";
const JWT_T0 = 1767225600; // 2026-01-01 00:00 UTC: a fixed clock so SSR and client agree
const JWT_HEADER = { alg: "HS256", typ: "JWT" };
const JWT_HASH = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"; // bcrypt("secret")
const LANES = [
  { x: 48, w: 88, name: "Client", sub: "browser / app", color: C.sky },
  { x: 222, w: 112, name: "FastAPI", sub: "/token · /users/me", color: C.brandL },
  { x: 356, w: 80, name: "Database", sub: "users table", color: C.amber },
];

const jwtPayload = (role, exp) => ({ sub: "alice", role, exp });
/** Fake but deterministic 32-byte "HMAC-SHA256" of the signing input. */
function jwtSign(signingInput) {
  const rnd = mulberry32(hash32(`${JWT_SECRET}|${signingInput}`) ^ hash32(signingInput + "#"));
  return b64urlBytes(Array.from({ length: 32 }, () => Math.floor(rnd() * 256)));
}
/** Issue a token at unix time `iat` that lives `minutes`. */
function jwtIssue(iat, minutes) {
  const exp = iat + minutes * 60;
  const h = b64url(JSON.stringify(JWT_HEADER));
  const p = b64url(JSON.stringify(jwtPayload("user", exp)));
  return { iat, exp, h, p, sig: jwtSign(`${h}.${p}`), pAdmin: b64url(JSON.stringify(jwtPayload("admin", exp))) };
}
const utc = (sec) => new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const mins = (m) => (Math.abs(m) >= 120 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)} h` : `${m} min`);

/**
 * Build one animated exchange. Each step is an arrow between lanes
 * (from === to draws a "work" pill on that lane). Returns the steps plus the
 * HTTP response the client finally sees.
 */
function jwtFlow(kind, { tok, tampered, wrongPw, now }) {
  const S = (from, to, label, sub, color = C.text) => ({ from, to, label, sub, color });
  if (kind === "login") {
    const steps = [
      S(0, 1, "POST /token", `username=alice&password=${wrongPw ? "letmein" : "secret"}`, C.sky),
      S(1, 2, "SELECT … FROM users", "WHERE username = 'alice'", C.amber),
      S(2, 1, "user row", "hashed_password: $2b$12$…", C.amber),
      S(1, 1, wrongPw ? "verify_password() ✗" : "verify_password() ✓", "pbkdf2/bcrypt hash compare", wrongPw ? C.rose : C.emerald),
    ];
    if (wrongPw) {
      steps.push(S(1, 0, "401 Unauthorized", "Incorrect username or password", C.amber));
      return { steps, req: "POST /token", status: 401, body: { detail: "Incorrect username or password" }, extra: "WWW-Authenticate: Bearer" };
    }
    steps.push(S(1, 1, "create_access_token()", "sign {sub, role, exp} with HS256", C.brandL));
    steps.push(S(1, 0, "200 OK", '{"access_token": "eyJ…", …}', C.emerald));
    return { steps, req: "POST /token", status: 200, body: { access_token: "…", token_type: "bearer" }, login: true };
  }
  // GET /users/me
  if (!tok) {
    return {
      steps: [S(0, 1, "GET /users/me", "no Authorization header", C.sky), S(1, 0, "401 Unauthorized", "Not authenticated", C.amber)],
      req: "GET /users/me",
      status: 401,
      body: { detail: "Not authenticated" },
      extra: "WWW-Authenticate: Bearer",
    };
  }
  const sent = tampered ? tok.pAdmin : tok.p;
  const sigOk = jwtSign(`${tok.h}.${sent}`) === tok.sig;
  const expOk = now < tok.exp; // PyJWT rejects once exp <= now
  const steps = [
    S(0, 1, "GET /users/me", `Authorization: Bearer ${tok.h.slice(0, 10)}…`, C.sky),
    S(1, 1, sigOk ? "jwt.decode(): signature ✓" : "jwt.decode(): signature ✗", "recompute HMAC-SHA256, compare", sigOk ? C.emerald : C.rose),
  ];
  const fail = (detail) => {
    steps.push(S(1, 0, "401 Unauthorized", detail, C.amber));
    return { steps, req: "GET /users/me", status: 401, body: { detail }, extra: "WWW-Authenticate: Bearer" };
  };
  if (!sigOk) return fail("Could not validate credentials");
  steps.push(S(1, 1, expOk ? "check exp ✓" : "check exp ✗", `exp ${utc(tok.exp).slice(11, 16)} vs now ${utc(now).slice(11, 16)}`, expOk ? C.emerald : C.rose));
  if (!expOk) return fail("Token has expired");
  steps.push(S(1, 2, "SELECT … FROM users", "WHERE username = 'alice'", C.amber));
  steps.push(S(2, 1, "user row", "alice · role=user", C.amber));
  steps.push(S(1, 0, "200 OK", '{"username": "alice", …}', C.emerald));
  return { steps, req: "GET /users/me", status: 200, body: { username: "alice", email: "alice@example.com", role: "user", disabled: false } };
}

const JWT_ROW = 35; // vertical spacing of sequence rows
const JWT_TOP = 72; // y of the first row

/** The three-lane sequence diagram, drawn up to `prog` steps (fractional = in flight). */
function JwtSequence({ flow, prog }) {
  const id = useSvgId();
  const H = JWT_TOP + 5 * JWT_ROW + 16;
  const steps = flow ? flow.steps : [];
  const active = steps[Math.min(steps.length - 1, Math.floor(prog))];
  return (
    <svg viewBox={`0 0 400 ${H}`} className="w-full h-auto select-none">
      <defs>
        {[C.sky, C.amber, C.emerald, C.rose, C.brandL, C.text].map((c, i) => <Arrow key={c} id={`${id}a${i}`} color={c} />)}
      </defs>
      {LANES.map((l, i) => {
        const busy = active && prog < steps.length && (active.to === i || (active.from === i && active.to === i));
        return (
          <g key={l.name}>
            <line x1={l.x} x2={l.x} y1="42" y2={H - 4} stroke={C.axis} strokeDasharray="3 4" />
            <rect x={l.x - l.w / 2} y="4" width={l.w} height="34" rx="7" fill={BOX} stroke={l.color} strokeOpacity={busy ? 1 : 0.5} strokeWidth={busy ? 1.8 : 1} style={{ transition: "stroke-opacity .2s" }} />
            <text x={l.x} y="19" textAnchor="middle" fontSize="12" fontWeight="600" fill={l.color}>{l.name}</text>
            <text x={l.x} y="31.5" textAnchor="middle" fontSize="8.5" fill={C.dim} fontFamily={i === 1 ? MONO : undefined}>{l.sub}</text>
          </g>
        );
      })}
      {!flow && (
        <text x="200" y={JWT_TOP + 2.2 * JWT_ROW} textAnchor="middle" fontSize="11.5" fill={C.text}>
          Press “Log in” to start the OAuth2 password flow
        </text>
      )}
      {steps.map((s, i) => {
        if (prog <= i) return null;
        const t = ease(clamp(prog - i, 0, 1));
        const fade = clamp((prog - i) * 2.5, 0, 1);
        const y = JWT_TOP + i * JWT_ROW;
        const mk = `url(#${id}a${[C.sky, C.amber, C.emerald, C.rose, C.brandL, C.text].indexOf(s.color)})`;
        if (s.from === s.to) {
          // Work done inside one lane: a pill on its lifeline.
          const x = LANES[s.from].x;
          return (
            <g key={i} opacity={fade}>
              <rect x={x - 92} y={y - 22} width="184" height="28" rx="6" fill={BOX} stroke={s.color} strokeOpacity="0.85" />
              <text x={x} y={y - 10} textAnchor="middle" fontSize="10" fontWeight="600" fill={s.color}>{s.label}</text>
              <text x={x} y={y + 1.5} textAnchor="middle" fontSize="8.5" fill={C.text} fontFamily={MONO}>{s.sub}</text>
            </g>
          );
        }
        const x0 = LANES[s.from].x + (s.to > s.from ? 4 : -4);
        const x1 = LANES[s.to].x + (s.to > s.from ? -4 : 4);
        const xe = lerp(x0, x1, t);
        const mid = (LANES[s.from].x + LANES[s.to].x) / 2;
        return (
          <g key={i}>
            <line x1={x0} x2={xe} y1={y} y2={y} stroke={s.color} strokeWidth="1.8" markerEnd={t > 0.98 ? mk : undefined} />
            {t < 0.98 && <circle cx={xe} cy={y} r="3.6" fill={s.color} />}
            <g opacity={fade}>
              <text x={mid} y={y - 15} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={s.color} fontFamily={MONO}>{s.label}</text>
              <text x={mid} y={y - 4.5} textAnchor="middle" fontSize="8.5" fill={C.text} fontFamily={MONO}>{s.sub}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** Pretty JSON with one key optionally highlighted (the tampered role). */
function JsonBlock({ value, hot }) {
  const lines = toJson(value, true).split("\n");
  return (
    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-slate-300">
      {lines.map((ln, i) => (
        <div key={i} className={hot && ln.includes(`"${hot}"`) ? "rounded bg-rose-500/20 text-rose-300" : ""}>{ln}</div>
      ))}
    </pre>
  );
}

export function JwtAuth({ params = {} }) {
  const prm = obj(params);
  const expires = Math.round(clamp(num(prm.expires, 30), 1, 1440));
  const [wrongPw, setWrongPw] = useState(false);
  const [tok, setTok] = useState(null);
  const [tampered, setTampered] = useState(false);
  const [age, setAge] = useState(0); // minutes since the current token was issued
  const [flow, setFlow] = useState(null);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const anim = useRef({ prog: 0, seq: 0, clock: JWT_T0 });
  const force = useForce();
  const now = tok ? tok.iat + age * 60 : anim.current.clock;

  // Advance the in-flight exchange; when it lands, apply its effect and log it.
  useLoop(running, (dt) => {
    const a = anim.current;
    if (!flow) return;
    a.prog = Math.min(flow.steps.length, a.prog + dt / 0.6);
    if (a.prog >= flow.steps.length) {
      setRunning(false);
      let body = flow.body;
      if (flow.login && flow.tok) {
        setTok(flow.tok);
        setAge(0);
        setTampered(false);
        body = { access_token: `${flow.tok.h}.${flow.tok.p}.${flow.tok.sig}`, token_type: "bearer" };
      }
      a.seq += 1;
      setLog((l) => [{ n: a.seq, req: flow.req, status: flow.status, body: toJson(body), extra: flow.extra }, ...l].slice(0, 6));
    }
    force();
  });

  const start = (kind) => {
    const f = jwtFlow(kind, { tok, tampered, wrongPw, now });
    if (f.login) {
      // The server's clock keeps moving: a new login is issued "now".
      anim.current.clock = now;
      f.tok = jwtIssue(now, expires);
    }
    anim.current.prog = 0;
    setFlow(f);
    setRunning(true);
  };
  const reset = () => {
    anim.current = { prog: 0, seq: 0, clock: JWT_T0 };
    setTok(null);
    setTampered(false);
    setAge(0);
    setFlow(null);
    setLog([]);
    setRunning(false);
  };

  const prog = flow ? (running ? anim.current.prog : flow.steps.length) : 0;
  const sentP = tok ? (tampered ? tok.pAdmin : tok.p) : "";
  const expected = tok ? jwtSign(`${tok.h}.${sentP}`) : "";
  const left = tok ? Math.round((tok.exp - now) / 60) : 0;
  const expired = tok && now >= tok.exp;

  return (
    <Card
      title="OAuth2 password flow with JWT bearer tokens"
      params={params}
      caption="Log in, then call /users/me: the server keeps no session, it only checks the token's signature and exp on every request. Then break it three ways: tick “wrong password”, drag the token age past its expiry, or tamper with the payload (role → admin) and watch the signature check fail. The payload is only base64url-encoded, not encrypted: anyone can read it, but only the holder of SECRET_KEY can sign it."
    >
      <Row className="mt-0">
        <Button primary onClick={() => start("login")} disabled={running}>Log in</Button>
        <Toggle label="wrong password" tone="accent-rose-500" on={wrongPw} onChange={setWrongPw} />
        <Button primary onClick={() => start("me")} disabled={running}>Call /users/me</Button>
        <Button onClick={reset} className="ml-auto">Reset</Button>
      </Row>

      <div className="mt-3 rounded-lg bg-ink-950/60 p-1">
        <JwtSequence flow={flow} prog={prog} />
      </div>

      <Row>
        <Slider
          label="Fast-forward: token age"
          value={Math.min(age, expires * 2)}
          min={0}
          max={expires * 2}
          step={1}
          onChange={(v) => setAge(clamp(Math.round(v), 0, expires * 2))}
          display={mins(Math.min(age, expires * 2))}
        />
      </Row>
      <Row>
        <Button onClick={() => setTampered((t) => !t)} disabled={!tok} className={tampered ? "bg-rose-600 hover:bg-rose-500" : ""}>
          {tampered ? "Undo tamper (role → user)" : "Tamper payload (role → admin)"}
        </Button>
        <Stat label="expires after" value={mins(expires)} color="text-sky-300" />
        {tok && (
          <Stat
            label={expired ? "status" : "valid for"}
            value={expired ? `expired ${mins(-left)} ago` : mins(left)}
            color={expired ? "text-rose-300" : "text-emerald-300"}
          />
        )}
      </Row>

      {/* The token: coloured parts + what each part decodes to. */}
      <div className="mt-3 rounded-lg bg-ink-800 p-3">
        <Label>access token (what the client stores and sends)</Label>
        {tok ? (
          <>
            <div className="mt-1 break-all font-mono text-[11px] leading-relaxed">
              <span className="text-rose-400">{tok.h}</span>
              <span className="text-slate-500">.</span>
              <span className={tampered ? "rounded bg-rose-500/20 text-fuchsia-300 underline decoration-rose-400 decoration-wavy" : "text-fuchsia-300"}>{sentP}</span>
              <span className="text-slate-500">.</span>
              <span className="text-sky-300">{tok.sig}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-rose-400/30 bg-ink-900 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-rose-400">header</div>
                <JsonBlock value={JWT_HEADER} />
              </div>
              <div className="rounded-md border border-fuchsia-400/30 bg-ink-900 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300">payload (claims)</div>
                <JsonBlock value={jwtPayload(tampered ? "admin" : "user", tok.exp)} hot={tampered ? "role" : null} />
                <div className="mt-1 text-[10px] text-slate-500">exp = {utc(tok.exp)}</div>
              </div>
              <div className="rounded-md border border-sky-400/30 bg-ink-900 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">HMAC-SHA256 signature</div>
                <div className="font-mono text-[10px] leading-relaxed text-slate-400">
                  HMACSHA256(<span className="text-rose-400">header</span> + "." + <span className="text-fuchsia-300">payload</span>, SECRET_KEY)
                </div>
                <div className={`mt-1.5 text-[10px] leading-snug ${tampered ? "text-rose-300" : "text-emerald-300"}`}>
                  {tampered ? (
                    <>
                      server recomputes <span className="font-mono">{expected.slice(0, 10)}…</span> ≠ received <span className="font-mono">{tok.sig.slice(0, 10)}…</span>
                    </>
                  ) : (
                    <>server recomputes <span className="font-mono">{expected.slice(0, 10)}…</span> = received ✓</>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
              <span>issued <span className="font-mono text-slate-300">{utc(tok.iat).slice(11)}</span></span>
              <span>now <span className="font-mono text-slate-300">{utc(now).slice(11)}</span></span>
              <span>exp <span className={`font-mono ${expired ? "text-rose-300" : "text-slate-300"}`}>{utc(tok.exp).slice(11)}</span></span>
            </div>
          </>
        ) : (
          <div className="mt-1 text-xs text-slate-500">No token yet: press “Log in”. (Calling /users/me now gets 401 “Not authenticated”.)</div>
        )}
      </div>

      {/* Request / response log. */}
      <div className="mt-3">
        <Label className="mb-1">request log</Label>
        <div className="space-y-1">
          {log.length === 0 && <div className="rounded-md bg-ink-800 px-2 py-1.5 text-[11px] text-slate-500">No requests yet.</div>}
          {log.map((e) => (
            <div key={e.n} className="rounded-md bg-ink-800 px-2 py-1.5 font-mono text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">#{e.n}</span>
                <span className="text-slate-200">{e.req}</span>
                <span className="text-slate-500">→</span>
                <StatusPill code={e.status} />
                {e.extra && <span className="text-slate-500">{e.extra}</span>}
              </div>
              <div className="mt-0.5 break-all text-slate-400">{e.body}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ---------- http-playground: a mock FastAPI CRUD app you can call ---------- */

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const HAS_BODY = new Set(["POST", "PUT", "PATCH"]);
const HTTP_LEGEND = [
  [200, "OK: here is the resource"],
  [201, "Created: new resource, see Location"],
  [204, "No Content: done, empty body"],
  [307, "Redirect: FastAPI strips the trailing slash"],
  [404, "Not Found: no such route, or no such id"],
  [405, "Method Not Allowed: path exists, verb doesn't"],
  [422, "Unprocessable: Pydantic validation failed"],
];

/** Resource naming from params.resource: "items" → Item, item_id, /items. */
function resNames(raw) {
  const r = typeof raw === "string" && /^[a-z][a-z0-9_-]{0,19}$/i.test(raw.trim()) ? raw.trim().toLowerCase() : "items";
  const one = r.length > 1 && r.endsWith("s") ? r.slice(0, -1) : r;
  const ident = one.replace(/-/g, "_");
  const Cls = ident.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
  return { r, one, idName: `${ident}_id`, Cls, Title: Cls.replace(/([a-z])([A-Z])/g, "$1 $2") };
}

const httpSeed = () => ({
  next: 3,
  items: [
    { id: 1, name: "Keyboard", price: 49.9, description: "Mechanical, 87 keys" },
    { id: 2, name: "Mouse", price: 19.5, description: null },
  ],
});

/** Python-style slice so negative skip/limit behave like items[skip : skip + limit]. */
function pySlice(arr, a, b) {
  const n = arr.length;
  const norm = (i) => (i < 0 ? Math.max(0, n + i) : Math.min(n, i));
  return arr.slice(norm(a), norm(b));
}

const missing = (loc, input) => ({ type: "missing", loc, msg: "Field required", input });
const strErr = (loc, input) => ({ type: "string_type", loc, msg: "Input should be a valid string", input });

/** Validate a body against Item (or ItemUpdate when partial). Returns { data, errors }. */
function validateItem(body, partial) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { errors: [{ type: "model_attributes_type", loc: ["body"], msg: "Input should be a valid dictionary or object to extract fields from", input: body }] };
  }
  const errors = [];
  const data = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (has("name")) {
    if (typeof body.name === "string") data.name = body.name;
    else errors.push(strErr(["body", "name"], body.name));
  } else if (!partial) errors.push(missing(["body", "name"], body));
  if (has("price")) {
    let p = body.price;
    if (typeof p === "string" && /^\s*-?\d+(\.\d+)?([eE][-+]?\d+)?\s*$/.test(p)) p = Number(p); // lax mode parses numeric strings
    if (typeof body.price === "string" && typeof p === "string") {
      errors.push({ type: "float_parsing", loc: ["body", "price"], msg: "Input should be a valid number, unable to parse string as a number", input: body.price });
    } else if (typeof p !== "number" || !Number.isFinite(p)) {
      errors.push({ type: "float_type", loc: ["body", "price"], msg: "Input should be a valid number", input: body.price });
    } else if (!(p > 0)) {
      errors.push({ type: "greater_than", loc: ["body", "price"], msg: "Input should be greater than 0", input: body.price, ctx: { gt: 0 } });
    } else data.price = p;
  } else if (!partial) errors.push(missing(["body", "price"], body));
  if (has("description")) {
    if (body.description === null || typeof body.description === "string") data.description = body.description;
    else errors.push(strErr(["body", "description"], body.description));
  } else if (!partial) data.description = null; // PUT replaces: omitted optional fields fall back to their default
  return { data, errors };
}

/** Parse "/items/1?skip=0" into route + params, mimicking Starlette's router. */
function httpRoute(path, N) {
  const raw = String(path || "").trim();
  const [p0, q = ""] = raw.split("?");
  const p = p0.startsWith("/") ? p0 : `/${p0}`;
  const query = {};
  q.split("&").filter(Boolean).forEach((kv) => {
    const i = kv.indexOf("=");
    const k = decodeURIComponentSafe(i < 0 ? kv : kv.slice(0, i));
    if (!(k in query)) query[k] = decodeURIComponentSafe(i < 0 ? "" : kv.slice(i + 1));
  });
  const base = `/${N.r}`;
  if (p === base) return { kind: "list", allow: ["GET", "POST"], query, p };
  const m = p.match(new RegExp(`^${base}/([^/]+)$`));
  if (m) return { kind: "item", allow: ["GET", "PUT", "PATCH", "DELETE"], idRaw: decodeURIComponentSafe(m[1]), query, p };
  if (p.length > 1 && p.endsWith("/")) {
    const strip = p.slice(0, -1);
    const again = httpRoute(strip + (q ? `?${q}` : ""), N);
    if (again.kind !== "none") return { kind: "redirect", to: strip + (q ? `?${q}` : ""), query, p };
  }
  return { kind: "none", query, p };
}
function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

const intParse = (loc, input) => ({ type: "int_parsing", loc, msg: "Input should be a valid integer, unable to parse string as an integer", input });

/**
 * Handle one request against the in-memory db. Pure: returns the response and
 * the new db (never mutates the old one). `ep` names the matched endpoint so
 * the widget can show its decorator.
 */
function httpHandle(db, method, path, bodyText, N) {
  const rt = httpRoute(path, N);
  const json = (status, body, extra = {}) => ({ status, body, headers: extra });
  const NF = { detail: `${N.Title} not found` };
  if (rt.kind === "none") return { db, ep: "none", res: json(404, { detail: "Not Found" }) };
  if (rt.kind === "redirect") return { db, ep: "redirect", res: { status: 307, body: undefined, headers: { location: rt.to } } };
  if (!rt.allow.includes(method)) {
    return { db, ep: method === "OPTIONS" ? "options" : "405", res: json(405, { detail: "Method Not Allowed" }, { allow: rt.allow.join(", ") }) };
  }
  const ep = `${method} ${rt.kind}`;
  // Collect every validation error first (path, query, body), like FastAPI does.
  const errors = [];
  let id = null;
  if (rt.kind === "item") {
    if (/^\s*-?\d+\s*$/.test(rt.idRaw)) id = Number(rt.idRaw);
    else errors.push(intParse(["path", N.idName], rt.idRaw));
  }
  let skip = 0, limit = 10;
  if (rt.kind === "list" && method === "GET") {
    for (const k of ["skip", "limit"]) {
      if (!(k in rt.query)) continue;
      if (/^\s*-?\d+\s*$/.test(rt.query[k])) {
        if (k === "skip") skip = Number(rt.query[k]);
        else limit = Number(rt.query[k]);
      } else errors.push(intParse(["query", k], rt.query[k]));
    }
  }
  let body;
  let valid = null;
  if (HAS_BODY.has(method)) {
    const txt = String(bodyText ?? "").trim();
    if (!txt) errors.push(missing(["body"], null));
    else {
      try {
        body = JSON.parse(txt);
      } catch (e) {
        const pos = Number((String(e && e.message).match(/position (\d+)/) || [])[1]) || 0;
        errors.push({ type: "json_invalid", loc: ["body", pos], msg: "JSON decode error", input: {}, ctx: { error: "Expecting value" } });
      }
      if (body !== undefined) {
        valid = validateItem(body, method === "PATCH");
        errors.push(...valid.errors);
      }
    }
  }
  if (errors.length) return { db, ep, res: json(422, { detail: errors }) };

  const items = db.items;
  const idx = items.findIndex((it) => it.id === id);
  if (method === "GET" && rt.kind === "list") return { db, ep, res: json(200, pySlice(items, skip, skip + limit)) };
  if (method === "POST") {
    const it = { id: db.next, name: valid.data.name, price: valid.data.price, description: valid.data.description ?? null };
    return { db: { next: db.next + 1, items: [...items, it] }, ep, touched: it.id, res: json(201, it, { location: `/${N.r}/${it.id}` }) };
  }
  if (idx < 0) return { db, ep, res: json(404, NF) };
  if (method === "GET") return { db, ep, touched: id, res: json(200, items[idx]) };
  if (method === "DELETE") return { db: { ...db, items: items.filter((it) => it.id !== id) }, ep, res: { status: 204, body: undefined, headers: {} } };
  // PUT replaces the whole object; PATCH merges only the fields that were sent (exclude_unset).
  const upd = method === "PUT" ? { id, name: valid.data.name, price: valid.data.price, description: valid.data.description ?? null } : { ...items[idx], ...valid.data };
  return { db: { ...db, items: items.map((it) => (it.id === id ? upd : it)) }, ep, touched: id, res: json(200, upd) };
}

/** The FastAPI code behind each endpoint (resource-aware). */
function httpCode(ep, N, method) {
  const { r, one, idName, Cls } = N;
  const P = `"/${r}/{${idName}}"`;
  const nf = `raise HTTPException(status_code=404, detail="${N.Title} not found")`;
  switch (ep) {
    case "GET list":
      return `@app.get("/${r}")\ndef list_${r.replace(/-/g, "_")}(skip: int = 0, limit: int = 10):\n    return list(db.values())[skip : skip + limit]`;
    case "POST list":
      return `@app.post("/${r}", status_code=201)\ndef create_${one}(${one}: ${Cls}, response: Response):\n    new_id = next(ids)\n    db[new_id] = {"id": new_id, **${one}.model_dump()}\n    response.headers["Location"] = f"/${r}/{new_id}"\n    return db[new_id]`;
    case "GET item":
      return `@app.get(${P})\ndef read_${one}(${idName}: int):\n    if ${idName} not in db:\n        ${nf}\n    return db[${idName}]`;
    case "PUT item":
      return `@app.put(${P})\ndef replace_${one}(${idName}: int, ${one}: ${Cls}):\n    if ${idName} not in db:\n        ${nf}\n    db[${idName}] = {"id": ${idName}, **${one}.model_dump()}  # every field replaced\n    return db[${idName}]`;
    case "PATCH item":
      return `@app.patch(${P})\ndef update_${one}(${idName}: int, patch: ${Cls}Update):\n    if ${idName} not in db:\n        ${nf}\n    changes = patch.model_dump(exclude_unset=True)  # only fields you sent\n    db[${idName}] = db[${idName}] | changes\n    return db[${idName}]`;
    case "DELETE item":
      return `@app.delete(${P}, status_code=204)\ndef delete_${one}(${idName}: int):\n    if ${idName} not in db:\n        ${nf}\n    del db[${idName}]  # 204: no body is sent back`;
    case "options":
      return `# No route handles OPTIONS, so the router answers 405.\n# Only CORSMiddleware replies to OPTIONS (a CORS preflight).`;
    case "405":
      return `# The path matched, but no route is declared for ${method}.\n# Starlette's router answers 405 itself (with an Allow header);\n# none of your code runs.`;
    case "redirect":
      return `# redirect_slashes=True (the default): a URL that only matches\n# without the trailing "/" gets a 307 to the canonical path.`;
    default:
      return `# No route matches this path, so the router answers 404\n# {"detail": "Not Found"} before any of your code runs.`;
  }
}

const HTTP_BODIES = (N) => ({
  POST: `{"name": "Monitor", "price": 189}`,
  PUT: `{"name": "Mouse", "price": 24.5}`,
  PATCH: `{"price": 12.5}`,
  bad: `{"name": 42, "price": -5}`,
});

/** One-line HTTP request/response strip with a packet flying across. */
function HttpWire({ phase, t, method, path, status }) {
  const id = useSvgId();
  const back = phase === "res" || phase === "done";
  const x = phase === "req" ? lerp(84, 216, ease(t)) : phase === "res" ? lerp(216, 84, ease(t)) : null;
  const line = `${method} ${path}`;
  return (
    <svg viewBox="0 0 300 58" className="w-full h-auto select-none">
      <defs>
        <Arrow id={`${id}r`} color={C.sky} />
        <Arrow id={`${id}s`} color={statusHex(status || 200)} />
      </defs>
      <rect x="3" y="8" width="77" height="42" rx="7" fill={BOX} stroke={C.sky} strokeOpacity="0.6" />
      <text x="41.5" y="26" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={C.sky}>Client</text>
      <text x="41.5" y="39" textAnchor="middle" fontSize="8" fill={C.dim}>this widget</text>
      <rect x="220" y="8" width="77" height="42" rx="7" fill={BOX} stroke={C.brandL} strokeOpacity={phase === "req" && t > 0.95 ? 1 : 0.6} />
      <text x="258.5" y="26" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={C.brandL}>FastAPI</text>
      <text x="258.5" y="39" textAnchor="middle" fontSize="7.6" fill={C.dim} fontFamily={MONO}>uvicorn :8000</text>
      <line x1="84" x2="216" y1="21" y2="21" stroke={C.axis} markerEnd={`url(#${id}r)`} />
      <line x1="84" x2="216" y1="37" y2="37" stroke={C.axis} markerStart={`url(#${id}s)`} />
      <text x="150" y="16" textAnchor="middle" fontSize="8" fill={phase ? C.sky : C.dim} fontFamily={MONO}>{line.length > 27 ? line.slice(0, 26) + "…" : line}</text>
      <text x="150" y="50" textAnchor="middle" fontSize="8" fill={back ? statusHex(status) : C.dim} fontFamily={MONO}>
        {back ? `${status} ${REASONS[status] || ""}` : "response"}
      </text>
      {x != null && <circle cx={x} cy={phase === "req" ? 21 : 37} r="4" fill={back ? statusHex(status) : C.sky} />}
    </svg>
  );
}

export function HttpPlayground({ params = {} }) {
  const prm = obj(params);
  const N = resNames(prm.resource);
  const bodies = HTTP_BODIES(N);
  const [db, setDb] = useState(httpSeed);
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState(`/${N.r}`);
  const [bodyBy, setBodyBy] = useState({ POST: bodies.POST, PUT: bodies.PUT, PATCH: bodies.PATCH });
  const [last, setLast] = useState(null); // { req, res, ep, touched }
  const [hist, setHist] = useState([]);
  const [running, setRunning] = useState(false);
  const anim = useRef({ phase: null, t: 0 });
  const histN = useRef(0);
  const force = useForce();

  useLoop(running, (dt) => {
    const a = anim.current;
    a.t += dt / 0.45;
    if (a.t >= 1) {
      if (a.phase === "req") {
        a.phase = "res";
        a.t = 0;
      } else {
        a.phase = "done";
        a.t = 1;
        setRunning(false);
      }
    }
    force();
  });

  const body = HAS_BODY.has(method) ? bodyBy[method] ?? "" : "";
  const send = (m = method, p = path, b = body) => {
    const r = httpHandle(db, m, p, b, N);
    setDb(r.db);
    const req = { method: m, path: String(p).trim() || "/", body: HAS_BODY.has(m) ? String(b).trim() : "" };
    setLast({ req, res: r.res, ep: r.ep, touched: r.touched });
    histN.current += 1;
    setHist((h) => [{ ...req, status: r.res.status, k: histN.current }, ...h].slice(0, 6));
    anim.current = { phase: "req", t: 0 };
    setRunning(true);
  };
  const reset = () => {
    setDb(httpSeed());
    setLast(null);
    setHist([]);
    anim.current = { phase: null, t: 0 };
    setRunning(false);
  };

  const phase = last ? anim.current.phase || "done" : null;
  const shown = phase === "done";
  const res = last && last.res;

  // Raw HTTP text for the last exchange.
  let reqText = "";
  let resHead = "";
  let resBody = "";
  if (last) {
    const rq = last.req;
    reqText = `${rq.method} ${rq.path.startsWith("/") ? rq.path : "/" + rq.path} HTTP/1.1\nhost: api.example.com\naccept: application/json`;
    if (rq.body) reqText += `\ncontent-type: application/json\ncontent-length: ${utf8Bytes(rq.body).length}\n\n${rq.body}`;
    const hasBody = res.body !== undefined;
    const compact = hasBody ? toJson(res.body) : "";
    const hs = [];
    if (res.headers.allow) hs.push(`allow: ${res.headers.allow}`);
    if (res.headers.location) hs.push(`location: ${res.headers.location}`);
    if (hasBody) hs.push("content-type: application/json", `content-length: ${utf8Bytes(compact).length}`);
    else if (res.status === 307) hs.push("content-length: 0");
    hs.push("server: uvicorn");
    resHead = `HTTP/1.1 ${res.status} ${REASONS[res.status] || ""}\n${hs.join("\n")}`;
    resBody = hasBody ? toJson(res.body, true) : "";
  }
  const presets = [`/${N.r}`, `/${N.r}/1`, `/${N.r}/99`, `/${N.r}?limit=1&skip=1`, `/${N.r}/abc`];

  return (
    <Card
      title={`HTTP playground: a FastAPI CRUD API for /${N.r}`}
      params={params}
      caption={`A mock FastAPI app with an in-memory db. Try: GET /${N.r}/99 (404), POST the “invalid” body (422, one error per bad field), PATCH vs PUT on /${N.r}/2 (PUT resets fields you leave out, PATCH only changes what you send), DELETE twice (204, then 404), POST to /${N.r}/1 (405 + Allow header) and OPTIONS (405: only CORS middleware answers it).`}
    >
      {/* Request builder */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(HTTP_METHODS.includes(e.target.value) ? e.target.value : "GET")}
          className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-slate-200 outline-none focus:border-brand-500"
          aria-label="HTTP method"
        >
          {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value.slice(0, 80))}
          onKeyDown={(e) => e.key === "Enter" && send()}
          aria-label="path"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-slate-200 outline-none focus:border-brand-500"
        />
        <Button primary onClick={() => send()}>Send</Button>
        <Button onClick={reset}>Reset db</Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        path:
        {presets.map((p) => (
          <button key={p} type="button" onClick={() => setPath(p)} className={`rounded px-1.5 py-0.5 font-mono transition-colors ${p === path ? "bg-brand-500/25 text-brand-200" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}>
            {p}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
          <span>JSON body {HAS_BODY.has(method) ? "" : `(not sent with ${method})`}</span>
          {HAS_BODY.has(method) && (
            <>
              <button type="button" onClick={() => setBodyBy((b) => ({ ...b, [method]: bodies[method] }))} className="rounded bg-ink-800 px-1.5 py-0.5 text-emerald-300 hover:bg-ink-700">valid</button>
              <button type="button" onClick={() => setBodyBy((b) => ({ ...b, [method]: bodies.bad }))} className="rounded bg-ink-800 px-1.5 py-0.5 text-amber-300 hover:bg-ink-700">invalid</button>
            </>
          )}
        </div>
        <textarea
          value={HAS_BODY.has(method) ? body : ""}
          disabled={!HAS_BODY.has(method)}
          onChange={(e) => setBodyBy((b) => ({ ...b, [method]: e.target.value.slice(0, 600) }))}
          rows={2}
          spellCheck={false}
          placeholder={HAS_BODY.has(method) ? "" : "no body"}
          aria-label="JSON body"
          className="w-full resize-y rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-slate-200 outline-none focus:border-brand-500 disabled:opacity-40"
        />
      </div>

      <div className="mt-2 rounded-lg bg-ink-950/60 p-1">
        <HttpWire phase={phase} t={anim.current.t} method={last ? last.req.method : method} path={last ? last.req.path : path} status={res ? res.status : 0} />
      </div>

      {/* Raw request + response */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">raw request</Label>
          <Pre className="min-h-[5rem]">{last ? reqText : <span className="text-slate-500">Pick a method and path, then Send.</span>}</Pre>
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Label>raw response</Label>
            {shown && res && <StatusPill code={res.status} />}
          </div>
          <Pre className="min-h-[5rem]">
            {last && shown ? (
              <>
                <span className={`font-semibold ${statusCls(res.status)}`}>{resHead.split("\n")[0]}</span>
                {"\n" + resHead.split("\n").slice(1).join("\n")}
                {resBody ? `\n\n${resBody}` : res.status === 204 ? <span className="text-slate-500">{"\n\n(empty body)"}</span> : ""}
              </>
            ) : (
              <span className="text-slate-500">{last ? "waiting…" : "—"}</span>
            )}
          </Pre>
        </div>
      </div>

      {/* The route that handled it */}
      {last && (
        <div className="mt-2">
          <Label className="mb-1">{last.ep.includes(" ") ? "matched route" : "what happened"}</Label>
          <PyCode code={httpCode(last.ep, N, last.req.method)} />
        </div>
      )}

      {/* Server state + legend */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">server state (db)</Label>
          <div className="overflow-hidden rounded-lg border border-ink-700">
            <table className="w-full table-fixed text-left font-mono text-[11px]">
              <thead className="bg-ink-800 text-slate-500">
                <tr>
                  <th className="w-8 px-2 py-1 font-normal">id</th>
                  <th className="px-2 py-1 font-normal">name</th>
                  <th className="w-14 px-2 py-1 font-normal">price</th>
                  <th className="px-2 py-1 font-normal">description</th>
                </tr>
              </thead>
              <tbody>
                {db.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-slate-500">db is empty</td>
                  </tr>
                )}
                {db.items.map((it) => (
                  <tr key={it.id} className={`border-t border-ink-700 transition-colors ${last && last.touched === it.id ? "bg-brand-500/15" : ""}`}>
                    <td className="px-2 py-1 text-slate-400">{it.id}</td>
                    <td className="truncate px-2 py-1 text-slate-200">{it.name}</td>
                    <td className="px-2 py-1 text-fuchsia-300">{toJson(it.price, false, 0, "price")}</td>
                    <td className="truncate px-2 py-1 text-slate-400">{it.description == null ? <span className="text-slate-600">null</span> : it.description}</td>
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
                    setMethod(h.method);
                    setPath(h.path);
                    if (HAS_BODY.has(h.method)) setBodyBy((b) => ({ ...b, [h.method]: h.body }));
                  }}
                  className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 hover:bg-ink-700"
                >
                  <span className={statusCls(h.status)}>{h.status}</span> {h.method} {h.path.length > 18 ? h.path.slice(0, 17) + "…" : h.path}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <Label className="mb-1">status codes used</Label>
          <div className="space-y-0.5">
            {HTTP_LEGEND.map(([code, text]) => {
              const on = shown && res && res.status === code;
              return (
                <div key={code} className={`flex items-baseline gap-2 rounded px-1.5 py-0.5 text-[11px] transition-colors ${on ? "bg-ink-700" : ""}`}>
                  <span className="w-7 shrink-0 font-mono font-semibold" style={{ color: statusHex(code) }}>{code}</span>
                  <span className={on ? "text-slate-200" : "text-slate-400"}>{text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- cors: preflights, allow-lists and the browser's verdict ---------- */

const CORS_ORIGINS = ["http://localhost:3000", "https://app.example.com", "https://evil.example"];
const CORS_ALLOW_OPTS = [...CORS_ORIGINS, "*"];
const CORS_METHODS = ["GET", "POST", "PUT", "DELETE"];
const CORS_HEADER_OPTS = ["Authorization", "X-Request-ID", "*"];
const SAFELISTED = ["Accept", "Accept-Language", "Content-Language", "Content-Type"]; // Starlette always allows these
const API = "https://api.example.com";
const CORS_REQS = {
  GET: { method: "GET", path: "/items", label: "GET /items" },
  POST: { method: "POST", path: "/items", label: "POST /items (JSON)" },
  DELETE: { method: "DELETE", path: "/items/1", label: "DELETE /items/1" },
};

/**
 * Simulate one fetch() from `origin` against Starlette's CORSMiddleware with
 * config `cfg`, then apply the browser's CORS checks. Mirrors starlette/middleware/cors.py.
 */
function corsSimulate(cfg, origin, kind, auth, creds) {
  const rq = CORS_REQS[kind] || CORS_REQS.GET;
  const allowAll = cfg.origins.includes("*");
  const allowAllHeaders = cfg.headers.includes("*");
  const originOk = allowAll || cfg.origins.includes(origin);
  const reqHeaders = [];
  if (rq.method === "POST") reqHeaders.push("content-type");
  if (auth) reqHeaders.unshift("authorization");
  // "Simple" = GET/HEAD/POST with only safelisted headers (JSON content-type is not safelisted).
  const simple = rq.method === "GET" && !auth;

  /** The browser's CORS check on a response (fetch spec order). */
  const check = (h) => {
    const acao = h["access-control-allow-origin"];
    if (!acao) return { kind: "origin", console: "No 'Access-Control-Allow-Origin' header is present on the requested resource." };
    if (creds && acao === "*") return { kind: "wildcard", console: "The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'." };
    if (acao !== "*" && acao !== origin) return { kind: "origin", console: `The 'Access-Control-Allow-Origin' header has a value '${acao}' that is not equal to the supplied origin.` };
    if (creds && h["access-control-allow-credentials"] !== "true") return { kind: "credentials", console: "The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'." };
    return null;
  };

  let preflight = null;
  if (!simple) {
    const pre = { "access-control-allow-origin": undefined };
    const failures = [];
    if (originOk) pre["access-control-allow-origin"] = allowAll && !cfg.credentials ? "*" : origin;
    else failures.push("origin");
    if (!(allowAll && !cfg.credentials)) pre.vary = "Origin";
    pre["access-control-allow-methods"] = cfg.methods.join(", ");
    pre["access-control-max-age"] = "600";
    if (allowAllHeaders) pre["access-control-allow-headers"] = reqHeaders.join(",");
    else pre["access-control-allow-headers"] = [...new Set([...SAFELISTED, ...cfg.headers])].sort().join(", ");
    if (cfg.credentials) pre["access-control-allow-credentials"] = "true";
    if (!cfg.methods.includes(rq.method)) failures.push("method");
    const allowedLower = new Set([...SAFELISTED, ...cfg.headers].map((h) => h.toLowerCase()));
    if (!allowAllHeaders && reqHeaders.some((h) => !allowedLower.has(h))) failures.push("headers");
    const status = failures.length ? 400 : 200;
    const text = failures.length ? `Disallowed CORS ${failures.join(", ")}` : "OK";
    const reqH = [
      ["Origin", origin],
      ["Access-Control-Request-Method", rq.method],
    ];
    if (reqHeaders.length) reqH.push(["Access-Control-Request-Headers", reqHeaders.join(",")]);
    let fail = check(pre);
    if (!fail && status !== 200) {
      fail = { kind: failures[0], console: "Response to preflight request doesn't pass access control check: It does not have HTTP ok status." };
    } else if (fail) fail = { ...fail, console: `Response to preflight request doesn't pass access control check: ${fail.console}` };
    preflight = { reqH, status, text, resH: Object.entries(pre).filter(([, v]) => v !== undefined), failures, fail };
  }

  let actual = null;
  if (!preflight || !preflight.fail) {
    const status = rq.method === "POST" ? 201 : rq.method === "DELETE" ? 204 : 200;
    const h = {};
    if (rq.method !== "DELETE") h["content-type"] = "application/json";
    if (allowAll) h["access-control-allow-origin"] = "*";
    if (cfg.credentials) h["access-control-allow-credentials"] = "true";
    // Starlette mirrors the exact Origin when it has to (cookies sent, or a specific allow-list).
    if ((allowAll && creds) || (!allowAll && originOk)) {
      h["access-control-allow-origin"] = origin;
      h.vary = "Origin";
    }
    const reqH = [["Origin", origin]];
    if (rq.method === "POST") reqH.push(["Content-Type", "application/json"]);
    if (auth) reqH.push(["Authorization", "Bearer eyJhbGciOi…"]);
    if (creds) reqH.push(["Cookie", "session=7f3a…"]);
    const order = ["content-type", "access-control-allow-origin", "access-control-allow-credentials", "vary"];
    actual = { reqH, status, resH: order.filter((k) => h[k]).map((k) => [k, h[k]]), fail: check(h) };
  }

  const fail = (preflight && preflight.fail) || (actual && actual.fail) || null;
  const why = {
    origin: `Origin ${origin} is not in allow_origins`,
    method: `${rq.method} is not in allow_methods`,
    headers: "The Authorization header is not in allow_headers",
    wildcard: "Wildcard \"*\" origin can't be used with credentials",
    credentials: "The request sends credentials but allow_credentials=False",
  };
  return {
    rq,
    simple,
    preflight,
    actual,
    ok: !fail,
    reason: fail ? why[fail.kind] || "Blocked" : null,
    console: fail ? `Access to fetch at '${API}${rq.path}' from origin '${origin}' has been blocked by CORS policy: ${fail.console}` : null,
    handlerRan: !!actual,
    mirrorWarn: allowAll && cfg.credentials,
  };
}

/** Steps drawn in the CORS diagram for a simulated result. */
function corsSteps(sim) {
  const s = [];
  if (sim.preflight) {
    s.push({ dir: 1, label: `OPTIONS ${sim.rq.path}`, sub: "preflight", color: C.fuchsia, mw: true });
    s.push({ dir: -1, label: `${sim.preflight.status} ${sim.preflight.status === 200 ? "OK" : "Bad Request"}`, sub: sim.preflight.failures.length ? `disallowed: ${sim.preflight.failures.join(", ")}` : sim.preflight.fail ? "browser rejects the headers" : "preflight passed", color: sim.preflight.fail ? C.rose : C.emerald, mw: true });
  }
  if (sim.actual) {
    s.push({ dir: 1, label: `${sim.rq.method} ${sim.rq.path}`, sub: "actual request", color: C.sky });
    s.push({ dir: -1, label: `${sim.actual.status} ${REASONS[sim.actual.status]}`, sub: sim.actual.fail ? "JS can't read this" : "readable by JS", color: sim.actual.fail ? C.rose : C.emerald });
  }
  return s;
}

function CorsDiagram({ sim, prog, origin }) {
  const id = useSvgId();
  const steps = corsSteps(sim);
  const n = steps.length;
  const done = prog >= n;
  const rows = [52, 92, 132, 172];
  const handlerLit = sim.actual && prog > (sim.preflight ? 2.9 : 0.9);
  const mwLit = prog > 0.9;
  const verdictCol = sim.ok ? C.emerald : C.rose;
  const host = origin.replace(/^https?:\/\//, "");
  const code = ["fetch(API +", `  "${sim.rq.path}", {`, `  method: "${sim.rq.method}",`, "})"];
  return (
    <svg viewBox="0 0 400 206" className="w-full h-auto select-none">
      <defs>
        {[C.fuchsia, C.emerald, C.rose, C.sky].map((c, i) => <Arrow key={c} id={`${id}m${i}`} color={c} />)}
      </defs>
      {/* Browser: a tab showing the page's origin */}
      <rect x="4" y="4" width="132" height="198" rx="8" fill={BOX} stroke={C.sky} strokeOpacity="0.55" />
      <path d="M4,26 L4,12 Q4,4 12,4 L128,4 Q136,4 136,12 L136,26 Z" fill="#232a3d" />
      <circle cx="14" cy="15" r="2.6" fill={C.rose} opacity="0.8" />
      <circle cx="22.5" cy="15" r="2.6" fill={C.amber} opacity="0.8" />
      <circle cx="31" cy="15" r="2.6" fill={C.emerald} opacity="0.8" />
      <text x="40" y="18.5" fontSize="9" fill="#e2e8f0" fontFamily={MONO}>{host.length > 19 ? host.slice(0, 18) + "…" : host}</text>
      <text x="70" y="44" textAnchor="middle" fontSize="12" fontWeight="600" fill={C.sky}>Browser</text>
      <text x="70" y="56" textAnchor="middle" fontSize="8.5" fill={C.dim}>page JS calls fetch()</text>
      {code.map((ln, i) => (
        <text key={i} x="12" y={73 + i * 11} fontSize="8.4" fill={C.text} fontFamily={MONO} xmlSpace="preserve">{ln}</text>
      ))}
      {/* verdict badge */}
      <g opacity={done ? 1 : 0.15} style={{ transition: "opacity .3s" }}>
        <rect x="12" y="126" width="116" height="68" rx="6" fill={verdictCol} fillOpacity="0.12" stroke={verdictCol} strokeOpacity="0.7" />
        <text x="70" y="150" textAnchor="middle" fontSize="18" fontWeight="700" fill={verdictCol}>{sim.ok ? "✓" : "✕"}</text>
        <text x="70" y="168" textAnchor="middle" fontSize="10" fontWeight="600" fill={verdictCol}>{sim.ok ? "Response delivered" : "Blocked by CORS"}</text>
        <text x="70" y="183" textAnchor="middle" fontSize="8.5" fill={C.text}>{sim.ok ? "to the page's JS" : "JS gets a TypeError"}</text>
      </g>

      {/* Server: CORSMiddleware wraps the app */}
      <rect x="264" y="4" width="132" height="198" rx="8" fill={BOX} stroke={C.brandL} strokeOpacity="0.55" />
      <text x="330" y="21" textAnchor="middle" fontSize="12" fontWeight="600" fill={C.brandL}>FastAPI</text>
      <text x="330" y="33" textAnchor="middle" fontSize="8.5" fill={C.dim} fontFamily={MONO}>api.example.com</text>
      <rect x="272" y="40" width="116" height="66" rx="6" fill="#11141f" stroke={C.fuchsia} strokeOpacity={mwLit ? 0.9 : 0.35} style={{ transition: "stroke-opacity .3s" }} />
      <text x="330" y="57" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={C.fuchsia}>CORSMiddleware</text>
      <text x="330" y="71" textAnchor="middle" fontSize="8.5" fill={C.text}>answers OPTIONS itself,</text>
      <text x="330" y="83" textAnchor="middle" fontSize="8.5" fill={C.text}>adds Access-Control-*</text>
      <text x="330" y="95" textAnchor="middle" fontSize="8.5" fill={C.text}>headers to responses</text>
      <rect x="272" y="116" width="116" height="78" rx="6" fill={handlerLit ? "#0f2a22" : "#11141f"} stroke={C.emerald} strokeOpacity={handlerLit ? 0.9 : 0.35} style={{ transition: "all .3s" }} />
      <text x="330" y="136" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={C.emerald}>route handler</text>
      <text x="330" y="152" textAnchor="middle" fontSize="8.5" fill={C.text} fontFamily={MONO}>{`@app.${sim.rq.method.toLowerCase()}(...)`}</text>
      <text x="330" y="176" textAnchor="middle" fontSize="9" fontWeight="600" fill={handlerLit ? C.emerald : C.dim}>
        {handlerLit ? "ran ✓ (side effects!)" : sim.actual ? "waiting…" : "never called"}
      </text>

      {/* Messages between the two */}
      {steps.map((s, i) => {
        if (prog <= i) return null;
        const t = ease(clamp(prog - i, 0, 1));
        const y = rows[i] ?? rows[3];
        const a = s.dir > 0 ? 140 : 260;
        const b = s.dir > 0 ? 260 : 140;
        const xe = lerp(a, b, t);
        const mk = `url(#${id}m${[C.fuchsia, C.emerald, C.rose, C.sky].indexOf(s.color)})`;
        return (
          <g key={i}>
            <line x1={a} x2={xe} y1={y} y2={y} stroke={s.color} strokeWidth="1.8" markerEnd={t > 0.98 ? mk : undefined} />
            {t < 0.98 && <circle cx={xe} cy={y} r="4" fill={s.color} />}
            <g opacity={clamp((prog - i) * 2.5, 0, 1)}>
              <text x="200" y={y - 14} textAnchor="middle" fontSize="10" fontWeight="600" fill={s.color} fontFamily={MONO}>{s.label}</text>
              <text x="200" y={y - 4.5} textAnchor="middle" fontSize="8.2" fill={C.text}>{s.sub}</text>
            </g>
          </g>
        );
      })}
      {n === 2 && sim.simple && (
        <text x="200" y="140" textAnchor="middle" fontSize="8.5" fill={C.dim}>
          <tspan x="200">simple request:</tspan>
          <tspan x="200" dy="12">no preflight,</tspan>
          <tspan x="200" dy="12">sent straight away</tspan>
        </text>
      )}
    </svg>
  );
}

function HeaderList({ title, lines, first, tone = "text-slate-300", dim }) {
  return (
    <div className={`min-w-0 rounded-md bg-ink-900 p-2 transition-opacity ${dim ? "opacity-30" : ""}`}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="break-all font-mono text-[10.5px] leading-relaxed">
        {first && <div className={tone}>{first}</div>}
        {lines.map(([k, v]) => (
          <div key={k}>
            <span className={k.toLowerCase().startsWith("access-control") || k === "Origin" ? "text-fuchsia-300" : "text-slate-400"}>{k}</span>
            <span className="text-slate-500">: </span>
            <span className="text-slate-200">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const pyList = (xs) => `[${xs.map((x) => `"${x}"`).join(", ")}]`;

export function Cors({ params = {} }) {
  const prm = obj(params);
  const [origins, setOrigins] = useState(() => {
    const a = prm.allowed;
    if (typeof a === "string" && CORS_ALLOW_OPTS.includes(a)) return [a];
    if (!Array.isArray(a)) return ["http://localhost:3000"];
    return CORS_ALLOW_OPTS.filter((o) => a.includes(o));
  });
  const [credentials, setCredentials] = useState(false);
  const [methods, setMethods] = useState(["GET", "POST"]);
  const [headers, setHeaders] = useState([]);
  const [origin, setOrigin] = useState(CORS_ORIGINS[0]);
  const [kind, setKind] = useState("GET");
  const [auth, setAuth] = useState(false);
  const [creds, setCreds] = useState(false);
  const [sent, setSent] = useState(null); // snapshot of what was last sent
  const [running, setRunning] = useState(false);
  const anim = useRef({ prog: 99 });
  const force = useForce();

  const cfg = { origins, credentials, methods, headers };
  const live = corsSimulate(cfg, origin, kind, auth, creds);
  const sim = sent ? sent.sim : live;
  const n = corsSteps(sim).length;

  useLoop(running, (dt) => {
    const a = anim.current;
    a.prog = Math.min(n, a.prog + dt / 0.8);
    if (a.prog >= n) setRunning(false);
    force();
  });

  const send = () => {
    setSent({ sim: live, origin, key: JSON.stringify([cfg, origin, kind, auth, creds]) });
    anim.current.prog = 0;
    setRunning(true);
  };
  const stale = sent && sent.key !== JSON.stringify([cfg, origin, kind, auth, creds]);
  const prog = running ? anim.current.prog : n;
  const shownOrigin = sent ? sent.origin : origin;
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const order = (opts, xs) => opts.filter((o) => xs.includes(o));
  const done = prog >= n;
  const pf = sim.preflight;
  const ac = sim.actual;

  const py = `from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=${pyList(order(CORS_ALLOW_OPTS, origins))},
    allow_credentials=${credentials ? "True" : "False"},
    allow_methods=${pyList(order(CORS_METHODS, methods))},
    allow_headers=${pyList(order(CORS_HEADER_OPTS, headers))},
)`;

  return (
    <Card
      title="CORS: who may read the response?"
      params={params}
      caption="CORS is enforced by the BROWSER, not the server. Try: switch the page to https://evil.example and send a simple GET: the server still receives it and the handler runs, the browser just hides the response from the page's JavaScript. A DELETE, a JSON POST or an Authorization header makes the browser send an OPTIONS preflight first, and the real request is only sent if the preflight passes. Then tick “*”, turn on credentials in the request and send a POST."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Browser side: who is asking, and what */}
        <div className="min-w-0 rounded-lg border border-sky-400/25 bg-ink-800 p-2.5">
          <div className="text-[11px] font-semibold text-sky-300">Browser · the page making the request</div>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            origin
            <select
              value={origin}
              onChange={(e) => setOrigin(CORS_ORIGINS.includes(e.target.value) ? e.target.value : CORS_ORIGINS[0])}
              className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-900 px-1.5 py-1 font-mono text-[11px] text-slate-200 outline-none focus:border-brand-500"
            >
              {CORS_ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <div className="mt-2">
            <Seg options={[["GET", "GET"], ["POST", "POST json"], ["DELETE", "DELETE"]]} value={kind} onChange={setKind} />
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <Toggle label="send Authorization header" on={auth} onChange={setAuth} />
            <Toggle label={'credentials: "include" (cookies)'} on={creds} onChange={setCreds} />
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {live.simple ? <span className="text-emerald-300">simple request: no preflight</span> : <span className="text-fuchsia-300">needs a preflight (OPTIONS)</span>}
            {!live.simple && <span> · {kind === "DELETE" ? "DELETE isn't a simple method" : kind === "POST" ? "Content-Type: application/json isn't simple" : "Authorization isn't a simple header"}</span>}
          </div>
        </div>

        {/* Server side: CORSMiddleware config */}
        <div className="min-w-0 rounded-lg border border-brand-400/25 bg-ink-800 p-2.5">
          <div className="text-[11px] font-semibold text-brand-300">FastAPI · {API}</div>
          <Label className="mt-2">allow_origins</Label>
          <div className="mt-0.5 flex flex-col gap-0.5">
            {CORS_ALLOW_OPTS.map((o) => (
              <Toggle key={o} label={<span className="font-mono text-[11px]">{o === "*" ? '"*" (any origin)' : o}</span>} on={origins.includes(o)} onChange={() => toggle(origins, setOrigins, o)} />
            ))}
          </div>
          <div className="mt-1.5">
            <Toggle label={<span className="font-mono text-[11px]">allow_credentials</span>} on={credentials} onChange={setCredentials} />
          </div>
          <Label className="mt-1.5">allow_methods</Label>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {CORS_METHODS.map((m) => (
              <Toggle key={m} label={<span className="font-mono text-[11px]">{m}</span>} on={methods.includes(m)} onChange={() => toggle(methods, setMethods, m)} />
            ))}
          </div>
          <Label className="mt-1.5">allow_headers</Label>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {CORS_HEADER_OPTS.map((h) => (
              <Toggle key={h} label={<span className="font-mono text-[11px]">{h}</span>} on={headers.includes(h)} onChange={() => toggle(headers, setHeaders, h)} />
            ))}
          </div>
          <div className="mt-1 text-[10px] text-slate-500">Content-Type, Accept, Accept-Language and Content-Language are always allowed.</div>
        </div>
      </div>

      <Row>
        <Button primary onClick={send}>Send request</Button>
        {stale && <span className="text-[11px] text-amber-300">settings changed: send again to replay</span>}
        {!sent && <span className="text-[11px] text-slate-500">showing the result for the current settings</span>}
      </Row>

      <div className="mt-2 rounded-lg bg-ink-950/60 p-1">
        <CorsDiagram sim={sim} prog={prog} origin={shownOrigin} />
      </div>

      {/* Headers on the wire */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pf && (
          <>
            <HeaderList title="① preflight request" first={`OPTIONS ${sim.rq.path}`} tone="text-fuchsia-300" lines={pf.reqH} dim={prog <= 0} />
            <HeaderList title="② preflight response" first={`${pf.status} ${pf.status === 200 ? "OK" : "Bad Request"} · body: "${pf.text}"`} tone={pf.status === 200 ? "text-emerald-300" : "text-amber-300"} lines={pf.resH} dim={prog < 2} />
          </>
        )}
        {ac ? (
          <>
            <HeaderList title={`${pf ? "③" : "①"} actual request`} first={`${sim.rq.method} ${sim.rq.path}`} tone="text-sky-300" lines={ac.reqH} dim={prog <= (pf ? 2 : 0)} />
            <HeaderList title={`${pf ? "④" : "②"} actual response`} first={`${ac.status} ${REASONS[ac.status]}`} tone="text-emerald-300" lines={ac.resH} dim={prog < n} />
          </>
        ) : (
          <div className={`rounded-md border border-dashed border-ink-600 p-2 text-[11px] leading-relaxed text-slate-500 sm:col-span-2 ${done ? "" : "opacity-30"}`}>
            The preflight failed, so the browser never sent the real {sim.rq.method}. Your route handler was not called.
          </div>
        )}
      </div>

      {/* Verdict */}
      <div className={`mt-3 rounded-lg border p-3 transition-opacity ${sim.ok ? "border-emerald-400/40 bg-emerald-500/10" : "border-rose-400/40 bg-rose-500/10"} ${done ? "" : "opacity-40"}`}>
        <div className={`text-sm font-semibold ${sim.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {sim.ok ? "Allowed: the page's JavaScript can read the response" : `Blocked by CORS policy: ${sim.reason}`}
        </div>
        {sim.console && <div className="mt-1 break-words font-mono text-[10.5px] leading-relaxed text-rose-200/80">{sim.console}</div>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Stat label="server received it" value={sim.actual ? "yes" : pf ? "only the OPTIONS" : "yes"} color={sim.actual ? "text-amber-300" : "text-slate-300"} />
          <Stat label="handler ran" value={sim.handlerRan ? "yes" : "no"} color={sim.handlerRan ? "text-amber-300" : "text-emerald-300"} />
          <Stat label="JS can read it" value={sim.ok ? "yes" : "no"} color={sim.ok ? "text-emerald-300" : "text-rose-300"} />
        </div>
        {!sim.ok && sim.actual && (
          <div className="mt-2 text-[11px] leading-relaxed text-amber-200/90">
            The server still received and processed this request: CORS only stops the browser from handing the response to the page. It is not access control, so protect state-changing routes with real authentication.
          </div>
        )}
        {sim.mirrorWarn && (
          <div className="mt-2 text-[11px] leading-relaxed text-amber-200/90">
            Heads-up: with allow_origins=["*"] and allow_credentials=True, Starlette echoes back whatever Origin asked, so every site (even evil.example) can make credentialed calls. List your origins explicitly instead.
          </div>
        )}
      </div>

      <div className="mt-3">
        <Label className="mb-1">generated config (main.py)</Label>
        <PyCode code={py} />
      </div>
    </Card>
  );
}

export const WIDGETS_F = {
  "jwt-auth": JwtAuth,
  "http-playground": HttpPlayground,
  cors: Cors,
};
