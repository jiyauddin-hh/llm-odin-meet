"use client";

// Interactive Docker teaching widgets (set I): networking, storage, Compose
// start-up ordering and resource limits. Each widget is rendered from a
// ```diagram fenced block in a lesson and receives optional JSON `params`.
// Everything is plain React + inline SVG. Nothing touches a real Docker daemon:
// packets, DNS lookups, healthchecks and cgroup accounting are simulated in
// memory with fixed rules, every "random" number comes from a seeded PRNG and
// the clock is a tick counter, so server and client renders match. Animations
// only start on the client and are cleaned up on unmount.

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
/** The site's mono font has ligatures that turn -> and >= into arrows; keep code literal. */
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
/** Stable 32-bit hash of a string (seeds the PRNG from a command line, a name…). */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Deterministic hex string of length n. */
function hexOf(seed, n) {
  const r = mulberry32(seed);
  let s = "";
  while (s.length < n) s += Math.floor(r() * 16).toString(16);
  return s;
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
  return "i" + useId().replace(/[^a-zA-Z0-9]/g, "");
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
function Choice({ options, value, onChange, tones = {}, mono, label }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(([k, text]) => {
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
            {text}
          </button>
        );
      })}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, display, wide }) {
  return (
    <label className={`flex min-w-[150px] flex-1 items-center gap-2 text-xs text-slate-400 ${wide ? "basis-full sm:basis-0" : ""}`}>
      <span className="shrink-0">{label}</span>
      <input type="range" className="w-full accent-brand-500" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
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

/** Monospace panel for terminal output (wraps instead of scrolling the page). */
function Pre({ children, className = "", nowrap }) {
  return <pre style={NOLIG} className={`${nowrap ? "overflow-x-auto whitespace-pre" : "whitespace-pre-wrap break-words"} rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300 ${className}`}>{children}</pre>;
}

/** Arrowhead marker definition. */
function Arrow({ id, color }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  );
}

const INPUT = "rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-xs text-slate-200 outline-none focus:border-brand-500";

/* ---------- tiny shell / YAML highlighters for the code panels ---------- */

const SH_CMD = new Set(["docker", "curl", "ping", "nslookup", "dig", "pg_isready", "redis-cli", "cat", "ls", "echo", "sudo", "mkdir", "nc"]);
const SH_SUB = new Set(["run", "network", "create", "connect", "disconnect", "compose", "up", "down", "rm", "restart", "volume", "stats", "inspect", "exec", "ps", "port", "logs", "update", "stop", "start"]);
const SH_TOK = /((?:^|(?<=\s))#.*$)|("(?:\\.|[^"\\])*"|'[^']*')|((?<=^|\s)--?[A-Za-z][\w-]*)|(\$\([^)]*\)|\$\w+)|(\b[a-z][\w.-]*\b)/g;

/** One shell line → strings and coloured spans. */
function shLine(line) {
  const out = [];
  const re = new RegExp(SH_TOK.source, "g");
  let last = 0, m, first = true;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const t = m[0];
    let cls = null;
    if (m[1]) cls = "italic text-slate-500";
    else if (m[2]) cls = "text-emerald-300";
    else if (m[3]) cls = "text-amber-200";
    else if (m[4]) cls = "text-fuchsia-300";
    else if (SH_CMD.has(t) && first) cls = "text-sky-300";
    else if (SH_SUB.has(t)) cls = "text-fuchsia-300";
    if (m[5] || m[3]) first = false;
    out.push(cls ? <span key={m.index} className={cls}>{t}</span> : t);
    last = m.index + t.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

const YAML_VAL = /("(?:\\.|[^"\\])*"|'[^']*')|(\b(?:true|false|null)\b)|(\b\d+(?:\.\d+)?(?:s|ms|m|M|G)?\b)/g;
/** One YAML line → key / value / comment spans. */
function yamlLine(line) {
  const out = [];
  let body = line, comment = "";
  const ci = line.search(/(^|\s)#/);
  if (ci >= 0) {
    body = line.slice(0, ci);
    comment = line.slice(ci);
  }
  const km = body.match(/^(\s*(?:- )?)([\w.-]+)(:)(.*)$/);
  let rest = body;
  if (km) {
    out.push(km[1], <span key="k" className="text-sky-300">{km[2]}</span>, km[3]);
    rest = km[4];
  }
  const re = new RegExp(YAML_VAL.source, "g");
  let last = 0, m;
  while ((m = re.exec(rest))) {
    if (m.index > last) out.push(rest.slice(last, m.index));
    out.push(<span key={`v${m.index}`} className={m[1] ? "text-emerald-300" : "text-orange-300"}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < rest.length) out.push(rest.slice(last));
  if (comment) out.push(<span key="c" className="italic text-slate-500">{comment}</span>);
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

/** Shell or YAML snippet; `marks` maps a line index to a highlight tone. */
function Code({ lines, marks = {}, label, lang = "sh", className = "" }) {
  const hl = lang === "yaml" ? yamlLine : shLine;
  return (
    <div className={`min-w-0 overflow-hidden rounded-lg border border-ink-700 bg-ink-950 ${className}`}>
      {label && <div className="border-b border-ink-700 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>}
      <pre className="overflow-x-auto py-1.5 font-mono text-[11px] leading-[1.6] text-slate-300" style={NOLIG}>
        <div className="min-w-max">
          {lines.map((ln, i) => (
            <div key={i} className={`whitespace-pre border-l-2 pl-2.5 pr-3 transition-colors duration-300 ${MARK[marks[i]] || "border-transparent"}`}>
              {ln ? hl(ln) : " "}
            </div>
          ))}
        </div>
      </pre>
    </div>
  );
}

/** Point at fraction t along a polyline. */
function polyAt(pts, t) {
  if (pts.length === 1) return pts[0];
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let want = clamp(t, 0, 1) * total;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? clamp(want / seg[i], 0, 1) : 1;
      return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)];
    }
    want -= seg[i];
  }
  return pts[pts.length - 1];
}

/**
 * Step-through player shared by the packet animations: `steps` is a list of
 * stops; the dot dwells at each stop, then glides to the next. Returns the
 * current index, the glide progress and controls.
 */
function useStepper(steps, { dwell = 1.25, glide = 0.55 } = {}) {
  const force = useForce();
  const st = useRef({ k: 0, p: 0, moving: false, t: 0, playing: false, steps: null });
  const S = st.current;
  if (S.steps !== steps) {
    // a new run: start from its first stop and play it automatically
    S.steps = steps;
    S.k = 0;
    S.p = 0;
    S.moving = false;
    S.t = 0;
    S.playing = !!steps && steps.length > 0;
  }
  const last = steps ? steps.length - 1 : 0;
  useLoop(!!steps && S.playing, (dt) => {
    const s = st.current;
    if (!s.steps) return;
    if (s.moving) {
      s.p += dt / glide;
      if (s.p >= 1) {
        s.k = Math.min(last, s.k + 1);
        s.moving = false;
        s.p = 0;
        s.t = 0;
      }
    } else {
      s.t += dt;
      if (s.k >= last) s.playing = false;
      else if (s.t >= dwell) s.moving = true;
    }
    force();
  });
  const skip = () => {
    const s = st.current;
    s.k = last;
    s.moving = false;
    s.p = 0;
    s.playing = false;
    force();
  };
  return { k: S.k, p: S.moving ? ease(clamp(S.p, 0, 1)) : 0, moving: S.moving, done: !!steps && S.k >= last && !S.moving, playing: S.playing, skip };
}

/* ======================================================================== */
/* ---------- port-mapping: -p host:container, DNAT and docker-proxy ------ */
/* ======================================================================== */

const PM_LO = "127.0.0.1";
const PM_LAN = "192.168.1.20";
const PM_GW = "172.17.0.1";
const PM_LAPTOP = "192.168.1.50";
const PM_TONES = [C.sky, C.emerald, C.amber, C.fuchsia];
const PM_MAXCT = 4;
const PM_IMG = {
  nginx: { ref: "nginx:1.27", base: "web", listen: ["80/tcp"], tool: "http", what: "nginx" },
  postgres: { ref: "postgres:16", base: "db", listen: ["5432/tcp"], tool: "pg", what: "postgres", env: "-e POSTGRES_PASSWORD=secret " },
  redis: { ref: "redis:7", base: "cache", listen: ["6379/tcp"], tool: "redis", what: "redis-server" },
  api: { ref: "my-api:1.0", base: "api", listen: ["3000/tcp"], tool: "http", what: "node (my-api)" },
  whoami: { ref: "traefik/whoami", base: "whoami", listen: ["80/tcp"], tool: "http", what: "whoami" },
  dns: { ref: "coredns/coredns", base: "dns", listen: ["53/udp"], tool: "dns", what: "coredns" },
  app: { ref: "my-app:1.0", base: "app", listen: [], tool: "http", what: "my-app" },
};
const PM_IMG_KEYS = ["nginx", "whoami", "api", "postgres", "redis", "dns"];
const PM_DEFAULT = ["8080:80", "5432:5432"];

/** "8080:80", "127.0.0.1:8080:80", "80", "127.0.0.1::80", "5353:53/udp" → {ip, host, cport, proto}. */
function pmParse(raw) {
  if (typeof raw === "number") raw = String(raw);
  if (typeof raw !== "string") return null;
  const m = raw.trim().toLowerCase().match(/^(?:(\d{1,3}(?:\.\d{1,3}){3}|localhost):)?(?:(\d{1,5})?:)?(\d{1,5})(?:\/(tcp|udp))?$/);
  if (!m) return null;
  const host = m[2] ? Number(m[2]) : null;
  const cport = Number(m[3]);
  if (cport < 1 || cport > 65535 || (host !== null && (host < 1 || host > 65535))) return null;
  return { ip: m[1] === "localhost" ? PM_LO : m[1] || "0.0.0.0", host, cport, proto: m[4] || "tcp" };
}

/** Which image a lesson's container port probably belongs to. */
function pmGuess(cport, proto) {
  if (proto === "udp") return cport === 53 ? "dns" : "app";
  return { 80: "nginx", 443: "nginx", 5432: "postgres", 6379: "redis", 3000: "api" }[cport] || "app";
}

/** An existing binding that a new one would collide with (same proto + port, overlapping address). */
function pmClash(binds, b) {
  return binds.find((x) => x.proto === b.proto && x.host === b.host && (x.ip === b.ip || x.ip === "0.0.0.0" || b.ip === "0.0.0.0"));
}

const pmSpec = (b) => `${b.ip === "0.0.0.0" ? "" : `${b.ip}:`}${b.eph ? (b.ip === "0.0.0.0" ? "" : ":") : `${b.host}:`}${b.cport}${b.proto === "udp" ? "/udp" : ""}`;

function pmNewCt(cts, img, seq) {
  const def = PM_IMG[img];
  let name = def.base;
  for (let n = 2; cts.some((c) => c.name === name); n++) name = `${def.base}${n}`;
  let last = 2;
  while (cts.some((c) => c.ip === `172.17.0.${last}`)) last++;
  let tone = 0;
  while (cts.some((c) => c.tone === tone)) tone++;
  return { id: hexOf(seq * 7919 + 17, 12), seq, img, name, ip: `172.17.0.${last}`, listen: [...def.listen], tone };
}

function pmInit(prm) {
  const list = Array.isArray(prm.mappings) ? prm.mappings : typeof prm.mappings === "string" || typeof prm.mappings === "number" ? [prm.mappings] : PM_DEFAULT;
  const cts = [], binds = [], notes = [];
  let eph = 32768, seq = 0;
  for (const raw of list.slice(0, 8)) {
    const p = pmParse(raw);
    if (!p) {
      notes.push(`skipped ${JSON.stringify(raw)}: write host:container, ip:host:container, or add /udp`);
      continue;
    }
    if (![PM_LO, "0.0.0.0", PM_LAN].includes(p.ip)) {
      notes.push(`skipped "${raw}": listen ${p.proto}4 ${p.ip}:${p.host ?? ""}: bind: cannot assign requested address (the host has 127.0.0.1 and ${PM_LAN})`);
      continue;
    }
    const b = { ...p, host: p.host ?? eph++, eph: p.host === null };
    if (pmClash(binds, b) || (b.host === 22 && b.proto === "tcp")) {
      notes.push(`skipped "${raw}": ${b.host === 22 && b.proto === "tcp" ? `listen tcp4 ${b.ip}:22: bind: address already in use (sshd)` : `Bind for ${b.ip}:${b.host} failed: port is already allocated`}`);
      continue;
    }
    const img = pmGuess(p.cport, p.proto);
    let ct = cts.find((c) => c.img === img);
    if (!ct) {
      if (cts.length >= PM_MAXCT) {
        notes.push(`skipped "${raw}": this diagram shows at most ${PM_MAXCT} containers`);
        continue;
      }
      ct = pmNewCt(cts, img, seq++);
      cts.push(ct);
    }
    const lp = `${p.cport}/${p.proto}`;
    if (!ct.listen.includes(lp)) ct.listen.push(lp);
    binds.push({ ...b, cid: ct.id });
  }
  if (!cts.length && !notes.length) return pmInit({ mappings: PM_DEFAULT });
  return { cts, binds, notes, seq };
}

/** Which client tool fits the target (curl for HTTP, pg_isready, redis-cli, dig for UDP). */
function pmTool(S, addr, port, proto) {
  if (proto === "udp") return "dns";
  let ct = S.cts.find((c) => c.id === addr);
  if (!ct && (addr === "lo" || addr === "lan")) {
    const b = S.binds.find((x) => x.host === port && x.proto === proto);
    if (b) ct = S.cts.find((c) => c.id === b.cid);
  }
  if (ct && PM_IMG[ct.img].tool !== "dns") return PM_IMG[ct.img].tool;
  return port === 5432 ? "pg" : port === 6379 ? "redis" : "http";
}

function pmCmd(tool, h, port) {
  if (tool === "pg") return `pg_isready -h ${h} -p ${port}`;
  if (tool === "redis") return `redis-cli -h ${h} -p ${port} ping`;
  if (tool === "dns") return `dig @${h === "localhost" ? PM_LO : h} -p ${port} +short web.internal`;
  return `curl ${h}:${port}`;
}

/** Terminal output of the client tool for an outcome. */
function pmOutput(r) {
  const { tool, hostStr: h, port, kind, ct, client, cport } = r;
  const ip = h === "localhost" ? PM_LO : h;
  if (kind === "ok") {
    if (tool === "pg") return `${h}:${port} - accepting connections`;
    if (tool === "redis") return "PONG";
    if (tool === "dns") return "10.0.0.5";
    if (ct.img === "nginx") return "<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n…";
    if (ct.img === "whoami") return `Hostname: ${ct.id}\nIP: 127.0.0.1\nIP: ${ct.ip}\nRemoteAddr: ${client}:${40000 + (hashStr(h + port) % 20000)}\nGET / HTTP/1.1\nHost: ${h}:${port}\nUser-Agent: curl/8.5.0\nAccept: */*`;
    if (ct.img === "api") return `{"status":"ok","service":"my-api","clientIp":"${client}"}`;
    return `Hello from ${ct.name} (my-app) on :${cport}, client ${client}`;
  }
  if (kind === "sshd") return tool === "http" ? "curl: (1) Received HTTP/0.9 when not allowed\n(the server sent \"SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13\": that is sshd, not HTTP)" : tool === "redis" ? "Error: Protocol error, got \"S\" as reply type byte" : tool === "dns" ? ";; communications error: connection refused" : `${h}:${port} - no response`;
  if (kind === "refused") {
    if (tool === "pg") return `${h}:${port} - no response`;
    if (tool === "redis") return `Could not connect to Redis at ${h}:${port}: Connection refused`;
    if (tool === "dns") return `;; communications error to ${ip}#${port}: connection refused\n;; no servers could be reached`;
    return `curl: (7) Failed to connect to ${h} port ${port} after 0 ms: Couldn't connect to server`;
  }
  if (kind === "reset") {
    if (tool === "pg") return `${h}:${port} - no response`;
    if (tool === "redis") return "Error: Connection reset by peer";
    if (tool === "dns") return ";; connection timed out; no servers could be reached";
    return "curl: (56) Recv failure: Connection reset by peer";
  }
  // timeout
  if (tool === "pg") return `${h}:${port} - no response`;
  if (tool === "redis") return `Could not connect to Redis at ${h}:${port}: Connection timed out`;
  if (tool === "dns") return ";; connection timed out; no servers could be reached";
  return `curl: (28) Failed to connect to ${h} port ${port} after 133942 ms: Couldn't connect to server`;
}

const PM_OUTCOME = {
  ok: ["Connected", "text-emerald-300"],
  refused: ["Connection refused", "text-rose-300"],
  reset: ["Connection reset", "text-rose-300"],
  timeout: ["Timed out", "text-amber-300"],
  sshd: ["Wrong service (host sshd)", "text-amber-300"],
};

/** Follow one connection attempt and explain each hop. */
function pmResolve(S, src, addr, port, proto) {
  const ct0 = S.cts.find((c) => c.id === addr);
  const hostStr = addr === "lan" ? PM_LAN : ct0 ? ct0.ip : "localhost";
  const tool = pmTool(S, addr, port, proto);
  const steps = [];
  const st = (at, say, tone = "sky") => steps.push({ at, say, tone });
  const fin = (kind, extra = {}) => ({ steps, kind, tool, hostStr, port, proto, src, ...extra });
  const pkt = proto === "udp" ? "a UDP datagram" : "a TCP SYN";
  const deliver = (ct, cport, client, via) => {
    if (ct.listen.includes(`${cport}/${proto}`)) {
      st(`ct:${ct.id}`, `${PM_IMG[ct.img].what} in ${ct.name} is listening on :${cport}/${proto} and answers. It sees the client as ${client}${via === "proxy" ? " (docker-proxy), not as 127.0.0.1" : via === "dnat" && src === "lan" ? ": DNAT keeps the real source address" : ""}.`, "emerald");
      return fin("ok", { ct, client, cport });
    }
    const ls = ct.listen.length ? ct.listen.map((x) => `:${x}`).join(", ") : "nothing";
    st(
      `ct:${ct.id}`,
      `Nothing listens on :${cport}/${proto} inside ${ct.name} (it listens on ${ls}). ${via === "proxy" ? "docker-proxy had already accepted your connection, so when its own connection is refused it just closes yours: a reset, not a refusal." : "The container's kernel rejects the connection."} The mapping's container port must match the port the app really listens on.`,
      "rose",
    );
    return fin(via === "proxy" ? "reset" : proto === "udp" ? "timeout" : "refused", { ct });
  };

  st(src === "host" ? "shell" : "laptop", `${src === "host" ? "A shell on the Docker host" : `A laptop on the same LAN (${PM_LAPTOP})`} sends ${pkt} to ${hostStr === "localhost" ? "localhost (127.0.0.1)" : hostStr}:${port}.`);
  if (src === "lan" && addr === "lo") {
    st("laptop", `localhost always means this machine: on the laptop, 127.0.0.1 is the laptop itself, so the packet never reaches the Docker host. Nothing listens on the laptop's port ${port}. Use the host's LAN IP ${PM_LAN} instead.`, "rose");
    return fin("refused");
  }
  if (ct0) {
    if (src === "lan") {
      st("drop", `172.17.0.0/16 only exists inside the Docker host. The LAN router has no route to ${ct0.ip}, the packets go nowhere and the client waits for its connect timeout. From outside, you can only reach published ports on the host's own address.`, "rose");
      return fin("timeout");
    }
    st("route", `No publishing needed for this: the host's routing table has "172.17.0.0/16 dev docker0", so on a Linux host you can reach a container IP directly. (Docker Desktop on macOS/Windows runs the engine in a VM, so this does not work there.)`);
    st(`br:${ct0.id}`, `docker0 (${PM_GW}) forwards the packet to ${ct0.name}'s veth interface.`);
    return deliver(ct0, port, PM_GW, "direct");
  }
  const dst = addr === "lo" ? PM_LO : PM_LAN;
  if (src === "host" && addr === "lo") st("lo", "localhost resolves to 127.0.0.1, so the packet goes over the loopback interface lo.");
  else if (src === "host") st("eth0", `${PM_LAN} is one of the host's own addresses, so the kernel delivers the packet locally; it never touches the wire.`);
  else st("eth0", `The packet arrives on the host's eth0 (${PM_LAN}).`);
  const i = S.binds.findIndex((b) => b.host === port && b.proto === proto && (b.ip === "0.0.0.0" || b.ip === dst));
  if (i < 0) {
    if (port === 22 && proto === "tcp") {
      st("sshd", "No Docker rule for :22, but the host's own sshd listens on 0.0.0.0:22 and answers with its SSH banner. Host ports are shared by host processes and published containers.", "amber");
      return fin("sshd");
    }
    const other = S.binds.find((b) => b.host === port && b.proto === proto);
    const otherProto = S.binds.find((b) => b.host === port && b.proto !== proto);
    let why;
    if (other) why = `Port ${port} is published only on ${other.ip} (-p ${pmSpec(other)}), so nothing handles ${dst}:${port}.`;
    else if (otherProto) why = `Only ${port}/${otherProto.proto} is published; ${proto.toUpperCase()} and ${otherProto.proto.toUpperCase()} ports are separate.`;
    else why = `No container publishes host port ${port} (a container port that is not published is only reachable from the container's networks).`;
    st("nat-miss", `${why} There is no DNAT rule, no docker-proxy and no host process on ${port}, so the host kernel answers ${proto === "udp" ? "with ICMP port unreachable" : "the SYN with RST"}: connection refused.`, "rose");
    return fin("refused");
  }
  const b = S.binds[i];
  const ct = S.cts.find((c) => c.id === b.cid);
  if (src === "host" && addr === "lo") {
    st(`nat:${i}`, `Docker's DNAT rule in the nat OUTPUT chain skips 127.0.0.0/8, so loopback traffic is handled by docker-proxy, the userland proxy that Docker starts for every published port. It is listening on ${b.ip}:${port} and accepts the connection.`);
    st(`br:${ct.id}`, `docker-proxy opens its own connection from ${PM_GW} (docker0) to ${ct.ip}:${b.cport}.`);
    return deliver(ct, b.cport, PM_GW, "proxy");
  }
  st(
    `nat:${i}`,
    src === "host"
      ? `iptables nat OUTPUT → DOCKER chain: DNAT ${dst}:${port} → ${ct.ip}:${b.cport}. The kernel rewrites the destination address; no proxy involved.`
      : `iptables nat PREROUTING → DOCKER chain: DNAT ${dst}:${port} → ${ct.ip}:${b.cport}, then the FORWARD chain's DOCKER rules accept it. These rules run before ufw's INPUT rules, which is why ufw does not block published ports.`,
  );
  st(`br:${ct.id}`, `Routed out of docker0 to ${ct.ip}:${b.cport}.`);
  return deliver(ct, b.cport, src === "host" ? PM_LAN : PM_LAPTOP, "dnat");
}

export function PortMapping({ params = {} }) {
  const prm = obj(params);
  const init = useMemo(() => pmInit(prm), [JSON.stringify(prm.mappings ?? null)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [S, setS] = useState(init);
  const firstPort = init.binds[0]?.host ?? 8080;
  const [src, setSrc] = useState("host");
  const [addr, setAddr] = useState("lo");
  const [port, setPort] = useState(firstPort);
  const [proto, setProto] = useState(init.binds[0]?.proto ?? "tcp");
  const [run, setRun] = useState(null);
  const [form, setForm] = useState({ ip: "0.0.0.0", host: String(firstPort), cport: "80", proto: "tcp", img: "nginx" });
  const [addMsg, setAddMsg] = useState(null);
  const id = useSvgId();
  const player = useStepper(run ? run.steps : null);

  const clearRun = () => setRun(null);
  const ctOf = (cid) => S.cts.find((c) => c.id === cid);
  const portOk = Number.isInteger(port) && port >= 1 && port <= 65535;
  const tool = pmTool(S, addr, port, proto);
  const tgt = addr === "lan" ? PM_LAN : ctOf(addr)?.ip || "localhost";
  const cmd = pmCmd(tool, tgt, portOk ? port : "?");
  const prompt = src === "host" ? "dev@docker-host:~$" : "me@laptop:~$";

  const go = () => {
    if (!portOk) return;
    setRun(pmResolve(S, src, addr, port, proto));
  };

  // ----- add / remove containers -----
  const addCt = () => {
    const host = Number(form.host), cport = Number(form.cport);
    const name0 = (() => {
      const def = PM_IMG[form.img];
      let name = def.base;
      for (let n = 2; S.cts.some((c) => c.name === name); n++) name = `${def.base}${n}`;
      return name;
    })();
    const runCmd = `docker run -d --name ${name0} -p ${pmSpec({ ip: form.ip, host, cport, proto: form.proto })} ${PM_IMG[form.img].env || ""}${PM_IMG[form.img].ref}`;
    if (!Number.isInteger(host) || !Number.isInteger(cport) || host < 1 || host > 65535 || cport < 1 || cport > 65535) {
      setAddMsg({ cmd: runCmd, out: `docker: invalid ${!Number.isInteger(host) || host < 1 || host > 65535 ? `hostPort: ${form.host || '""'}` : `containerPort: ${form.cport || '""'}`}. Ports are 1-65535.`, bad: true });
      return;
    }
    if (S.cts.length >= PM_MAXCT) {
      setAddMsg({ cmd: runCmd, out: `This diagram has room for ${PM_MAXCT} containers: remove one first (docker rm -f).`, bad: true });
      return;
    }
    const b = { ip: form.ip, host, cport, proto: form.proto };
    const eid = hexOf(hashStr(name0 + S.seq), 64);
    const clash = pmClash(S.binds, b);
    if (clash) {
      setAddMsg({
        cmd: runCmd,
        out: `docker: Error response from daemon: driver failed programming external connectivity on endpoint ${name0} (${eid}): Bind for ${b.ip}:${host} failed: port is already allocated.`,
        bad: true,
        note: `${ctOf(clash.cid)?.name} already holds ${pmSpec(clash)}. The container was created but could not start: docker ps -a shows it as Created. Pick another host port (the container port can stay ${cport}).`,
      });
      return;
    }
    if (host === 22 && b.proto === "tcp") {
      setAddMsg({
        cmd: runCmd,
        out: `docker: Error response from daemon: driver failed programming external connectivity on endpoint ${name0} (${eid}): Error starting userland proxy: listen tcp4 ${b.ip}:22: bind: address already in use.`,
        bad: true,
        note: "A host process (sshd) owns port 22. Docker cannot publish a port that something on the host is already listening on.",
      });
      return;
    }
    setS((s) => {
      const ct = pmNewCt(s.cts, form.img, s.seq);
      return { ...s, cts: [...s.cts, ct], binds: [...s.binds, { ...b, cid: ct.id }], seq: s.seq + 1 };
    });
    const ct = pmNewCt(S.cts, form.img, S.seq);
    const listens = ct.listen.includes(`${cport}/${b.proto}`);
    setAddMsg({
      cmd: runCmd,
      out: hexOf(S.seq * 7919 + 17, 64),
      bad: false,
      note: listens ? `${name0} is up at ${ct.ip}, published as ${b.ip}:${host} → ${cport}/${b.proto}.` : `Started, but ${PM_IMG[form.img].what} listens on ${ct.listen.join(", ")}, not ${cport}/${b.proto}. Docker does not check this: try connecting and see what happens.`,
    });
    clearRun();
  };
  const rmCt = (cid) => {
    setS((s) => ({ ...s, cts: s.cts.filter((c) => c.id !== cid), binds: s.binds.filter((b) => b.cid !== cid) }));
    if (addr === cid) setAddr("lo");
    setAddMsg({ cmd: `docker rm -f ${ctOf(cid)?.name}`, out: ctOf(cid)?.name, bad: false, note: "Removing the container also removes its DNAT rules and stops its docker-proxy, so the host port is free again." });
    clearRun();
  };
  const resetAll = () => {
    setS(init);
    setAddr("lo");
    setSrc("host");
    setPort(firstPort);
    setProto(init.binds[0]?.proto ?? "tcp");
    setAddMsg(null);
    clearRun();
  };

  // ----- layout -----
  const R = Math.max(1, S.binds.length);
  const natTop = 120;
  const rowY = (i) => natTop + 30 + i * 14;
  const natBot = natTop + 22 + R * 14 + 4;
  const brY = natBot + 21;
  const ctTop = brY + 22;
  const H = ctTop + 66 + 10;
  const n = Math.max(1, S.cts.length);
  const cw = (312 - (n - 1) * 8) / n;
  const cx = (i) => 14 + i * (cw + 8) + cw / 2;
  const ctIdx = (cid) => S.cts.findIndex((c) => c.id === cid);
  const pos = (key) => {
    if (key === "shell") return [64, 73];
    if (key === "laptop") return [271, 18];
    if (key === "drop") return [271, 38];
    if (key === "lo") return [64, 101];
    if (key === "eth0") return [271, 73];
    if (key === "sshd") return [271, 101];
    if (key === "nat-miss") return [170, natTop + 11];
    if (key === "route") return [9, brY];
    const [k, v] = key.split(":");
    if (k === "nat") return [170, rowY(Number(v)) - 3];
    const ci = ctIdx(v);
    if (k === "br") return [cx(Math.max(0, ci)), brY];
    if (k === "ct") return [cx(Math.max(0, ci)), ctTop + 33];
    return [170, 60];
  };
  // intermediate points so the dot follows the wires
  const via = (from, to) => {
    if (to === "route") return [[9, 73]];
    if (to.startsWith("nat") && from === "eth0") return [[271, natTop]];
    if (to.startsWith("nat") && from === "lo") return [[64, natTop]];
    return [];
  };

  const steps = run ? run.steps : [];
  const k = player.k;
  const cur = steps[k];
  let dot = null;
  if (run && cur) {
    const a = pos(cur.at);
    if (player.moving && steps[k + 1]) {
      const pts = [a, ...via(cur.at, steps[k + 1].at), pos(steps[k + 1].at)];
      dot = polyAt(pts, player.p);
    } else dot = a;
  }
  const trail = [];
  if (run) {
    for (let i = 0; i < k + (player.moving ? 1 : 0) && i + 1 < steps.length; i++) trail.push([pos(steps[i].at), ...via(steps[i].at, steps[i + 1].at), pos(steps[i + 1].at)]);
  }
  const hot = (key) => run && cur && cur.at === key && !player.moving;
  const passed = (key) => run && steps.slice(0, k + 1).some((s) => s.at === key);
  const endTone = run && player.done ? (run.kind === "ok" ? C.emerald : run.kind === "timeout" || run.kind === "sshd" ? C.amber : C.rose) : C.sky;
  const activeBind = run ? steps.map((s) => s.at).find((a) => a.startsWith("nat:")) : null;

  const portChips = (() => {
    const out = [];
    const ct = ctOf(addr);
    if (ct) {
      ct.listen.forEach((l) => {
        const [p, pr] = l.split("/");
        out.push([Number(p), pr]);
      });
      const hp = S.binds.find((b) => b.cid === ct.id && b.host !== b.cport);
      if (hp) out.push([hp.host, hp.proto]);
    } else {
      S.binds.forEach((b) => out.push([b.host, b.proto]));
      out.push([[3000, 9000, 8081].find((p) => !S.binds.some((b) => b.host === p)), "tcp"]);
      out.push([22, "tcp"]);
    }
    return out.filter(([p, pr], i) => out.findIndex(([q, qr]) => q === p && qr === pr) === i);
  })();

  const psLines = [
    "NAMES    IMAGE            PORTS",
    ...S.cts.map((c) => {
      const ports = S.binds.filter((b) => b.cid === c.id).map((b) => `${b.ip}:${b.host}->${b.cport}/${b.proto}`);
      const unpub = c.listen.filter((l) => !S.binds.some((b) => b.cid === c.id && `${b.cport}/${b.proto}` === l));
      return `${c.name.padEnd(8)} ${PM_IMG[c.img].ref.padEnd(16)} ${[...ports, ...unpub].join(", ") || "-"}`;
    }),
  ];
  const runLines = S.cts.map((c) => {
    const ps = S.binds.filter((b) => b.cid === c.id).map((b) => `-p ${pmSpec(b)}`).join(" ");
    return `docker run -d --name ${c.name} ${ps}${ps ? " " : ""}${PM_IMG[c.img].env || ""}${PM_IMG[c.img].ref}`;
  });
  const runMarks = {};
  if (activeBind) {
    const b = S.binds[Number(activeBind.split(":")[1])];
    const ci = b ? ctIdx(b.cid) : -1;
    if (ci >= 0) runMarks[ci] = player.done ? (run.kind === "ok" ? "emerald" : "rose") : "sky";
  }

  const addrOpts = [
    ["lo", "localhost"],
    ["lan", `${PM_LAN} (host LAN IP)`],
    ...S.cts.map((c) => [c.id, `${c.ip} (${c.name})`]),
  ];

  return (
    <Card
      title="Publishing ports: -p host:container"
      params={params}
      caption="Pick where the client runs, the address and the port, then press Connect and follow the packet. Try a published port from the host and from the laptop, an unpublished port (connection refused), a port bound to 127.0.0.1 from the laptop, and a container IP from outside. Then publish another container: reuse a taken host port to see Docker's real error."
    >
      <svg viewBox={`0 0 340 ${H}`} className="h-auto w-full select-none" role="img" aria-label="Docker host with port mappings, iptables DNAT rules, the docker0 bridge and containers">
        <defs>
          <filter id={`${id}g`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        {/* laptop outside the host */}
        <rect x="211" y="4" width="120" height="28" rx="7" fill={src === "lan" ? "#0c2a3d" : C.ink800} stroke={src === "lan" ? C.sky : C.ink600} />
        <text x="271" y="15" textAnchor="middle" fontSize="9" fontWeight="600" fill="#e2e8f0">laptop (LAN)</text>
        <text x="271" y="26" textAnchor="middle" fontSize="7.5" fill={C.dim} fontFamily={MONO}>{PM_LAPTOP}</text>
        <line x1="271" y1="32" x2="271" y2="62" stroke={passed("eth0") && src === "lan" ? C.sky : C.axis} strokeDasharray="3 2" />
        <text x="14" y="22" fontSize="8" fill={C.dim}>LAN 192.168.1.0/24</text>
        {/* host */}
        <rect x="4" y="44" width="332" height={H - 48} rx="9" fill={C.ink950} stroke={C.ink600} strokeDasharray="5 3" />
        <text x="14" y="55" fontSize="8" fill={C.dim}>Docker host (Linux · Engine 27)</text>
        <rect x="14" y="62" width="100" height="22" rx="6" fill={src === "host" ? "#0c2a3d" : C.ink800} stroke={src === "host" ? C.sky : C.ink600} />
        <text x="64" y="76" textAnchor="middle" fontSize="8.5" fill="#e2e8f0" fontFamily={MONO}>$ shell</text>
        {[["lo", 14, 92, `lo ${PM_LO}`], ["eth0", 216, 62, `eth0 ${PM_LAN}`]].map(([k2, x, y, t]) => (
          <g key={k2}>
            <rect x={x} y={y} width={k2 === "lo" ? 100 : 110} height={k2 === "lo" ? 18 : 22} rx="9" fill={hot(k2) ? "#0c2a3d" : C.ink800} stroke={passed(k2) ? C.sky : C.ink600} />
            <text x={x + (k2 === "lo" ? 50 : 55)} y={y + (k2 === "lo" ? 12.5 : 14)} textAnchor="middle" fontSize="8" fill={C.text} fontFamily={MONO}>{t}</text>
          </g>
        ))}
        <line x1="64" y1="84" x2="64" y2="92" stroke={C.axis} />
        <line x1="64" y1="110" x2="64" y2={natTop} stroke={C.axis} />
        <line x1="271" y1="84" x2="271" y2={natTop} stroke={C.axis} />
        <line x1="114" y1="73" x2="216" y2="73" stroke={C.axis} strokeDasharray="2 3" />
        <rect x="216" y="92" width="110" height="18" rx="9" fill={hot("sshd") ? "#33260a" : C.ink800} stroke={hot("sshd") ? C.amber : C.ink600} strokeDasharray="3 2" />
        <text x="271" y="104.5" textAnchor="middle" fontSize="7.5" fill={C.dim} fontFamily={MONO}>sshd 0.0.0.0:22 (host)</text>
        {/* NAT table */}
        <rect x="14" y={natTop} width="312" height={natBot - natTop} rx="7" fill={C.ink900} stroke={hot("nat-miss") ? C.rose : C.ink600} />
        <text x="22" y={natTop + 14} fontSize="8.5" fontWeight="600" fill="#e2e8f0">iptables nat · DOCKER chain</text>
        <text x="318" y={natTop + 14} textAnchor="end" fontSize="7.5" fill={C.dim}>+ docker-proxy per port</text>
        {S.binds.length === 0 && <text x="170" y={rowY(0)} textAnchor="middle" fontSize="8" fill={C.dim}>no published ports</text>}
        {S.binds.map((b, i) => {
          const ct = ctOf(b.cid);
          const on = activeBind === `nat:${i}`;
          const tone = PM_TONES[ct?.tone ?? 0];
          return (
            <g key={i}>
              {on && <rect x="18" y={rowY(i) - 10} width="304" height="13" rx="3" fill={tone} opacity="0.14" />}
              <circle cx="25" cy={rowY(i) - 3.5} r="2.5" fill={tone} />
              <text x="32" y={rowY(i)} fontSize="8" fill={on ? "#f1f5f9" : C.text} fontFamily={MONO}>
                {`${b.ip}:${b.host}/${b.proto}`}
                <tspan fill={tone}>{"  →  "}</tspan>
                {`${ct?.ip}:${b.cport}`}
              </text>
              <text x="318" y={rowY(i)} textAnchor="end" fontSize="7.5" fill={tone} fontFamily={MONO}>{ct?.name}</text>
            </g>
          );
        })}
        {/* docker0 bridge */}
        <rect x="14" y={brY - 7} width="312" height="14" rx="7" fill="#1e1b3a" stroke={C.brand} strokeOpacity="0.6" />
        <text x="22" y={brY + 3} fontSize="8" fill={C.brandL} fontFamily={MONO}>docker0 · {PM_GW}/16</text>
        {/* containers */}
        {S.cts.map((c, i) => {
          const x = 14 + i * (cw + 8);
          const tone = PM_TONES[c.tone];
          const on = hot(`ct:${c.id}`);
          const ok = on && player.done && run.kind === "ok";
          const bad = on && player.done && run.kind !== "ok";
          const narrow = cw < 90;
          return (
            <g key={c.id}>
              <line x1={cx(i)} y1={brY + 7} x2={cx(i)} y2={ctTop} stroke={passed(`br:${c.id}`) ? C.sky : C.axis} />
              {on && <rect x={x - 2} y={ctTop - 2} width={cw + 4} height="70" rx="9" fill={bad ? C.rose : ok ? C.emerald : C.sky} opacity="0.3" filter={`url(#${id}g)`} />}
              <rect x={x} y={ctTop} width={cw} height="66" rx="7" fill={bad ? "#3b1622" : ok ? "#0b2e24" : C.ink800} stroke={bad ? C.rose : ok ? C.emerald : tone} strokeOpacity={on ? 1 : 0.7} />
              <text x={cx(i)} y={ctTop + 13} textAnchor="middle" fontSize="9" fontWeight="700" fill="#f1f5f9" fontFamily={MONO}>{c.name}</text>
              <text x={cx(i)} y={ctTop + 24} textAnchor="middle" fontSize={narrow ? 6.8 : 7.5} fill={C.dim} fontFamily={MONO}>{PM_IMG[c.img].ref.replace("coredns/", "").replace("traefik/", "")}</text>
              <text x={cx(i)} y={ctTop + 37} textAnchor="middle" fontSize={narrow ? 7.4 : 8} fill={tone} fontFamily={MONO}>{c.ip}</text>
              <text x={cx(i)} y={ctTop + 50} textAnchor="middle" fontSize="7" fill={C.dim}>listens</text>
              <text x={cx(i)} y={ctTop + 60} textAnchor="middle" fontSize={narrow ? 6.8 : 7.5} fill={C.text} fontFamily={MONO}>{c.listen.map((l) => `:${l.replace("/tcp", "")}`).join(" ") || "-"}</text>
            </g>
          );
        })}
        {S.cts.length === 0 && <text x="170" y={ctTop + 34} textAnchor="middle" fontSize="8.5" fill={C.dim}>no containers running</text>}
        {/* packet */}
        {trail.map((pts, i) => (
          <polyline key={i} points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={C.sky} strokeWidth="1.4" strokeOpacity="0.45" strokeDasharray="4 2" />
        ))}
        {dot && (
          <g transform={`translate(${dot[0]} ${dot[1]})`}>
            <circle r="6" fill={endTone} stroke={C.ink950} strokeWidth="1.5" />
            {player.done && run.kind !== "ok" && <path d="M-2.6,-2.6 L2.6,2.6 M2.6,-2.6 L-2.6,2.6" stroke={C.ink950} strokeWidth="1.6" />}
            {player.done && run.kind === "ok" && <path d="M-2.8,0 L-0.8,2.2 L3,-2.2" fill="none" stroke={C.ink950} strokeWidth="1.6" />}
          </g>
        )}
      </svg>

      {/* client controls */}
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="w-14">from</Label>
          <Choice label="client location" options={[["host", "shell on the host"], ["lan", "laptop on the LAN"]]} value={src} onChange={(v) => { setSrc(v); clearRun(); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="w-14">address</Label>
          <Choice label="destination address" options={addrOpts} value={addr} onChange={(v) => { setAddr(v); clearRun(); }} mono />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="w-14">port</Label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={65535}
            value={Number.isFinite(port) ? port : ""}
            onChange={(e) => { setPort(Math.trunc(Number(e.target.value))); clearRun(); }}
            onKeyDown={(e) => e.key === "Enter" && go()}
            aria-label="destination port"
            className={`${INPUT} w-20`}
          />
          <Choice label="protocol" options={[["tcp", "tcp"], ["udp", "udp"]]} value={proto} onChange={(v) => { setProto(v); clearRun(); }} mono />
          <div className="flex flex-wrap gap-1">
            {portChips.map(([p, pr]) => (
              <button
                key={`${p}/${pr}`}
                type="button"
                onClick={() => { setPort(p); setProto(pr); clearRun(); }}
                className={`rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors ${port === p && proto === pr ? "bg-brand-500/25 text-brand-200" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
              >
                :{p}{pr === "udp" ? "/udp" : ""}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-ink-950 px-2 py-1.5 font-mono text-[11px] text-slate-300" style={NOLIG}>
          <span className="text-slate-500">{prompt} </span>{shLine(cmd)}
        </code>
        <Button primary onClick={go} disabled={!portOk}>Connect</Button>
        {run && !player.done && <Button onClick={player.skip}>Skip ▶▶</Button>}
      </div>

      <div className="mt-2 min-h-[64px] rounded-lg bg-ink-800 px-3 py-2" aria-live="polite">
        {!run && <div className="text-xs text-slate-500">Press Connect to send the packet.</div>}
        {run && (
          <ol className="space-y-1 text-xs leading-relaxed">
            {steps.slice(0, k + 1).map((s, i) => (
              <li key={i} className={`flex gap-2 ${i === k ? "" : "opacity-60"}`}>
                <span className={`mt-[1px] font-mono text-[10px] ${s.tone === "rose" ? "text-rose-300" : s.tone === "emerald" ? "text-emerald-300" : s.tone === "amber" ? "text-amber-300" : "text-sky-300"}`}>{i + 1}.</span>
                <span className="text-slate-300">{s.say}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {run && player.done && (
        <div className="mt-2">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Label>output</Label>
            <span className={`text-xs font-semibold ${PM_OUTCOME[run.kind][1]}`}>{PM_OUTCOME[run.kind][0]}</span>
          </div>
          <Pre className={run.kind === "ok" ? "" : "text-rose-200"}>
            <span className="text-slate-500">{prompt} </span>
            {pmCmd(run.tool, run.hostStr, run.port)}
            {"\n"}
            {pmOutput(run)}
          </Pre>
        </div>
      )}

      {/* publish another container */}
      <Label className="mb-1 mt-4">publish another container</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-xs text-slate-400">
        <span>-p</span>
        <select value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} aria-label="bind address" className={INPUT}>
          <option value="0.0.0.0">0.0.0.0 (all)</option>
          <option value={PM_LO}>127.0.0.1</option>
        </select>
        <span>:</span>
        <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value.replace(/\D/g, "").slice(0, 5) })} aria-label="host port" inputMode="numeric" className={`${INPUT} w-16`} />
        <span>:</span>
        <input value={form.cport} onChange={(e) => setForm({ ...form, cport: e.target.value.replace(/\D/g, "").slice(0, 5) })} aria-label="container port" inputMode="numeric" className={`${INPUT} w-16`} />
        <select value={form.proto} onChange={(e) => setForm({ ...form, proto: e.target.value === "udp" ? "udp" : "tcp" })} aria-label="protocol" className={INPUT}>
          <option value="tcp">/tcp</option>
          <option value="udp">/udp</option>
        </select>
        <select
          value={form.img}
          onChange={(e) => {
            const img = PM_IMG_KEYS.includes(e.target.value) ? e.target.value : "nginx";
            const [p, pr] = PM_IMG[img].listen[0].split("/");
            setForm({ ...form, img, cport: p, proto: pr });
          }}
          aria-label="image"
          className={INPUT}
        >
          {PM_IMG_KEYS.map((k2) => <option key={k2} value={k2}>{PM_IMG[k2].ref}</option>)}
        </select>
        <Button primary onClick={addCt}>docker run</Button>
      </div>
      {addMsg && (
        <div className="mt-2">
          <Pre className={addMsg.bad ? "text-rose-200" : ""}>
            <span className="text-slate-500">$ </span>
            {addMsg.cmd}
            {"\n"}
            {addMsg.out}
          </Pre>
          {addMsg.note && <div className={`mt-1 text-[11px] leading-relaxed ${addMsg.bad ? "text-rose-200/80" : "text-slate-400"}`}>{addMsg.note}</div>}
        </div>
      )}
      {S.notes.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">{S.notes.join(" · ")}</div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">docker ps</Label>
          <Pre nowrap className="text-[10px]">{psLines.join("\n")}</Pre>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {S.cts.map((c) => (
              <button key={c.id} type="button" onClick={() => rmCt(c.id)} className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10.5px] text-slate-400 hover:bg-rose-500/20 hover:text-rose-200" aria-label={`remove container ${c.name}`}>
                rm -f {c.name}
              </button>
            ))}
            <button type="button" onClick={resetAll} className="rounded bg-ink-800 px-1.5 py-0.5 text-[10.5px] text-slate-400 hover:text-slate-200">reset</button>
          </div>
        </div>
        <Code label="equivalent commands" lines={runLines.length ? runLines : ["# no containers"]} marks={runMarks} />
      </div>
    </Card>
  );
}

/* ======================================================================== */
/* ---------- docker-network: drivers, embedded DNS and isolation --------- */
/* ======================================================================== */

const DN_CTS = [
  { name: "web", image: "nginx:1.27-alpine", port: 80, x: 60 },
  { name: "api", image: "my-api:1.0", port: 8000, x: 170 },
  { name: "db", image: "postgres:16-alpine", port: 5432, x: 280, alias: "postgres" },
];
const DN_DRIVERS = ["bridge", "user-defined", "host", "none"];
const DN_UD_NETS = [
  { name: "frontend", sub: "172.18", dev: "br-3c1e9a07d2f4" },
  { name: "backend", sub: "172.19", dev: "br-8f20d41b6ac3" },
];
const DN_UD_INIT = { frontend: [["web", 2], ["api", 3]], backend: [["db", 2]] };
const DN_HOST_DNS = "192.168.1.1";
const DN_LABEL = { bridge: "default bridge", "user-defined": "user-defined bridges", host: "host", none: "none" };

/** Interfaces per container for a driver. attach = {net: [[ct, lastOctet]]} for user-defined networks. */
function dnTopo(mode, attach) {
  const ifs = { web: [], api: [], db: [] };
  if (mode === "bridge") DN_CTS.forEach((c, i) => ifs[c.name].push({ net: "bridge", ip: `172.17.0.${i + 2}` }));
  if (mode === "user-defined")
    DN_UD_NETS.forEach((n) => (attach[n.name] || []).forEach(([ct, o]) => ifs[ct].push({ net: n.name, ip: `${n.sub}.0.${o}` })));
  return ifs;
}
const dnNetOfIp = (mode, ip) => {
  if (mode === "bridge") return ip.startsWith("172.17.") ? "bridge" : null;
  if (mode === "user-defined") return DN_UD_NETS.find((n) => ip.startsWith(`${n.sub}.`))?.name || null;
  return null;
};

function dnParse(line) {
  const t = String(line).trim().split(/\s+/).filter(Boolean);
  if (!t.length) return null;
  if (t[0] === "ping") {
    let i = 1, count = 1;
    while (t[i] && t[i].startsWith("-")) {
      if (t[i] === "-c") {
        count = int(t[i + 1], 1, 1, 3);
        i += 2;
      } else i++;
    }
    return t[i] ? { kind: "ping", target: t[i].toLowerCase(), count } : { kind: "raw", out: "BusyBox v1.36.1 multi-call binary.\n\nUsage: ping [OPTIONS] HOST" };
  }
  if (t[0] === "curl") {
    const arg = t.slice(1).filter((x) => !x.startsWith("-")).pop();
    if (!arg) return { kind: "raw", out: "curl: try 'curl --help' or 'curl --manual' for more information" };
    const m = arg.toLowerCase().match(/^(?:(https?):\/\/)?([a-z0-9.-]+)(?::(\d{1,5}))?(\/.*)?$/);
    if (!m) return { kind: "raw", out: `curl: (3) URL rejected: Malformed input to a URL function` };
    return { kind: "curl", target: m[2], port: m[3] ? Number(m[3]) : m[1] === "https" ? 443 : 80, path: m[4] || "/" };
  }
  if (t[0] === "nslookup" || (t[0] === "getent" && t[1] === "hosts")) {
    const name = t[0] === "getent" ? t[2] : t[1];
    return name ? { kind: t[0] === "getent" ? "getent" : "nslookup", target: name.toLowerCase() } : { kind: "raw", out: "Usage: nslookup HOST [DNS_SERVER]" };
  }
  return { kind: "raw", out: `sh: ${t[0].slice(0, 30)}: not found\n(try ping, curl, nslookup or getent hosts)` };
}

const DN_IP_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Name → IP the way the container's resolver would do it, with an explanation. */
function dnLookup(mode, ifs, from, name) {
  if (DN_IP_RE.test(name)) return { ip: name, lit: true };
  if (name === "localhost") return { ip: "127.0.0.1", say: "localhost comes from the container's own /etc/hosts: 127.0.0.1, its own loopback.", server: null };
  if (mode === "none")
    return { ip: null, server: DN_HOST_DNS, timeout: true, say: `/etc/resolv.conf still lists the host's nameserver ${DN_HOST_DNS}, but with --network none there is no interface to send the query on.` };
  if (mode === "host" || mode === "bridge") {
    const known = DN_CTS.some((c) => c.name === name || c.alias === name);
    return {
      ip: null,
      server: DN_HOST_DNS,
      say: `${mode === "host" ? "With --network host the container uses the host's /etc/resolv.conf" : "On the default bridge, /etc/resolv.conf is a copy of the host's"}: nameserver ${DN_HOST_DNS} (the LAN router). It has never heard of "${name}"${known ? `: container names are only resolvable on user-defined networks${mode === "bridge" ? " (the legacy --link flag is deprecated)" : ""}` : ""}. NXDOMAIN.`,
    };
  }
  // user-defined: embedded DNS at 127.0.0.11
  const mine = ifs[from].map((x) => x.net);
  const viaAlias = !DN_CTS.some((c) => c.name === name);
  const tgt = DN_CTS.find((c) => c.name === name || (c.alias === name && ifs[c.name].some((x) => x.net === "backend")));
  if (tgt) {
    // an alias is scoped to the network it was given on (db's "postgres" alias lives on backend)
    const shared = ifs[tgt.name].find((x) => mine.includes(x.net) && (!viaAlias || x.net === "backend"));
    if (shared)
      return {
        ip: shared.ip,
        server: "127.0.0.11",
        name: tgt.name,
        say: `/etc/resolv.conf says nameserver 127.0.0.11: Docker's embedded DNS server. It answers for containers on the networks ${from} is attached to (${mine.join(", ")}): "${name}" is ${name === tgt.name ? "" : `an alias of ${tgt.name} (--network-alias), `}${shared.ip} on ${shared.net}.`,
      };
    return {
      ip: null,
      server: "127.0.0.11",
      say: `The embedded DNS (127.0.0.11) only answers for containers that share a network with ${from} (${mine.join(", ")}). ${tgt.name} is on ${ifs[tgt.name].map((x) => x.net).join(", ")}, so the name is unknown here; the query is forwarded to the host's resolver, which says NXDOMAIN.`,
    };
  }
  return { ip: null, server: "127.0.0.11", say: `127.0.0.11 has no container or alias called "${name}" on ${mine.join(", ")}, so it forwards the query to the host's resolver (${DN_HOST_DNS}): NXDOMAIN.` };
}

/** Where a packet to `ip` from container `from` ends up. */
function dnReach(mode, ifs, from, ip, web2) {
  if (ip.startsWith("127.")) return { to: mode === "host" ? "hoststack" : "self", say: mode === "host" ? "127.0.0.1 in host mode is the host's own loopback: every host process and every --network host container shares it." : `127.0.0.1 is ${from}'s own loopback. Each container has its own network namespace, so this never reaches another container.` };
  if (mode === "none") return { to: null, unreachable: true, say: "With --network none the container only has lo. There is no route to anything else: Network unreachable." };
  if (mode === "host") {
    if (ip === "192.168.1.20" || ip === "172.17.0.1") return { to: "hoststack", say: `${ip} is an address of the host itself, which is also this container's network stack.` };
    return { to: null, loss: true, say: `With --network host there are no container IPs: nothing on the host answers for ${ip}.` };
  }
  if (ip === "192.168.1.20") return { to: "host", say: "192.168.1.20 is the host's LAN address; containers reach it through their gateway like any outside address." };
  const net = dnNetOfIp(mode, ip);
  if (!net) return { to: null, loss: true, say: `${ip} is not on any Docker network here; the packet goes out via the gateway and nobody answers.` };
  if (ip.endsWith(".0.1")) return { to: "host", net, say: `${ip} is the gateway of ${net}: the host's own address on that bridge.` };
  const own = ifs[from].find((x) => x.net === net);
  const tgt = DN_CTS.find((c) => ifs[c.name].some((x) => x.ip === ip));
  if (!own)
    return {
      to: null,
      loss: true,
      blocked: { net, tgt: tgt?.name },
      say: `${from} has no interface on ${net}. The packet goes to ${from}'s gateway, and Docker's DOCKER-ISOLATION iptables rules drop traffic between different bridge networks: no reply, ever${mode === "user-defined" ? ". Fix it with docker network connect" : ""}.`,
    };
  if (!tgt || tgt.name === from) return tgt ? { to: "self", net, say: `${ip} is ${from}'s own address.` } : { to: null, loss: true, say: `No container has ${ip} on ${net}; ARP gets no answer.` };
  return { to: tgt.name, net, say: `${from} and ${tgt.name} are both on ${net} (${mode === "bridge" ? "docker0" : DN_UD_NETS.find((n) => n.name === net).dev}): a direct layer-2 hop through the bridge.` };
}

function dnRun(mode, ifs, from, line, web2) {
  const q = dnParse(line);
  if (!q) return null;
  const steps = [{ say: `docker exec ${from} ${line.trim()}`, tone: "dim", code: true }];
  const res = { q, steps, from, line: line.trim(), path: null };
  if (q.kind === "raw") return { ...res, out: q.out, ok: false };
  const r = mulberry32(hashStr(mode + from + line));
  const lk = dnLookup(mode, ifs, from, q.target);
  if (!lk.lit) steps.push({ say: lk.say, tone: lk.ip ? "emerald" : "rose", dns: true });
  const srv = lk.server || (mode === "user-defined" ? "127.0.0.11" : DN_HOST_DNS);
  if (q.kind === "nslookup" || q.kind === "getent") {
    if (q.kind === "getent") return { ...res, out: lk.ip ? `${lk.ip}      ${q.target}` : "(no output, exit status 2)", ok: !!lk.ip };
    if (lk.timeout) return { ...res, out: ";; connection timed out; no servers could be reached", ok: false };
    if (lk.lit) return { ...res, out: `Server:\t\t${srv}\nAddress:\t${srv}:53\n\n** server can't find ${q.target.split(".").reverse().join(".")}.in-addr.arpa: NXDOMAIN`, ok: false };
    return { ...res, out: lk.ip ? `Server:\t\t${srv}\nAddress:\t${srv}:53\n\nNon-authoritative answer:\nName:\t${q.target}\nAddress: ${lk.ip}` : `Server:\t\t${srv}\nAddress:\t${srv}:53\n\n** server can't find ${q.target}: NXDOMAIN`, ok: !!lk.ip };
  }
  if (!lk.ip) return { ...res, out: q.kind === "ping" ? `ping: bad address '${q.target}'` : `curl: (6) Could not resolve host: ${q.target}`, ok: false, path: { dnsFail: true } };
  const reach = dnReach(mode, ifs, from, lk.ip, web2);
  steps.push({ say: reach.say, tone: reach.to ? "sky" : "rose" });
  res.path = { to: reach.to, net: reach.net, blocked: reach.blocked };
  const label = q.target;
  if (q.kind === "ping") {
    const head = `PING ${label} (${lk.ip}): 56 data bytes`;
    if (reach.unreachable) return { ...res, out: `${head}\nping: sendto: Network unreachable`, ok: false };
    if (!reach.to) return { ...res, out: `${head}\n\n--- ${label} ping statistics ---\n${q.count} packets transmitted, 0 packets received, 100% packet loss`, ok: false };
    const ts = Array.from({ length: q.count }, () => (reach.to === "self" || reach.to === "hoststack" ? 0.03 + r() * 0.03 : 0.07 + r() * 0.08));
    const f = (v) => v.toFixed(3);
    return {
      ...res,
      out: `${head}\n${ts.map((t, i) => `64 bytes from ${lk.ip}: seq=${i} ttl=64 time=${f(t)} ms`).join("\n")}\n\n--- ${label} ping statistics ---\n${q.count} packets transmitted, ${q.count} packets received, 0% packet loss\nround-trip min/avg/max = ${f(Math.min(...ts))}/${f(ts.reduce((a, b) => a + b, 0) / ts.length)}/${f(Math.max(...ts))} ms`,
      ok: true,
    };
  }
  // curl
  const url = `${q.target}:${q.port}`;
  if (reach.unreachable) return { ...res, out: `curl: (7) Failed to connect to ${q.target} port ${q.port} after 0 ms: Couldn't connect to server`, ok: false };
  if (!reach.to) return { ...res, out: `curl: (28) Failed to connect to ${q.target} port ${q.port} after 133942 ms: Couldn't connect to server`, ok: false };
  let svc = null;
  if (reach.to === "self") svc = DN_CTS.find((c) => c.name === from);
  else if (reach.to === "hoststack" || reach.to === "host") svc = reach.to === "hoststack" ? DN_CTS.find((c) => c.port === q.port) || (q.port === 22 ? "sshd" : null) : q.port === 22 ? "sshd" : null;
  else svc = DN_CTS.find((c) => c.name === reach.to);
  const listens = svc === "sshd" || (svc && svc.port === q.port);
  if (!listens) {
    steps.push({ say: `Nothing listens on port ${q.port} there${svc && svc !== "sshd" ? ` (${svc.name} listens on ${svc.port})` : ""}, so the kernel answers RST.`, tone: "rose" });
    return { ...res, out: `curl: (7) Failed to connect to ${q.target} port ${q.port} after 0 ms: Couldn't connect to server`, ok: false };
  }
  if (svc === "sshd") return { ...res, out: "curl: (1) Received HTTP/0.9 when not allowed", ok: false };
  if (reach.to === "hoststack" && svc.name !== from) steps.push({ say: `In host mode all containers share one network stack, so ${from} reaches ${svc.name}'s port ${q.port} on localhost. There is no isolation between them.`, tone: "amber" });
  else steps.push({ say: `${svc.name} accepts on :${q.port}. Note the container port is used directly: -p publishing is only for traffic coming from outside Docker.`, tone: "emerald" });
  if (svc.name === "db") return { ...res, out: "curl: (52) Empty reply from server\n(TCP connected fine: Postgres just doesn't speak HTTP. Use psql or pg_isready.)", ok: true };
  if (svc.name === "web") return { ...res, out: "<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n…", ok: true };
  return { ...res, out: `{"status":"ok","service":"api","path":"${q.path}","host":"${url}"}`, ok: true };
}

function dnPresets(mode, ifs) {
  const ipOf = (c) => ifs[c][0]?.ip;
  if (mode === "bridge") return [["web", "ping -c 1 api"], ["web", `ping -c 1 ${ipOf("api")}`], ["web", "curl api:8000"], ["web", `curl ${ipOf("api")}:8000`], ["api", "nslookup db"], ["api", `ping -c 1 ${ipOf("db")}`]];
  if (mode === "user-defined") {
    const dbIp = ifs.db.find((x) => x.net === "backend")?.ip || ipOf("db");
    return [["api", "ping -c 1 db"], ["api", "nslookup db"], ["api", "ping -c 1 postgres"], ["web", "curl api:8000"], ["web", "ping -c 1 db"], ["web", `ping -c 1 ${dbIp}`]];
  }
  if (mode === "host") return [["web", "curl localhost:8000"], ["api", "curl localhost:5432"], ["web", "ping -c 1 db"], ["api", "curl localhost:80"], ["api", "nslookup db"]];
  return [["api", "ping -c 1 172.17.0.4"], ["api", "curl localhost:8000"], ["web", "curl localhost:8000"], ["api", "nslookup db"]];
}

function dnCommands(mode, attach, web2) {
  if (mode === "bridge")
    return {
      lines: ["# no --network flag: every container joins the default bridge", "docker run -d --name db -e POSTGRES_PASSWORD=secret postgres:16-alpine", "docker run -d --name api my-api:1.0", "docker run -d --name web -p 8080:80 nginx:1.27-alpine", "", "docker network inspect bridge   # 172.17.0.0/16, gw 172.17.0.1", "docker exec web cat /etc/resolv.conf   # nameserver 192.168.1.1"],
      marks: {},
    };
  if (mode === "user-defined") {
    const lines = ["docker network create frontend", "docker network create backend", "docker run -d --name db --network backend --network-alias postgres \\", "    -e POSTGRES_PASSWORD=secret postgres:16-alpine", "docker run -d --name api --network frontend my-api:1.0", "docker run -d --name web --network frontend -p 8080:80 nginx:1.27-alpine"];
    const marks = {};
    DN_UD_NETS.forEach((n) => {
      const init = new Set((DN_UD_INIT[n.name] || []).map(([c]) => c));
      const now = new Set((attach[n.name] || []).map(([c]) => c));
      DN_CTS.forEach((c) => {
        if (now.has(c.name) && !init.has(c.name)) {
          marks[lines.length] = "emerald";
          lines.push(`docker network connect ${n.name} ${c.name}`);
        }
        if (!now.has(c.name) && init.has(c.name)) {
          marks[lines.length] = "amber";
          lines.push(`docker network disconnect ${n.name} ${c.name}`);
        }
      });
    });
    lines.push("", "docker exec api cat /etc/resolv.conf   # nameserver 127.0.0.11");
    return { lines, marks };
  }
  if (mode === "host") {
    const lines = ["docker run -d --name db --network host -e POSTGRES_PASSWORD=secret postgres:16-alpine", "docker run -d --name api --network host my-api:1.0", "docker run -d --name web --network host nginx:1.27-alpine", "# no -p needed: nginx is on the host's :80 directly", "# (-p is ignored: \"Published ports are discarded when using host network mode\")"];
    const marks = {};
    if (web2) {
      marks[lines.length] = "rose";
      lines.push("docker run -d --name web2 --network host nginx:1.27-alpine");
    }
    return { lines, marks };
  }
  return { lines: ["docker run -d --name db --network none -e POSTGRES_PASSWORD=secret postgres:16-alpine", "docker run -d --name api --network none my-api:1.0", "docker run -d --name web --network none nginx:1.27-alpine", "docker exec api ip addr   # only lo: 127.0.0.1"], marks: {} };
}

export function DockerNetwork({ params = {} }) {
  const prm = obj(params);
  const [mode, setMode] = useState(() => oneOf(prm.driver ?? prm.network, DN_DRIVERS, "bridge", { default: "bridge", docker0: "bridge", user: "user-defined", userdefined: "user-defined", custom: "user-defined", "user-defined-bridge": "user-defined", null: "none" }));
  const [attach, setAttach] = useState(DN_UD_INIT);
  const [web2, setWeb2] = useState(false);
  const [from, setFrom] = useState(mode === "user-defined" ? "api" : "web");
  const [line, setLine] = useState(() => dnPresets(mode, dnTopo(mode, DN_UD_INIT))[0][1]);
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState(null);
  const id = useSvgId();
  const ifs = useMemo(() => dnTopo(mode, attach), [mode, attach]);

  const pickMode = (m) => {
    setMode(m);
    setRes(null);
    setMsg(null);
    const p = dnPresets(m, dnTopo(m, attach))[0];
    setFrom(p[0]);
    setLine(p[1]);
  };
  const exec = (f = from, l = line) => {
    setFrom(f);
    setLine(l);
    setRes(dnRun(mode, ifs, f, l, web2));
  };
  const toggleNet = (net, ct) => {
    const on = (attach[net] || []).some(([c]) => c === ct);
    if (on && ifs[ct].length <= 1) {
      setMsg({ bad: true, text: `Keeping ${ct} on at least one network in this demo (with none it would only have lo).` });
      return;
    }
    let next;
    if (on) next = { ...attach, [net]: attach[net].filter(([c]) => c !== ct) };
    else {
      let o = 2;
      while ((attach[net] || []).some(([, x]) => x === o)) o++;
      next = { ...attach, [net]: [...(attach[net] || []), [ct, o]] };
    }
    setAttach(next);
    const sub = DN_UD_NETS.find((n) => n.name === net).sub;
    setMsg({ bad: false, text: on ? `docker network disconnect ${net} ${ct}: its interface on ${net} is removed immediately; ${ct} drops off ${net}'s DNS.` : `docker network connect ${net} ${ct}: the running container gets a new interface (eth${ifs[ct].length}) with ${sub}.0.${next[net].find(([c]) => c === ct)[1]}, and the embedded DNS now resolves the containers on ${net} for it.` });
    setRes(null);
  };

  const cmd = dnCommands(mode, attach, web2);
  const presets = dnPresets(mode, ifs);
  const nets = mode === "bridge" ? [{ name: "bridge", sub: "172.17", dev: "docker0" }] : mode === "user-defined" ? DN_UD_NETS : [];
  const barY = (i) => (mode === "bridge" ? 104 : 98 + i * 34);
  const H = mode === "bridge" ? 162 : mode === "user-defined" ? 190 : mode === "host" ? 150 : 120;
  const BOX_Y = 10, BOX_H = 48;
  const ifX = (c, net) => {
    const k = ifs[c.name].findIndex((x) => x.net === net);
    const n = ifs[c.name].length;
    return c.x + (n > 1 ? (k - (n - 1) / 2) * 26 : 0);
  };
  const ok = res && res.ok;
  const pathCol = res ? (ok ? C.emerald : C.rose) : C.sky;
  const p = res?.path;

  let flow = null;
  if (p && (mode === "bridge" || mode === "user-defined")) {
    const fc = DN_CTS.find((c) => c.name === from);
    if (p.to && p.net && p.to !== "self") {
      const ni = nets.findIndex((n) => n.name === p.net);
      const fx = ifX(fc, p.net), y = barY(ni);
      if (p.to === "host") flow = { pts: [[fx, BOX_Y + BOX_H], [fx, y], [fx, H - 26]], end: null };
      else {
        const tc = DN_CTS.find((c) => c.name === p.to);
        const tx = ifX(tc, p.net);
        flow = { pts: [[fx, BOX_Y + BOX_H], [fx, y], [tx, y], [tx, BOX_Y + BOX_H]], end: null };
      }
    } else if (p.blocked) {
      const own = ifs[from][0];
      const ni = nets.findIndex((n) => n.name === own.net);
      const fx = ifX(fc, own.net);
      const ti = nets.findIndex((n) => n.name === p.blocked.net);
      flow = { pts: [[fx, BOX_Y + BOX_H], [fx, barY(ni)], [fx + 14 * (ti > ni ? 1 : -1) || fx + 14, H - 26]], end: [fx + 14 * (ti > ni ? 1 : -1) || fx + 14, H - 26] };
    }
  }

  return (
    <Card
      title="Docker networks: who can reach whom, and by which name"
      params={params}
      caption="Pick a network driver, then run commands inside a container (docker exec). On the default bridge only IPs work; on user-defined networks Docker's DNS at 127.0.0.11 resolves container names and aliases, but only within shared networks: api can't reach db until you docker network connect it to backend. host mode shares the host's network stack (no IPs, no -p, port clashes), and none leaves only loopback."
    >
      <Choice label="network driver" options={DN_DRIVERS.map((d) => [d, d === "user-defined" ? "user-defined bridge" : d])} value={mode} onChange={pickMode} />
      <svg viewBox={`0 0 340 ${H}`} className="mt-3 h-auto w-full select-none" role="img" aria-label={`Containers web, api and db on the ${DN_LABEL[mode]} network`}>
        <defs>
          <Arrow id={`${id}a`} color={pathCol} />
        </defs>
        {mode === "host" && (
          <g>
            <rect x="4" y="4" width="332" height={H - 30} rx="9" fill="#0b1a2b" stroke={C.sky} strokeOpacity="0.5" />
            <text x="170" y="96" textAnchor="middle" fontSize="8.5" fill={C.sky}>one shared network namespace: the host's</text>
            <text x="170" y="108" textAnchor="middle" fontSize="8" fill={C.text} fontFamily={MONO}>eth0 192.168.1.20 · lo 127.0.0.1 · docker0 172.17.0.1</text>
          </g>
        )}
        {/* interface links */}
        {(mode === "bridge" || mode === "user-defined") &&
          DN_CTS.map((c) =>
            ifs[c.name].map((f) => {
              const ni = nets.findIndex((n) => n.name === f.net);
              const x = ifX(c, f.net);
              const y = barY(ni);
              const left = ifs[c.name].length > 1 && ifs[c.name].findIndex((z) => z.net === f.net) === 0;
              return (
                <g key={c.name + f.net}>
                  <line x1={x} y1={BOX_Y + BOX_H} x2={x} y2={y - 4} stroke={C.axis} strokeWidth="1.2" />
                  <text x={left ? x - 3 : x + 3} y={BOX_Y + BOX_H + 14} textAnchor={left ? "end" : "start"} fontSize="7.2" fill={C.text} fontFamily={MONO}>{f.ip}</text>
                </g>
              );
            }),
          )}
        {/* networks */}
        {nets.map((n, i) => {
          const hit = p && (p.net === n.name || p.blocked?.net === n.name);
          return (
            <g key={n.name}>
              <rect x="8" y={barY(i) - 4} width="324" height="8" rx="4" fill="#1e1b3a" stroke={hit ? pathCol : C.brand} strokeOpacity={hit ? 0.9 : 0.5} />
              <text x="12" y={barY(i) + 13} fontSize="7.5" fill={C.brandL} fontFamily={MONO}>{n.name} {n.sub}.0.0/16 <tspan fill={C.dim}>({n.dev})</tspan></text>
            </g>
          );
        })}
        {(mode === "bridge" || mode === "user-defined") &&
          DN_CTS.map((c) =>
            ifs[c.name].map((f) => <circle key={`d${c.name}${f.net}`} cx={ifX(c, f.net)} cy={barY(nets.findIndex((n) => n.name === f.net))} r="2.6" fill={C.brandL} />),
          )}
        {/* containers */}
        {DN_CTS.map((c) => {
          const isFrom = res && c.name === from;
          const isTo = p && p.to === c.name;
          const st = isFrom ? C.sky : isTo ? pathCol : C.ink600;
          return (
            <g key={c.name}>
              <rect x={c.x - 48} y={BOX_Y} width="96" height={BOX_H} rx="8" fill={isFrom ? "#0c2a3d" : C.ink800} stroke={st} strokeWidth={isFrom || isTo ? 1.5 : 1} strokeDasharray={mode === "host" ? "4 3" : undefined} />
              <text x={c.x} y={BOX_Y + 15} textAnchor="middle" fontSize="10" fontWeight="700" fill="#f1f5f9" fontFamily={MONO}>{c.name}</text>
              <text x={c.x} y={BOX_Y + 27} textAnchor="middle" fontSize="7" fill={C.dim} fontFamily={MONO}>{c.image}</text>
              <text x={c.x} y={BOX_Y + 40} textAnchor="middle" fontSize={c.alias && mode === "user-defined" ? 7 : 7.5} fill={C.text} fontFamily={MONO}>
                {mode === "none" ? "lo only" : mode === "host" ? `host :${c.port}` : `:${c.port}`}
                {c.alias && mode === "user-defined" ? ` · aka ${c.alias}` : ""}
              </text>
            </g>
          );
        })}
        {mode === "host" && web2 && (
          <g>
            <rect x="122" y="64" width="96" height="20" rx="6" fill="#3b1622" stroke={C.rose} strokeDasharray="4 3" />
            <text x="170" y="77" textAnchor="middle" fontSize="8" fill={C.rose} fontFamily={MONO}>web2 · Exited (1)</text>
          </g>
        )}
        {mode === "none" &&
          DN_CTS.map((c) => (
            <g key={`lo${c.name}`}>
              <circle cx={c.x} cy={BOX_Y + BOX_H + 18} r="9" fill="none" stroke={C.dim} strokeDasharray="3 2" />
              <text x={c.x} y={BOX_Y + BOX_H + 21} textAnchor="middle" fontSize="7" fill={C.dim} fontFamily={MONO}>lo</text>
              <text x={c.x} y={BOX_Y + BOX_H + 40} textAnchor="middle" fontSize="7" fill={C.dim}>no eth0</text>
            </g>
          ))}
        {/* host strip */}
        {mode !== "host" && (
          <g>
            <rect x="4" y={H - 22} width="332" height="18" rx="6" fill={C.ink950} stroke={C.ink600} strokeDasharray="4 3" />
            <text x="170" y={H - 10} textAnchor="middle" fontSize="7.5" fill={C.dim}>
              {mode === "user-defined" ? "host · iptables DOCKER-ISOLATION: no traffic between bridges" : mode === "bridge" ? "host · docker0 172.17.0.1 · DNS = host's resolver 192.168.1.1" : "host · unreachable: the containers have no network"}
            </text>
          </g>
        )}
        {mode === "host" && <text x="170" y={H - 8} textAnchor="middle" fontSize="7.5" fill={C.dim}>no bridge, no container IPs, no NAT</text>}
        {/* the last command's path */}
        {flow && (
          <polyline points={flow.pts.map((q) => q.join(",")).join(" ")} fill="none" stroke={pathCol} strokeWidth="2" strokeDasharray="5 4" markerEnd={flow.end ? undefined : `url(#${id}a)`}>
            <animate attributeName="stroke-dashoffset" from="18" to="0" dur="0.8s" repeatCount="indefinite" />
          </polyline>
        )}
        {flow?.end && <path d={`M${flow.end[0] - 4},${flow.end[1] - 4} l8,8 m0,-8 l-8,8`} stroke={C.rose} strokeWidth="2" transform="translate(0 -6)" />}
        {p && p.dnsFail && (() => {
          const fc = DN_CTS.find((c) => c.name === from);
          return (
            <g>
              <rect x={fc.x - 30} y={BOX_Y + BOX_H + 19} width="60" height="13" rx="4" fill="#3b1622" stroke={C.rose} />
              <text x={fc.x} y={BOX_Y + BOX_H + 28.5} textAnchor="middle" fontSize="7.5" fill={C.rose}>DNS: no answer</text>
            </g>
          );
        })()}
        {p && (p.to === "self" || p.to === "hoststack") && (() => {
          const fc = DN_CTS.find((c) => c.name === from);
          const tc = p.to === "hoststack" ? DN_CTS.find((c) => res.q.port === c.port) : null;
          if (tc && tc.name !== from)
            return (
              <path d={`M${fc.x},${BOX_Y + BOX_H} C${fc.x},${BOX_Y + BOX_H + 26} ${tc.x},${BOX_Y + BOX_H + 26} ${tc.x},${BOX_Y + BOX_H + 2}`} fill="none" stroke={pathCol} strokeWidth="2" strokeDasharray="5 4" markerEnd={`url(#${id}a)`}>
                <animate attributeName="stroke-dashoffset" from="18" to="0" dur="0.8s" repeatCount="indefinite" />
              </path>
            );
          return <path d={`M${fc.x + 20},${BOX_Y + BOX_H} c0,16 -40,16 -40,2`} fill="none" stroke={pathCol} strokeWidth="2" markerEnd={`url(#${id}a)`} />;
        })()}
      </svg>

      {mode === "user-defined" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Label>networks</Label>
          {[["backend", "api"], ["backend", "web"], ["frontend", "db"]].map(([net, ct]) => {
            const on = (attach[net] || []).some(([c]) => c === ct);
            return (
              <button key={net + ct} type="button" onClick={() => toggleNet(net, ct)} className={`rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors ${on ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
                docker network {on ? "disconnect" : "connect"} {net} {ct}
              </button>
            );
          })}
          <button type="button" onClick={() => { setAttach(DN_UD_INIT); setRes(null); setMsg(null); }} className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-slate-200">reset</button>
        </div>
      )}
      {mode === "host" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={() => { setWeb2((v) => !v); setMsg(web2 ? null : { bad: true, text: "web2: nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use) … container exits with code 1. With host networking two containers can't both use :80, and there is no -p to remap it." }); }}>
            {web2 ? "remove web2" : "run a 2nd nginx (web2) on the host network"}
          </Button>
        </div>
      )}
      {msg && <div className={`mt-2 rounded-md px-2 py-1 font-mono text-[11px] leading-relaxed ${msg.bad ? "bg-rose-500/10 text-rose-200" : "bg-emerald-500/10 text-emerald-200"}`}>{msg.text}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Label>exec in</Label>
        <Choice label="container to run the command in" options={DN_CTS.map((c) => [c.name, c.name])} value={from} onChange={(v) => { setFrom(v); setRes(null); }} mono />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-slate-500">/ #</span>
        <input
          value={line}
          onChange={(e) => setLine(e.target.value.slice(0, 60))}
          onKeyDown={(e) => e.key === "Enter" && exec()}
          aria-label="command to run in the container"
          spellCheck={false}
          className={`${INPUT} min-w-0 flex-1`}
        />
        <Button primary onClick={() => exec()}>Run</Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        {presets.map(([f, l]) => (
          <button
            key={f + l}
            type="button"
            onClick={() => exec(f, l)}
            className={`rounded px-1.5 py-0.5 font-mono transition-colors ${res && res.from === f && res.line === l ? "bg-brand-500/25 text-brand-200" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
          >
            {f}$ {l}
          </button>
        ))}
      </div>
      {res && (
        <div className="mt-2 space-y-2" aria-live="polite">
          <ol className="space-y-1 rounded-lg bg-ink-800 px-3 py-2 text-xs leading-relaxed">
            {res.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className={`mt-[1px] shrink-0 font-mono text-[10px] ${s.tone === "rose" ? "text-rose-300" : s.tone === "emerald" ? "text-emerald-300" : s.tone === "amber" ? "text-amber-300" : s.tone === "dim" ? "text-slate-500" : "text-sky-300"}`}>{s.dns ? "DNS" : s.code ? "$" : "→"}</span>
                <span className={s.code ? "font-mono text-slate-400" : "text-slate-300"}>{s.say}</span>
              </li>
            ))}
          </ol>
          <Pre className={res.ok ? "" : "text-rose-200"}>
            <span className="text-slate-500">{res.from}:/# </span>
            {res.line}
            {"\n"}
            {res.out}
          </Pre>
        </div>
      )}
      <Code className="mt-3" label={`commands · ${DN_LABEL[mode]}`} lines={cmd.lines} marks={cmd.marks} />
    </Card>
  );
}

/* ======================================================================== */
/* ---------- volume-mounts: what survives, and where the bytes live ------ */
/* ======================================================================== */

const VM_TYPES = ["none", "volume", "bind", "tmpfs"];
const VM_IMAGE_FILES = ["README.txt"];
const VM_DIR = "/app/uploads";
const VM_BIND = "/home/dev/project/uploads";
const VM_TONE = { none: C.dim, volume: C.emerald, bind: C.amber, tmpfs: C.fuchsia };
const VM_TYPE_LABEL = { none: "no mount", volume: "named volume", bind: "bind mount", tmpfs: "tmpfs" };

const vmCid = (n) => hexOf(n * 104729 + 3, 64);

function vmRunCmd(type) {
  const m = { none: "", volume: " -v uploads:/app/uploads", bind: ' -v "$(pwd)"/uploads:/app/uploads', tmpfs: " --tmpfs /app/uploads" }[type];
  return `docker run -d --name app --restart unless-stopped${m} myapp:1.0`;
}

/** Fresh state: the container has just been started with the chosen mount. */
function vmInit(type) {
  const s = { type, ctr: null, vol: null, bind: [], seq: 0, w: 0, h: 0, log: [], last: null };
  return vmDo(s, "run", true);
}

/** What `ls /app/uploads` shows inside the container. */
function vmView(s) {
  if (!s.ctr) return null;
  if (s.type === "none") return [...VM_IMAGE_FILES, ...s.ctr.layer];
  if (s.type === "volume") return s.vol ? s.vol.files : [];
  if (s.type === "bind") return s.bind;
  return s.ctr.tmp;
}

/** Applies one action and returns the new state, with a log entry. */
function vmDo(s0, act, quiet) {
  const s = { ...s0, ctr: s0.ctr && { ...s0.ctr }, vol: s0.vol && { files: [...s0.vol.files] }, bind: [...s0.bind], log: [...s0.log] };
  const say = (cmd, out, tone = "ok", note) => s.log.push({ cmd, out, tone, note });
  const ls = () => {
    const v = vmView(s);
    return v && v.length ? v.join("  ") : "(empty)";
  };
  const noCtr = "Error response from daemon: No such container: app";
  if (act === "run") {
    if (s.ctr) {
      say(vmRunCmd(s.type), `docker: Error response from daemon: Conflict. The container name "/app" is already in use by container "${s.ctr.cid}". You have to remove (or rename) that container to be able to reuse that name.`, "bad", "Run it again after docker rm -f app.");
      return s;
    }
    s.seq += 1;
    s.ctr = { n: s.seq, cid: vmCid(s.seq), layer: [], tmp: [] };
    let note = "A brand-new container from the image.";
    if (s.type === "volume") {
      if (!s.vol) {
        s.vol = { files: [] };
        note = 'The volume "uploads" did not exist, so -v created it.';
      }
      if (!s.vol.files.length) {
        s.vol.files = [...VM_IMAGE_FILES];
        note += " It was empty, so Docker copied the image's /app/uploads (README.txt) into it first. This only happens for an empty named volume.";
      } else note += " The volume already has data, so nothing is copied: the container sees exactly what is in the volume.";
    }
    if (s.type === "bind") note = `The host directory ${VM_BIND} is mounted over /app/uploads. Bind mounts are never pre-populated: the image's README.txt is hidden underneath.`;
    if (s.type === "tmpfs") note = "A fresh, empty tmpfs (RAM) is mounted over /app/uploads, hiding the image's README.txt.";
    if (s.type === "none") note = "No mount: /app/uploads is the image's directory, and new files go to this container's own writable layer.";
    if (!quiet) say(vmRunCmd(s.type), s.ctr.cid, "ok", note);
    else say(vmRunCmd(s.type), s.ctr.cid, "ok", note);
    say("docker exec app ls /app/uploads", ls());
    return s;
  }
  if (act === "write") {
    if (!s.ctr) return say("docker exec app sh -c 'cp photo.jpg /app/uploads/…'", noCtr, "bad"), s;
    s.w += 1;
    const f = `upload-${s.w}.jpg`;
    if (s.type === "none") s.ctr.layer.push(f);
    else if (s.type === "volume") s.vol.files.push(f);
    else if (s.type === "bind") s.bind.push(f);
    else s.ctr.tmp.push(f);
    s.last = f;
    say(`curl -F file=@photo.jpg localhost:8080/upload   # app writes ${VM_DIR}/${f}`, `{"saved":"${VM_DIR}/${f}"}`);
    return s;
  }
  if (act === "restart") {
    if (!s.ctr) return say("docker restart app", noCtr, "bad"), s;
    const lost = s.type === "tmpfs" && s.ctr.tmp.length;
    s.ctr.tmp = [];
    say("docker restart app", "app", lost ? "bad" : "ok", s.type === "tmpfs" ? "A tmpfs mount lives only while the container runs: stopping it (restart = stop + start) throws the RAM away." : "Same container, same writable layer and mounts: restart keeps everything.");
    say("docker exec app ls /app/uploads", ls(), lost ? "bad" : "ok");
    return s;
  }
  if (act === "rm") {
    if (!s.ctr) return say("docker rm -f app", noCtr, "bad"), s;
    const had = s.type === "none" ? s.ctr.layer.length : s.type === "tmpfs" ? s.ctr.tmp.length : 0;
    s.ctr = null;
    say(
      "docker rm -f app",
      "app",
      had ? "bad" : "ok",
      {
        none: "The writable layer is deleted together with the container: those uploads are gone.",
        volume: 'The named volume "uploads" is not touched: docker rm -v only removes anonymous volumes. List it with docker volume ls.',
        bind: `${VM_BIND} is an ordinary directory on the host; removing the container does not touch it.`,
        tmpfs: "The tmpfs disappears with the container.",
      }[s.type],
    );
    return s;
  }
  if (act === "host") {
    if (s.type !== "bind") return s;
    s.h += 1;
    const f = `notes-${s.h}.txt`;
    s.bind.push(f);
    s.last = f;
    say(`echo "edited on the host" > ~/project/uploads/${f}`, "", "ok", "Same directory, two views: the change is visible inside the container immediately (this is how live-reload dev setups work).");
    if (s.ctr) say("docker exec app ls /app/uploads", ls());
    return s;
  }
  if (act === "reboot") {
    const lost = s.type === "tmpfs" && s.ctr && s.ctr.tmp.length;
    if (s.ctr) s.ctr.tmp = [];
    say("sudo reboot", "… host is back, dockerd starts, --restart unless-stopped brings app up again", lost ? "bad" : "ok", s.ctr ? { none: "The container (and its writable layer on disk) survives a reboot; it is the same container, just started again.", volume: "Volumes are directories on disk under /var/lib/docker/volumes: they survive.", bind: "The host directory is on disk: it survives.", tmpfs: "RAM is cleared: everything in the tmpfs is gone." }[s.type] : "No container to restart.");
    if (s.ctr) say("docker exec app ls /app/uploads", ls(), lost ? "bad" : "ok");
    return s;
  }
  if (act === "volrm") {
    if (s.type !== "volume") return s;
    if (!s.vol) return say("docker volume rm uploads", "Error response from daemon: get uploads: no such volume", "bad"), s;
    if (s.ctr) return say("docker volume rm uploads", `Error response from daemon: remove uploads: volume is in use - [${s.ctr.cid}]`, "bad", "A volume can't be removed while any container (even a stopped one) uses it."), s;
    s.vol = null;
    say("docker volume rm uploads", "uploads", "bad", "Now the data is really gone. (docker compose down -v and docker volume prune do the same.)");
    return s;
  }
  return s;
}

const VM_SURVIVE = [
  ["docker restart", { none: [1], volume: [1], bind: [1], tmpfs: [0, "stop wipes it"] }],
  ["rm -f, then run again", { none: [0, "layer deleted"], volume: [1], bind: [1], tmpfs: [0] }],
  ["host reboot", { none: [1, "same container"], volume: [1], bind: [1], tmpfs: [0, "RAM"] }],
  ["edit from the host", { none: [0, "buried in overlay2"], volume: [2, "root only, don't"], bind: [1, "it's your dir"], tmpfs: [0] }],
  ["image's README.txt", { none: [1, "visible"], volume: [2, "copied if empty"], bind: [0, "hidden"], tmpfs: [0, "hidden"] }],
];

function vmSyntax(type) {
  if (type === "none") return { sh: ["docker run -d --name app --restart unless-stopped myapp:1.0", "# writes go to the container's writable layer:", "#   /var/lib/docker/overlay2/<id>/diff/app/uploads"], yaml: ["services:", "  app:", "    image: myapp:1.0", "    restart: unless-stopped"] };
  if (type === "volume")
    return {
      sh: ["docker volume create uploads    # optional: -v creates it", "docker run -d --name app --restart unless-stopped \\", "  -v uploads:/app/uploads myapp:1.0", "# long form:", "#  --mount type=volume,src=uploads,dst=/app/uploads", "docker volume inspect uploads   # Mountpoint: /var/lib/docker/volumes/uploads/_data"],
      yaml: ["services:", "  app:", "    image: myapp:1.0", "    volumes:", "      - uploads:/app/uploads", "volumes:", "  uploads:        # created as <project>_uploads"],
    };
  if (type === "bind")
    return {
      sh: ["mkdir -p uploads", "docker run -d --name app --restart unless-stopped \\", '  -v "$(pwd)"/uploads:/app/uploads myapp:1.0', "# long form (fails if the host path is missing; -v creates it):", '#  --mount type=bind,src="$(pwd)"/uploads,dst=/app/uploads'],
      yaml: ["services:", "  app:", "    image: myapp:1.0", "    volumes:", "      - ./uploads:/app/uploads   # a path => bind mount"],
    };
  return {
    sh: ["docker run -d --name app --restart unless-stopped \\", "  --tmpfs /app/uploads:size=64m myapp:1.0", "# long form:", "#  --mount type=tmpfs,dst=/app/uploads,tmpfs-size=67108864"],
    yaml: ["services:", "  app:", "    image: myapp:1.0", "    tmpfs:", "      - /app/uploads:size=64m"],
  };
}

export function VolumeMounts({ params = {} }) {
  const prm = obj(params);
  const t0 = oneOf(prm.type ?? prm.mount, VM_TYPES, "volume", { named: "volume", "named-volume": "volume", volumes: "volume", "bind-mount": "bind", host: "bind", ram: "tmpfs", memory: "tmpfs", "": "volume", container: "none", layer: "none" });
  const [s, setS] = useState(() => vmInit(t0));
  const logRef = useRef(null);
  const view = vmView(s);
  const type = s.type;
  const tone = VM_TONE[type];
  const syn = vmSyntax(type);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.log.length]);

  const act = (a) => setS((x) => vmDo(x, a));
  const pick = (t) => setS(vmInit(t));

  // storage panel contents
  const store = type === "none" ? (s.ctr ? s.ctr.layer : null) : type === "volume" ? (s.vol ? s.vol.files : null) : type === "bind" ? s.bind : s.ctr ? s.ctr.tmp : null;
  const storeTitle = { none: "container writable layer", volume: 'volume "uploads"', bind: "host directory", tmpfs: "tmpfs (RAM)" }[type];
  const storePath = {
    none: s.ctr ? [`/var/lib/docker/overlay2/`, `${s.ctr.cid.slice(0, 12)}…/diff/app/uploads`] : ["deleted with the container"],
    volume: s.vol ? ["/var/lib/docker/volumes/", "uploads/_data"] : ["(volume removed)"],
    bind: ["/home/dev/project/", "uploads"],
    tmpfs: s.ctr ? ["memory only, never", "written to disk"] : ["freed with the container"],
  }[type];
  const fileRows = (files, x, y, max = 5) => {
    if (!files) return null;
    if (!files.length) return <text x={x} y={y} fontSize="8" fill={C.dim} fontFamily={MONO}>(empty)</text>;
    const shown = files.length > max ? files.slice(files.length - max + 1) : files;
    return (
      <g>
        {files.length > max && <text x={x} y={y} fontSize="7.5" fill={C.dim} fontFamily={MONO}>… {files.length - max + 1} more</text>}
        {shown.map((f, i) => (
          <text key={f} x={x} y={y + (i + (files.length > max ? 1 : 0)) * 11} fontSize="8" fontFamily={MONO} fill={f === s.last ? C.emerald : f.startsWith("notes") ? C.amber : f === "README.txt" ? C.sky : C.text}>
            {f}
          </text>
        ))}
      </g>
    );
  };
  const hidden = type === "bind" || type === "tmpfs";

  return (
    <Card
      title="Container storage: what survives?"
      params={params}
      caption="Pick a mount type, upload a few files, then try to lose them: docker restart, docker rm -f followed by docker run, a host reboot. With no mount, files live in the container's writable layer and die with the container; a named volume and a bind mount outlive it; tmpfs is RAM and is wiped whenever the container stops. Compare the image's README.txt: an empty named volume gets a copy of it, while a bind mount or tmpfs hides it."
    >
      <Choice label="mount type" options={VM_TYPES.map((t) => [t, VM_TYPE_LABEL[t]])} value={type} onChange={pick} />
      <svg viewBox="0 0 340 200" className="mt-3 h-auto w-full select-none" role="img" aria-label={`Container app with ${VM_TYPE_LABEL[type]} at /app/uploads`}>
        {/* container */}
        <rect x="4" y="4" width="160" height="192" rx="9" fill={s.ctr ? C.ink800 : C.ink950} stroke={s.ctr ? C.sky : C.ink600} strokeOpacity={s.ctr ? 0.6 : 1} strokeDasharray={s.ctr ? undefined : "5 3"} />
        <text x="14" y="19" fontSize="9.5" fontWeight="700" fill="#f1f5f9" fontFamily={MONO}>app</text>
        <text x="156" y="19" textAnchor="end" fontSize="7.5" fill={s.ctr ? C.emerald : C.dim} fontFamily={MONO}>{s.ctr ? `${s.ctr.cid.slice(0, 12)} · Up` : "no container"}</text>
        <rect x="12" y="28" width="144" height="84" rx="6" fill={C.ink950} stroke={type === "none" ? C.ink600 : tone} strokeOpacity={s.ctr ? 0.9 : 0.3} />
        <text x="20" y="41" fontSize="8.5" fill={C.text} fontFamily={MONO}>{VM_DIR}</text>
        {type !== "none" && <text x="148" y="41" textAnchor="end" fontSize="7" fill={tone}>{type === "volume" ? "volume" : type === "bind" ? "bind" : "tmpfs"}</text>}
        {s.ctr ? fileRows(view, 20, 56, 5) : <text x="20" y="58" fontSize="8" fill={C.dim}>docker rm -f removed it</text>}
        {/* image layer */}
        <rect x="12" y="120" width="144" height="68" rx="6" fill="none" stroke={C.ink600} strokeDasharray="4 3" />
        <text x="20" y="133" fontSize="8" fill={C.dim}>image myapp:1.0 (read-only)</text>
        <text x="20" y="147" fontSize="8" fill={hidden ? C.dim : C.sky} fontFamily={MONO} textDecoration={hidden ? "line-through" : undefined}>/app/uploads/README.txt</text>
        <text x="20" y="161" fontSize="7.5" fill={hidden ? C.rose : type === "volume" ? C.emerald : C.text}>
          {type === "none" ? "merged with the writable layer" : type === "volume" ? "shadowed by the volume, but" : "hidden under the mount"}
        </text>
        <text x="20" y="173" fontSize="7.5" fill={hidden ? C.rose : type === "volume" ? C.emerald : C.text}>
          {type === "none" ? "(overlayfs: upper + lower)" : type === "volume" ? "copied into it while it was empty" : "(the mount covers the directory)"}
        </text>
        {/* link */}
        <line x1="156" y1="70" x2="178" y2="70" stroke={tone} strokeWidth="2" strokeDasharray={store ? undefined : "3 3"} opacity={s.ctr ? 1 : 0.35} />
        <circle cx="178" cy="70" r="3" fill={tone} opacity={s.ctr ? 1 : 0.35} />
        {/* host */}
        <rect x="172" y="4" width="164" height="192" rx="9" fill={C.ink950} stroke={C.ink600} strokeDasharray="5 3" />
        <text x="182" y="19" fontSize="8" fill={C.dim}>Docker host</text>
        <rect x="180" y="28" width="148" height="112" rx="6" fill={type === "tmpfs" ? "#2a1436" : C.ink800} stroke={tone} strokeOpacity={store ? 0.9 : 0.3} strokeDasharray={store ? undefined : "4 3"} />
        <text x="188" y="41" fontSize="8.5" fontWeight="600" fill={tone}>{storeTitle}</text>
        {storePath.map((l, i) => (
          <text key={i} x="188" y={53 + i * 10} fontSize="7.3" fill={C.dim} fontFamily={MONO}>{l}</text>
        ))}
        {fileRows(store, 188, 82, 5)}
        <text x="188" y="156" fontSize="7.5" fill={C.text}>
          {{ none: "dies with the container", volume: "managed by Docker, outlives containers", bind: "your path, edit it with any tool", tmpfs: "fast, private, gone on stop" }[type]}
        </text>
        {type === "bind" && <text x="188" y="170" fontSize="7.5" fill={C.amber}>host edits show up instantly</text>}
        {type === "volume" && <text x="188" y="170" fontSize="7.5" fill={C.dim} fontFamily={MONO}>docker volume ls → uploads</text>}
        {type === "tmpfs" && <text x="188" y="170" fontSize="7.5" fill={C.dim}>counts toward the memory limit</text>}
        {type === "none" && <text x="188" y="170" fontSize="7.5" fill={C.dim}>slow-ish (copy-on-write)</text>}
      </svg>

      <Row>
        <Button primary onClick={() => act("write")} disabled={!s.ctr}>upload a file</Button>
        <Button onClick={() => act("restart")} disabled={!s.ctr}>docker restart</Button>
        <Button onClick={() => act("rm")} disabled={!s.ctr}>docker rm -f</Button>
        <Button onClick={() => act("run")}>docker run</Button>
        <Button onClick={() => act("reboot")}>reboot host</Button>
        {type === "bind" && <Button onClick={() => act("host")}>edit on host</Button>}
        {type === "volume" && <Button onClick={() => act("volrm")}>docker volume rm</Button>}
        <Button onClick={() => pick(type)} aria-label="reset this mount type">Reset</Button>
      </Row>

      <Label className="mb-1 mt-3">terminal</Label>
      <div ref={logRef} className="max-h-52 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[11px] leading-relaxed" style={NOLIG} aria-live="polite">
        {s.log.map((l, i) => (
          <div key={i} className={`mb-1 border-l-2 pl-2 ${i >= s.log.length - 2 ? "border-brand-400" : "border-transparent"}`}>
            <div className="whitespace-pre-wrap break-words"><span className="text-slate-500">$ </span>{shLine(l.cmd)}</div>
            {l.out && <div className={`whitespace-pre-wrap break-all ${l.tone === "bad" ? "text-rose-300" : "text-slate-400"}`}>{l.out}</div>}
            {l.note && <div className="whitespace-pre-wrap break-words font-sans text-[11px] text-slate-500">↳ {l.note}</div>}
          </div>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[11px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-1 pr-2 font-normal">data survives…</th>
              {VM_TYPES.map((t) => (
                <th key={t} className={`px-1.5 py-1 font-normal ${t === type ? "text-white" : ""}`}>{VM_TYPE_LABEL[t]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VM_SURVIVE.map(([what, row]) => (
              <tr key={what} className="border-t border-ink-700">
                <td className="py-1 pr-2 text-slate-400">{what}</td>
                {VM_TYPES.map((t) => {
                  const [v, note] = row[t];
                  return (
                    <td key={t} className={`px-1.5 py-1 ${t === type ? "bg-brand-500/10" : ""}`}>
                      <span className={v === 1 ? "text-emerald-300" : v === 2 ? "text-amber-300" : "text-rose-300"}>{v === 1 ? "✓" : v === 2 ? "~" : "✗"}</span>
                      {note && <span className="ml-1 text-slate-500">{note}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Code label="docker run" lines={syn.sh} />
        <Code label="compose.yaml" lines={syn.yaml} lang="yaml" />
      </div>
    </Card>
  );
}

/* ======================================================================== */
/* ---------- compose-startup: depends_on conditions and healthchecks ----- */
/* ======================================================================== */

const CS_PRESETS = {
  "web-api-db": {
    H: 92,
    svcs: [
      { name: "web", image: "shop/web:1.0", deps: [["api", "service_started"]], pos: [52, 46], ports: "8080:80" },
      { name: "api", image: "shop/api:1.0", deps: [["db", "service_healthy"]], pos: [170, 46], needsDb: true, restart: true },
      { name: "db", image: "postgres:16", deps: [], pos: [288, 46], db: true },
    ],
  },
  "full-stack": {
    H: 204,
    svcs: [
      { name: "nginx", image: "nginx:1.27", deps: [["web", "service_started"], ["api", "service_started"]], pos: [42, 88], ports: "80:80" },
      { name: "web", image: "shop/web:1.0", deps: [], pos: [128, 30] },
      { name: "api", image: "shop/api:1.0", deps: [["db", "service_healthy"], ["cache", "service_started"], ["migrate", "service_completed_successfully"]], pos: [128, 132], needsDb: true, restart: true },
      { name: "migrate", image: "shop/api:1.0", deps: [["db", "service_healthy"]], pos: [216, 70], oneshot: true },
      { name: "cache", image: "redis:7", deps: [], pos: [216, 182] },
      { name: "db", image: "postgres:16", deps: [], pos: [298, 132], db: true },
    ],
  },
};
const CS_KEYS = Object.keys(CS_PRESETS);
const CS_P = "shop";
const CS_HC = { interval: 2, retries: 3, startPeriod: 4, readyAfter: 5 };
const CS_COND_SHORT = { service_started: "started", service_healthy: "healthy", service_completed_successfully: "completed" };
const CS_STATE = {
  created: ["Created", C.ink600],
  waiting: ["waiting", "#3a3f58"],
  starting: ["health: starting", C.amber],
  healthy: ["healthy", C.emerald],
  unhealthy: ["unhealthy", C.rose],
  running: ["running", C.sky],
  exited0: ["Exited (0)", "#94a3b8"],
  exited1: ["Exited (1)", C.rose],
  restarting: ["Restarting (1)", C.orange],
};

/**
 * One deterministic `docker compose up -d`, second by second. Compose creates
 * every container first, then starts each one as soon as all of its depends_on
 * conditions hold; if a condition can never hold it stops with an error.
 */
function csSim(preset, { broken, migFail, plain }) {
  const defs = CS_PRESETS[preset].svcs;
  const deps = (d) => d.deps.map(([on, cond]) => [on, plain ? "service_started" : cond]);
  const st = {};
  defs.forEach((d) => (st[d.name] = { phase: "created", start: null, health: null, fails: 0, exit: null, exitT: null, restarts: 0, next: null, firstStart: null }));
  const db = defs.find((d) => d.db);
  const dbReady = (t) => db && st[db.name].start !== null && st[db.name].phase === "running" && t >= st[db.name].start + CS_HC.readyAfter;
  const events = [];
  const ev = (t, svc, text, tone = "text") => events.push({ t, svc, text, tone });
  const frames = [];
  let err = null, errT = null, doneT = null;
  const T = 24;
  const order = [...defs].reverse(); // dependencies first (the presets list dependents first)

  ev(0, null, `Network ${CS_P}_default  Created`, "dim");
  if (db) ev(0, null, `Volume "${CS_P}_pgdata"  Created`, "dim");
  order.forEach((d) => ev(0, d.name, `Container ${CS_P}-${d.name}-1  Created`, "dim"));

  const snap = (t) => {
    const f = {};
    defs.forEach((d) => {
      const s = st[d.name];
      let k = "created";
      if (s.phase === "running") k = d.db ? (s.health === "healthy" ? "healthy" : s.health === "unhealthy" ? "unhealthy" : "starting") : "running";
      else if (s.phase === "exited") k = s.exit === 0 ? "exited0" : "exited1";
      else if (s.phase === "restarting") k = "restarting";
      else if (t > 0 && !err) k = "waiting";
      f[d.name] = { k, restarts: s.restarts, start: s.start, firstStart: s.firstStart, exit: s.exit, exitT: s.exitT, health: s.health };
    });
    return f;
  };
  frames.push(snap(0));

  for (let t = 1; t <= T; t++) {
    // 1. what the running containers do this second
    for (const d of order) {
      const s = st[d.name];
      if (s.phase === "restarting" && t >= s.next) {
        s.phase = "running";
        s.start = t;
        ev(t, d.name, `restarted by the restart policy (RestartCount=${s.restarts})`, "amber");
        continue;
      }
      if (s.phase !== "running") continue;
      const age = t - s.start;
      if (d.db) {
        if (age === CS_HC.readyAfter) ev(t, d.name, "LOG: database system is ready to accept connections", "dim");
        if (age > 0 && age % CS_HC.interval === 0) {
          const pass = !broken && dbReady(t);
          if (pass) {
            if (s.health !== "healthy") ev(t, d.name, "healthcheck passed → healthy", "emerald");
            s.health = "healthy";
            s.fails = 0;
          } else {
            const why = broken ? 'exec: "curl": executable file not found in $PATH' : "/var/run/postgresql:5432 - no response";
            if (age <= CS_HC.startPeriod) ev(t, d.name, `healthcheck failed (${why}), inside start_period: not counted`, "dim");
            else {
              s.fails += 1;
              ev(t, d.name, s.fails <= CS_HC.retries ? `healthcheck failed ${s.fails}/${CS_HC.retries}: ${why}` : `healthcheck failed again (FailingStreak ${s.fails})`, s.fails <= CS_HC.retries ? "amber" : "dim");
              if (s.fails >= CS_HC.retries && s.health !== "unhealthy") {
                s.health = "unhealthy";
                ev(t, d.name, `${CS_HC.retries} failures in a row → unhealthy`, "rose");
              }
            }
          }
        }
      } else if (d.oneshot) {
        if (age === 1 && !dbReady(t)) {
          s.phase = "exited";
          s.exit = 1;
          s.exitT = t;
          ev(t, d.name, "Error: connect ECONNREFUSED db:5432 → exited with code 1", "rose");
        } else if (age === 3) {
          s.phase = "exited";
          s.exit = migFail ? 1 : 0;
          s.exitT = t;
          ev(t, d.name, migFail ? 'migration 0042_orders failed: column "total" does not exist → exited with code 1' : "applied 3 migrations → exited with code 0", migFail ? "rose" : "emerald");
        } else if (age === 1) ev(t, d.name, "running migrations…", "text");
      } else if (d.needsDb && age === 1) {
        if (!dbReady(t)) {
          ev(t, d.name, "Error: connect ECONNREFUSED 172.20.0.2:5432 → exited with code 1", "rose");
          if (d.restart && s.restarts < 5) {
            s.restarts += 1;
            s.phase = "restarting";
            const delay = 2 ** (s.restarts - 1);
            s.next = t + delay;
            ev(t, d.name, `restart: on-failure → Restarting, next try in ${delay}s (the delay doubles)`, "orange");
          } else {
            s.phase = "exited";
            s.exit = 1;
            s.exitT = t;
          }
        } else {
          const mig = st.migrate;
          ev(t, d.name, mig && mig.exit !== 0 && mig.exit !== null ? 'listening on :8000, but migrations never ran: queries fail with relation "orders" does not exist' : "connected to db, listening on :8000", mig && mig.exit ? "amber" : "emerald");
        }
      } else if (age === 1 && d.name === "cache") ev(t, d.name, "Ready to accept connections tcp", "dim");
    }
    // 2. compose starts whatever is unblocked
    if (!err && doneT === null) {
      for (const d of order) {
        const s = st[d.name];
        if (s.phase !== "created") continue;
        let ok = true;
        for (const [on, cond] of deps(d)) {
          const o = st[on];
          if (cond === "service_started") ok = ok && o.firstStart !== null && o.firstStart < t;
          else if (cond === "service_healthy") {
            if (o.health === "unhealthy") {
              err = `dependency failed to start: container ${CS_P}-${on}-1 is unhealthy`;
              break;
            }
            ok = ok && o.health === "healthy" && o.phase === "running";
          } else {
            if (o.phase === "exited" && o.exit !== 0) {
              err = `service "${on}" didn't complete successfully: exit ${o.exit}`;
              break;
            }
            ok = ok && o.phase === "exited" && o.exit === 0;
          }
        }
        if (err) {
          errT = t;
          ev(t, null, err, "rose");
          ev(t, null, "docker compose up exits with status 1; containers it already started keep running", "rose");
          break;
        }
        if (ok) {
          s.phase = "running";
          s.start = t;
          s.firstStart = t;
          if (d.db) s.health = "starting";
          ev(t, d.name, `Container ${CS_P}-${d.name}-1  Started${d.db ? " (health: starting)" : ""}`, "sky");
        }
      }
      if (!err && defs.every((d) => st[d.name].phase !== "created")) {
        doneT = t;
        ev(t, null, "✔ all containers started: docker compose up -d returns 0", "emerald");
      }
    }
    frames.push(snap(t));
  }
  const lastEv = events.reduce((m, e) => Math.max(m, e.t), 0);
  const end = clamp(err ? errT + 3 : Math.max(lastEv + 1, (doneT ?? 0) + 2), 8, T);
  return { frames: frames.slice(0, end + 1), events, end, err, errT, doneT };
}

/** compose.yaml for the preset, with the keys that matter for the current toggles marked. */
function csYaml(preset, { broken, migFail, plain }) {
  const L = [], M = {};
  const add = (s, m) => {
    if (m) M[L.length] = m;
    L.push(s);
  };
  add("services:");
  for (const d of CS_PRESETS[preset].svcs) {
    add(`  ${d.name}:`);
    add(`    image: ${d.image}`);
    if (d.oneshot) add('    command: ["npm", "run", "migrate"]', migFail ? "rose" : null);
    if (d.ports) add(`    ports: ["${d.ports}"]`);
    if (d.restart) add("    restart: on-failure", plain ? "amber" : null);
    if (d.deps.length) {
      if (plain) add(`    depends_on: [${d.deps.map(([o]) => o).join(", ")}]   # only waits for "started"`, "amber");
      else {
        add("    depends_on:", "sky");
        for (const [o, c] of d.deps) {
          add(`      ${o}:`, "sky");
          add(`        condition: ${c}`, c === "service_healthy" && broken ? "rose" : c === "service_completed_successfully" && migFail ? "rose" : c === "service_started" ? "sky" : "emerald");
        }
      }
    }
    if (d.db) {
      add("    environment:");
      add("      POSTGRES_PASSWORD: example");
      add("    volumes:");
      add("      - pgdata:/var/lib/postgresql/data");
      add("    healthcheck:", broken ? "rose" : "amber");
      add(broken ? '      test: ["CMD", "curl", "-f", "http://localhost:5432"]   # no curl in this image' : '      test: ["CMD-SHELL", "pg_isready -U postgres"]', broken ? "rose" : "amber");
      add(`      interval: ${CS_HC.interval}s`, "amber");
      add("      timeout: 2s", "amber");
      add(`      retries: ${CS_HC.retries}`, "amber");
      add(`      start_period: ${CS_HC.startPeriod}s`, "amber");
    }
  }
  add("volumes:");
  add("  pgdata:");
  return { lines: L, marks: M };
}

/** `docker compose ps` STATUS column for one service at time t. */
function csPsStatus(f, t) {
  const ago = (x) => {
    const n = Math.max(1, t - x);
    return n === 1 ? "1 second" : `${n} seconds`;
  };
  if (f.k === "created" || f.k === "waiting") return "Created";
  if (f.k === "restarting") return `Restarting (1) ${t - f.start <= 0 ? "Less than a second" : ago(f.start)} ago`;
  if (f.k === "exited0" || f.k === "exited1") return `Exited (${f.exit ?? 1}) ${t - f.exitT <= 0 ? "Less than a second" : ago(f.exitT)} ago`;
  const up = t - f.start <= 0 ? "Less than a second" : ago(f.start);
  if (f.k === "starting") return `Up ${up} (health: starting)`;
  if (f.k === "healthy") return `Up ${up} (healthy)`;
  if (f.k === "unhealthy") return `Up ${up} (unhealthy)`;
  return `Up ${up}`;
}

/** The `[+] Running n/m` progress block docker compose prints. */
function csProgress(preset, sim, t, plain) {
  const defs = CS_PRESETS[preset].svcs;
  const f = sim.frames[Math.min(t, sim.frames.length - 1)];
  const waitedHealthy = new Set(plain ? [] : defs.flatMap((d) => d.deps.filter(([, c]) => c === "service_healthy").map(([o]) => o)));
  const waitedDone = new Set(plain ? [] : defs.flatMap((d) => d.deps.filter(([, c]) => c === "service_completed_successfully").map(([o]) => o)));
  const rows = [["✔", `Network ${CS_P}_default`, "Created"]];
  if (defs.some((d) => d.db)) rows.push(["✔", `Volume "${CS_P}_pgdata"`, "Created"]);
  for (const d of [...defs].reverse()) {
    const x = f[d.name];
    let r;
    if (x.k === "created" || x.k === "waiting") r = ["✔", "Created"];
    else if (waitedHealthy.has(d.name) && (x.k === "starting" || x.k === "running")) r = ["⠿", "Waiting"];
    else if (waitedHealthy.has(d.name) && x.k === "healthy") r = ["✔", "Healthy"];
    else if (waitedHealthy.has(d.name) && x.k === "unhealthy") r = ["✘", "Error"];
    else if (waitedDone.has(d.name) && x.k === "running") r = ["⠿", "Waiting"];
    else if (waitedDone.has(d.name) && x.k === "exited0") r = ["✔", "Exited"];
    else if (waitedDone.has(d.name) && x.k === "exited1") r = ["✘", `service "${d.name}" didn't complete successfully: exit 1`];
    else r = ["✔", "Started"];
    rows.push([r[0], `Container ${CS_P}-${d.name}-1`, r[1]]);
  }
  const ok = rows.filter((r) => r[0] === "✔").length;
  return { head: `[+] Running ${ok}/${rows.length}`, rows };
}

function csClip(ax, ay, bx, by, hw, hh) {
  const dx = bx - ax, dy = by - ay;
  const s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return [ax + dx * Math.min(1, s), ay + dy * Math.min(1, s)];
}

export function ComposeStartup({ params = {} }) {
  const prm = obj(params);
  const [preset, setPreset] = useState(() => oneOf(prm.preset, CS_KEYS, "web-api-db", { simple: "web-api-db", basic: "web-api-db", "3-tier": "web-api-db", full: "full-stack", fullstack: "full-stack", complex: "full-stack" }));
  const [broken, setBroken] = useState(!!prm.brokenHealthcheck);
  const [migFail, setMigFail] = useState(false);
  const [plain, setPlain] = useState(!!prm.plain);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const id = useSvgId();
  const opts = { broken, migFail, plain };
  const sim = useMemo(() => csSim(preset, opts), [preset, broken, migFail, plain]); // eslint-disable-line react-hooks/exhaustive-deps
  const yaml = useMemo(() => csYaml(preset, opts), [preset, broken, migFail, plain]); // eslint-disable-line react-hooks/exhaustive-deps
  const logRef = useRef(null);
  const end = sim.end;
  const tt = Math.min(t, end);
  const f = sim.frames[tt];
  const defs = CS_PRESETS[preset].svcs;
  const P = CS_PRESETS[preset];

  useInterval(playing, 700, () => {
    setT((x) => {
      if (x >= end) {
        setPlaying(false);
        return x;
      }
      return x + 1;
    });
  });
  useEffect(() => {
    if (playing && t >= end) setPlaying(false);
  }, [playing, t, end]);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tt, sim]);

  const restart = (play = true) => {
    setT(0);
    setPlaying(play);
  };
  const change = (fn) => (v) => {
    fn(v);
    restart(true);
  };
  const shownEvents = sim.events.filter((e) => e.t <= tt);
  const prog = csProgress(preset, sim, tt, plain);
  const failed = sim.err && tt >= sim.errT;
  const finished = sim.doneT !== null && tt >= sim.doneT;

  // edges
  const edgeState = (d, on, cond) => {
    const c = plain ? "service_started" : cond;
    const o = f[on], me = f[d.name];
    if (failed && me.k === "created") {
      if (c === "service_healthy" && o.k === "unhealthy") return "fail";
      if (c === "service_completed_successfully" && o.k === "exited1") return "fail";
    }
    const sat = c === "service_started" ? o.firstStart !== null : c === "service_healthy" ? o.k === "healthy" : o.k === "exited0";
    if (me.k !== "created" && me.k !== "waiting") return "done";
    if (sat) return "ok";
    return tt > 0 && !failed ? "wait" : "idle";
  };
  const EW = 36, EH = 17;
  const tone = (k) => CS_STATE[k][1];
  const ganttX0 = 58, ganttW = 340 - ganttX0 - 6;
  const cell = ganttW / (end + 1);

  return (
    <Card
      title="docker compose up: start-up order and healthchecks"
      params={params}
      caption="Press Play to watch docker compose up -d second by second: the network and volume are created, all containers are created, then each service starts only when its depends_on conditions hold. service_healthy waits for the healthcheck, service_completed_successfully waits for a one-off job to exit 0. Break the healthcheck or the migration to see Compose give up, or switch to a plain depends_on list: api then starts before Postgres accepts connections and crash-loops until it does."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Choice label="preset" options={[["web-api-db", "web → api → db"], ["full-stack", "full stack"]]} value={preset} onChange={change(setPreset)} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Toggle label="break db healthcheck" on={broken} onChange={change(setBroken)} />
        <Toggle label="migrate fails (exit 1)" on={migFail} onChange={change(setMigFail)} disabled={preset !== "full-stack"} />
        <Toggle label="no conditions (plain depends_on list)" on={plain} onChange={change(setPlain)} />
      </div>

      <svg viewBox={`0 0 340 ${P.H}`} className="mt-3 h-auto w-full select-none" role="img" aria-label={`Compose dependency graph at t=${tt}s`}>
        <defs>
          {["ok", "done", "wait", "fail", "idle"].map((k) => (
            <Arrow key={k} id={`${id}${k}`} color={{ ok: C.emerald, done: "#475569", wait: C.amber, fail: C.rose, idle: C.axis }[k]} />
          ))}
        </defs>
        {defs.flatMap((d) =>
          d.deps.map(([on, cond]) => {
            const o = defs.find((x) => x.name === on);
            const [ax, ay] = csClip(d.pos[0], d.pos[1], o.pos[0], o.pos[1], EW, EH);
            const [bx, by] = csClip(o.pos[0], o.pos[1], d.pos[0], d.pos[1], EW + 3, EH + 3);
            const es = edgeState(d, on, cond);
            const col = { ok: C.emerald, done: "#475569", wait: C.amber, fail: C.rose, idle: C.axis }[es];
            const mx = (ax + bx) / 2, my = (ay + by) / 2;
            const lbl = plain ? "started" : CS_COND_SHORT[cond];
            return (
              <g key={d.name + on}>
                <line x1={ax} y1={ay} x2={bx} y2={by} stroke={col} strokeWidth={es === "wait" || es === "fail" ? 1.6 : 1.2} strokeDasharray={es === "wait" ? "4 3" : undefined} markerEnd={`url(#${id}${es})`}>
                  {es === "wait" && <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.9s" repeatCount="indefinite" />}
                </line>
                <rect x={mx - lbl.length * 2.25 - 3} y={my - 6} width={lbl.length * 4.5 + 6} height="11" rx="3" fill={C.ink900} />
                <text x={mx} y={my + 2.5} textAnchor="middle" fontSize="7.2" fill={es === "fail" ? C.rose : es === "wait" ? C.amber : C.text} fontFamily={MONO}>{lbl}</text>
              </g>
            );
          }),
        )}
        {defs.map((d) => {
          const x = f[d.name];
          const col = tone(x.k);
          const lab = x.k === "restarting" ? `Restarting (${x.restarts})` : CS_STATE[x.k][0];
          const live = x.k !== "created" && x.k !== "waiting";
          return (
            <g key={d.name}>
              <rect x={d.pos[0] - EW} y={d.pos[1] - EH} width={EW * 2} height={EH * 2} rx="7" fill={live ? `${col}22` : C.ink800} stroke={live ? col : x.k === "waiting" ? C.amber : C.ink600} strokeDasharray={x.k === "waiting" ? "3 2" : undefined} strokeWidth={live ? 1.5 : 1} style={{ transition: "fill 0.3s, stroke 0.3s" }} />
              <text x={d.pos[0]} y={d.pos[1] - 3} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#f1f5f9" fontFamily={MONO}>{d.name}</text>
              <text x={d.pos[0]} y={d.pos[1] + 10} textAnchor="middle" fontSize="7.3" fill={live ? col : x.k === "waiting" ? C.amber : C.dim}>{x.k === "waiting" ? "waiting…" : lab}</text>
            </g>
          );
        })}
      </svg>

      {/* timeline */}
      <svg viewBox={`0 0 340 ${defs.length * 14 + 22}`} className="mt-2 h-auto w-full select-none" role="img" aria-label="Timeline of container states per second">
        {defs.map((d, i) => (
          <g key={d.name}>
            <text x={ganttX0 - 5} y={i * 14 + 10} textAnchor="end" fontSize="8" fill={C.text} fontFamily={MONO}>{d.name}</text>
            {sim.frames.map((fr, k2) => {
              const k = fr[d.name].k;
              return <rect key={k2} x={ganttX0 + k2 * cell + 0.5} y={i * 14 + 2} width={Math.max(0.5, cell - 1)} height="10" rx="1.5" fill={k2 <= tt ? tone(k) : C.ink800} opacity={k2 <= tt ? (k === "created" ? 0.6 : k === "waiting" ? 0.9 : 0.85) : 0.6} />;
            })}
          </g>
        ))}
        <line x1={ganttX0 + (tt + 0.5) * cell} y1="0" x2={ganttX0 + (tt + 0.5) * cell} y2={defs.length * 14 + 4} stroke="#f1f5f9" strokeWidth="1" opacity="0.7" />
        {sim.frames.map((_, k2) =>
          k2 % 2 === 0 ? (
            <text key={k2} x={ganttX0 + (k2 + 0.5) * cell} y={defs.length * 14 + 15} textAnchor="middle" fontSize="7" fill={k2 === tt ? "#f1f5f9" : C.dim} fontFamily={MONO}>{k2}s</text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {["waiting", "starting", "healthy", "unhealthy", "running", "restarting", "exited0", "exited1"].filter((k) => k !== "exited1" || preset === "full-stack" || plain).map((k) => (
          <Legend key={k} color={tone(k)} label={k === "restarting" ? "restarting" : k === "exited0" ? "exited 0" : k === "exited1" ? "exited ≠ 0" : CS_STATE[k][0]} />
        ))}
      </div>

      <Row>
        <Button primary onClick={() => (playing ? setPlaying(false) : tt >= end ? restart(true) : setPlaying(true))}>{playing ? "Pause" : tt >= end ? "Replay" : tt > 0 ? "Resume" : "Play"}</Button>
        <Button onClick={() => { setPlaying(false); setT(Math.max(0, tt - 1)); }} disabled={tt === 0} aria-label="One second back">◀ 1s</Button>
        <Button onClick={() => { setPlaying(false); setT(Math.min(end, tt + 1)); }} disabled={tt >= end} aria-label="One second forward">1s ▶</Button>
        <Button onClick={() => restart(false)}>Reset</Button>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <Stat label="t" value={`${tt}s`} />
          <Stat label="compose up" value={failed ? "failed" : finished ? "done" : tt === 0 ? "creating" : "starting…"} color={failed ? "text-rose-300" : finished ? "text-emerald-300" : "text-amber-300"} />
        </span>
      </Row>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">$ docker compose up -d</Label>
          <Pre nowrap className="text-[10px]">
            <span className="text-sky-300">{prog.head}</span>
            {prog.rows.map((r, i) => (
              <span key={i}>
                {"\n "}
                <span className={r[0] === "✔" ? "text-emerald-300" : r[0] === "✘" ? "text-rose-300" : "text-amber-300"}>{r[0]}</span> {r[1].padEnd(25)} <span className={r[0] === "✘" ? "text-rose-300" : "text-slate-400"}>{r[2]}</span>
              </span>
            ))}
            {failed && <span className="text-rose-300">{`\n${sim.err}`}</span>}
          </Pre>
          <Label className="mb-1 mt-2">$ docker compose ps -a</Label>
          <Pre nowrap className="text-[10px]">
            {"NAME".padEnd(16)}STATUS
            {[...defs].reverse().map((d) => {
              const x = f[d.name];
              const s2 = csPsStatus(x, tt);
              return (
                <span key={d.name}>
                  {"\n"}
                  {`${CS_P}-${d.name}-1`.padEnd(16)}
                  <span style={{ color: x.k === "created" || x.k === "waiting" ? C.dim : tone(x.k) }}>{s2}</span>
                </span>
              );
            })}
          </Pre>
        </div>
        <div className="min-w-0">
          <Label className="mb-1">what happened</Label>
          <ol ref={logRef} className="h-[15.5rem] space-y-0.5 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[10.5px] leading-snug" aria-live="polite">
            {shownEvents.map((e, i) => (
              <li key={i} className={`${{ rose: "text-rose-300", emerald: "text-emerald-300", amber: "text-amber-300", orange: "text-orange-300", sky: "text-sky-300", dim: "text-slate-500" }[e.tone] || "text-slate-300"} ${i === shownEvents.length - 1 ? "font-semibold" : ""}`}>
                <span className="text-slate-600">{String(e.t).padStart(2, " ")}s </span>
                {e.svc ? <span className="text-slate-400">{e.svc}: </span> : null}
                {e.text}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {failed && (
        <div className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-200">
          {sim.err.includes("unhealthy")
            ? "The db container is running, but its healthcheck never passes, so every service_healthy dependency is unsatisfiable and Compose aborts. Debug it with docker inspect --format '{{json .State.Health}}' shop-db-1, which shows the last probe outputs."
            : "migrate exited non-zero, so service_completed_successfully can never be met and api (and everything behind it) is left in Created. Fix the migration and run docker compose up -d again."}
        </div>
      )}
      {plain && !failed && finished && (
        <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          A plain list only means "start after the container has started". Compose reports success while api is still crash-looping{preset === "full-stack" ? " and migrate has failed for good" : ""}: started is not the same as ready.
        </div>
      )}
      <Code className="mt-3" label="compose.yaml" lang="yaml" lines={yaml.lines} marks={yaml.marks} />
    </Card>
  );
}

/* ======================================================================== */
/* ---------- resource-limits: --memory, the OOM killer and --cpus -------- */
/* ======================================================================== */

const RL_BASE = 38; // MiB right after start
const RL_WIN = 40; // seconds of history in the memory chart
const RL_CID = "4f1c2a9e7b3d";
const RL_PERIOD = 100000; // µs, CFS period (cpu.max second field)

function rlMemInit() {
  return { t: 0, startT: 0, use: RL_BASE, state: "running", restarts: 0, oomKills: 0, oomFlag: false, next: null, pid: 2817, hist: [{ t: 0, u: RL_BASE, k: "running" }], events: [] };
}

/** One simulated second of the leaky worker. */
function rlMemStep(s, limit, restart) {
  const t = s.t + 1;
  const r = mulberry32(hashStr(`leak-${t}`));
  const n = { ...s, t, events: [...s.events] };
  const ev = (text, tone = "text") => n.events.push({ t, text, tone });
  if (s.state === "running") {
    n.use = s.use + 12 + r() * 10; // ~17 MiB/s leak: a cache that never evicts
    if (n.use >= limit) {
      n.use = limit;
      n.oomKills += 1;
      n.oomFlag = true;
      ev(`kernel: Memory cgroup out of memory: Killed process ${s.pid} (node) total-vm:${Math.round(limit * 1024 * 3.1)}kB, anon-rss:${Math.round(limit * 1024 * 0.97)}kB`, "rose");
      ev("container exited: OOMKilled=true, ExitCode=137 (128 + SIGKILL)", "rose");
      if (restart) {
        n.restarts += 1;
        const d = Math.min(8, 2 ** (n.restarts - 1));
        n.state = "restarting";
        n.next = t + d;
        ev(`--restart on-failure: exit 137 counts as a failure → restarting in ${d}s`, "orange");
      } else {
        n.state = "exited";
        ev("no restart policy: it stays Exited (137) until someone notices", "amber");
      }
      n.hist = [...s.hist, { t, u: limit, k: "oom" }].slice(-RL_WIN - 1);
      return n;
    }
  } else if (s.state === "restarting" && t >= s.next) {
    n.state = "running";
    n.startT = t;
    n.use = RL_BASE;
    n.pid = s.pid + 31;
    n.oomFlag = false;
    ev(`restarted (RestartCount=${n.restarts}); the leak starts again from ${RL_BASE} MiB`, "amber");
  } else if (s.state !== "running") n.use = 0;
  n.hist = [...s.hist, { t, u: n.state === "running" ? n.use : 0, k: n.state }].slice(-RL_WIN - 1);
  return n;
}

const RL_CTS = [
  { name: "encoder", color: C.fuchsia, what: "4 busy threads (video encoding)", demand: (t, r) => 3.6 + r() * 0.4 },
  { name: "api", color: C.sky, what: "bursty web requests", demand: (t, r) => (r() < 0.35 ? 0.9 + r() * 0.7 : 0.15 + r() * 0.35) },
  { name: "batch", color: C.amber, what: "2 busy threads (report job)", demand: () => 2 },
];

/** Max-min fair split of N cores (equal cpu.weight) given each container's cap. */
function rlAlloc(N, caps) {
  const a = caps.map(() => 0);
  let rem = N;
  let act = caps.map((_, i) => i).filter((i) => caps[i] > 1e-9);
  while (act.length && rem > 1e-9) {
    const share = rem / act.length;
    const sat = act.filter((i) => caps[i] - a[i] <= share + 1e-9);
    if (sat.length) {
      sat.forEach((i) => {
        rem -= caps[i] - a[i];
        a[i] = caps[i];
      });
      act = act.filter((i) => !sat.includes(i));
    } else {
      act.forEach((i) => (a[i] += share));
      rem = 0;
    }
  }
  return a;
}

/** CPU usage for second t: demand, cap from --cpus, fair share of the host, CFS throttling. */
function rlCpuAt(t, N, lims) {
  const r = mulberry32(hashStr(`cpu-${t}`));
  const dem = RL_CTS.map((c) => c.demand(t, r));
  const caps = dem.map((d, i) => (lims[i] > 0 ? Math.min(d, lims[i]) : d));
  const use = rlAlloc(N, caps);
  return RL_CTS.map((c, i) => {
    const lim = lims[i];
    const throttled = lim > 0 && dem[i] > lim + 1e-9 && use[i] >= lim - 1e-6;
    // with d runnable threads the quota is burned in lim/d of the period, then the group waits for the next period
    const thrFrac = throttled ? 1 - lim / dem[i] : 0;
    const contention = !throttled && use[i] < caps[i] - 1e-6;
    return { d: dem[i], u: use[i], lim, throttled, thrFrac, contention };
  });
}

function rlCpuInit(N, lims) {
  return { t: 0, hist: [rlCpuAt(0, N, lims)], tot: RL_CTS.map(() => ({ usage: 0, periods: 0, throttled: 0, thrUs: 0 })) };
}
function rlCpuStep(s, N, lims) {
  const t = s.t + 1;
  const now = rlCpuAt(t, N, lims);
  return {
    t,
    hist: [...s.hist, now].slice(-30),
    tot: s.tot.map((x, i) => ({
      usage: x.usage + now[i].u * 1e6,
      periods: x.periods + 10,
      throttled: x.throttled + (now[i].throttled ? 10 : 0),
      thrUs: x.thrUs + now[i].thrFrac * RL_PERIOD * 10,
    })),
  };
}

const fmtCpus = (v) => (v > 0 ? String(Number(v.toFixed(2))) : "none");
const fmtMiB = (v) => (v >= 1024 ? `${(v / 1024).toFixed(2)}GiB` : `${v.toFixed(1)}MiB`);

function MemoryPart({ limit0 }) {
  const [limit, setLimit] = useState(limit0);
  const [restart, setRestart] = useState(true);
  const [s, setS] = useState(rlMemInit);
  const [playing, setPlaying] = useState(false);
  const limRef = useRef(limit);
  limRef.current = limit;

  useInterval(playing, 450, () => {
    setS((x) => rlMemStep(x, limRef.current, restart));
  });
  useEffect(() => {
    if (s.state === "exited") setPlaying(false);
  }, [s.state]);
  const reset = () => {
    setS(rlMemInit());
    setPlaying(false);
  };

  // chart
  const W = 340, H = 132, x0 = 34, y0 = 8, cw = W - x0 - 8, ch = H - y0 - 20;
  const top = Math.max(128, Math.ceil((limit * 1.2) / 64) * 64);
  const X = (t) => x0 + ((t - Math.max(0, s.t - RL_WIN)) / RL_WIN) * cw;
  const Y = (u) => y0 + ch - (u / top) * ch;
  const pts = s.hist.map((h) => [X(h.t), Y(h.u)]);
  const area = pts.length > 1 ? `M${pts[0][0]},${Y(0)} ${pts.map((p) => `L${p[0]},${p[1]}`).join(" ")} L${pts[pts.length - 1][0]},${Y(0)} Z` : "";
  const ticks = [0, top / 4, top / 2, (3 * top) / 4, top];
  const pct = s.state === "running" ? (s.use / limit) * 100 : 0;
  const statusTxt = s.state === "running" ? `Up ${s.t - s.startT}s` : s.state === "restarting" ? "Restarting (137)" : "Exited (137)";
  const exited = s.state !== "running";

  return (
    <div>
      <div className="text-xs leading-relaxed text-slate-400">A worker with a memory leak (a cache that never evicts) grows by ~17 MiB/s. <span className="font-mono text-slate-300">--memory</span> sets the cgroup&apos;s <span className="font-mono text-slate-300">memory.max</span>; when the container hits it and the kernel can&apos;t reclaim anything, the OOM killer SIGKILLs the process.</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full select-none" role="img" aria-label={`Memory usage ${s.use.toFixed(0)} MiB of a ${limit} MiB limit`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x0} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={C.grid} />
            <text x={x0 - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={C.dim} fontFamily={MONO}>{Math.round(v)}</text>
          </g>
        ))}
        <text x="4" y={y0 + 4} fontSize="7" fill={C.dim}>MiB</text>
        <line x1={x0} x2={W - 8} y1={Y(limit)} y2={Y(limit)} stroke={C.rose} strokeDasharray="5 3" />
        <text x={W - 10} y={Y(limit) - 3} textAnchor="end" fontSize="7.5" fill={C.rose} fontFamily={MONO}>--memory {limit}m (memory.max)</text>
        {area && <path d={area} fill={C.sky} opacity="0.18" />}
        {pts.length > 1 && <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={C.sky} strokeWidth="1.5" />}
        {s.hist.filter((h) => h.k === "oom").map((h) => (
          <g key={h.t} transform={`translate(${X(h.t)} ${Y(h.u)})`}>
            <circle r="5" fill={C.rose} />
            <path d="M-2.2,-2.2 L2.2,2.2 M2.2,-2.2 L-2.2,2.2" stroke={C.ink950} strokeWidth="1.5" />
          </g>
        ))}
        <text x={x0} y={H - 6} fontSize="7" fill={C.dim} fontFamily={MONO}>{Math.max(0, s.t - RL_WIN)}s</text>
        <text x={W - 8} y={H - 6} textAnchor="end" fontSize="7" fill={C.dim} fontFamily={MONO}>{s.t}s</text>
      </svg>
      <Row>
        <Button primary onClick={() => (exited && s.state === "exited" ? (reset(), setPlaying(true)) : setPlaying((v) => !v))}>{playing ? "Pause" : s.state === "exited" ? "Run again" : s.t ? "Resume" : "Start worker"}</Button>
        <Button onClick={() => setS((x) => rlMemStep(x, limit, restart))} disabled={s.state === "exited"}>Step 1s</Button>
        <Button onClick={reset}>Reset</Button>
        <Toggle label="--restart on-failure" on={restart} onChange={setRestart} />
      </Row>
      <Row>
        <Slider label="--memory" value={limit} min={64} max={1024} step={32} onChange={setLimit} display={`${limit}m`} />
      </Row>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="state" value={s.state === "running" ? "running" : s.state === "restarting" ? "restarting" : "exited"} color={s.state === "running" ? "text-emerald-300" : "text-rose-300"} sub={statusTxt} />
        <Tile label="OOMKilled" value={String(s.oomFlag)} color={s.oomFlag ? "text-rose-300" : "text-slate-200"} sub={s.oomFlag ? "exit code 137" : "reset when it starts again"} />
        <Tile label="RestartCount" value={s.restarts} color={s.restarts ? "text-orange-300" : "text-slate-200"} sub={restart ? "delay doubles each time" : "no restart policy"} />
        <Tile label="oom_kill" value={s.oomKills} color={s.oomKills ? "text-rose-300" : "text-slate-200"} sub="memory.events" />
      </div>
      <Label className="mb-1 mt-3">$ docker stats --no-stream worker</Label>
      <Pre nowrap className="text-[10px]">
        {"CONTAINER ID   NAME     CPU %    MEM USAGE / LIMIT     MEM %    PIDS\n"}
        {`${RL_CID}   worker   ${s.state === "running" ? "41.07%" : "0.00% "}   `}
        <span className={pct > 85 ? "text-rose-300" : pct > 65 ? "text-amber-300" : "text-slate-200"}>{`${(s.state === "running" ? fmtMiB(s.use) : "0B").padStart(8)} / ${fmtMiB(limit).replace(".0MiB", "MiB")}`}</span>
        {`   ${pct.toFixed(2).padStart(5)}%   ${s.state === "running" ? 11 : 0}`}
      </Pre>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="mb-1">$ docker inspect worker</Label>
          <Pre className="text-[10px]">
            {"--format '{{.State.Status}} {{.State.OOMKilled}} {{.State.ExitCode}} {{.RestartCount}}'\n"}
            <span className={s.oomFlag ? "text-rose-300" : "text-slate-200"}>{`${s.state === "running" ? "running" : s.state === "restarting" ? "restarting" : "exited"} ${s.oomFlag} ${s.oomFlag ? 137 : 0} ${s.restarts}`}</span>
            {`\n\n$ cat /sys/fs/cgroup/system.slice/docker-${RL_CID}….scope/memory.max\n${limit * 1048576}`}
          </Pre>
        </div>
        <div className="min-w-0">
          <Label className="mb-1">kernel / docker events</Label>
          <ol className="h-[7.6rem] space-y-0.5 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2 font-mono text-[10px] leading-snug" aria-live="polite">
            {s.events.length === 0 && <li className="text-slate-500">Start the worker and watch the usage climb.</li>}
            {s.events.slice(-8).reverse().map((e, i) => (
              <li key={s.events.length - i} className={e.tone === "rose" ? "text-rose-300" : e.tone === "orange" ? "text-orange-300" : e.tone === "amber" ? "text-amber-300" : "text-slate-300"}>
                <span className="text-slate-600">{e.t}s </span>
                {e.text}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Code
          label="docker run / docker update"
          lines={[
            "docker run -d --name worker \\",
            `  --memory ${limit}m --memory-swap ${limit}m \\`,
            `  ${restart ? "--restart on-failure " : ""}leaky-worker:1.0`,
            "# change it live (both flags, since swap was set):",
            `docker update --memory ${limit}m --memory-swap ${limit}m worker`,
          ]}
          marks={{ 1: "rose", ...(restart ? { 2: "amber" } : {}) }}
        />
        <Code
          label="compose.yaml"
          lang="yaml"
          lines={["services:", "  worker:", "    image: leaky-worker:1.0", ...(restart ? ["    restart: on-failure"] : []), "    deploy:", "      resources:", "        limits:", `          memory: ${limit}M`]}
          marks={{ [restart ? 7 : 6]: "rose", ...(restart ? { 3: "amber" } : {}) }}
        />
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
        --memory-swap equal to --memory means no swap on top (otherwise the default lets the container use as much swap again as its memory limit, if the host has swap). Exit code 137 = 128 + 9: the process got SIGKILL, it never had a chance to clean up. Raising the limit only delays this worker&apos;s death; the leak is the bug.
      </div>
    </div>
  );
}

function CpuPart({ cpus0 }) {
  const [N, setN] = useState(4);
  const [lims, setLims] = useState(() => [cpus0, 0, 1.5]);
  const [s, setS] = useState(() => rlCpuInit(4, [cpus0, 0, 1.5]));
  const [playing, setPlaying] = useState(false);
  const cfg = useRef({ N, lims });
  cfg.current = { N, lims };
  useInterval(playing, 600, () => setS((x) => rlCpuStep(x, cfg.current.N, cfg.current.lims)));

  const now = rlCpuAt(s.t, N, lims);
  const used = now.reduce((a, c) => a + c.u, 0);
  const setLim = (i, v) => setLims((l) => l.map((x, j) => (j === i ? v : x)));
  const BW = 210;
  const scale = BW / Math.max(N, 4.2);

  return (
    <div>
      <div className="text-xs leading-relaxed text-slate-400">
        Three containers share a host with <span className="font-mono text-slate-300">{N}</span> cores. <span className="font-mono text-slate-300">--cpus=X</span> writes the CFS quota to <span className="font-mono text-slate-300">cpu.max</span>: X × 100000 µs of CPU time per 100000 µs period. A container that burns its quota early in the period is throttled until the next one starts, even if other cores are idle.
      </div>
      <Row>
        <Slider label="host cores" value={N} min={1} max={8} onChange={(v) => { setN(v); setLims((l) => l.map((x) => Math.min(x, v))); }} />
        <Button primary onClick={() => setPlaying((v) => !v)}>{playing ? "Pause" : s.t ? "Resume" : "Run"}</Button>
        <Button onClick={() => setS((x) => rlCpuStep(x, N, lims))}>Step 1s</Button>
        <Button onClick={() => { setPlaying(false); setS(rlCpuInit(N, lims)); }}>Reset</Button>
      </Row>
      {/* host cores bar */}
      <svg viewBox="0 0 340 34" className="mt-3 h-auto w-full select-none" role="img" aria-label={`Host CPU: ${used.toFixed(2)} of ${N} cores busy`}>
        <text x="0" y="10" fontSize="8" fill={C.dim}>host · {N} cores · {Math.round((used / N) * 100)}% busy</text>
        <rect x="0" y="15" width="340" height="14" rx="4" fill={C.ink800} stroke={C.ink600} />
        {(() => {
          let x = 0;
          return now.map((c, i) => {
            const w = (c.u / N) * 340;
            const el = <rect key={i} x={x} y="15" width={Math.max(0, w)} height="14" fill={RL_CTS[i].color} opacity="0.8" />;
            x += w;
            return el;
          });
        })()}
        {Array.from({ length: N - 1 }, (_, k) => (
          <line key={k} x1={((k + 1) / N) * 340} x2={((k + 1) / N) * 340} y1="15" y2="29" stroke={C.ink950} strokeWidth="1.5" />
        ))}
      </svg>
      <div className="mt-2 space-y-2">
        {RL_CTS.map((c, i) => {
          const x = now[i];
          const tot = s.tot[i];
          const hist = s.hist.map((h) => h[i].u);
          const quota = Math.round(lims[i] * RL_PERIOD);
          return (
            <div key={c.name} className="rounded-lg bg-ink-800 p-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs font-semibold" style={{ color: c.color }}>{c.name}</span>
                <span className="text-[11px] text-slate-500">{c.what}</span>
                <span className="ml-auto font-mono text-[11px] text-slate-400">cpu.max <span className="text-slate-200">{lims[i] > 0 ? `${quota} ${RL_PERIOD}` : `max ${RL_PERIOD}`}</span></span>
              </div>
              <Slider label="--cpus" value={lims[i]} min={0} max={N} step={0.25} onChange={(v) => setLim(i, v)} display={fmtCpus(lims[i])} />
              <svg viewBox="0 0 340 40" className="mt-1 h-auto w-full select-none" role="img" aria-label={`${c.name}: wants ${x.d.toFixed(2)} cores, gets ${x.u.toFixed(2)}`}>
                {/* demand vs usage vs limit on a cores scale */}
                <rect x="0" y="3" width={BW} height="12" rx="3" fill={C.ink950} />
                <rect x="0.5" y="3.5" width={Math.max(0, x.d * scale - 1)} height="11" rx="3" fill={c.color} fillOpacity="0.12" stroke={c.color} strokeOpacity="0.45" />
                <rect x="0" y="3" width={x.u * scale} height="12" rx="3" fill={c.color} opacity="0.85" />
                {lims[i] > 0 && <line x1={lims[i] * scale} x2={lims[i] * scale} y1="0" y2="18" stroke={C.rose} strokeWidth="1.5" />}
                {Array.from({ length: Math.floor(Math.max(N, 4.2)) + 1 }, (_, k) => (
                  <text key={k} x={k * scale} y="25" textAnchor={k === 0 ? "start" : "middle"} fontSize="6.5" fill={C.dim} fontFamily={MONO}>{k}</text>
                ))}
                {/* sparkline */}
                {hist.length > 1 && (
                  <polyline points={hist.map((u, k) => `${BW + 12 + (k / 29) * 116},${15 - (u / Math.max(N, 1)) * 12}`).join(" ")} fill="none" stroke={c.color} strokeWidth="1.2" />
                )}
                <rect x={BW + 12} y="2" width="116" height="14" fill="none" stroke={C.ink600} rx="2" />
                {/* one CFS period */}
                {(() => {
                  const run = x.throttled ? 1 - x.thrFrac : 1;
                  return (
                    <g>
                      <rect x={BW + 12} y="27" width={116 * run} height="7" fill={c.color} opacity="0.7" />
                      {x.throttled && <rect x={BW + 12 + 116 * run} y="27" width={116 * x.thrFrac} height="7" fill={C.rose} opacity="0.35" />}
                      <text x={BW + 10} y="33.5" textAnchor="end" fontSize="6.5" fill={C.dim}>100 ms</text>
                    </g>
                  );
                })()}
              </svg>
              <div className="flex flex-wrap gap-1.5">
                <Stat label="CPU %" value={`${(x.u * 100).toFixed(1)}%`} color="text-slate-100" />
                <Stat label="wants" value={`${x.d.toFixed(2)} cores`} />
                {x.throttled ? <Stat label="throttled" value={`${Math.round(x.thrFrac * 100)}% of each period`} color="text-rose-300" /> : x.contention ? <Stat label="waiting" value="host is full (no throttling)" color="text-amber-300" /> : <Stat label="limit" value={lims[i] > 0 ? "not reached" : "none"} color="text-emerald-300" />}
              </div>
              <div className="mt-1 font-mono text-[10px] text-slate-500">
                cpu.stat: usage_usec {Math.round(tot.usage)} · nr_periods {tot.periods} · <span className={tot.throttled ? "text-rose-300/80" : ""}>nr_throttled {tot.throttled} · throttled_usec {Math.round(tot.thrUs)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <Legend color={C.sky} label="used (cores)" />
        <Legend color={C.dim} label="wanted (faint)" />
        <Legend color={C.rose} label="--cpus limit / throttled part of a period" />
      </div>
      <Label className="mb-1 mt-3">$ docker stats --no-stream</Label>
      <Pre nowrap className="text-[10px]">
        {"NAME      CPU %     MEM USAGE / LIMIT\n"}
        {RL_CTS.map((c, i) => `${c.name.padEnd(9)} ${`${(now[i].u * 100).toFixed(2)}%`.padEnd(9)} ${["412.3MiB", "96.8MiB", "220.5MiB"][i]} / 15.5GiB`).join("\n")}
      </Pre>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Code label="docker run" lines={RL_CTS.map((c, i) => `docker run -d --name ${c.name}${lims[i] > 0 ? ` --cpus=${fmtCpus(lims[i])}` : ""} ${c.name}:1.0`)} marks={Object.fromEntries(lims.map((l, i) => [i, l > 0 ? (now[i].throttled ? "rose" : "sky") : null]).filter(([, v]) => v))} />
        <Code
          label="compose.yaml"
          lang="yaml"
          lines={["services:", ...RL_CTS.flatMap((c, i) => [`  ${c.name}:`, `    image: ${c.name}:1.0`, ...(lims[i] > 0 ? ["    deploy:", "      resources:", "        limits:", `          cpus: "${fmtCpus(lims[i])}"`] : [])])]}
        />
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
        docker stats shows 100% per core, so 150% means 1.5 cores. Throttling is not the same as waiting for a busy host: with no limit a container is never throttled, it just shares the cores (equally here, since every cpu.weight is the default 100; --cpu-shares changes that).
      </div>
    </div>
  );
}

export function ResourceLimits({ params = {} }) {
  const prm = obj(params);
  const [part, setPart] = useState(() => oneOf(prm.part ?? prm.view, ["memory", "cpu"], "memory", { mem: "memory", ram: "memory", oom: "memory", cpus: "cpu", processor: "cpu" }));
  const mem = clamp(Math.round(num(prm.memoryMb ?? prm.memory, 256) / 32) * 32, 64, 1024);
  const cpus = clamp(Math.round(num(prm.cpus, 1) * 4) / 4, 0.25, 4);
  return (
    <Card
      title="Resource limits: --memory and --cpus"
      params={params}
      caption="Memory: start the leaky worker and watch it hit --memory; the kernel's OOM killer ends it with exit code 137 and OOMKilled=true, and --restart on-failure brings it back (only to die again). CPU: run the simulation and move the --cpus sliders: a limit below what a container wants shows up as throttling within every 100 ms CFS period, while too little host CPU just means sharing."
    >
      <Choice label="part" options={[["memory", "Memory: --memory & OOM"], ["cpu", "CPU: --cpus & CFS quota"]]} value={part} onChange={setPart} />
      <div className="mt-3">{part === "memory" ? <MemoryPart limit0={mem} /> : <CpuPart cpus0={cpus} />}</div>
    </Card>
  );
}

export const WIDGETS_I = {
  "port-mapping": PortMapping,
  "docker-network": DockerNetwork,
  "volume-mounts": VolumeMounts,
  "compose-startup": ComposeStartup,
  "resource-limits": ResourceLimits,
};
