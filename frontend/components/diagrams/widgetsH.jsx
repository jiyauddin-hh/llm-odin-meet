"use client";

// Interactive Docker teaching widgets (set H). Each widget is rendered from a
// ```diagram fenced block in a lesson and receives optional JSON `params`.
// Everything is plain React + inline SVG. Nothing touches the network or a real
// Docker daemon: the engine, registry, builds and containers are simulated in
// memory, IDs and names come from a seeded PRNG and the clock is fixed, so
// server and client renders match. Animations only start on the client.

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
  return "h" + useId().replace(/[^a-zA-Z0-9]/g, "");
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
      {options.map(([k, lab]) => {
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
            {lab}
          </button>
        );
      })}
    </div>
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

/** Monospace panel for commands and program output (wraps instead of scrolling the page). */
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

const MARK = {
  brand: "border-brand-400 bg-brand-500/15",
  rose: "border-rose-400 bg-rose-500/15",
  amber: "border-amber-400 bg-amber-500/10",
  emerald: "border-emerald-400 bg-emerald-500/10",
  sky: "border-sky-400 bg-sky-500/10",
  dim: "border-transparent opacity-40",
  amberDim: "border-amber-400/40 bg-amber-500/[0.04]",
  emeraldDim: "border-emerald-400/40 bg-emerald-500/[0.04]",
};

/* ---------- tiny Dockerfile / shell highlighter ---------- */

const DF_INSTR = new Set("FROM RUN COPY ADD WORKDIR ENV ARG EXPOSE CMD ENTRYPOINT USER LABEL VOLUME HEALTHCHECK SHELL STOPSIGNAL ONBUILD".split(" "));
const DF_TOK = /(^\s*#.*$)|("(?:\\.|[^"\\])*")|(--[a-z][\w-]*(?:=[^\s]+)?)|(\bAS\b)|(\$\{?\w+\}?)|(\b[A-Z]+\b)/g;

/** One line of a Dockerfile → array of strings and coloured spans. */
function dfLine(line) {
  const out = [];
  const re = new RegExp(DF_TOK.source, "g");
  let last = 0, m, first = true;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const t = m[0];
    let cls = null;
    if (m[1]) cls = "italic text-slate-500";
    else if (m[2]) cls = "text-emerald-300";
    else if (m[3]) cls = "text-sky-300";
    else if (m[4]) cls = "text-fuchsia-300";
    else if (m[5]) cls = "text-amber-200";
    else if (m[6] && first && DF_INSTR.has(t)) cls = "font-semibold text-fuchsia-300";
    if (!m[1]) first = false;
    out.push(cls ? <span key={m.index} className={cls}>{t}</span> : t);
    last = m.index + t.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** A Dockerfile listing; `marks` maps a line index to a highlight tone, `badges` to a small right-hand note. */
function DockerfileView({ lines, marks = {}, badges = {}, label, className = "", numbered = true, onLine, lineLabel }) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-lg border border-ink-700 bg-ink-950 ${className}`}>
      {label && <div className="border-b border-ink-700 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>}
      <pre className="overflow-x-auto py-1.5 font-mono text-[11px] leading-[1.65] text-slate-300" style={NOLIG}>
        <div className="min-w-max">
          {lines.map((ln, i) => {
            const body = (
              <>
                {numbered && <span className="mr-2 inline-block w-4 select-none text-right text-slate-600">{i + 1}</span>}
                {ln ? dfLine(ln) : " "}
                {badges[i] && <span className={`ml-2 rounded px-1 py-px text-[9px] ${badges[i][1] || "bg-ink-800 text-slate-400"}`}>{badges[i][0]}</span>}
              </>
            );
            const cls = `block w-full whitespace-pre border-l-2 pl-2 pr-3 text-left transition-colors duration-300 ${MARK[marks[i]] || "border-transparent"}`;
            return onLine && ln && !ln.trim().startsWith("#") ? (
              <button key={i} type="button" className={`${cls} hover:bg-ink-800`} onClick={() => onLine(i)} aria-label={lineLabel ? lineLabel(i) : `line ${i + 1}`}>
                {body}
              </button>
            ) : (
              <div key={i} className={cls}>
                {body}
              </div>
            );
          })}
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

/** Deterministic hex string of length n from a seed. */
function hexId(seed, n = 64) {
  const r = mulberry32(seed);
  let s = "";
  for (let i = 0; i < n; i++) s += "0123456789abcdef"[Math.floor(r() * 16)];
  return s;
}

/** Docker-style human sizes (decimal units, like the CLI: 192MB, 4.27MB, 13.3kB). */
function hsize(bytes) {
  if (bytes < 1000) return `${Math.round(bytes)}B`;
  const u = ["kB", "MB", "GB", "TB"];
  let v = bytes / 1000, i = 0;
  while (v >= 1000 && i < u.length - 1) {
    v /= 1000;
    i++;
  }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${s.includes(".") ? s.replace(/\.?0+$/, "") : s}${u[i]}`;
}
const MB = 1e6;

/** Docker's "x seconds ago" (units.HumanDuration). */
function humanDur(sec) {
  const s = Math.max(0, Math.round(sec));
  if (s < 1) return "Less than a second";
  if (s === 1) return "1 second";
  if (s < 60) return `${s} seconds`;
  const m = Math.round(s / 60);
  if (m === 1) return "About a minute";
  if (m < 60) return `${m} minutes`;
  const h = Math.round(s / 3600);
  if (h === 1) return "About an hour";
  return `${h} hours`;
}

/** Pads columns like the CLI's tabwriter (3 spaces between columns). */
function table(rows) {
  const w = [];
  rows.forEach((r) => r.forEach((c, i) => (w[i] = Math.max(w[i] || 0, String(c).length))));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(w[i] + 3))).join("").trimEnd()).join("\n");
}

/** Play / pause / step / reset state for a step-through animation (dwell seconds per step, move seconds between). */
function useStepper(count, { dwell = 2.2, move = 0.6 } = {}) {
  const [playing, setPlaying] = useState(false);
  const force = useForce();
  const st = useRef({ at: 0, p: 0, moving: false, dwell: 0 });
  const last = count - 1;
  useLoop(playing || st.current.moving, (dt) => {
    const s = st.current;
    if (s.moving) {
      s.p += dt / move;
      if (s.p >= 1) {
        s.at = Math.min(last, s.at + 1);
        s.moving = false;
        s.p = 0;
        s.dwell = 0;
      }
    } else if (playing) {
      s.dwell += dt;
      if (s.at >= last) setPlaying(false);
      else if (s.dwell >= dwell) s.moving = true;
    }
    force();
  });
  const fresh = () => ({ at: 0, p: 0, moving: false, dwell: 0 });
  const S = st.current;
  if (S.at > last) S.at = Math.max(0, last);
  return {
    at: clamp(S.at, 0, Math.max(0, last)),
    p: S.moving ? ease(clamp(S.p, 0, 1)) : 0,
    moving: S.moving,
    playing,
    done: S.at >= last && !S.moving,
    reset() {
      st.current = fresh();
      setPlaying(false);
      force();
    },
    step(dir = 1) {
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
    },
    play() {
      if (playing) return setPlaying(false);
      if (st.current.at >= last) st.current = fresh();
      st.current.dwell = dwell - 0.4;
      setPlaying(true);
      force();
    },
    jump(i) {
      st.current = { ...fresh(), at: clamp(i, 0, last) };
      setPlaying(false);
      force();
    },
  };
}

/** Play/Back/Step/Reset buttons for a useStepper. */
function StepperControls({ sp, children }) {
  return (
    <Row>
      <Button primary onClick={sp.play}>{sp.playing ? "Pause" : sp.done ? "Replay" : "Play"}</Button>
      <Button onClick={() => sp.step(-1)} disabled={sp.at === 0 && !sp.moving} aria-label="Back one step">◀ Back</Button>
      <Button onClick={() => sp.step(1)} disabled={sp.done} aria-label="Step forward">Step ▶</Button>
      <Button onClick={sp.reset}>Reset</Button>
      {children}
    </Row>
  );
}

/* ---------- docker-architecture: what happens behind docker run / build / pull ---------- */

const DA_BOX = {
  client: { x: 18, y: 8, w: 138, h: 42, t: "Client", s: "docker CLI" },
  registry: { x: 184, y: 8, w: 146, h: 42, t: "Registry", s: "docker.io (Docker Hub)" },
  dockerd: { x: 12, y: 82, w: 150, h: 44, t: "dockerd", s: "Engine API · images · networks" },
  buildkit: { x: 178, y: 82, w: 150, h: 44, t: "BuildKit", s: "builder, inside dockerd" },
  containerd: { x: 12, y: 146, w: 150, h: 36, t: "containerd", s: "tasks · snapshots" },
  images: { x: 178, y: 146, w: 150, h: 36, t: "Local images", s: "" },
  shim: { x: 12, y: 202, w: 150, h: 34, t: "containerd-shim-runc-v2", s: "one per container" },
  runc: { x: 12, y: 256, w: 70, h: 34, t: "runc", s: "OCI runtime" },
  net: { x: 92, y: 256, w: 70, h: 34, t: "iptables", s: "docker-proxy" },
  container: { x: 178, y: 202, w: 150, h: 108, t: "Container", s: "" },
};
const DA_EDGES = [
  ["client", "dockerd"], ["dockerd", "registry"], ["dockerd", "buildkit"], ["buildkit", "registry"], ["dockerd", "containerd"], ["dockerd", "images"],
  ["buildkit", "images"], ["containerd", "shim"], ["shim", "runc"], ["runc", "container"], ["shim", "container"], ["net", "container"], ["images", "container"],
];
const DA_NAME = { client: "docker CLI", registry: "Registry", dockerd: "dockerd", buildkit: "BuildKit", containerd: "containerd", images: "Image store", shim: "containerd-shim", runc: "runc", net: "Networking", container: "Container" };

/** Point where the ray from the centre of box `b` towards (tx, ty) leaves the box. */
function daEdgePt(b, tx, ty) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const k = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * k, cy + dy * k];
}
function daSeg(a, b) {
  const A = DA_BOX[a], B = DA_BOX[b];
  const [p1x, p1y] = daEdgePt(A, B.x + B.w / 2, B.y + B.h / 2);
  const [p2x, p2y] = daEdgePt(B, A.x + A.w / 2, A.y + A.h / 2);
  return [p1x, p1y, p2x, p2y];
}

const DA_ID = "5c1f0e9a7b2d";
const DA_LAYERS = ["a2318d6c47ec", "095d327c79ae", "bbfaa25db775", "7bb6fb0cfb2b", "0723edc10c17", "24b3fdc4d1e3", "3122471704d5"];

const DA_STEPS = {
  run: [
    { act: ["client"], t: "The CLI parses the command", cmd: "$ docker run -d -p 8080:80 nginx", say: "The docker CLI is only a client. It parses the flags: the image reference nginx expands to docker.io/library/nginx:latest, -d means don't attach to the output, -p 8080:80 means publish container port 80/tcp on host port 8080. It builds a container config and sends it to the daemon through the Docker Engine API." },
    { act: ["client", "dockerd"], edge: ["client", "dockerd"], pkt: "POST", t: "A REST call over the Unix socket", cmd: 'POST /v1.47/containers/create\n{"Image":"nginx","ExposedPorts":{"80/tcp":{}},\n "HostConfig":{"PortBindings":{"80/tcp":[{"HostPort":"8080"}]}}}', say: "The CLI sends an HTTP request to dockerd over the Unix socket /var/run/docker.sock (DOCKER_HOST or a docker context can point it at a remote daemon over SSH or TLS instead). Anyone who can write to this socket can start privileged containers, so access to it is effectively root on the host." },
    { act: ["dockerd", "images"], edge: ["dockerd", "images"], pkt: "nginx?", tone: "rose", t: "Image not found locally", cmd: 'HTTP/1.1 404 Not Found\n{"message":"No such image: nginx:latest"}', out: ["Unable to find image 'nginx:latest' locally"], say: "dockerd looks up nginx:latest in its local image store. It isn't there, so the create call fails with 404 and the CLI prints “Unable to find image 'nginx:latest' locally”. It is docker run (the client) that reacts by asking for a pull and then retrying the create." },
    { act: ["client", "dockerd"], edge: ["client", "dockerd"], pkt: "pull", t: "The CLI asks the daemon to pull", cmd: "POST /v1.47/images/create?fromImage=nginx&tag=latest", say: "The pull itself is done by the daemon, not by the CLI. dockerd streams JSON progress messages back over the same connection and the CLI draws them as the familiar progress lines." },
    { act: ["dockerd", "registry"], edge: ["dockerd", "registry"], pkt: "manifest", t: "Resolve the tag: the manifest", cmd: "GET https://registry-1.docker.io/v2/library/nginx/manifests/latest\nAccept: application/vnd.oci.image.index.v1+json\nAuthorization: Bearer <anonymous token from auth.docker.io>", out: ["latest: Pulling from library/nginx"], say: "dockerd gets an anonymous pull token from auth.docker.io and asks the registry for the manifest of library/nginx:latest. The tag points to an image index with one manifest per platform, so dockerd picks linux/amd64 and fetches that manifest: the digest of the image config plus the list of compressed layer blobs." },
    { act: ["registry", "dockerd", "images"], edge: ["registry", "images"], pkt: "layers", t: "Download and unpack the layers", cmd: "GET /v2/library/nginx/blobs/sha256:a2318d6c47ec…   (7 layers, 3 at a time)", out: [...DA_LAYERS.map((l) => `${l}: Pull complete`), "Digest: sha256:28402db69fec7c17e179ea87882667f1e054391138f77ffaf0c3eb388efc3ffb", "Status: Downloaded newer image for nginx:latest"], img: true, say: "Layers download in parallel (3 at a time by default). Each one is checked against its sha256 digest, decompressed and unpacked into its own overlay2 directory under /var/lib/docker. Layers you already have, for example shared with another image, are skipped (“Already exists”). Finally the tag nginx:latest is pointed at the new image." },
    { act: ["client", "dockerd", "container"], edge: ["client", "dockerd"], pkt: "create", t: "Create the container", cmd: `POST /v1.47/containers/create          → 201 {"Id":"${DA_ID}…"}\nPOST /v1.47/containers/${DA_ID}…/start → 204 No Content`, created: true, say: "The CLI retries the create. dockerd records the container's configuration, prepares its root filesystem (the read-only image layers as overlay lowerdirs plus a new, empty writable layer on top), gives it a random name (eager_turing) and an IP on the default bridge network (172.17.0.2 on docker0), and returns the ID. The CLI then calls start." },
    { act: ["dockerd", "containerd"], edge: ["dockerd", "containerd"], pkt: "gRPC", t: "dockerd hands off to containerd", cmd: `gRPC containerd.services.tasks.v1.Tasks/Create\n  namespace: moby\n  bundle: /run/containerd/io.containerd.runtime.v2.task/moby/${DA_ID}…`, created: true, say: "dockerd doesn't run processes itself. It turns the container into an OCI runtime spec (config.json: root filesystem, command, environment, mounts, namespaces, cgroup limits, capabilities, seccomp profile) and asks containerd, over gRPC on /run/containerd/containerd.sock, to create and start a task." },
    { act: ["containerd", "shim"], edge: ["containerd", "shim"], pkt: "spawn", t: "One shim per container", cmd: `containerd-shim-runc-v2 -namespace moby -id ${DA_ID}… \\\n  -address /run/containerd/containerd.sock`, created: true, say: "containerd starts a containerd-shim-runc-v2 process for this container. The shim becomes the container's parent: it holds its stdin/stdout/stderr, reaps it and reports its exit code. Because of the shim, containerd and dockerd can restart (with live-restore enabled) without killing running containers." },
    { act: ["shim", "runc", "container"], edge: ["shim", "runc"], pkt: "create", t: "runc: namespaces and cgroups", cmd: `runc create --bundle <bundle> ${DA_ID}…\n# namespaces: pid net mnt uts ipc (+cgroup)\n# cgroup: /sys/fs/cgroup/system.slice/docker-${DA_ID}….scope`, created: true, ns: true, say: "The shim calls runc, the OCI runtime. runc creates new Linux namespaces: pid (its own process tree), net (its own interfaces), mnt (its own mounts, with pivot_root into the overlay root filesystem), uts (its own hostname) and ipc. A user namespace is only used with userns-remap or rootless Docker: by default root in the container is root on the host, limited by dropped capabilities and seccomp. A cgroup (v2) enforces --memory, --cpus and --pids-limit." },
    { act: ["runc", "container"], edge: ["runc", "container"], pkt: "exec", t: "The process starts and runc exits", cmd: `runc start ${DA_ID}…\n# on the host: containerd-shim-runc-v2 ─┬─ nginx: master process\n#                                      └─ nginx: worker process`, created: true, ns: true, proc: true, say: "runc execs the image's ENTRYPOINT + CMD (/docker-entrypoint.sh nginx -g 'daemon off;') as PID 1 inside the namespaces, and then runc itself exits. The container is now an ordinary Linux process on the host (ps on the host shows it) whose parent is the shim." },
    { act: ["dockerd", "net", "container"], edge: ["net", "container"], pkt: ":8080", t: "Publish the port", cmd: "iptables -t nat -A DOCKER ! -i docker0 -p tcp --dport 8080 \\\n  -j DNAT --to-destination 172.17.0.2:80\ndocker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8080 \\\n  -container-ip 172.17.0.2 -container-port 80", created: true, ns: true, proc: true, port: true, say: "For -p 8080:80 dockerd adds iptables NAT rules that rewrite traffic for host port 8080 to 172.17.0.2:80, and starts a docker-proxy process on port 8080 for the cases NAT can't handle (such as connections to localhost). A published port listens on every host interface by default: use -p 127.0.0.1:8080:80 to keep it local." },
    { act: ["client"], edge: ["dockerd", "client"], pkt: "Id", tone: "emerald", t: "Detached: print the ID and exit", cmd: `$ docker ps\nCONTAINER ID   IMAGE   COMMAND                  STATUS         PORTS                  NAMES\n${DA_ID}   nginx   "/docker-entrypoint.…"   Up 2 seconds   0.0.0.0:8080->80/tcp   eager_turing`, out: [`${DA_ID}8c4a0b6e1d93f27a5c08b4e6d1f2a9370c5e8b1d64f2a7c3e90d`], created: true, ns: true, proc: true, port: true, say: "With -d the CLI does not attach to the container's output: it prints the full container ID and exits, while the container keeps running under its shim. curl http://localhost:8080 now reaches nginx." },
  ],
  build: [
    { act: ["client"], t: "The CLI starts a BuildKit build", cmd: "$ docker build -t myapp:1.0 .", say: "Since Docker Engine 23, docker build means docker buildx build, which uses BuildKit, the builder built into dockerd. The final argument (.) is the build context: the directory whose files COPY can see, filtered by .dockerignore. -t names the result." },
    { act: ["client", "dockerd", "buildkit"], edge: ["client", "dockerd"], pkt: "session", t: "Open a build session", cmd: "POST /v1.47/session          (connection upgraded to gRPC)\nPOST /v1.47/build?t=myapp:1.0&version=2", out: ["[+] Building 4.2s (10/10) FINISHED                docker:default", " => [internal] load build definition from Dockerfile   0.0s", " => [internal] load .dockerignore                      0.0s"], say: "The CLI opens a session with BuildKit through the Engine API (the HTTP connection is upgraded to gRPC). BuildKit then pulls what it needs from the client over that session: first the Dockerfile and .dockerignore, later the files that COPY needs." },
    { act: ["buildkit", "registry"], edge: ["buildkit", "registry"], pkt: "FROM", t: "Resolve the base image", cmd: "GET /v2/library/python/manifests/3.12-slim", out: [" => [internal] load metadata for docker.io/library/python:3.12-slim   0.6s", " => [1/5] FROM docker.io/library/python:3.12-slim@sha256:…        0.0s"], say: "The Dockerfile frontend parses the file into BuildKit's build graph (LLB). FROM python:3.12-slim is resolved to an exact digest at the registry; its layers are only downloaded if they aren't in the local cache yet." },
    { act: ["client", "dockerd", "buildkit"], edge: ["client", "dockerd"], pkt: "context", t: "Transfer the build context", cmd: "# .dockerignore\n.git\n.venv\n__pycache__\n.env", out: [" => [internal] load build context                      0.1s", " => => transferring context: 48.21kB                   0.0s"], say: "COPY needs files, so BuildKit requests them from the CLI over the session, and only the ones the build uses; unchanged files are not sent again on the next build. Because of .dockerignore, .git, virtualenvs and secrets such as .env never leave your machine." },
    { act: ["buildkit", "runc", "container"], edge: ["buildkit", "images"], pkt: "cache?", t: "Run each step, cache first", cmd: "Dockerfile:\n  WORKDIR /app\n  COPY requirements.txt .\n  RUN pip install --no-cache-dir -r requirements.txt\n  COPY . .\n  CMD [\"python\", \"app.py\"]", out: [" => CACHED [2/5] WORKDIR /app                          0.0s", " => CACHED [3/5] COPY requirements.txt .               0.0s", " => CACHED [4/5] RUN pip install --no-cache-dir -r …  0.0s", " => [5/5] COPY . .                                     0.1s"], build: true, say: "For each instruction BuildKit computes a cache key from the instruction text and its inputs (for COPY, a checksum of the copied files). If the cache has a matching result it is reused (CACHED). Otherwise the step runs: RUN executes in a temporary container (BuildKit runs runc too) and its filesystem changes become a new layer. Here only app.py changed, so only the last COPY ran." },
    { act: ["buildkit", "images"], edge: ["buildkit", "images"], pkt: "layers", tone: "emerald", t: "Export and tag the image", cmd: "image = layers (filesystem diffs) + config (ENV, EXPOSE, CMD, …)", out: [" => exporting to image                                 0.1s", " => => exporting layers                                0.0s", " => => writing image sha256:7d3e5a9f0c21…             0.0s", " => => naming to docker.io/library/myapp:1.0           0.0s"], img: true, say: "The layers plus an image config (ENV, EXPOSE, CMD and friends are metadata in the config, not layers) make up the image. BuildKit writes it to the local image store and tags it myapp:1.0. Nothing is uploaded: add --push, or run docker push, to send it to a registry." },
    { act: ["client"], edge: ["dockerd", "client"], pkt: "done", tone: "emerald", t: "Done", cmd: "$ docker images myapp\nREPOSITORY   TAG   IMAGE ID       CREATED          SIZE\nmyapp        1.0   7d3e5a9f0c21   10 seconds ago   146MB", img: true, say: "docker images now lists myapp:1.0, ready for docker run -p 8000:8000 myapp:1.0. Building again with unchanged inputs takes a fraction of a second because every step is CACHED." },
  ],
  pull: [
    { act: ["client"], t: "Normalise the image reference", cmd: "$ docker pull nginx", say: "nginx is short for docker.io/library/nginx:latest: the default registry (Docker Hub), the library/ namespace used for official images, and the default tag latest. Pin a version (nginx:1.27) or a digest (nginx@sha256:…) when you need reproducible deployments." },
    { act: ["client", "dockerd"], edge: ["client", "dockerd"], pkt: "pull", t: "Ask the daemon to pull", cmd: "POST /v1.47/images/create?fromImage=nginx&tag=latest", out: ["Using default tag: latest"], say: "Pulls are done by dockerd. The CLI only sends the request over /var/run/docker.sock and renders the stream of JSON progress messages that comes back." },
    { act: ["dockerd", "registry"], edge: ["dockerd", "registry"], pkt: "manifest", t: "Fetch the manifest", cmd: "GET https://registry-1.docker.io/v2/library/nginx/manifests/latest\nAccept: application/vnd.oci.image.index.v1+json", out: ["latest: Pulling from library/nginx"], say: "After getting an anonymous token (Docker Hub rate-limits anonymous pulls; docker login raises the limit), dockerd fetches the manifest. latest points to an index of per-platform manifests; dockerd selects linux/amd64 (or linux/arm64 on an ARM machine), which lists the config blob and the layers by digest." },
    { act: ["registry", "dockerd", "images"], edge: ["registry", "images"], pkt: "layers", t: "Download only missing layers", cmd: "GET /v2/library/nginx/blobs/sha256:<digest>   (missing layers only)", out: [`${DA_LAYERS[0]}: Already exists`, ...DA_LAYERS.slice(1).map((l) => `${l}: Pull complete`)], say: "Layers are content-addressed, so a layer that is already present (here the Debian base, shared with another image) is not downloaded again. The others are fetched in parallel, verified against their sha256 digests and unpacked into overlay2 directories." },
    { act: ["images"], edge: ["dockerd", "images"], pkt: "tag", tone: "emerald", t: "Store and tag", cmd: "$ docker images --digests nginx\nREPOSITORY   TAG      DIGEST                    IMAGE ID       SIZE\nnginx        latest   sha256:28402db69fec7c…    3b25b682ea82   192MB", out: ["Digest: sha256:28402db69fec7c17e179ea87882667f1e054391138f77ffaf0c3eb388efc3ffb", "Status: Downloaded newer image for nginx:latest", "docker.io/library/nginx:latest"], img: true, say: "The tag nginx:latest now points at this image locally. Tags are mutable: next week latest may point to a newer image, and only a new docker pull updates your local copy. The digest never changes, which is why production manifests often pin it." },
  ],
};

export function DockerArchitecture({ params = {} }) {
  const prm = obj(params);
  const [cmd, setCmd] = useState(() => oneOf(prm.command, ["run", "build", "pull"], "run", { "docker run": "run", "docker build": "build", "docker pull": "pull", start: "run", buildx: "build" }));
  const steps = DA_STEPS[cmd];
  const sp = useStepper(steps.length, { dwell: 3.2, move: 0.7 });
  const id = useSvgId();
  const at = sp.at;
  const cur = steps[at];
  const nxt = steps[Math.min(steps.length - 1, at + 1)];
  const pick = (k) => {
    setCmd(k);
    sp.reset();
  };

  // cumulative facts so far (for the boxes' contents)
  const seen = steps.slice(0, at + 1);
  const has = (f) => seen.some((s) => s[f]);
  const out = seen.flatMap((s) => s.out || []);
  const imgLabel = cmd === "build" ? (has("img") ? "python:3.12-slim · myapp:1.0" : "python:3.12-slim") : has("img") ? "nginx:latest" : "(no nginx image)";

  // the packet travels along the next step's edge while moving, and sits at the end of the current edge otherwise
  let pkt = null;
  const travel = sp.moving ? nxt : cur;
  if (travel.edge) {
    const [x1, y1, x2, y2] = daSeg(travel.edge[0], travel.edge[1]);
    const t = sp.moving ? sp.p : 1;
    pkt = { x: lerp(x1, x2, t), y: lerp(y1, y2, t), label: travel.pkt, tone: travel.tone };
  }
  const active = new Set(sp.moving ? [] : cur.act);
  const edgeOn = (a, b) => !sp.moving && cur.edge && ((cur.edge[0] === a && cur.edge[1] === b) || (cur.edge[0] === b && cur.edge[1] === a));
  const pktCol = pkt?.tone === "rose" ? C.rose : pkt?.tone === "emerald" ? C.emerald : C.sky;
  const ct = DA_BOX.container;
  const nsOn = has("ns"), procOn = has("proc"), created = has("created"), portOn = has("port");
  const building = cmd === "build" && at === 4 && !sp.moving;
  const outRef = useRef(null);
  useEffect(() => {
    const el = outRef.current;
    if (el) el.scrollTop = el.scrollHeight; // newest output in view (scrolls the panel only)
  }, [out.length, cmd]);

  return (
    <Card
      title={`What happens when you type docker ${cmd}`}
      params={params}
      caption="Press Play, or Step through one stage at a time. The highlighted boxes are the components doing the work, the dot is the request or data moving between them, and the panel below shows the API call or command at that moment. Switch between run, build and pull: the CLI never does the work itself, it always asks dockerd, which delegates to containerd, the shim and runc (or BuildKit for builds)."
    >
      <Choice label="Docker command" options={[["run", "docker run"], ["build", "docker build"], ["pull", "docker pull"]]} value={cmd} onChange={pick} mono />
      <svg viewBox="0 0 340 338" className="mt-3 h-auto w-full select-none" role="img" aria-label={`Docker architecture, step ${at + 1} of ${steps.length}: ${cur.t}`}>
        <defs>
          <filter id={`${id}g`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <rect x="4" y="62" width="332" height="272" rx="10" fill={C.ink950} stroke={C.ink600} strokeDasharray="5 3" />
        <text x="326" y="327" textAnchor="end" fontSize="8" fill={C.dim}>Docker host (Linux) · /var/lib/docker</text>
        {DA_EDGES.map(([a, b]) => {
          const [x1, y1, x2, y2] = daSeg(a, b);
          const on = edgeOn(a, b);
          return <line key={a + b} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? pktCol : C.axis} strokeWidth={on ? 1.6 : 1} strokeDasharray={on ? undefined : "3 3"} opacity={on ? 0.9 : 0.55} />;
        })}
        {/* the socket the CLI talks to */}
        <rect x="37" y="55" width="100" height="14" rx="7" fill={C.ink800} stroke={edgeOn("client", "dockerd") ? C.sky : C.ink600} />
        <text x="87" y="64.5" textAnchor="middle" fontSize="7" fill={C.text} fontFamily={MONO}>/var/run/docker.sock</text>
        <text x="257" y="65" textAnchor="middle" fontSize="7" fill={C.dim}>HTTPS</text>
        {Object.entries(DA_BOX).map(([k, b]) => {
          const on = active.has(k);
          const dimmed = (k === "buildkit" && cmd !== "build") || (cmd === "pull" && ["containerd", "shim", "runc", "net", "container", "buildkit"].includes(k)) || (cmd === "build" && ["containerd", "shim", "net"].includes(k));
          const tone = on && cur.tone === "rose" && k !== "dockerd" ? C.rose : C.sky;
          return (
            <g key={k} opacity={dimmed && !on ? 0.35 : 1} style={{ transition: "opacity 0.3s" }}>
              {on && <rect x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} rx="9" fill={tone} opacity="0.25" filter={`url(#${id}g)`} />}
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="7" fill={on ? "#0c2a3d" : C.ink800} stroke={on ? tone : C.ink600} strokeWidth={on ? 1.6 : 1} style={{ transition: "stroke 0.3s, fill 0.3s" }} />
              {k !== "container" && (
                <>
                  <text x={b.x + b.w / 2} y={b.y + (b.s || k === "images" ? b.h / 2 - 1 : b.h / 2 + 3)} textAnchor="middle" fontSize={b.w < 100 ? 8.5 : 9.5} fontWeight="600" fill="#e2e8f0" fontFamily={k === "client" || k === "registry" || k === "images" ? undefined : MONO}>{b.t}</text>
                  <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 10} textAnchor="middle" fontSize="7.2" fill={k === "images" && has("img") ? C.emerald : C.dim} fontFamily={k === "images" ? MONO : undefined}>{k === "images" ? imgLabel : b.s}</text>
                </>
              )}
            </g>
          );
        })}
        {/* container contents */}
        <g>
          <text x={ct.x + 8} y={ct.y + 14} fontSize="9.5" fontWeight="600" fill="#e2e8f0">{cmd === "build" ? "Build step container" : "Container"}</text>
          <text x={ct.x + ct.w - 8} y={ct.y + 14} textAnchor="end" fontSize="7.5" fill={procOn ? C.emerald : created ? C.amber : C.dim} fontFamily={MONO}>
            {cmd === "build" ? (building ? "RUN …" : "temporary") : procOn ? "running" : created ? "created" : "—"}
          </text>
          {["pid", "net", "mnt", "uts", "ipc", "user"].map((n, i) => {
            const on = (nsOn || building) && n !== "user";
            return (
              <g key={n}>
                <rect x={ct.x + 5 + i * 23.5} y={ct.y + 22} width="21" height="13" rx="3" fill={on ? "#0f2f2a" : C.ink900} stroke={on ? C.teal : C.ink600} strokeDasharray={n === "user" ? "2 2" : undefined} />
                <text x={ct.x + 15.5 + i * 23.5} y={ct.y + 31.5} textAnchor="middle" fontSize="6.8" fill={on ? C.teal : C.dim} fontFamily={MONO}>{n}</text>
              </g>
            );
          })}
          <text x={ct.x + 8} y={ct.y + 47} fontSize="6.8" fill={C.dim}>namespaces{nsOn || building ? " (user ns only if userns-remap)" : ""}</text>
          <rect x={ct.x + 5} y={ct.y + 52} width={ct.w - 10} height="13" rx="3" fill={nsOn || building ? "#2a2410" : C.ink900} stroke={nsOn || building ? C.amber : C.ink600} />
          <text x={ct.x + ct.w / 2} y={ct.y + 61.5} textAnchor="middle" fontSize="7" fill={nsOn || building ? C.amber : C.dim} fontFamily={MONO}>cgroup v2 · cpu · memory · pids</text>
          <text x={ct.x + 8} y={ct.y + 78} fontSize="7.5" fill={procOn ? C.emerald : C.dim} fontFamily={MONO}>{cmd === "build" ? (building ? "PID 1  pip install …" : "PID 1  (per RUN step)") : procOn ? "PID 1  nginx: master process" : "PID 1  (not started)"}</text>
          <text x={ct.x + 8} y={ct.y + 91} fontSize="7" fill={created || building ? C.text : C.dim} fontFamily={MONO}>rootfs: overlay (image + rw)</text>
          <text x={ct.x + 8} y={ct.y + 102} fontSize="7" fill={portOn ? C.sky : C.dim} fontFamily={MONO}>{cmd === "build" ? "no ports, no name" : created ? `eth0 172.17.0.2${portOn ? " · :80 ← :8080" : ""}` : "no network yet"}</text>
        </g>
        {portOn && cmd === "run" && (
          <text x="87" y="304" textAnchor="middle" fontSize="7.2" fill={C.sky} fontFamily={MONO}>host :8080 → 172.17.0.2:80</text>
        )}
        {pkt && pkt.label && (
          <g transform={`translate(${pkt.x} ${pkt.y})`}>
            <rect x={-Math.max(15, pkt.label.length * 2.6 + 6)} y="-6.5" width={Math.max(30, pkt.label.length * 5.2 + 12)} height="13" rx="6.5" fill={pktCol} stroke={C.ink950} strokeWidth="1.5" />
            <text y="2.6" textAnchor="middle" fontSize="7" fontWeight="700" fill={C.ink950} fontFamily={MONO}>{pkt.label}</text>
          </g>
        )}
      </svg>
      <div className="mt-2 min-h-[96px] rounded-lg bg-ink-800 px-3 py-2" aria-live="polite">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">
          Step {at + 1} / {steps.length} · <span className={cur.tone === "rose" ? "text-rose-300" : cur.tone === "emerald" ? "text-emerald-300" : "text-sky-300"}>{cur.act.map((a) => DA_NAME[a]).join(" → ")}</span>
        </div>
        <div className="mt-0.5 text-xs font-semibold text-white">{cur.t}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-slate-300">{cur.say}</div>
      </div>
      <StepperControls sp={sp} />
      <div className="mt-3 grid gap-2">
        <div className="min-w-0">
          <Label className="mb-1">command / API call at this step</Label>
          <pre style={NOLIG} className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[10.5px] leading-relaxed text-sky-200">{cur.cmd}</pre>
        </div>
        <div className="min-w-0">
          <Label className="mb-1">terminal output so far</Label>
          <pre ref={outRef} style={NOLIG} className="max-h-48 min-h-[2.5rem] overflow-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-300">
            <span className="text-emerald-300">$ </span>
            {DA_STEPS[cmd][0].cmd.replace(/^\$ /, "")}
            {out.length > 0 ? "\n" + out.join("\n") : ""}
          </pre>
        </div>
      </div>
    </Card>
  );
}

/* ---------- container-lifecycle: states, commands, exit codes and restart policies ---------- */

const CL_NODE = {
  created: [52, 62],
  running: [170, 62],
  paused: [288, 62],
  removed: [52, 180],
  exited: [170, 180],
  restarting: [288, 180],
};
// p0 → p1, optionally curved through control point c; label at l
const CL_ARROW = {
  "none>created": { p0: [52, 20], p1: [52, 46], l: [60, 36, "create", "start"] },
  "created>running": { p0: [95, 62], p1: [126, 62], l: [110, 56, "start", "middle"] },
  "running>paused": { p0: [213, 57], p1: [244, 57], l: [229, 51, "pause", "middle"] },
  "paused>running": { p0: [244, 68], p1: [213, 68], l: [229, 78, "unpause", "middle"] },
  "running>exited": { p0: [162, 78], p1: [162, 163], l: [156, 112, "stop · kill", "end"], l2: [156, 123, "exit 0/1", "end"] },
  "exited>running": { p0: [178, 163], p1: [178, 78], l: [184, 118, "start", "start"], l2: [184, 129, "restart", "start"] },
  "running>restarting": { p0: [204, 78], c: [220, 150], p1: [245, 176], l: [226, 160, "exit + policy", "end"] },
  "restarting>running": { p0: [272, 164], c: [262, 98], p1: [214, 72], l: [268, 112, "after backoff", "start"] },
  "restarting>exited": { p0: [245, 187], p1: [214, 187], l: [230, 199, "stop", "middle"] },
  "created>removed": { p0: [52, 78], p1: [52, 163], l: [46, 121, "rm", "end"] },
  "exited>removed": { p0: [126, 180], p1: [96, 180], l: [111, 174, "rm", "middle"] },
  "running>removed": { p0: [130, 78], p1: [90, 164], l: [62, 140, "rm -f", "start"] },
};
const CL_LABEL = { created: "created", running: "running", paused: "paused", removed: "removed", exited: "exited", restarting: "restarting" };
const CL_TONE = { created: C.amber, running: C.emerald, paused: C.sky, exited: C.dim, restarting: C.orange, removed: C.rose };
const CL_POLICIES = ["no", "on-failure", "always", "unless-stopped"];

function clPt(a, t) {
  if (!a.c) return [lerp(a.p0[0], a.p1[0], t), lerp(a.p0[1], a.p1[1], t)];
  const u = 1 - t;
  return [u * u * a.p0[0] + 2 * u * t * a.c[0] + t * t * a.p1[0], u * u * a.p0[1] + 2 * u * t * a.c[1] + t * t * a.p1[1]];
}
const clPath = (a) => (a.c ? `M${a.p0[0]},${a.p0[1]} Q${a.c[0]},${a.c[1]} ${a.p1[0]},${a.p1[1]}` : `M${a.p0[0]},${a.p0[1]} L${a.p1[0]},${a.p1[1]}`);

function clInit(policy) {
  return { st: "none", shown: "none", id: "", n: 0, exit: null, manual: false, restarts: 0, backoff: 0, clock: 0, started: 0, finished: 0, policy, log: [], k: 0, q: [], anim: null, busy: null };
}

export function ContainerLifecycle({ params = {} }) {
  const prm = obj(params);
  const initPolicy = oneOf(prm.restart, CL_POLICIES, "no", { none: "no", false: "no", "on failure": "on-failure", onfailure: "on-failure", unlessstopped: "unless-stopped", "unless stopped": "unless-stopped" });
  const [policy, setPolicy] = useState(initPolicy);
  const [sigterm, setSigterm] = useState(true);
  const sim = useRef(null);
  if (!sim.current) sim.current = clInit(initPolicy);
  const s = sim.current;
  const force = useForce();
  const logRef = useRef(null);
  const id = useSvgId();

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight; // keep the newest line in view (scrolls the log only, not the page)
  }, [s.log.length, s.k]);

  useLoop(!!(s.anim || s.q.length || s.busy), (dt) => {
    const m = sim.current;
    if (!m.anim && m.q.length) m.anim = { key: m.q.shift(), p: 0 };
    if (m.anim) {
      m.anim.p += dt / 0.45;
      if (m.anim.p >= 1) {
        m.shown = m.anim.key.split(">")[1];
        m.anim = null;
      }
    }
    if (m.busy && !m.anim && !m.q.length) {
      m.busy.t += dt;
      if (m.busy.t >= m.busy.dur) {
        const done = m.busy.done;
        m.busy = null;
        done();
      }
    }
    force();
  });

  const NAME = "web";
  const full = () => s.id;
  const exists = () => s.st !== "none" && s.st !== "removed";
  const ERR = "Error response from daemon: ";
  const log = (c, o = [], tone) => {
    s.k += 1;
    s.log = [...s.log, { c, o: Array.isArray(o) ? o : [o], tone, k: s.k }].slice(-40);
  };
  const out = (lines, tone) => {
    // append output to the last log entry
    const last = s.log[s.log.length - 1];
    if (last) {
      s.log = [...s.log.slice(0, -1), { ...last, o: [...last.o, ...(Array.isArray(lines) ? lines : [lines])], tone: tone || last.tone }];
      s.k += 1;
    }
  };
  const go = (from, to) => {
    if (from !== to) s.q.push(`${from}>${to}`);
    s.st = to;
  };
  const tick = (sec = 2) => (s.clock += sec);
  const noSuch = () => `${ERR}No such container: ${NAME}`;

  /** The restart manager: called when the main process exits on its own (never after a manual stop). */
  const afterExit = (code) => {
    s.exit = code;
    s.finished = s.clock;
    const p = s.policy;
    const should = p === "always" || p === "unless-stopped" || (p === "on-failure" && code !== 0);
    go("running", should ? "restarting" : "exited");
    if (!should) {
      out(`# restart policy "${p}": ${p === "on-failure" ? "exit code 0 is a success, so no restart" : "the container stays exited"}`);
      return;
    }
    // backoff: 100 ms, doubled for each consecutive restart, reset once the container ran for 10 s
    s.backoff = s.clock - s.started >= 10 || !s.backoff ? 100 : Math.min(60000, s.backoff * 2);
    out(`# restart policy "${p}": restarting in ${s.backoff >= 1000 ? s.backoff / 1000 + " s" : s.backoff + " ms"}`, "amber");
    s.busy = {
      label: `restarting (backoff ${s.backoff >= 1000 ? s.backoff / 1000 + " s" : s.backoff + " ms"})`, t: 0, dur: 1.1, done: () => {
        if (s.st !== "restarting") return;
        s.restarts += 1;
        s.started = tick(1);
        go("restarting", "running");
        log("# dockerd restarted the container", [`RestartCount is now ${s.restarts}`], "amber");
      },
    };
  };

  /** Graceful stop: SIGTERM, then SIGKILL after the 10 s timeout. `then(code)` runs once the process is gone. */
  const stopProc = (then, why = "docker stop") => {
    if (s.st === "paused") go("paused", "running"); // the daemon resumes the task so the signal can be delivered
    if (sigterm) {
      s.busy = { label: `${why}: SIGTERM sent, the app shuts down cleanly`, t: 0, dur: 0.7, done: () => then(0) };
    } else {
      s.busy = {
        label: `${why}: SIGTERM ignored, waiting for the 10 s timeout…`, t: 0, dur: 2.4, done: () => {
          tick(10);
          then(137);
        },
      };
    }
  };

  const cmd = (k) => {
    if (s.busy) return;
    tick();
    const st = s.st;
    const c = `docker ${k} ${NAME}`;
    switch (k) {
      case "create": {
        const line = `docker create --name ${NAME}${s.policy !== "no" ? ` --restart ${s.policy}` : ""} myapp:1.0`;
        if (exists()) {
          log(line, `${ERR}Conflict. The container name "/${NAME}" is already in use by container "${full()}". You have to remove (or rename) that container to be able to reuse that name.`, "rose");
          break;
        }
        s.n += 1;
        s.id = hexId(4242 + s.n * 977);
        s.exit = null;
        s.manual = false;
        s.restarts = 0;
        s.backoff = 0;
        s.created = s.clock;
        s.shown = "none";
        go("none", "created");
        log(line, full());
        break;
      }
      case "start":
        if (!exists()) log(c, [noSuch(), `Error: failed to start containers: ${NAME}`], "rose");
        else if (st === "paused") log(c, [`${ERR}cannot start a paused container, try unpause instead`, `Error: failed to start containers: ${NAME}`], "rose");
        else {
          if (st === "created" || st === "exited") {
            go(st, "running");
            s.started = s.clock;
            s.manual = false;
          }
          log(c, NAME);
        }
        break;
      case "stop":
        if (!exists()) log(c, noSuch(), "rose");
        else if (st === "created" || st === "exited") log(c, [NAME, "# already stopped: nothing to do"]);
        else if (st === "restarting") {
          s.manual = true;
          go("restarting", "exited");
          log(c, [NAME, "# the pending restart is cancelled"]);
        } else {
          log(c, []);
          s.manual = true;
          stopProc((code) => {
            s.exit = code;
            s.finished = s.clock;
            go("running", "exited");
            out([NAME, `# exit code ${code}${code === 137 ? " = 128 + 9 (SIGKILL)" : ": the app handled SIGTERM"} · manual stop, so no restart`]);
          });
        }
        break;
      case "kill":
        if (!exists()) log(c, noSuch(), "rose");
        else if (st === "created" || st === "exited") log(c, `${ERR}cannot kill container: ${NAME}: container ${full()} is not running`, "rose");
        else {
          s.manual = true;
          if (st === "paused") go("paused", "running");
          if (st === "restarting") go("restarting", "exited");
          else go("running", "exited");
          s.exit = st === "restarting" ? s.exit : 137;
          s.finished = s.clock;
          log(c, [NAME, st === "restarting" ? "# the pending restart is cancelled" : "# SIGKILL: exit code 137 = 128 + 9, no chance to clean up · no restart"]);
        }
        break;
      case "pause":
        if (!exists()) log(c, noSuch(), "rose");
        else if (st === "paused") log(c, `${ERR}container ${full()} is already paused`, "rose");
        else if (st === "restarting") log(c, `${ERR}container ${full()} is restarting, wait until the container is running`, "rose");
        else if (st !== "running") log(c, `${ERR}container ${full()} is not running`, "rose");
        else {
          go("running", "paused");
          log(c, [NAME, "# cgroup freezer: every process is suspended, memory is kept"]);
        }
        break;
      case "unpause":
        if (!exists()) log(c, noSuch(), "rose");
        else if (st !== "paused") log(c, `${ERR}container ${full()} is not paused`, "rose");
        else {
          go("paused", "running");
          log(c, NAME);
        }
        break;
      case "restart":
        if (!exists()) log(c, [noSuch(), `Error: failed to restart containers: ${NAME}`], "rose");
        else if (st === "created" || st === "exited" || st === "restarting") {
          go(st, "running");
          s.started = s.clock;
          s.manual = false;
          log(c, NAME);
        } else {
          log(c, []);
          stopProc((code) => {
            s.exit = code;
            go("running", "exited");
            go("exited", "running");
            s.started = tick(1);
            s.manual = false;
            out([NAME, `# stopped (exit ${code}) and started again; RestartCount only counts policy restarts`]);
          }, "docker restart");
        }
        break;
      case "rm":
        if (!exists()) log(c, `${ERR}No such container: ${NAME}`, "rose");
        else if (st === "running") log(c, `${ERR}cannot remove container "/${NAME}": container is running: stop the container before removing or force remove`, "rose");
        else if (st === "paused") log(c, `${ERR}cannot remove container "/${NAME}": container is paused: unpause and then stop the container before attempting removal or force remove`, "rose");
        else if (st === "restarting") log(c, `${ERR}cannot remove container "/${NAME}": container is restarting: stop the container before removing or force remove`, "rose");
        else {
          go(st, "removed");
          log(c, [NAME, "# the writable layer is deleted with it"]);
        }
        break;
      case "rm -f":
        if (!exists()) log(`docker rm -f ${NAME}`, ["# no such container (with -f that is not an error)"]);
        else {
          if (st === "paused") go("paused", "running");
          if (st === "restarting") {
            go("restarting", "exited");
            go("exited", "removed");
          } else if (st === "running" || st === "paused") go("running", "removed");
          else go(st, "removed");
          log(`docker rm -f ${NAME}`, [NAME, st === "running" || st === "paused" ? "# SIGKILL, then remove" : "# removed"]);
        }
        break;
      default:
        break;
    }
    force();
  };

  const event = (k) => {
    if (s.busy) return;
    tick();
    if (k === "crash" || k === "exit0") {
      const code = k === "crash" ? 1 : 0;
      log(`# the main process ${code ? "crashes" : "finishes its work"} and exits with code ${code}`, [], code ? "rose" : undefined);
      afterExit(code);
    } else if (k === "daemon") {
      log("sudo systemctl restart docker", ["# dockerd shuts down (no live-restore), then starts again"], "amber");
      const wasUp = s.st === "running" || s.st === "paused" || s.st === "restarting";
      const boot = () => {
        tick(3);
        const p = s.policy;
        if (s.st !== "exited") {
          out(s.st === "created" ? "# created but never started: stays created" : "# no container");
          force();
          return;
        }
        const restart = p === "always" || (p === "unless-stopped" && !s.manual) || (p === "on-failure" && !s.manual && s.exit !== 0);
        const why =
          p === "no" ? 'policy "no": stays exited'
            : p === "always" ? `policy "always": started again${s.manual ? " even though it was stopped by hand" : ""}`
              : p === "unless-stopped" ? (s.manual ? 'policy "unless-stopped": it was stopped by hand, so it stays exited' : 'policy "unless-stopped": started again')
                : restart ? `policy "on-failure": last exit code ${s.exit} is a failure, started again` : `policy "on-failure": ${s.manual ? "it was stopped by hand" : `last exit code ${s.exit} is a success`}, stays exited`;
        if (restart) {
          go("exited", "running");
          s.started = s.clock;
          s.manual = false;
        }
        out(`# dockerd is back: ${why}`, restart ? "amber" : undefined);
        force();
      };
      if (wasUp) {
        if (s.st === "restarting") {
          go("restarting", "exited");
          boot();
        } else {
          stopProc((code) => {
            s.exit = code;
            s.finished = s.clock;
            go("running", "exited");
            out(`# dockerd stopped the container on shutdown: exit ${code} (not a manual stop)`);
            boot();
          }, "dockerd shutdown");
        }
      } else boot();
    }
    force();
  };

  const changePolicy = (p) => {
    if (s.busy) return;
    setPolicy(p);
    s.policy = p;
    if (exists()) {
      log(`docker update --restart ${p} ${NAME}`, NAME);
      force();
    }
  };
  const reset = () => {
    sim.current = clInit(policy);
    force();
  };

  // --- derived view ---
  const st = s.st;
  const shownNode = s.anim ? null : s.shown;
  const statusText =
    st === "created" ? "Created"
      : st === "running" ? `Up ${humanDur(s.clock - s.started)}`
        : st === "paused" ? `Up ${humanDur(s.clock - s.started)} (Paused)`
          : st === "exited" ? `Exited (${s.exit ?? 0}) ${humanDur(s.clock - s.finished)} ago`
            : st === "restarting" ? `Restarting (${s.exit}) Less than a second ago` : "";
  const psRows = [["CONTAINER ID", "IMAGE", "COMMAND", "CREATED", "STATUS", "PORTS", "NAMES"]];
  if (exists()) psRows.push([s.id.slice(0, 12), "myapp:1.0", '"node server.js"', `${humanDur(s.clock - s.created)} ago`, statusText, st === "running" ? "3000/tcp" : "", NAME]);
  const anyBusy = !!(s.busy || s.anim || s.q.length);
  const canEvent = st === "running" && !anyBusy;
  let dot = null;
  if (s.anim) {
    const a = CL_ARROW[s.anim.key];
    if (a) dot = clPt(a, ease(clamp(s.anim.p, 0, 1)));
  }

  const btn = "rounded-md border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-[11px] text-slate-200 transition-colors hover:bg-ink-700 disabled:opacity-40";

  return (
    <Card
      title="A container's life: states, exit codes and restart policies"
      params={params}
      caption="Start with docker create, then start, pause, stop, kill or remove it and watch the state machine and the CLI output. Try rm on a running container, stop with “app handles SIGTERM” off (10 s grace period, then SIGKILL: exit 137), and a crash under each restart policy. Then stop it by hand and restart the daemon: always brings it back, unless-stopped does not."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-500">--restart</span>
        <Choice label="Restart policy" options={CL_POLICIES.map((p) => [p, p])} value={policy} onChange={changePolicy} mono />
      </div>
      <svg viewBox="0 0 340 212" className="mt-3 h-auto w-full select-none" role="img" aria-label={`Container state machine, current state: ${st === "none" ? "no container" : st}`}>
        <defs>
          <Arrow id={`${id}a`} color={C.axis} />
          <Arrow id={`${id}b`} color={C.sky} />
          <filter id={`${id}g`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <circle cx="52" cy="14" r="5" fill={st === "none" || st === "removed" ? C.brandL : C.ink600} />
        <text x="62" y="17" fontSize="7.5" fill={C.dim}>myapp:1.0 image</text>
        {Object.entries(CL_ARROW).map(([k, a]) => {
          const on = s.anim && s.anim.key === k;
          return (
            <g key={k}>
              <path d={clPath(a)} fill="none" stroke={on ? C.sky : C.axis} strokeWidth={on ? 1.6 : 1} markerEnd={`url(#${id}${on ? "b" : "a"})`} />
              <text x={a.l[0]} y={a.l[1]} textAnchor={a.l[3]} fontSize="7.5" fill={on ? C.sky : C.text} fontFamily={MONO}>{a.l[2]}</text>
              {a.l2 && <text x={a.l2[0]} y={a.l2[1]} textAnchor={a.l2[3]} fontSize="7.5" fill={on ? C.sky : C.text} fontFamily={MONO}>{a.l2[2]}</text>}
            </g>
          );
        })}
        {Object.entries(CL_NODE).map(([k, [x, y]]) => {
          const on = shownNode === k;
          const col = CL_TONE[k];
          return (
            <g key={k}>
              {on && <rect x={x - 44} y={y - 17} width="88" height="34" rx="9" fill={col} opacity="0.3" filter={`url(#${id}g)`} />}
              <rect x={x - 42} y={y - 15} width="84" height="30" rx="8" fill={on ? C.ink700 : C.ink800} stroke={on ? col : C.ink600} strokeWidth={on ? 1.8 : 1} style={{ transition: "stroke 0.3s" }} />
              <text x={x} y={y + (on && (k === "exited" || k === "restarting") && s.exit !== null ? 0 : 3.5)} textAnchor="middle" fontSize="10" fontWeight="600" fill={on ? "#f1f5f9" : C.text} fontFamily={MONO}>{CL_LABEL[k]}</text>
              {on && (k === "exited" || k === "restarting") && s.exit !== null && (
                <text x={x} y={y + 10} textAnchor="middle" fontSize="7.5" fill={s.exit ? C.rose : C.emerald} fontFamily={MONO}>exit {s.exit}</text>
              )}
            </g>
          );
        })}
        {dot && <circle cx={dot[0]} cy={dot[1]} r="4.5" fill={C.sky} stroke={C.ink950} strokeWidth="1.5" />}
      </svg>
      <div className="mt-1 h-5">
        {s.busy && (
          <div className="relative h-5 overflow-hidden rounded bg-ink-800" aria-live="polite">
            <div className="absolute inset-y-0 left-0 bg-amber-500/25" style={{ width: `${clamp(s.busy.t / s.busy.dur, 0, 1) * 100}%` }} />
            <div className="relative px-2 text-[10.5px] leading-5 text-amber-200">{s.busy.label}</div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Stat label="state" value={st === "none" ? "—" : st} color={st === "none" ? "text-slate-500" : ""} />
        <Stat label="last exit code" value={s.exit ?? "—"} color={s.exit ? "text-rose-300" : s.exit === 0 ? "text-emerald-300" : "text-slate-500"} />
        <Stat label="RestartCount" value={s.restarts} />
        <Stat label="stopped by hand" value={exists() ? (s.manual ? "yes" : "no") : "—"} color={s.manual ? "text-amber-300" : "text-slate-400"} />
      </div>
      <div className="mt-3">
        <Label className="mb-1">commands</Label>
        <div className="flex flex-wrap gap-1.5">
          {["create", "start", "stop", "kill", "pause", "unpause", "restart", "rm", "rm -f"].map((k) => (
            <button key={k} type="button" className={btn} disabled={anyBusy} onClick={() => cmd(k)}>docker {k}</button>
          ))}
        </div>
        <Label className="mb-1 mt-2">events</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={`${btn} border-rose-500/40 text-rose-200`} disabled={!canEvent} onClick={() => event("crash")}>process crashes (exit 1)</button>
          <button type="button" className={btn} disabled={!canEvent} onClick={() => event("exit0")}>process exits normally (exit 0)</button>
          <button type="button" className={`${btn} border-amber-500/40 text-amber-200`} disabled={anyBusy} onClick={() => event("daemon")}>daemon restarts</button>
        </div>
        <Row className="mt-2">
          <Toggle label="app handles SIGTERM" on={sigterm} onChange={setSigterm} />
          <Button className="ml-auto" onClick={reset}>Reset</Button>
        </Row>
      </div>
      <Label className="mb-1 mt-3">terminal</Label>
      <div ref={logRef} className="h-48 overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[10.5px] leading-relaxed" style={NOLIG} aria-live="polite">
        {s.log.length === 0 && <div className="text-slate-500">No container yet: click docker create, then docker start.</div>}
        {s.log.map((e) => (
          <div key={e.k} className="mb-1">
            {e.c.startsWith("#") ? <div className={e.tone === "rose" ? "text-rose-300" : "text-amber-300"}>{e.c}</div> : (
              <div className="whitespace-pre-wrap break-words text-slate-100"><span className="text-emerald-400">$ </span>{e.c}</div>
            )}
            {e.o.map((o, i) => (
              <div key={i} className={`whitespace-pre-wrap break-words ${o.startsWith("#") ? (e.tone === "amber" ? "text-amber-300/90" : "text-slate-500") : o.startsWith("Error") ? "text-rose-300" : "text-slate-300"}`}>{o}</div>
            ))}
          </div>
        ))}
      </div>
      <Label className="mb-1 mt-2">$ docker ps -a</Label>
      <pre style={NOLIG} className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[10px] leading-relaxed text-slate-300">
        {table(psRows)}
        {psRows.length === 1 ? "\n" : ""}
      </pre>
    </Card>
  );
}

/* ---------- docker-terminal: a mock Docker CLI with simulated images, containers, volumes and networks ---------- */

const DT_PATH = "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const DT_OS = {
  debian: 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian',
  alpine: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.3\nPRETTY_NAME="Alpine Linux v3.20"',
  ubuntu: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nVERSION_CODENAME=noble\nID=ubuntu',
};
const DT_ROOT = {
  debian: ["bin", "boot", "dev", "etc", "home", "lib", "lib64", "media", "mnt", "opt", "proc", "root", "run", "sbin", "srv", "sys", "tmp", "usr", "var"],
  alpine: ["bin", "dev", "etc", "home", "lib", "media", "mnt", "opt", "proc", "root", "run", "sbin", "srv", "sys", "tmp", "usr", "var"],
  busybox: ["bin", "dev", "etc", "home", "lib", "lib64", "proc", "root", "sys", "tmp", "usr", "var"],
  scratch: ["dev", "etc", "hello", "proc", "sys"],
};
const DT_TS = "2026/10/28 09:00:0"; // nginx log timestamp prefix (fixed clock)
const DT_NGINX_START = [
  "/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration",
  "/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/",
  "/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh",
  "10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf",
  "/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh",
  "/docker-entrypoint.sh: Configuration complete; ready for start up",
  `${DT_TS}5 [notice] 1#1: using the "epoll" event method`,
  `${DT_TS}5 [notice] 1#1: nginx/1.27.2`,
  `${DT_TS}5 [notice] 1#1: start worker processes`,
];
const DT_PG_NOPASS = [
  "Error: Database is uninitialized and superuser password is not specified.",
  "       You must specify POSTGRES_PASSWORD to a non-empty value for the",
  '       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".',
  "",
  '       You may also use "POSTGRES_HOST_AUTH_METHOD=trust" to allow all',
  "       connections without a password. This is *not* recommended.",
];
const dtPgStart = (v, init) => [
  ...(init
    ? ['The files belonging to this database system will be owned by user "postgres".', "…", "PostgreSQL init process complete; ready for start up.", ""]
    : ["", "PostgreSQL Database directory appears to contain a database; Skipping initialization", ""]),
  `2026-10-28 09:00:06.412 UTC [1] LOG:  starting PostgreSQL ${v} on x86_64-pc-linux-gnu`,
  '2026-10-28 09:00:06.413 UTC [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432',
  '2026-10-28 09:00:06.419 UTC [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"',
  "2026-10-28 09:00:06.431 UTC [1] LOG:  database system is ready to accept connections",
];
const DT_HELLO = [
  "",
  "Hello from Docker!",
  "This message shows that your installation appears to be working correctly.",
  "",
  "To generate this message, Docker took the following steps:",
  " 1. The Docker client contacted the Docker daemon.",
  ' 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.',
  "    (amd64)",
  " 3. The Docker daemon created a new container from that image which runs the",
  "    executable that produces the output you are currently reading.",
  " 4. The Docker daemon streamed that output to the Docker client, which sent it",
  "    to your terminal.",
  "",
];

// The images this mock registry knows about.
const DT_CAT = {
  "nginx:latest": { size: 191.99e6, layers: 7, base: "debian", os: "debian", created: "2 weeks ago", ep: ["/docker-entrypoint.sh"], cmd: ["nginx", "-g", "daemon off;"], kind: "server", ports: ["80/tcp"], env: ["NGINX_VERSION=1.27.2", "NJS_VERSION=0.8.6", "PKG_RELEASE=1~bookworm"], rw: 1093, shells: ["sh", "bash"], extraRoot: ["docker-entrypoint.d", "docker-entrypoint.sh"], stopsig: "SIGQUIT" },
  "nginx:alpine": { size: 47.97e6, layers: 8, base: "alpine", os: "alpine", created: "2 weeks ago", ep: ["/docker-entrypoint.sh"], cmd: ["nginx", "-g", "daemon off;"], kind: "server", ports: ["80/tcp"], env: ["NGINX_VERSION=1.27.2", "PKG_RELEASE=1"], rw: 1093, shells: ["sh"], extraRoot: ["docker-entrypoint.d", "docker-entrypoint.sh"], stopsig: "SIGQUIT" },
  "postgres:16": { size: 432.6e6, layers: 14, base: "debian", os: "debian", created: "3 weeks ago", ep: ["docker-entrypoint.sh"], cmd: ["postgres"], kind: "server", ports: ["5432/tcp"], env: ["GOSU_VERSION=1.17", "LANG=en_US.utf8", "PG_MAJOR=16", "PG_VERSION=16.4-1.pgdg120+2", "PGDATA=/var/lib/postgresql/data"], volume: "/var/lib/postgresql/data", rw: 63, shells: ["sh", "bash"], extraRoot: ["docker-entrypoint-initdb.d"], pg: "16.4 (Debian 16.4-1.pgdg120+2)" },
  "postgres:latest": { size: 435.2e6, layers: 14, base: "debian", os: "debian", created: "3 weeks ago", ep: ["docker-entrypoint.sh"], cmd: ["postgres"], kind: "server", ports: ["5432/tcp"], env: ["GOSU_VERSION=1.17", "LANG=en_US.utf8", "PG_MAJOR=17", "PG_VERSION=17.0-1.pgdg120+1", "PGDATA=/var/lib/postgresql/data"], volume: "/var/lib/postgresql/data", rw: 63, shells: ["sh", "bash"], extraRoot: ["docker-entrypoint-initdb.d"], pg: "17.0 (Debian 17.0-1.pgdg120+1)" },
  "redis:latest": { size: 117.4e6, layers: 8, base: "debian", os: "debian", created: "4 weeks ago", ep: ["docker-entrypoint.sh"], cmd: ["redis-server"], kind: "server", ports: ["6379/tcp"], env: ["GOSU_VERSION=1.17", "REDIS_VERSION=7.4.1"], volume: "/data", workdir: "/data", rw: 0, shells: ["sh", "bash"] },
  "alpine:latest": { size: 7.8e6, layers: 1, base: "alpine", os: "alpine", created: "6 weeks ago", ep: null, cmd: ["/bin/sh"], kind: "shell", ports: [], env: [], rw: 0, shells: ["sh", "ash"] },
  "ubuntu:latest": { size: 78.12e6, layers: 1, base: "ubuntu", os: "ubuntu", created: "5 weeks ago", ep: null, cmd: ["/bin/bash"], kind: "shell", ports: [], env: [], rw: 0, shells: ["sh", "bash"] },
  "busybox:latest": { size: 4.27e6, layers: 1, base: "busybox", os: "busybox", created: "16 months ago", ep: null, cmd: ["sh"], kind: "shell", ports: [], env: [], rw: 0, shells: ["sh"] },
  "hello-world:latest": { size: 13.3e3, layers: 1, base: "hello", os: "scratch", created: "18 months ago", ep: null, cmd: ["/hello"], kind: "hello", ports: [], env: [], rw: 0, shells: [] },
  "node:20": { size: 1.1e9, layers: 8, base: "debian", os: "debian", created: "4 weeks ago", ep: ["docker-entrypoint.sh"], cmd: ["node"], kind: "repl", ports: [], env: ["NODE_VERSION=20.18.0", "YARN_VERSION=1.22.22"], rw: 0, shells: ["sh", "bash"] },
  "node:20-alpine": { size: 135.4e6, layers: 5, base: "alpine", os: "alpine", created: "4 weeks ago", ep: ["docker-entrypoint.sh"], cmd: ["node"], kind: "repl", ports: [], env: ["NODE_VERSION=20.18.0", "YARN_VERSION=1.22.22"], rw: 0, shells: ["sh"] },
  "python:3.12": { size: 1.02e9, layers: 8, base: "debian", os: "debian", created: "5 weeks ago", ep: null, cmd: ["python3"], kind: "repl", ports: [], env: ["LANG=C.UTF-8", "PYTHON_VERSION=3.12.7"], rw: 0, shells: ["sh", "bash"] },
  "python:3.12-slim": { size: 124.3e6, layers: 4, base: "debian", os: "debian", created: "5 weeks ago", ep: null, cmd: ["python3"], kind: "repl", ports: [], env: ["LANG=C.UTF-8", "PYTHON_VERSION=3.12.7"], rw: 0, shells: ["sh", "bash"] },
};
const DT_ALIAS = { "nginx:1.27": "nginx:latest", "nginx:stable": "nginx:latest", "postgres:17": "postgres:latest", "redis:7": "redis:latest", "alpine:3.20": "alpine:latest", "ubuntu:24.04": "ubuntu:latest", "ubuntu:noble": "ubuntu:latest", "node:20-bookworm": "node:20", "node:lts": "node:20", "python:3.12-bookworm": "python:3.12" };

const DT_ADJ = "admiring adoring affectionate agitated amazing angry awesome blissful bold brave busy charming clever compassionate competent confident cool cranky dazzling determined distracted dreamy eager ecstatic elastic elated elegant eloquent epic exciting fervent festive flamboyant focused friendly frosty funny gallant gifted goofy gracious happy hardcore heuristic hopeful hungry infallible inspiring intelligent interesting jolly jovial keen kind laughing loving lucid magical modest musing mystifying nervous nice nifty nostalgic objective optimistic peaceful pensive practical priceless quirky quizzical recursing relaxed reverent romantic serene sharp silly sleepy stoic strange suspicious sweet tender thirsty trusting unruffled upbeat vibrant vigilant vigorous wizardly wonderful xenodochial youthful zealous zen".split(" ");
const DT_SUR = "turing hopper lovelace babbage curie darwin einstein feynman galileo hawking knuth lamport liskov mccarthy newton noether pike ritchie shannon thompson torvalds wozniak yonath wing tesla sammet goldberg hamilton johnson kepler bohr dijkstra archimedes bardeen cerf diffie engelbart fermi hellman kalam lalande nash payne ramanujan raman saha bose bhabha chandrasekhar".split(" ");

/** FNV-1a hash of a string (seeds the deterministic IDs). */
function strHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Shell-like tokenizer: spaces split, quotes group, backslash escapes. */
function dtTokens(line) {
  const out = [];
  let cur = "", q = null, any = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === q) q = null;
      else if (ch === "\\" && q === '"' && i + 1 < line.length) cur += line[++i];
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      any = true;
    } else if (ch === "\\" && i + 1 < line.length) {
      cur += line[++i];
      any = true;
    } else if (/\s/.test(ch)) {
      if (cur || any) out.push(cur);
      cur = "";
      any = false;
    } else cur += ch;
  }
  if (cur || any) out.push(cur);
  return out;
}

/** "nginx", "nginx:1.27", "docker.io/library/nginx:latest" → { ref: "nginx:latest", repo, tag, key: catalog key or null }. */
function dtRef(s) {
  let r = String(s).replace(/^docker\.io\//, "").replace(/^library\//, "");
  const at = r.indexOf("@");
  if (at >= 0) r = r.slice(0, at);
  const ci = r.lastIndexOf(":");
  const repo = ci > r.lastIndexOf("/") && ci > 0 ? r.slice(0, ci) : r;
  const tag = ci > r.lastIndexOf("/") && ci > 0 ? r.slice(ci + 1) : "latest";
  const ref = `${repo}:${tag}`;
  const key = DT_CAT[ref] ? ref : DT_ALIAS[ref] || null;
  return { ref, repo, tag, key, given: s, hadTag: ci > r.lastIndexOf("/") && ci > 0 };
}
const dtRepoKnown = (repo) => Object.keys(DT_CAT).some((k) => k.startsWith(repo + ":"));

function dtEllipsis(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function dtNewId(m) {
  m.seq += 1;
  return hexId(9001 + m.seq * 7919);
}
function dtName(m) {
  for (let k = 0; k < 50; k++) {
    m.seq += 1;
    const r = mulberry32(m.seq * 131 + 7);
    const a = DT_ADJ[Math.floor(r() * DT_ADJ.length)], b = DT_SUR[Math.floor(r() * DT_SUR.length)];
    const n = `${a}_${b}`;
    if (n !== "boring_wozniak" && !m.conts.some((c) => c.name === n)) return n;
  }
  return `container_${m.seq}`;
}
function dtClock(sec) {
  const t = 9 * 3600 + sec;
  const p = (n) => String(n).padStart(2, "0");
  return `2026-10-28T${p(Math.floor(t / 3600) % 24)}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`;
}

function dtImage(m, key) {
  return m.images.find((i) => i.key === key);
}
function dtAddImage(m, key) {
  const cat = DT_CAT[key];
  const [repo, tag] = key.split(":");
  const im = { key, repo, tag, cat, id: hexId(strHash(key)), digest: hexId(strHash(key) ^ 0x5bd1e995) };
  m.images.push(im);
  return im;
}
function dtLayerIds(key) {
  const cat = DT_CAT[key];
  return Array.from({ length: cat.layers }, (_, i) => hexId(i === 0 ? strHash("base:" + cat.base) : strHash(key) + i * 101, 12));
}
/** Pull lines; `quiet` = used by docker run (no trailing reference line). */
function dtPullLines(m, key, tag, quiet) {
  const L = [];
  const cat = DT_CAT[key];
  const repo = key.split(":")[0];
  const have = new Set(m.images.flatMap((i) => (i.cat.base === cat.base ? [dtLayerIds(i.key)[0]] : [])));
  L.push(`${tag}: Pulling from library/${repo}`);
  dtLayerIds(key).forEach((l) => L.push(`${l}: ${have.has(l) ? "Already exists" : "Pull complete"}`));
  const im = dtAddImage(m, key);
  L.push(`Digest: sha256:${im.digest}`);
  L.push(`Status: Downloaded newer image for ${repo}:${tag}`);
  if (!quiet) L.push(`docker.io/library/${repo}:${tag}`);
  return L;
}

function dtFindC(m, q) {
  if (!q) return null;
  return m.conts.find((c) => c.name === q) || m.conts.find((c) => q.length >= 1 && c.id.startsWith(q)) || null;
}
function dtPortsStr(c) {
  if (c.state !== "running") return "";
  if (c.net === "host" || c.net === "none") return "";
  const pub = c.ports.map((p) => (p.ip === "0.0.0.0" ? `0.0.0.0:${p.host}->${p.cont}/${p.proto}, :::${p.host}->${p.cont}/${p.proto}` : `${p.ip}:${p.host}->${p.cont}/${p.proto}`));
  const exp = c.cat.ports.filter((e) => !c.ports.some((p) => `${p.cont}/${p.proto}` === e));
  return [...exp, ...pub].join(", ");
}
function dtStatus(m, c) {
  if (c.state === "running") return `Up ${humanDur(m.now - c.started)}`;
  if (c.state === "created") return "Created";
  return `Exited (${c.exit}) ${humanDur(m.now - c.finished)} ago`;
}

/* ---- commands that run *inside* a container (exec, run <cmd>, interactive shells) ---- */

function dtEnv(c, extra = []) {
  const pathLine = c.key.startsWith("postgres") ? `${DT_PATH}:/usr/lib/postgresql/${c.key === "postgres:16" ? 16 : 17}/bin` : DT_PATH;
  return [pathLine, `HOSTNAME=${c.hostname}`, ...c.cat.env, ...c.env, ...extra, "HOME=/root"];
}
/** Runs a canned command in container c. Returns { out: [...], code, notFound }. */
function dtInside(m, c, argv, extraEnv = []) {
  const [cmd, ...args] = argv;
  const os = c.cat.os;
  const bb = os === "alpine" || os === "busybox";
  const files = { "/etc/hostname": c.hostname, "/etc/os-release": DT_OS[os] };
  if (c.key.startsWith("nginx")) files["/usr/share/nginx/html/index.html"] = "<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n…\n<h1>Welcome to nginx!</h1>\n…\n</html>";
  const has = (bin) => (os === "scratch" ? bin === "/hello" : true);
  if (!has(cmd)) return { notFound: true, out: [], code: 127 };
  switch (cmd) {
    case "/hello":
      return c.key.startsWith("hello") ? { out: DT_HELLO, code: 0 } : { notFound: true, out: [], code: 127 };
    case "echo":
      return { out: [args.join(" ")], code: 0 };
    case "hostname":
      return { out: [c.hostname], code: 0 };
    case "whoami":
      return { out: [os === "scratch" ? "" : "root"], code: 0 };
    case "id":
      return { out: ["uid=0(root) gid=0(root) groups=0(root)"], code: 0 };
    case "pwd":
      return { out: [c.cwd || c.cat.workdir || "/"], code: 0 };
    case "env":
    case "printenv":
      return { out: dtEnv(c, extraEnv), code: 0 };
    case "uname":
      return { out: [args.includes("-a") ? `Linux ${c.hostname} 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024 x86_64${bb ? " Linux" : " GNU/Linux"}` : "Linux"], code: 0 };
    case "date":
      return { out: [`Wed Oct 28 ${dtClock(m.now).slice(11)} UTC 2026`], code: 0 };
    case "sleep":
      return { out: [], code: 0, long: args[0] === "infinity" || num(args[0], 0) >= 30 };
    case "tail":
      return args.includes("-f") ? { out: [], code: 0, long: true } : { out: [], code: 0 };
    case "cat": {
      if (!args.length) return { out: [], code: 0 };
      const outL = [];
      let code = 0;
      args.forEach((f) => {
        if (typeof files[f] === "string") outL.push(...String(files[f]).split("\n"));
        else {
          outL.push(bb ? `cat: can't open '${f}': No such file or directory` : `cat: ${f}: No such file or directory`);
          code = 1;
        }
      });
      if (os === "busybox" && args.includes("/etc/os-release")) return { out: ["cat: can't open '/etc/os-release': No such file or directory"], code: 1 };
      return { out: outL, code };
    }
    case "ls": {
      const p = args.filter((a) => !a.startsWith("-"))[0] || c.cwd || c.cat.workdir || "/";
      const cols = (arr) => {
        const w = Math.max(...arr.map((x) => x.length)) + 2;
        const per = Math.max(1, Math.floor(80 / w));
        const rows = [];
        for (let i = 0; i < arr.length; i += per) rows.push(arr.slice(i, i + per).map((x) => x.padEnd(w)).join("").trimEnd());
        return rows;
      };
      if (p === "/") return { out: cols([...DT_ROOT[os === "ubuntu" ? "debian" : os], ...(c.cat.extraRoot || [])].sort()), code: 0 };
      if (p === "/usr/share/nginx/html" && c.key.startsWith("nginx")) return { out: ["50x.html  index.html"], code: 0 };
      if (p === "/var/lib/postgresql/data" && c.key.startsWith("postgres")) return { out: cols(["PG_VERSION", "base", "global", "pg_hba.conf", "pg_ident.conf", "pg_wal", "postgresql.conf", "postmaster.opts", "postmaster.pid"]), code: 0 };
      if (p === "/etc") return { out: cols(["hostname", "hosts", "os-release", "passwd", "group", "resolv.conf", ...(c.key.startsWith("nginx") ? ["nginx"] : [])]), code: 0 };
      if (p === "/data" || p === "/tmp" || p === "/home" || p === "/root" || p === "/mnt") return { out: [], code: 0 };
      const mnt = c.mounts.find((x) => x.dst === p);
      if (mnt) return { out: mnt.type === "bind" ? ["index.html"] : [], code: 0 };
      return { out: [bb ? `ls: ${p}: No such file or directory` : `ls: cannot access '${p}': No such file or directory`], code: bb ? 1 : 2 };
    }
    case "ps":
      if (!bb) return { notFound: true, out: [], code: 127 }; // procps isn't installed in the Debian-based images
      return {
        out: ["PID   USER     TIME  COMMAND", `    1 root      0:00 ${[...(c.ep || []), ...c.argv].join(" ")}`, ...(c.execShell ? [`    7 root      0:00 ${c.execShell}`] : []), `${String(c.execShell ? 13 : 7).padStart(5)} root      0:00 ps ${args.join(" ")}`.trimEnd()],
        code: 0,
      };
    case "nginx":
      if (!c.key.startsWith("nginx")) return { notFound: true, out: [], code: 127 };
      return args[0] === "-v" ? { out: ["nginx version: nginx/1.27.2"], code: 0 } : { out: [`nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address in use)`], code: 1 };
    case "redis-cli":
      if (!c.key.startsWith("redis")) return { notFound: true, out: [], code: 127 };
      return { out: [args[0] === "ping" || args[0] === "PING" ? "PONG" : "(simulated) try: redis-cli ping"], code: 0 };
    case "psql":
      if (!c.key.startsWith("postgres")) return { notFound: true, out: [], code: 127 };
      return { out: [" ?column? ", "----------", "        1", "(1 row)", "", "(simulated: psql always answers SELECT 1 here)"], code: 0 };
    case "sh": case "bash": case "ash": case "/bin/sh": case "/bin/bash": {
      const name = cmd.replace("/bin/", "");
      if (!c.cat.shells.includes(name)) return { notFound: true, out: [], code: 127 };
      const ci = args.indexOf("-c");
      if (ci >= 0 && args[ci + 1]) return dtInside(m, c, dtTokens(args[ci + 1]), extraEnv);
      return { out: [], code: 0, shell: name };
    }
    case "python3": case "python":
      if (!c.key.startsWith("python")) return { notFound: true, out: [], code: 127 };
      if (args[0] === "--version" || args[0] === "-V") return { out: ["Python 3.12.7"], code: 0 };
      return { out: [], code: 0, repl: "python" };
    case "node":
      if (!c.key.startsWith("node")) return { notFound: true, out: [], code: 127 };
      if (args[0] === "--version" || args[0] === "-v") return { out: ["v20.18.0"], code: 0 };
      return { out: [], code: 0, repl: "node" };
    case "nginx-debug": case "postgres": case "redis-server": case "docker-entrypoint.sh": case "/docker-entrypoint.sh":
      return { out: [], code: 0, server: true };
    default:
      return { notFound: true, out: [], code: 127 };
  }
}

/* ---- the engine ---- */

function dtInit(preset) {
  const m = { images: [], conts: [], vols: [], nets: [], now: 0, seq: 0, port: 32767, shell: null };
  m.nets.push({ name: "bridge", driver: "bridge", id: hexId(11), sub: 17, next: 2, builtin: true }, { name: "host", driver: "host", id: hexId(12), builtin: true }, { name: "none", driver: "null", id: hexId(13), builtin: true });
  if (preset === "web-app") {
    dtAddImage(m, "postgres:16");
    dtAddImage(m, "nginx:latest");
    m.nets.push({ name: "app-net", driver: "bridge", id: hexId(14), sub: 18, next: 2 });
    m.vols.push({ name: "pgdata", anon: false, pg: true, size: 47.3e6 });
    m.now = 0;
    dtCreate(m, { key: "postgres:16", image: "postgres:16", name: "db", env: ["POSTGRES_PASSWORD=secret"], mounts: [{ type: "volume", name: "pgdata", dst: "/var/lib/postgresql/data" }], net: "app-net", ports: [], argv: null });
    dtStart(m, dtFindC(m, "db"));
    m.now = 4;
    dtCreate(m, { key: "nginx:latest", image: "nginx", name: "web", env: [], mounts: [], net: "app-net", ports: [{ ip: "0.0.0.0", host: 8080, cont: 80, proto: "tcp" }], argv: null });
    dtStart(m, dtFindC(m, "web"));
    m.now = 312;
  }
  return m;
}

/** Creates a container record (no checks). */
function dtCreate(m, o) {
  const cat = DT_CAT[o.key];
  const id = dtNewId(m);
  const net = m.nets.find((n) => n.name === (o.net || "bridge"));
  const mounts = [...o.mounts];
  if (cat.volume && !mounts.some((x) => x.dst === cat.volume)) {
    // the image declares VOLUME: Docker creates an anonymous volume for it
    const name = dtNewId(m);
    m.vols.push({ name, anon: true, size: 0 });
    mounts.push({ type: "volume", name, dst: cat.volume, anon: true });
  }
  mounts.forEach((x) => {
    if (x.type === "volume" && !m.vols.some((v) => v.name === x.name)) m.vols.push({ name: x.name, anon: false, size: 0 });
  });
  let ip = "";
  if (net && net.sub) ip = `172.${net.sub}.0.${net.next++}`;
  const c = {
    id, name: o.name, key: o.key, cat, image: o.image, ep: cat.ep, argv: o.argv && o.argv.length ? o.argv : cat.cmd, userCmd: !!(o.argv && o.argv.length),
    env: o.env, mounts, net: net ? net.name : "bridge", ip, ports: o.ports, rm: !!o.rm, it: !!o.it, state: "created", exit: 0, created: m.now, started: 0, finished: 0,
    logs: [], hostname: o.hostname || id.slice(0, 12), restart: o.restart || "no", pid: 0,
  };
  m.conts.unshift(c);
  return c;
}

/** Starts c: decides what its process does. Returns { out, err } for the attached terminal. */
function dtStart(m, c) {
  const pg = c.key.startsWith("postgres");
  c.started = m.now;
  c.pid = 2100 + (strHash(c.id) % 900);
  const res = { out: [] };
  let lines = [], long = false, code = 0;
  if (c.userCmd) {
    const r = dtInside(m, c, c.argv);
    if (r.notFound) {
      c.state = "created";
      c.exit = 127;
      res.err = `failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: exec: "${c.argv[0]}": executable file not found in $PATH: unknown`;
      return res;
    }
    lines = r.out;
    code = r.code;
    long = !!(r.long || r.server || (r.shell && c.it) || (r.repl && c.it));
    if (r.shell) res.shell = r.shell;
    if (r.repl) res.repl = r.repl;
  } else if (c.cat.kind === "server") {
    if (pg) {
      const pass = c.env.some((e) => /^POSTGRES_PASSWORD=.+/.test(e) || /^POSTGRES_HOST_AUTH_METHOD=trust$/.test(e));
      const vol = m.vols.find((v) => c.mounts.some((x) => x.dst === c.cat.volume && x.name === v.name));
      if (vol && vol.pg) lines = dtPgStart(c.cat.pg, false), long = true;
      else if (!pass) lines = DT_PG_NOPASS, code = 1;
      else {
        lines = dtPgStart(c.cat.pg, true);
        long = true;
        if (vol) {
          vol.pg = true;
          vol.size = 47.3e6;
        }
      }
    } else if (c.key.startsWith("nginx")) lines = DT_NGINX_START, long = true;
    else lines = ["1:C 28 Oct 2026 09:00:06.120 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo", "1:C 28 Oct 2026 09:00:06.120 * Redis version=7.4.1, bits=64, commit=00000000, modified=0, pid=1, just started", "1:M 28 Oct 2026 09:00:06.121 * Running mode=standalone, port=6379.", "1:M 28 Oct 2026 09:00:06.122 * Server initialized", "1:M 28 Oct 2026 09:00:06.122 * Ready to accept connections tcp"], long = true;
  } else if (c.cat.kind === "hello") lines = DT_HELLO;
  else if (c.cat.kind === "shell") {
    if (c.it) res.shell = c.argv[0].replace("/bin/", ""), long = true;
  } else if (c.cat.kind === "repl" && c.it) {
    res.repl = c.key.startsWith("node") ? "node" : "python";
    long = true;
  }
  c.logs.push(...lines);
  res.out = lines;
  if (long) c.state = "running";
  else {
    c.state = "exited";
    c.exit = code;
    c.finished = m.now;
  }
  return res;
}

function dtStop(m, c, sig = "TERM") {
  if (c.state !== "running") return;
  if (c.key.startsWith("nginx")) c.logs.push(`${DT_TS}9 [notice] 1#1: signal ${sig === "KILL" ? "9 (SIGKILL)" : "3 (SIGQUIT)"} received${sig === "KILL" ? "" : ", shutting down"}`, ...(sig === "KILL" ? [] : [`${DT_TS}9 [notice] 1#1: exit`]));
  else if (c.key.startsWith("postgres") && sig !== "KILL") c.logs.push("2026-10-28 09:00:09.511 UTC [1] LOG:  received fast shutdown request", "2026-10-28 09:00:09.530 UTC [1] LOG:  database system is shut down");
  else if (c.key.startsWith("redis") && sig !== "KILL") c.logs.push("1:signal-handler (1793) Received SIGTERM scheduling shutdown...", "1:M 28 Oct 2026 09:00:09.611 # Redis is now ready to exit, bye bye...");
  c.state = "exited";
  // servers handle their stop signal → 0; a shell as PID 1 ignores SIGTERM → SIGKILL after 10 s → 137
  c.exit = sig === "KILL" ? 137 : c.cat.kind === "server" && !c.userCmd ? 0 : 137;
  c.finished = m.now;
  if (c.exit === 137 && sig !== "KILL") m.now += 10;
}

function dtRemove(m, c) {
  m.conts = m.conts.filter((x) => x !== c);
  c.mounts.forEach((x) => {
    if (x.anon && c.rm) m.vols = m.vols.filter((v) => v.name !== x.name); // --rm also removes anonymous volumes
  });
}

const DT_RUN_HELP = "See 'docker run --help'.";

/** docker run / docker create. Returns lines; may set m.shell. */
function dtRunCmd(m, args, createOnly) {
  const L = [];
  const E = (t) => L.push({ t, c: "err" });
  const sub = createOnly ? "create" : "run";
  const o = { d: false, i: false, t: false, rm: false, name: null, ports: [], env: [], vols: [], net: null, restart: "no", hostname: null };
  const longVal = { "--name": "name", "--publish": "p", "--env": "e", "--volume": "v", "--network": "net", "--net": "net", "--restart": "restart", "--hostname": "hostname", "--workdir": "w", "--user": "u", "--memory": "m", "--cpus": "cpus", "--entrypoint": "entrypoint", "--platform": "platform", "--env-file": "envfile", "--label": "label", "--pull": "pull" };
  const longBool = { "--detach": "d", "--interactive": "i", "--tty": "t", "--rm": "rm", "--privileged": "priv", "--init": "init", "--read-only": "ro" };
  const shortVal = { p: "p", e: "e", v: "v", w: "w", u: "u", h: "hostname", m: "m", l: "label" };
  const shortBool = { d: "d", i: "i", t: "t", P: "P", q: "q" };
  const set = (k, v) => {
    if (k === "p") o.ports.push(v);
    else if (k === "e") o.env.push(v);
    else if (k === "v") o.vols.push(v);
    else if (k === "name" || k === "net" || k === "restart" || k === "hostname") o[k] = v;
  };
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      i++;
      break;
    }
    if (!a.startsWith("-") || a === "-") break;
    if (a.startsWith("--")) {
      const [f, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, null];
      if (longBool[f]) o[longBool[f]] = true;
      else if (longVal[f]) {
        const v = inline ?? args[++i];
        if (v === undefined) return [{ t: `flag needs an argument: ${f}`, c: "err" }, { t: DT_RUN_HELP }];
        set(longVal[f], v);
      } else return [{ t: `unknown flag: ${f}`, c: "err" }, { t: DT_RUN_HELP }];
      continue;
    }
    const cl = a.slice(1);
    for (let j = 0; j < cl.length; j++) {
      const ch = cl[j];
      if (shortBool[ch]) o[shortBool[ch]] = true;
      else if (shortVal[ch]) {
        const rest = cl.slice(j + 1).replace(/^=/, "");
        const v = rest || args[++i];
        if (v === undefined) return [{ t: `flag needs an argument: '${ch}' in -${ch}`, c: "err" }, { t: DT_RUN_HELP }];
        set(shortVal[ch], v);
        break;
      } else return [{ t: `unknown shorthand flag: '${ch}' in -${cl}`, c: "err" }, { t: DT_RUN_HELP }];
    }
  }
  const imageArg = args[i];
  const argv = args.slice(i + 1);
  if (!imageArg) return [{ t: `docker: 'docker ${sub}' requires at least 1 argument.`, c: "err" }, { t: "" }, { t: `Usage:  docker ${sub} [OPTIONS] IMAGE [COMMAND] [ARG...]` }, { t: "" }, { t: `See 'docker ${sub} --help' for more information` }];
  if (o.rm && o.restart !== "no") return [{ t: "docker: Conflicting options: --restart and --rm.", c: "err" }, { t: DT_RUN_HELP }];
  if (o.name !== null && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(o.name)) return [{ t: `docker: Error response from daemon: Invalid container name (${o.name}), only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed.`, c: "err" }, { t: DT_RUN_HELP }];
  // ports
  const ports = [];
  for (const p of o.ports) {
    const mm = p.match(/^(?:(\d+\.\d+\.\d+\.\d+):)?(?:(\d+):)?(\d+)(?:\/(tcp|udp))?$/);
    if (!mm) return [{ t: `docker: invalid publish opts format (should be name=value but got '${p}')`, c: "err" }, { t: DT_RUN_HELP }];
    const host = mm[2] ? Number(mm[2]) : ++m.port; // no host port: Docker picks one from the ephemeral range
    ports.push({ ip: mm[1] || "0.0.0.0", host, cont: Number(mm[3]), proto: mm[4] || "tcp" });
  }
  // volumes
  const mounts = [];
  for (const v of o.vols) {
    const parts = v.split(":");
    if (parts.length === 1) {
      if (!parts[0].startsWith("/")) return [{ t: `docker: Error response from daemon: invalid volume specification: '${v}': invalid mount config for type "volume": invalid mount path: '${v}' mount path must be absolute.`, c: "err" }, { t: DT_RUN_HELP }];
      mounts.push({ type: "volume", name: null, dst: parts[0], anon: true });
      continue;
    }
    const [src, dst, mode] = parts;
    if (!dst || !dst.startsWith("/")) return [{ t: `docker: Error response from daemon: invalid volume specification: '${v}'.`, c: "err" }, { t: DT_RUN_HELP }];
    const bind = src.startsWith("/") || src.startsWith(".") || src.startsWith("~") || src.startsWith("$");
    mounts.push(bind ? { type: "bind", src, dst, ro: mode === "ro" } : { type: "volume", name: src, dst, ro: mode === "ro" });
  }
  const env = o.env.map((e) => (e.includes("=") ? e : `${e}=`));
  const ref = dtRef(imageArg);
  // network check happens before the pull? No: the create call (after pulling) fails. Mirror the real order.
  let img = ref.key ? dtImage(m, ref.key) : null;
  if (!img) {
    L.push({ t: `Unable to find image '${ref.ref}' locally` });
    if (!ref.key) {
      if (dtRepoKnown(ref.repo)) E(`docker: Error response from daemon: manifest for ${ref.ref} not found: manifest unknown: manifest unknown.`);
      else E(`docker: Error response from daemon: pull access denied for ${ref.repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied.`);
      L.push({ t: DT_RUN_HELP });
      return L;
    }
    dtPullLines(m, ref.key, ref.tag, true).forEach((t) => L.push({ t }));
    m.now += 6;
    img = dtImage(m, ref.key);
  }
  const ex = o.name && m.conts.find((c) => c.name === o.name);
  if (ex) {
    E(`docker: Error response from daemon: Conflict. The container name "/${o.name}" is already in use by container "${ex.id}". You have to remove (or rename) that container to be able to reuse that name.`);
    L.push({ t: DT_RUN_HELP });
    return L;
  }
  const net = o.net ? m.nets.find((n) => n.name === o.net || n.id.startsWith(o.net)) : null;
  if (o.net && !net) {
    E(`docker: Error response from daemon: network ${o.net} not found.`);
    L.push({ t: DT_RUN_HELP });
    return L;
  }
  mounts.forEach((x) => {
    if (x.type === "volume" && !x.name) x.name = dtNewId(m);
  });
  const c = dtCreate(m, { key: ref.key, image: ref.given, name: o.name || dtName(m), env, mounts, net: net ? net.name : "bridge", ports: net && net.name === "host" ? [] : ports, argv, rm: o.rm, it: o.i && o.t, hostname: o.hostname, restart: o.restart });
  if (net && net.name === "host" && ports.length) L.push({ t: "WARNING: Published ports are discarded when using host network mode" });
  if (createOnly) {
    L.push({ t: c.id });
    return L;
  }
  // start: host ports must be free
  for (const p of c.ports) {
    const clash = m.conts.find((x) => x !== c && x.state === "running" && x.ports.some((q) => q.host === p.host && q.proto === p.proto));
    if (clash) {
      if (o.d) L.push({ t: c.id });
      E(`docker: Error response from daemon: driver failed programming external connectivity on endpoint ${c.name} (${hexId(strHash(c.id), 64)}): Bind for ${p.ip}:${p.host} failed: port is already allocated.`);
      L.push({ t: DT_RUN_HELP });
      return L;
    }
  }
  const r = dtStart(m, c);
  if (r.err) {
    if (o.d) L.push({ t: c.id });
    E(`docker: Error response from daemon: ${r.err}.`);
    L.push({ t: DT_RUN_HELP });
    return L;
  }
  if (o.d) {
    L.push({ t: c.id });
    if (c.state === "exited" && c.rm) dtRemove(m, c);
    return L;
  }
  // attached
  if (r.shell && c.state === "running") {
    m.shell = { cid: c.id, sh: r.shell, fromRun: true };
    L.push({ t: `# interactive ${r.shell} inside ${c.name}: try ls, hostname, ps, env, cat /etc/os-release, then exit`, c: "note" });
    return L;
  }
  if (r.repl && c.state === "running") {
    L.push({ t: r.repl === "node" ? "Welcome to Node.js v20.18.0.\nType \".help\" for more information.\n> .exit" : "Python 3.12.7 (main, Oct  1 2026, 22:12:08) [GCC 12.2.0] on linux\nType \"help\", \"copyright\", \"credits\" or \"license\" for more information.\n>>> exit()" });
    L.push({ t: "# (simulated: the REPL exited, so the container stopped)", c: "note" });
    c.state = "exited";
    c.exit = 0;
    c.finished = m.now;
    if (c.rm) dtRemove(m, c);
    return L;
  }
  r.out.forEach((t) => L.push({ t, c: c.key.startsWith("postgres") && r.out === DT_PG_NOPASS ? "err" : undefined }));
  if (c.state === "running" && c.cat.kind === "server" && !c.userCmd) {
    L.push({ t: "^C" });
    L.push({ t: "# simulated Ctrl+C: the CLI forwards SIGINT and the container stops. Add -d to keep it running in the background.", c: "note" });
    dtStop(m, c);
    c.exit = 0;
  } else if (c.state === "running") {
    L.push({ t: `# simulated: back at the prompt, but ${c.name} keeps running (PID 1 ignores SIGINT, so Ctrl+C wouldn't stop it). Use -d for background containers.`, c: "note" });
    return L;
  } else if (!(o.i && o.t) && c.cat.kind === "shell" && !c.userCmd) {
    L.push({ t: `# ${c.argv[0]} had no terminal (no -it), read end-of-input and exited at once: Exited (0)`, c: "note" });
  } else if (c.key.startsWith("postgres") && c.exit === 1) {
    L.push({ t: "# the entrypoint refused to start and the container exited with code 1: docker ps won't list it, docker ps -a will", c: "note" });
  }
  if (c.rm) dtRemove(m, c);
  return L;
}

function dtInspectC(m, c) {
  const pub = {};
  c.cat.ports.forEach((p) => (pub[p] = null));
  c.ports.forEach((p) => (pub[`${p.cont}/${p.proto}`] = [{ HostIp: p.ip, HostPort: String(p.host) }, ...(p.ip === "0.0.0.0" ? [{ HostIp: "::", HostPort: String(p.host) }] : [])]));
  const net = c.net === "host" || c.net === "none" ? {} : { [c.net]: { NetworkID: m.nets.find((n) => n.name === c.net)?.id, Gateway: c.ip.replace(/\.\d+$/, ".1"), IPAddress: c.ip, IPPrefixLen: 16, MacAddress: `02:42:ac:${c.ip.split(".").slice(1).map((n) => Number(n).toString(16).padStart(2, "0")).join(":")}` } };
  const o = {
    Id: c.id,
    Created: `${dtClock(c.created)}.${String(strHash(c.id) % 1e9).padStart(9, "0")}Z`,
    Path: (c.ep || c.argv)[0],
    Args: [...(c.ep ? c.argv : c.argv.slice(1))],
    State: { Status: c.state, Running: c.state === "running", Paused: false, Restarting: false, OOMKilled: false, Dead: false, Pid: c.state === "running" ? c.pid : 0, ExitCode: c.exit, StartedAt: c.started || c.state !== "created" ? `${dtClock(c.started)}Z` : "0001-01-01T00:00:00Z", FinishedAt: c.state === "exited" ? `${dtClock(c.finished)}Z` : "0001-01-01T00:00:00Z" },
    Image: `sha256:${dtImage(m, c.key)?.id || hexId(strHash(c.key))}`,
    Name: `/${c.name}`,
    RestartCount: 0,
    HostConfig: { NetworkMode: c.net, PortBindings: Object.fromEntries(c.ports.map((p) => [`${p.cont}/${p.proto}`, [{ HostIp: p.ip === "0.0.0.0" ? "" : p.ip, HostPort: String(p.host) }]])), RestartPolicy: { Name: c.restart, MaximumRetryCount: 0 }, AutoRemove: c.rm },
    Mounts: c.mounts.map((x) => (x.type === "bind" ? { Type: "bind", Source: x.src, Destination: x.dst, RW: !x.ro } : { Type: "volume", Name: x.name, Source: `/var/lib/docker/volumes/${x.name}/_data`, Destination: x.dst, Driver: "local", RW: !x.ro })),
    Config: { Hostname: c.hostname, Env: dtEnv(c).slice(0, -1), Cmd: c.argv, Image: c.image, Entrypoint: c.ep, ExposedPorts: Object.fromEntries(Object.keys(pub).map((k) => [k, {}])) },
    NetworkSettings: { Ports: c.state === "running" ? pub : {}, IPAddress: c.net === "bridge" ? c.ip : "", Networks: net },
  };
  return o;
}
function dtInspectI(m, im) {
  return {
    Id: `sha256:${im.id}`,
    RepoTags: [`${im.repo}:${im.tag}`],
    RepoDigests: [`${im.repo}@sha256:${im.digest}`],
    Architecture: "amd64",
    Os: "linux",
    Size: Math.round(im.cat.size),
    Config: { Env: [DT_PATH, ...im.cat.env], Cmd: im.cat.cmd, Entrypoint: im.cat.ep, ExposedPorts: Object.fromEntries(im.cat.ports.map((p) => [p, {}])), Volumes: im.cat.volume ? { [im.cat.volume]: {} } : null, WorkingDir: im.cat.workdir || "" },
    RootFS: { Type: "layers", Layers: dtLayerIds(im.key).map((l, i) => `sha256:${l}${hexId(strHash(l) + i, 52)}`) },
  };
}
/** Tiny Go-template subset for --format: {{.A.B}}, {{json .A}}, and the range-over-networks IP idiom. */
function dtFormat(obj2, f) {
  const t = f.trim();
  if (/range\s+\.NetworkSettings\.Networks/.test(t) && /\.IPAddress/.test(t)) return Object.values(obj2.NetworkSettings?.Networks || {}).map((n) => n.IPAddress).join("");
  const mm = t.match(/^\{\{\s*(json\s+)?\.([\w.]*)\s*\}\}$/);
  if (!mm) return null;
  let v = obj2;
  for (const k of mm[2].split(".").filter(Boolean)) v = v == null ? undefined : v[k];
  if (v === undefined) return `<no value>`;
  if (mm[1]) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.join(" ")}]`;
  if (v && typeof v === "object") return `map[${Object.keys(v).map((k) => `${k}:${typeof v[k] === "object" ? "…" : v[k]}`).join(" ")}]`;
  return String(v);
}

const DT_HELP = [
  "Supported in this simulated terminal (no real Docker daemon is involved):",
  "  docker run [-d] [-it] [--rm] [--name N] [-p H:C] [-e K=V] [-v vol:/path] [--network NET] IMAGE [CMD...]",
  "  docker create … · start · stop · restart · kill · rm [-f] · ps [-a] [-q] · logs [--tail N] · exec [-it] C CMD",
  "  docker images · pull · rmi · inspect [-f '{{.State.Status}}'] · system df · version",
  "  docker volume ls|create|rm|inspect · docker network ls|create|rm",
  "  curl localhost:PORT · clear (or Ctrl+L) · ↑/↓ for history",
  "Images in the mock registry: nginx (latest, alpine), postgres (16, latest), redis, alpine, ubuntu, busybox,",
  "  hello-world, node (20, 20-alpine), python (3.12, 3.12-slim).",
];

/** Runs one host command line; returns output lines [{t, c}]. */
function dtExec(m, line) {
  const L = [];
  const P = (t, c) => String(t).split("\n").forEach((x) => L.push({ t: x, c }));
  const E = (t) => P(t, "err");
  if (!m.shell && /\$\(docker [^()]*\)/.test(line)) {
    // command substitution, e.g. docker stop $(docker ps -q)
    line = line.replace(/\$\((docker [^()]*)\)/g, (x, inner) => dtExec(m, inner).filter((o) => o.c !== "note").map((o) => o.t).join(" "));
  }
  const tok = dtTokens(line);
  if (!tok.length) return L;

  // inside an interactive container shell
  if (m.shell) {
    const c = m.conts.find((x) => x.id === m.shell.cid);
    if (!c || c.state !== "running") {
      m.shell = null;
      return L;
    }
    if (tok[0] === "exit") {
      const sh = m.shell;
      m.shell = null;
      c.execShell = null;
      L.push({ t: "exit" });
      if (sh.fromRun) {
        c.state = "exited";
        c.exit = num(tok[1], 0);
        c.finished = m.now;
        P(`# PID 1 (${sh.sh}) exited, so the container stopped${c.rm ? " and --rm removed it" : ""}`, "note");
        if (c.rm) dtRemove(m, c);
      } else P("# the exec session ended; the container keeps running", "note");
      return L;
    }
    if (tok[0] === "docker") {
      E(c.cat.os === "alpine" || c.cat.os === "busybox" ? `${m.shell.sh}: docker: not found` : `bash: docker: command not found`);
      P("# you are inside the container: type exit to get back to the host", "note");
      return L;
    }
    if (tok[0] === "clear") return [{ t: "\f" }];
    const r = dtInside(m, c, tok);
    if (r.notFound) E(c.cat.os === "alpine" || c.cat.os === "busybox" ? `${m.shell.sh}: ${tok[0]}: not found` : `bash: ${tok[0]}: command not found`);
    else if (r.shell) P(`# a nested ${r.shell}: (simulated) staying in the current shell`, "note");
    else r.out.forEach((t) => P(t));
    return L;
  }

  m.now += 3;
  const [cmd0, ...rest0] = tok;
  if (cmd0 === "clear") return [{ t: "\f" }];
  if (cmd0 === "help") return DT_HELP.map((t) => ({ t }));
  if (cmd0 === "curl") return dtCurl(m, rest0);
  if (cmd0 === "ls") return [{ t: "Dockerfile  app.py  requirements.txt  site" }];
  if (cmd0 === "pwd") return [{ t: "/home/learner/project" }];
  if (cmd0 === "whoami") return [{ t: "learner" }];
  if (cmd0 === "echo") return [{ t: rest0.join(" ") }];
  if (cmd0 === "sudo") return [{ t: "# no need for sudo: learner is in the docker group (which is as powerful as root)", c: "note" }];
  if (cmd0 === "exit") return [{ t: "# this is the host shell: nothing to exit", c: "note" }];
  if (cmd0 !== "docker") return [{ t: `bash: ${cmd0}: command not found`, c: "err" }];

  let [sub, ...args] = rest0;
  // management-command aliases
  const alias = { "container ls": "ps", "container ps": "ps", "container list": "ps", "image ls": "images", "image list": "images", "image rm": "rmi", "image pull": "pull", "image inspect": "inspect", "container inspect": "inspect", "container run": "run", "container create": "create", "container start": "start", "container stop": "stop", "container restart": "restart", "container rm": "rm", "container kill": "kill", "container logs": "logs", "container exec": "exec", "volume list": "volume ls", "network list": "network ls" };
  if (sub && args[0] && alias[`${sub} ${args[0]}`]) {
    const a = alias[`${sub} ${args[0]}`].split(" ");
    sub = a[0];
    args = [...a.slice(1), ...args.slice(1)];
  }
  if (!sub || sub === "--help" || sub === "help") return DT_HELP.map((t) => ({ t }));
  const needArg = (n = 1) => {
    if (args.filter((a) => !a.startsWith("-")).length < n) {
      E(`"docker ${sub}" requires at least ${n} argument${n > 1 ? "s" : ""}.\nSee 'docker ${sub} --help'.`);
      return true;
    }
    return false;
  };
  const names = args.filter((a) => !a.startsWith("-"));
  const flags = new Set(args.filter((a) => a.startsWith("-")));
  const ERR = "Error response from daemon: ";

  switch (sub) {
    case "run":
      return dtRunCmd(m, args, false);
    case "create":
      return dtRunCmd(m, args, true);
    case "ps": {
      const all = flags.has("-a") || flags.has("--all") || flags.has("-aq") || flags.has("-qa");
      const q = flags.has("-q") || flags.has("--quiet") || flags.has("-aq") || flags.has("-qa");
      const list = m.conts.filter((c) => all || c.state === "running");
      if (q) return list.map((c) => ({ t: c.id.slice(0, 12) }));
      return table([["CONTAINER ID", "IMAGE", "COMMAND", "CREATED", "STATUS", "PORTS", "NAMES"], ...list.map((c) => [c.id.slice(0, 12), c.image, `"${dtEllipsis([...(c.ep || []), ...c.argv].join(" "), 20)}"`, `${humanDur(m.now - c.created)} ago`, dtStatus(m, c), dtPortsStr(c), c.name])]).split("\n").map((t) => ({ t }));
    }
    case "images": {
      const q = flags.has("-q");
      const list = [...m.images].reverse();
      if (q) return list.map((i) => ({ t: i.id.slice(0, 12) }));
      return table([["REPOSITORY", "TAG", "IMAGE ID", "CREATED", "SIZE"], ...list.map((i) => [i.repo, i.tag, i.id.slice(0, 12), i.cat.created, hsize(i.cat.size)])]).split("\n").map((t) => ({ t }));
    }
    case "pull": {
      if (needArg()) return L;
      const ref = dtRef(names[0]);
      if (!ref.hadTag) P("Using default tag: latest");
      if (!ref.key) {
        if (dtRepoKnown(ref.repo)) E(`Error response from daemon: manifest for ${ref.ref} not found: manifest unknown: manifest unknown`);
        else E(`Error response from daemon: pull access denied for ${ref.repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`);
        return L;
      }
      const have = dtImage(m, ref.key);
      if (have) {
        P(`${ref.tag}: Pulling from library/${ref.repo}`);
        P(`Digest: sha256:${have.digest}`);
        P(`Status: Image is up to date for ${ref.repo}:${ref.tag}`);
        P(`docker.io/library/${ref.repo}:${ref.tag}`);
        return L;
      }
      dtPullLines(m, ref.key, ref.tag, false).forEach((t) => P(t));
      m.now += 6;
      return L;
    }
    case "start": case "stop": case "restart": case "kill": {
      if (needArg()) return L;
      let failed = [];
      for (const n of names) {
        const c = dtFindC(m, n);
        if (!c) {
          E(`${ERR}No such container: ${n}`);
          failed.push(n);
          continue;
        }
        if (sub === "kill") {
          if (c.state !== "running") {
            E(`${ERR}cannot kill container: ${n}: container ${c.id} is not running`);
            continue;
          }
          dtStop(m, c, "KILL");
          P(n);
        } else if (sub === "stop") {
          if (c.state === "running") {
            dtStop(m, c);
            if (c.rm) dtRemove(m, c);
          }
          P(n);
          if (c.exit === 137 && c.cat.kind !== "server") P(`# ${c.argv[0]} is PID 1 and ignores SIGTERM: after 10 s Docker sent SIGKILL → exit code 137`, "note");
        } else {
          if (sub === "restart" && c.state === "running") dtStop(m, c);
          if (c.state !== "running") {
            const clash = c.ports.find((p) => m.conts.some((x) => x !== c && x.state === "running" && x.ports.some((q2) => q2.host === p.host)));
            if (clash) {
              E(`${ERR}driver failed programming external connectivity on endpoint ${c.name} (${hexId(strHash(c.id), 64)}): Bind for ${clash.ip}:${clash.host} failed: port is already allocated`);
              failed.push(n);
              continue;
            }
            const r = dtStart(m, c);
            if (r.err) {
              E(`${ERR}${r.err}`);
              failed.push(n);
              continue;
            }
            if (c.state === "exited" && c.rm) dtRemove(m, c);
          }
          P(n);
        }
      }
      if (failed.length && sub !== "stop") E(`Error: failed to ${sub} containers: ${failed.join(", ")}`);
      return L;
    }
    case "rm": {
      if (needArg()) return L;
      const short = [...flags].filter((f) => /^-[a-z]+$/.test(f)).join("");
      const force = short.includes("f") || flags.has("--force");
      const vols = short.includes("v") || flags.has("--volumes");
      for (const n of names) {
        const c = dtFindC(m, n);
        if (!c) {
          if (!force) E(`${ERR}No such container: ${n}`);
          continue;
        }
        if (c.state === "running" && !force) {
          E(`${ERR}cannot remove container "/${c.name}": container is running: stop the container before removing or force remove`);
          continue;
        }
        if (c.state === "running") dtStop(m, c, "KILL");
        if (vols) c.rm = true;
        dtRemove(m, c);
        P(n);
      }
      return L;
    }
    case "rmi": {
      if (needArg()) return L;
      const force = flags.has("-f") || flags.has("--force");
      for (const n of names) {
        const ref = dtRef(n);
        const im = m.images.find((i) => i.key === ref.key || (ref.key === null && n.length >= 3 && i.id.startsWith(n)) || i.id.startsWith(n.replace(/^sha256:/, "")));
        if (!im) {
          E(`${ERR}No such image: ${ref.ref}`);
          continue;
        }
        const users = m.conts.filter((c) => c.key === im.key);
        const run = users.find((c) => c.state === "running");
        if (run && force) {
          E(`${ERR}conflict: unable to delete ${im.id.slice(0, 12)} (cannot be forced) - image is being used by running container ${run.id.slice(0, 12)}`);
          continue;
        }
        if (users.length && !force) {
          E(`${ERR}conflict: unable to remove repository reference "${n}" (must force) - container ${users[0].id.slice(0, 12)} is using its referenced image ${im.id.slice(0, 12)}`);
          continue;
        }
        m.images = m.images.filter((i) => i !== im);
        P(`Untagged: ${im.repo}:${im.tag}`);
        P(`Untagged: ${im.repo}@sha256:${im.digest}`);
        P(`Deleted: sha256:${im.id}`);
        const shared = new Set(m.images.map((i) => dtLayerIds(i.key)[0]));
        dtLayerIds(im.key).forEach((l, i) => !(i === 0 && shared.has(l)) && P(`Deleted: sha256:${l}${hexId(strHash(l) + i, 52)}`));
      }
      return L;
    }
    case "logs": {
      if (needArg()) return L;
      const c = dtFindC(m, names[names.length - 1]);
      if (!c) {
        E(`${ERR}No such container: ${names[names.length - 1]}`);
        return L;
      }
      let lines = c.logs;
      const ti = args.findIndex((a) => a === "--tail" || a === "-n");
      const tv = ti >= 0 ? args[ti + 1] : (args.find((a) => a.startsWith("--tail=")) || "").slice(7);
      if (tv && tv !== "all") lines = lines.slice(-Math.max(0, int(tv, lines.length, 0, 9999)) || lines.length + 1);
      lines.forEach((t) => P(t, /^Error|\[error\]|FATAL/.test(t) ? "err" : undefined));
      if (!c.logs.length) P(`# ${c.name} hasn't written anything to stdout/stderr`, "note");
      if (flags.has("-f") || flags.has("--follow")) P("# (-f would keep streaming new lines until Ctrl+C)", "note");
      return L;
    }
    case "exec": {
      let i = 0, it = false, extra = [];
      for (; i < args.length && args[i].startsWith("-"); i++) {
        const a = args[i];
        if (a === "-it" || a === "-ti" || a === "-t" || a === "-i" || a === "--interactive" || a === "--tty") it = it || a.includes("t") || a === "--tty";
        else if (a === "-e" || a === "--env") extra.push(args[++i] || "");
        else if (a === "-w" || a === "-u" || a === "--user" || a === "--workdir") i++;
        else if (a === "-d") { /* detached exec: ignore */ }
        else {
          E(`unknown flag: ${a}\nSee 'docker exec --help'.`);
          return L;
        }
      }
      const cn = args[i], argv = args.slice(i + 1);
      if (!cn || !argv.length) {
        E(`"docker exec" requires at least 2 arguments.\nSee 'docker exec --help'.\n\nUsage:  docker exec [OPTIONS] CONTAINER COMMAND [ARG...]`);
        return L;
      }
      const c = dtFindC(m, cn);
      if (!c) {
        E(`${ERR}No such container: ${cn}`);
        return L;
      }
      if (c.state !== "running") {
        E(`${ERR}container ${c.id} is not running`);
        return L;
      }
      const r = dtInside(m, c, argv, extra);
      if (r.notFound) {
        E(`OCI runtime exec failed: exec failed: unable to start container process: exec: "${argv[0]}": executable file not found in $PATH: unknown`);
        if (argv[0] === "ps") P("# the Debian-based images don't ship procps: there is no ps (alpine/busybox have one)", "note");
        if (argv[0] === "bash" && c.cat.shells.includes("sh")) P("# this image has no bash: try sh", "note");
        return L;
      }
      if (r.shell) {
        if (!it) {
          P(`# ${r.shell} started without -it: no terminal, so it read end-of-input and exited`, "note");
          return L;
        }
        m.shell = { cid: c.id, sh: r.shell, fromRun: false };
        c.execShell = r.shell;
        P(`# a new ${r.shell} process inside ${c.name} (namespaces shared with PID 1). Type exit to leave.`, "note");
        return L;
      }
      if (r.repl) {
        P(it ? "# (simulated: the REPL opened and you closed it)" : "# no -it: the REPL read end-of-input and exited", "note");
        return L;
      }
      r.out.forEach((t) => P(t));
      return L;
    }
    case "inspect": {
      if (needArg()) return L;
      const fi = args.findIndex((a) => a === "-f" || a === "--format");
      const fmt = fi >= 0 ? args[fi + 1] : (args.find((a) => a.startsWith("--format=")) || "").slice(9) || null;
      const targets = args.filter((a, k) => !a.startsWith("-") && !(fi >= 0 && k === fi + 1));
      const res = [];
      for (const n of targets) {
        const c = dtFindC(m, n);
        if (c) res.push(dtInspectC(m, c));
        else {
          const ref = dtRef(n);
          const im = m.images.find((x) => x.key === ref.key || x.id.startsWith(n));
          if (im) res.push(dtInspectI(m, im));
          else {
            if (!fmt) P("[]");
            E(`Error: No such object: ${n}`);
            return L;
          }
        }
      }
      if (fmt) {
        res.forEach((o) => {
          const v = dtFormat(o, fmt);
          if (v === null) E(`template parsing error: (simulated) only {{.Path.To.Field}}, {{json .Field}} and the range .NetworkSettings.Networks idiom are supported`);
          else P(v);
        });
        return L;
      }
      P(JSON.stringify(res, null, 4));
      return L;
    }
    case "volume": {
      const [vs, ...va] = args;
      const vn = va.filter((a) => !a.startsWith("-"));
      if (vs === "ls") return table([["DRIVER", "VOLUME NAME"], ...m.vols.map((v) => ["local", v.name])]).split("\n").map((t) => ({ t }));
      if (vs === "create") {
        const name = vn[0] || dtNewId(m);
        if (!m.vols.some((v) => v.name === name)) m.vols.push({ name, anon: !vn[0], size: 0 });
        P(name);
        return L;
      }
      if (vs === "rm") {
        if (!vn.length) {
          E(`"docker volume rm" requires at least 1 argument.\nSee 'docker volume rm --help'.`);
          return L;
        }
        for (const n of vn) {
          const v = m.vols.find((x) => x.name === n);
          if (!v) {
            E(`Error response from daemon: get ${n}: no such volume`);
            continue;
          }
          const users = m.conts.filter((c) => c.mounts.some((x) => x.name === n));
          if (users.length) {
            E(`Error response from daemon: remove ${n}: volume is in use - [${users.map((c) => c.id).join(", ")}]`);
            continue;
          }
          m.vols = m.vols.filter((x) => x !== v);
          P(n);
        }
        return L;
      }
      if (vs === "inspect") {
        const v = m.vols.find((x) => x.name === vn[0]);
        if (!v) {
          P("[]");
          E(`Error response from daemon: get ${vn[0] || ""}: no such volume`);
          return L;
        }
        P(JSON.stringify([{ CreatedAt: `${dtClock(m.now)}Z`, Driver: "local", Labels: v.anon ? { "com.docker.volume.anonymous": "" } : null, Mountpoint: `/var/lib/docker/volumes/${v.name}/_data`, Name: v.name, Options: null, Scope: "local" }], null, 4));
        return L;
      }
      E(`docker: 'volume ${vs || ""}' is not a docker command (simulated: ls, create, rm, inspect).`.replace("  ", " "));
      return L;
    }
    case "network": {
      const [ns, ...na] = args;
      const nn = na.filter((a, k) => !a.startsWith("-") && na[k - 1] !== "--driver" && na[k - 1] !== "-d");
      if (ns === "ls") return table([["NETWORK ID", "NAME", "DRIVER", "SCOPE"], ...m.nets.map((n) => [n.id.slice(0, 12), n.name, n.driver, "local"])]).split("\n").map((t) => ({ t }));
      if (ns === "create") {
        const name = nn[nn.length - 1];
        if (!name) {
          E(`"docker network create" requires exactly 1 argument.\nSee 'docker network create --help'.`);
          return L;
        }
        if (m.nets.some((n) => n.name === name)) {
          E(`Error response from daemon: network with name ${name} already exists`);
          return L;
        }
        const id = dtNewId(m);
        m.nets.push({ name, driver: "bridge", id, sub: 18 + m.nets.filter((n) => n.sub).length, next: 2 });
        P(id);
        P("# containers on a user-defined network can reach each other by name (built-in DNS)", "note");
        return L;
      }
      if (ns === "rm") {
        for (const n of nn) {
          const net = m.nets.find((x) => x.name === n || x.id.startsWith(n));
          if (!net) E(`Error response from daemon: network ${n} not found`);
          else if (net.builtin) E(`Error response from daemon: ${net.name} is a pre-defined network and cannot be removed`);
          else if (m.conts.some((c) => c.net === net.name && c.state === "running")) E(`Error response from daemon: error while removing network: network ${net.name} id ${net.id} has active endpoints`);
          else {
            m.nets = m.nets.filter((x) => x !== net);
            P(n);
          }
        }
        return L;
      }
      E(`docker: 'network ${ns || ""}' is not a docker command (simulated: ls, create, rm).`);
      return L;
    }
    case "system": {
      if (args[0] !== "df") {
        E(`docker: 'system ${args[0] || ""}' is not a docker command (simulated: system df).`);
        return L;
      }
      const usedImg = new Set(m.conts.map((c) => c.key));
      const imgSize = m.images.reduce((a, i) => a + i.cat.size, 0);
      const imgFree = m.images.filter((i) => !usedImg.has(i.key)).reduce((a, i) => a + i.cat.size, 0);
      const cSize = m.conts.reduce((a, c) => a + (c.state === "created" ? 0 : c.cat.rw), 0);
      const cFree = m.conts.filter((c) => c.state !== "running").reduce((a, c) => a + (c.state === "created" ? 0 : c.cat.rw), 0);
      const usedVol = new Set(m.conts.flatMap((c) => c.mounts.map((x) => x.name)));
      const vSize = m.vols.reduce((a, v) => a + v.size, 0);
      const vFree = m.vols.filter((v) => !usedVol.has(v.name)).reduce((a, v) => a + v.size, 0);
      const pct = (a, b) => `${hsize(a)} (${b ? Math.round((a / b) * 100) : 0}%)`;
      return table([
        ["TYPE", "TOTAL", "ACTIVE", "SIZE", "RECLAIMABLE"],
        ["Images", m.images.length, m.images.filter((i) => usedImg.has(i.key)).length, hsize(imgSize), pct(imgFree, imgSize)],
        ["Containers", m.conts.length, m.conts.filter((c) => c.state === "running").length, hsize(cSize), pct(cFree, cSize)],
        ["Local Volumes", m.vols.length, m.vols.filter((v) => usedVol.has(v.name)).length, hsize(vSize), pct(vFree, vSize)],
        ["Build Cache", 0, 0, "0B", "0B"],
      ]).split("\n").map((t) => ({ t }));
    }
    case "version":
      return "Client: Docker Engine - Community\n Version:           27.3.1\n API version:       1.47\n Go version:        go1.22.7\n OS/Arch:           linux/amd64\n\nServer: Docker Engine - Community\n Engine:\n  Version:          27.3.1\n  API version:      1.47 (minimum version 1.24)\n containerd:\n  Version:          1.7.22\n runc:\n  Version:          1.1.14\n docker-init:\n  Version:          0.19.0".split("\n").map((t) => ({ t }));
    case "compose":
      return [{ t: "# docker compose isn't simulated in this terminal", c: "note" }];
    default:
      return [{ t: `docker: '${sub}' is not a docker command.\nSee 'docker --help'`, c: "err" }].flatMap((x) => x.t.split("\n").map((t) => ({ t, c: x.c })));
  }
}

function dtCurl(m, args) {
  const url = args.filter((a) => !a.startsWith("-"))[0];
  if (!url) return [{ t: "curl: try 'curl --help' or 'curl --manual' for more information", c: "err" }];
  const mm = url.replace(/^https?:\/\//, "").match(/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::(\d+))?(\/.*)?$/);
  if (!mm) return [{ t: `curl: (6) Could not resolve host: ${url.replace(/^https?:\/\//, "").split(/[/:]/)[0]}`, c: "err" }, { t: "# (simulated: only localhost is reachable from here)", c: "note" }];
  const port = Number(mm[2] || 80);
  const path = mm[3] || "/";
  const c = m.conts.find((x) => x.state === "running" && (x.ports.some((p) => p.host === port && p.ip !== "::1") || (x.net === "host" && x.cat.ports.includes(`${port}/tcp`))));
  if (!c) return [{ t: `curl: (7) Failed to connect to localhost port ${port} after 0 ms: Couldn't connect to server`, c: "err" }];
  const cport = c.net === "host" ? port : c.ports.find((p) => p.host === port).cont;
  if (!c.key.startsWith("nginx") || cport !== 80) return [{ t: "curl: (52) Empty reply from server", c: "err" }, { t: `# port ${port} reaches ${c.name}, but it doesn't speak HTTP`, c: "note" }];
  const ok = path === "/" || path === "/index.html";
  c.logs.push(`172.17.0.1 - - [28/Oct/2026:${dtClock(m.now).slice(11)} +0000] "GET ${path} HTTP/1.1" ${ok ? 200 : 404} ${ok ? 615 : 153} "-" "curl/8.5.0" "-"`);
  const head = args.includes("-I") || args.includes("--head");
  if (head) return [`HTTP/1.1 ${ok ? "200 OK" : "404 Not Found"}`, "Server: nginx/1.27.2", "Date: Wed, 28 Oct 2026 09:05:00 GMT", "Content-Type: text/html", `Content-Length: ${ok ? 615 : 153}`].map((t) => ({ t }));
  if (!ok) return ["<html>", "<head><title>404 Not Found</title></head>", "<body>", "<center><h1>404 Not Found</h1></center>", "<hr><center>nginx/1.27.2</center>", "</body>", "</html>"].map((t) => ({ t }));
  return ["<!DOCTYPE html>", "<html>", "<head>", "<title>Welcome to nginx!</title>", "…", "<h1>Welcome to nginx!</h1>", "<p>If you see this page, the nginx web server is successfully installed and", "working. Further configuration is required.</p>", "…", "</html>", `# answered by ${c.name}: host :${port} → container :80 (see docker logs ${c.name})`].map((t) => ({ t, c: t.startsWith("#") ? "note" : undefined }));
}

/** Contextual suggestions (clickable, for phones). */
function dtSuggest(m) {
  if (m.shell) {
    const c = m.conts.find((x) => x.id === m.shell.cid);
    const bb = c && (c.cat.os === "alpine" || c.cat.os === "busybox");
    return ["ls", "hostname", bb ? "ps" : "cat /etc/os-release", "env", "uname -a", "exit"];
  }
  const web = m.conts.find((c) => c.name === "web");
  const db = m.conts.find((c) => c.name === "db");
  const S = [];
  if (!m.images.length && !m.conts.length) S.push("docker run hello-world");
  if (!web) S.push("docker run -d --name web -p 8080:80 nginx");
  else if (web.state === "running") S.push("docker ps", "curl localhost:8080", "docker logs web", "docker exec web cat /etc/hostname", "docker exec -it web bash", "docker rm web", "docker stop web");
  else S.push("docker ps -a", "docker start web", "docker rm web");
  if (!db) S.push("docker run --name db postgres:16", "docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:16");
  else if (db.state !== "running") S.push("docker logs db", "docker rm db");
  else S.push("docker logs --tail 3 db", "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' db");
  S.push("docker run -it --rm alpine sh", "docker run --rm alpine echo hello", "docker images", "docker volume ls", "docker network ls", "docker system df", "help");
  return [...new Set(S)].slice(0, 12);
}

export function DockerTerminal({ params = {} }) {
  const prm = obj(params);
  const preset = oneOf(prm.preset, ["empty", "web-app"], "empty", { webapp: "web-app", web: "web-app", app: "web-app", blank: "empty", fresh: "empty" });
  const intro = () =>
    preset === "web-app"
      ? [{ t: "# A Docker host with two running containers on the user-defined network app-net:", c: "note" }, { t: "# web (nginx, port 8080) and db (postgres:16 with the volume pgdata). Try docker ps.", c: "note" }]
      : [{ t: "# A fresh Docker host: no images, no containers. Type help, or tap a suggestion below.", c: "note" }];
  const sim = useRef(null);
  if (!sim.current) sim.current = { m: dtInit(preset), lines: intro(), k: 0, hist: [], hi: -1 };
  const S = sim.current;
  const [input, setInput] = useState("");
  const force = useForce();
  const outRef = useRef(null);
  const inRef = useRef(null);

  useEffect(() => {
    const el = outRef.current;
    if (el) el.scrollTop = el.scrollHeight; // scroll the terminal, not the page
  }, [S.k]);

  const prompt = () => {
    const m = S.m;
    if (!m.shell) return "$ ";
    const c = m.conts.find((x) => x.id === m.shell.cid);
    if (!c) return "$ ";
    return c.cat.os === "alpine" || c.cat.os === "busybox" ? "/ # " : `root@${c.hostname}:/# `;
  };
  const run = (raw) => {
    const line = String(raw).slice(0, 400);
    const p = prompt();
    S.lines.push({ t: p + line, c: "cmd", p: p.length });
    if (line.trim()) {
      S.hist = [...S.hist.filter((h) => h !== line), line].slice(-50);
      let out;
      try {
        out = dtExec(S.m, line.trim());
      } catch (e) {
        out = [{ t: "# (simulator error: that command isn't supported here)", c: "note" }];
      }
      if (out.length === 1 && out[0].t === "\f") S.lines = [];
      else S.lines.push(...out);
    }
    if (S.lines.length > 600) S.lines = S.lines.slice(-600);
    S.hi = -1;
    S.k += 1;
    setInput("");
    force();
  };
  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run(input);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (!S.hist.length) return;
      let hi = S.hi === -1 ? S.hist.length : S.hi;
      hi = e.key === "ArrowUp" ? Math.max(0, hi - 1) : hi + 1;
      if (hi >= S.hist.length) {
        S.hi = -1;
        setInput("");
      } else {
        S.hi = hi;
        setInput(S.hist[hi]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      S.lines = [];
      S.k += 1;
      force();
    } else if (e.key === "c" && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault();
      S.lines.push({ t: prompt() + input + "^C", c: "cmd", p: prompt().length });
      S.k += 1;
      setInput("");
    }
  };
  const reset = () => {
    sim.current = { m: dtInit(preset), lines: intro(), k: S.k + 1, hist: S.hist, hi: -1 };
    setInput("");
    force();
  };

  const m = S.m;
  const running = m.conts.filter((c) => c.state === "running").length;
  const sugg = dtSuggest(m);
  const tone = { err: "text-rose-300", note: "text-slate-500", cmd: "text-slate-100" };

  return (
    <Card
      title="A Docker terminal to practise in"
      params={params}
      caption="Type real Docker commands (↑/↓ recalls history) or tap a suggestion. The first docker run of an image pulls it; try running postgres without a password and read its logs, start two containers on the same host port, rm a running container, and exec into nginx to see that its hostname is the container ID. Nothing here talks to a real daemon: images, containers, volumes and networks are simulated."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="images" value={m.images.length} />
        <Stat label="containers" value={`${running} up / ${m.conts.length}`} color={running ? "text-emerald-300" : "text-slate-200"} />
        <Stat label="volumes" value={m.vols.length} />
        <Stat label="networks" value={m.nets.length} />
        <Button className="ml-auto" onClick={reset}>Reset</Button>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-ink-700 bg-ink-950">
        <div className="flex items-center gap-1.5 border-b border-ink-700 bg-ink-800 px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-2 truncate font-mono text-[10px] text-slate-500">{m.shell ? `docker ${m.shell.fromRun ? "run" : "exec"} -it … ${m.shell.sh}` : "learner@devbox: ~/project"}</span>
        </div>
        <div ref={outRef} className="h-72 overflow-auto px-3 py-2 font-mono text-[10.5px] leading-[1.55] sm:text-[11px]" style={NOLIG} onClick={() => { if (!window.getSelection()?.toString()) inRef.current?.focus({ preventScroll: true }); }}>
          {S.lines.map((l, i) => (
            <div key={i} className={`min-h-[1em] whitespace-pre ${tone[l.c] || "text-slate-300"}`}>
              {l.c === "cmd" ? (
                <>
                  <span className="text-emerald-400">{l.t.slice(0, l.p)}</span>
                  {l.t.slice(l.p)}
                </>
              ) : l.t}
            </div>
          ))}
          <div className="flex items-center whitespace-pre">
            <span className="text-emerald-400">{prompt()}</span>
            <input
              ref={inRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              aria-label="Terminal input: type a docker command and press Enter"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="send"
              className="min-w-0 flex-1 bg-transparent font-mono text-slate-100 caret-emerald-400 outline-none"
              style={NOLIG}
            />
          </div>
        </div>
      </div>
      <Label className="mb-1 mt-2">suggestions (tap to run)</Label>
      <div className="flex flex-wrap gap-1.5">
        {sugg.map((t) => (
          <button key={t} type="button" onClick={() => run(t)} className="max-w-full truncate rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-left font-mono text-[10.5px] text-slate-300 hover:bg-ink-700" style={NOLIG} title={t}>
            {t}
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------- image-layers: Dockerfile → layers, the build cache, and copy-on-write ---------- */

// k: "base" (FROM), "fs" (creates a filesystem layer), "meta" (image config only, no layer)
// in: which edits change this step's inputs ("code" = app files, "deps" = the dependency manifest)
const IL_DF = {
  python: {
    label: "Python (Flask)",
    base: "python:3.12-slim",
    baseSize: 124.3e6,
    baseLayers: 4,
    deps: "requirements.txt",
    code: "app.py",
    good: [
      { t: "FROM python:3.12-slim", k: "base", time: 0.6 },
      { t: "WORKDIR /app", k: "fs", size: 0, time: 0.1, s: "WORKDIR /app" },
      { t: "COPY requirements.txt .", k: "fs", size: 120, time: 0.1, in: ["deps"], s: "COPY requirements.txt" },
      { t: "RUN pip install --no-cache-dir -r requirements.txt", k: "fs", size: 18.4e6, time: 14.2, s: "RUN pip install" },
      { t: "COPY . .", k: "fs", size: 48.2e3, time: 0.2, in: ["code", "deps"], s: "COPY . ." },
      { t: "ENV PORT=8000", k: "meta" },
      { t: "EXPOSE 8000", k: "meta" },
      { t: 'CMD ["python", "app.py"]', k: "meta" },
    ],
    bad: [
      { t: "FROM python:3.12-slim", k: "base", time: 0.6 },
      { t: "WORKDIR /app", k: "fs", size: 0, time: 0.1, s: "WORKDIR /app" },
      { t: "COPY . .", k: "fs", size: 48.2e3, time: 0.2, in: ["code", "deps"], s: "COPY . ." },
      { t: "RUN pip install --no-cache-dir -r requirements.txt", k: "fs", size: 18.4e6, time: 14.2, s: "RUN pip install" },
      { t: "ENV PORT=8000", k: "meta" },
      { t: "EXPOSE 8000", k: "meta" },
      { t: 'CMD ["python", "app.py"]', k: "meta" },
    ],
    files: [
      { p: "/app/app.py", from: "COPY . .", size: 4.2e3 },
      { p: "/usr/local/lib/python3.12/site-packages/flask/app.py", short: "…/site-packages/flask/app.py", from: "RUN pip install", size: 59.2e3 },
      { p: "/etc/os-release", from: "FROM", size: 267 },
    ],
  },
  node: {
    label: "Node.js (Express)",
    base: "node:20-alpine",
    baseSize: 135.4e6,
    baseLayers: 5,
    deps: "package.json",
    code: "server.js",
    good: [
      { t: "FROM node:20-alpine", k: "base", time: 0.7 },
      { t: "WORKDIR /app", k: "fs", size: 0, time: 0.1, s: "WORKDIR /app" },
      { t: "COPY package.json package-lock.json ./", k: "fs", size: 61.4e3, time: 0.1, in: ["deps"], s: "COPY package*.json" },
      { t: "RUN npm ci --omit=dev", k: "fs", size: 32.6e6, time: 21.7, s: "RUN npm ci" },
      { t: "COPY . .", k: "fs", size: 212e3, time: 0.2, in: ["code", "deps"], s: "COPY . ." },
      { t: "ENV NODE_ENV=production", k: "meta" },
      { t: "EXPOSE 3000", k: "meta" },
      { t: 'CMD ["node", "server.js"]', k: "meta" },
    ],
    bad: [
      { t: "FROM node:20-alpine", k: "base", time: 0.7 },
      { t: "WORKDIR /app", k: "fs", size: 0, time: 0.1, s: "WORKDIR /app" },
      { t: "COPY . .", k: "fs", size: 273e3, time: 0.2, in: ["code", "deps"], s: "COPY . ." },
      { t: "RUN npm ci --omit=dev", k: "fs", size: 32.6e6, time: 21.7, s: "RUN npm ci" },
      { t: "ENV NODE_ENV=production", k: "meta" },
      { t: "EXPOSE 3000", k: "meta" },
      { t: 'CMD ["node", "server.js"]', k: "meta" },
    ],
    files: [
      { p: "/app/server.js", from: "COPY . .", size: 3.1e3 },
      { p: "/app/node_modules/express/lib/router/index.js", short: "…/node_modules/express/…/index.js", from: "RUN npm ci", size: 12.6e3 },
      { p: "/etc/os-release", from: "FROM", size: 164 },
    ],
  },
  go: {
    label: "Go (Gin)",
    base: "golang:1.22-alpine",
    baseSize: 263.1e6,
    baseLayers: 5,
    deps: "go.mod",
    code: "main.go",
    good: [
      { t: "FROM golang:1.22-alpine", k: "base", time: 0.8 },
      { t: "WORKDIR /src", k: "fs", size: 0, time: 0.1, s: "WORKDIR /src" },
      { t: "COPY go.mod go.sum ./", k: "fs", size: 9.8e3, time: 0.1, in: ["deps"], s: "COPY go.mod go.sum" },
      { t: "RUN go mod download", k: "fs", size: 74.2e6, time: 9.8, s: "RUN go mod download" },
      { t: "COPY . .", k: "fs", size: 96.4e3, time: 0.2, in: ["code", "deps"], s: "COPY . ." },
      { t: "RUN go build -o /bin/app ./cmd/server", k: "fs", size: 38.2e6, time: 27.4, s: "RUN go build" },
      { t: "EXPOSE 8080", k: "meta" },
      { t: 'CMD ["/bin/app"]', k: "meta" },
    ],
    bad: [
      { t: "FROM golang:1.22-alpine", k: "base", time: 0.8 },
      { t: "WORKDIR /src", k: "fs", size: 0, time: 0.1, s: "WORKDIR /src" },
      { t: "COPY . .", k: "fs", size: 106e3, time: 0.2, in: ["code", "deps"], s: "COPY . ." },
      { t: "RUN go mod download", k: "fs", size: 74.2e6, time: 9.8, s: "RUN go mod download" },
      { t: "RUN go build -o /bin/app ./cmd/server", k: "fs", size: 38.2e6, time: 27.4, s: "RUN go build" },
      { t: "EXPOSE 8080", k: "meta" },
      { t: 'CMD ["/bin/app"]', k: "meta" },
    ],
    files: [
      { p: "/src/main.go", from: "COPY . .", size: 2.7e3 },
      { p: "/bin/app", from: "RUN go build", size: 14.1e6 },
      { p: "/etc/os-release", from: "FROM", size: 164 },
    ],
  },
};
const IL_TONE = { cached: C.emerald, rebuilt: C.sky, running: C.sky, pending: C.amber, idle: C.ink600 };

/** Which instruction indexes must rebuild for the given edits (and the first one invalidated). */
function ilPlan(lines, ed) {
  let first = Infinity;
  lines.forEach((l, i) => {
    if (ed.lines.includes(i) || (l.in && ((ed.code && l.in.includes("code")) || (ed.deps && l.in.includes("deps"))))) first = Math.min(first, i);
  });
  return { first, rebuild: lines.map((l, i) => i >= first && l.k !== "meta") };
}

export function ImageLayers({ params = {} }) {
  const prm = obj(params);
  const [lang, setLang] = useState(() => oneOf(prm.dockerfile, ["python", "node", "go"], "python", { py: "python", flask: "python", js: "node", nodejs: "node", "node.js": "node", express: "node", golang: "go", gin: "go" }));
  const [order, setOrder] = useState(() => oneOf(prm.order, ["good", "bad"], "good", { optimized: "good", optimised: "good", naive: "bad", wrong: "bad" }));
  const D = IL_DF[lang];
  const lines = D[order];
  const initEd = () => {
    // `edit` is the 1-based line number shown next to the Dockerfile (0 is treated as line 1)
    const e = Number.isNaN(num(prm.edit, NaN)) ? null : int(prm.edit, 1, 0, lines.length);
    return { code: false, deps: false, lines: e === null ? [] : [Math.max(1, e) - 1] };
  };
  const [ed, setEd] = useState(initEd);
  const [res, setRes] = useState(null); // result of the last rebuild: { status: [...], total }
  const [cow, setCow] = useState(() => ({ st: {}, created: false }));
  const force = useForce();
  const run = useRef(null); // { i, t, status, plan, times }

  useLoop(!!run.current, (dt) => {
    const r = run.current;
    if (!r) return;
    r.t += dt;
    const l = lines[r.i];
    const dur = r.plan.rebuild[r.i] ? clamp(0.35 + (l.time || 0) * 0.09, 0.35, 2.4) : 0.22;
    r.status[r.i] = r.plan.rebuild[r.i] ? "running" : "cached";
    if (r.t >= dur) {
      r.status[r.i] = r.plan.rebuild[r.i] ? "rebuilt" : "cached";
      r.t = 0;
      r.i += 1;
      while (r.i < lines.length && lines[r.i].k === "meta") {
        r.status[r.i] = r.plan.rebuild[r.i] || r.i >= r.plan.first ? "rebuilt" : "cached";
        r.i += 1;
      }
      if (r.i >= lines.length) {
        const total = lines.reduce((a, x, i) => a + (r.plan.rebuild[i] ? x.time || 0 : 0), 0) + 0.4;
        setRes({ status: r.status, total, plan: r.plan, ed: r.ed });
        setEd({ code: false, deps: false, lines: [] });
        setCow({ st: {}, created: false }); // a new image means a new container
        run.current = null;
      }
    }
    force();
  });

  const building = !!run.current;
  const plan = ilPlan(lines, ed);
  const dirty = plan.first !== Infinity;
  const rebuild = () => {
    if (building) return;
    run.current = { i: 0, t: 0, status: lines.map(() => "idle"), plan, ed };
    force();
  };
  const switchTo = (l, o) => {
    if (building) return;
    setLang(l);
    setOrder(o);
    setEd({ code: false, deps: false, lines: [] });
    setRes(null);
    setCow({ st: {}, created: false });
  };
  const toggleLine = (i) => {
    if (building) return;
    setRes(null);
    setEd((e) => ({ ...e, lines: e.lines.includes(i) ? e.lines.filter((x) => x !== i) : [...e.lines, i] }));
  };
  const edit = (k) => {
    if (building) return;
    setRes(null);
    setEd((e) => ({ ...e, [k]: !e[k] }));
  };

  // status of every line for display
  const status = lines.map((l, i) => {
    if (run.current) return run.current.status[i];
    if (dirty) return plan.rebuild[i] || (l.k === "meta" && i >= plan.first) ? "pending" : "idle";
    if (res) return res.status[i];
    return "idle";
  });
  const nSteps = lines.filter((l) => l.k !== "meta").length;
  const stepNo = (i) => lines.slice(0, i + 1).filter((l) => l.k !== "meta").length;
  const imgSize = D.baseSize + lines.reduce((a, l) => a + (l.k === "fs" ? l.size : 0), 0);
  const badges = {};
  const marks = {};
  lines.forEach((l, i) => {
    badges[i] = l.k === "base" ? [`${D.baseLayers} layers · ${hsize(D.baseSize)}`, "bg-ink-800 text-slate-400"] : l.k === "fs" ? [`layer · ${hsize(l.size)}`, "bg-sky-500/10 text-sky-300"] : ["config only", "bg-ink-800 text-slate-500"];
    const changed = ed.lines.includes(i) || (l.in && ((ed.code && l.in.includes("code")) || (ed.deps && l.in.includes("deps"))));
    if (changed && !building) marks[i] = "amber";
    else if (status[i] === "pending") marks[i] = "rose";
    else if (status[i] === "running") marks[i] = "sky";
    else if (status[i] === "rebuilt") marks[i] = "sky";
    else if (status[i] === "cached") marks[i] = "emerald";
  });

  // copy-on-write view
  const files = D.files;
  const rw = files.reduce((a, f) => a + (cow.st[f.p] === "mod" ? f.size : 0), 0) + (cow.created ? 1.2e6 : 0);
  const cowAct = (p, v) => setCow((c) => ({ ...c, st: { ...c.st, [p]: c.st[p] === v ? undefined : v } }));
  const fromLabel = (f) => (f.from === "FROM" ? D.base : f.from);
  const base = (p) => p.split("/").pop();

  const stack = lines.map((l, i) => ({ l, i })).filter((x) => x.l.k === "fs").reverse();
  const layerH = (size) => clamp(16 + Math.log10(size + 1) * 1.6, 16, 30);
  const totalTime = res ? res.total : null;
  const meta = lines.filter((l) => l.k === "meta").map((l) => l.t);

  return (
    <Card
      title="Image layers, the build cache and copy-on-write"
      params={params}
      caption={`Every RUN, COPY and ADD adds a read-only layer; ENV, EXPOSE and CMD only change the image config. Edit something and Rebuild: the first step whose inputs changed and every step after it are rebuilt, the ones before stay CACHED. Compare “good order” (copy ${D.deps} and install dependencies first) with “bad order” (COPY . . first: any code edit re-runs the slow install). Below, change files inside a running container to see copy-up and whiteouts in its writable layer.`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Choice label="Dockerfile" options={[["python", "Python"], ["node", "Node.js"], ["go", "Go"]]} value={lang} onChange={(l) => switchTo(l, order)} />
        <Choice label="Instruction order" options={[["good", "good order"], ["bad", "bad order"]]} value={order} onChange={(o) => switchTo(lang, o)} tones={{ bad: "rose" }} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1.25fr_1fr]">
        <div className="min-w-0">
          <DockerfileView
            label={`Dockerfile (${order === "good" ? "dependencies first" : "COPY . . first"}) · tap a line to edit it`}
            lines={lines.map((l) => l.t)}
            marks={marks}
            badges={badges}
            onLine={toggleLine}
            lineLabel={(i) => `${ed.lines.includes(i) ? "Undo edit of" : "Edit"} instruction ${i + 1}: ${lines[i].t}`}
          />
          <Row>
            <Button onClick={() => edit("code")} aria-pressed={ed.code} className={ed.code ? "ring-1 ring-amber-400" : ""} disabled={building}>✎ edit {D.code}</Button>
            <Button onClick={() => edit("deps")} aria-pressed={ed.deps} className={ed.deps ? "ring-1 ring-amber-400" : ""} disabled={building}>✎ edit {D.deps}</Button>
            <Button primary onClick={rebuild} disabled={building}>{building ? "Building…" : "Rebuild"}</Button>
          </Row>
          <div className="mt-2 min-h-[2.5rem] text-[11px] leading-relaxed text-slate-400" aria-live="polite">
            {building ? (
              <span className="text-sky-300">docker build -t myapp . (BuildKit checks the cache step by step)</span>
            ) : dirty ? (
              lines[plan.first].k === "meta" && !plan.rebuild.some(Boolean) ? (
                <span><span className="text-amber-300">Only image metadata changed</span>: every layer is reused, but the image gets a new config and therefore a new image ID.</span>
              ) : (
                <span>
                  <span className="text-amber-300">Changed: </span>step {stepNo(plan.first)} ({lines[plan.first].t.split(" ")[0]}). It and the {plural(plan.rebuild.filter(Boolean).length - 1, "filesystem step")} after it <span className="text-rose-300">will rebuild</span>; steps before it stay cached.
                </span>
              )
            ) : res ? (
              <span>
                Rebuilt in <span className="font-mono text-white">{totalTime.toFixed(1)}s</span>: {res.status.filter((x, i) => x === "cached" && lines[i].k !== "meta").length} of {nSteps} steps CACHED.
                {(() => {
                  const install = lines.findIndex((l) => /pip install|npm ci|go mod download/.test(l.t));
                  if (!res.ed.code || res.ed.deps || install < 0) return "";
                  return res.plan.rebuild[install]
                    ? ` Only ${D.code} changed, yet the slow ${lines[install].t.split(" ").slice(1, 3).join(" ")} ran again: COPY . . comes before it, so any code edit invalidates it.`
                    : ` The slow ${lines[install].t.split(" ").slice(1, 3).join(" ")} stayed CACHED because ${D.deps} didn't change.`;
                })()}
              </span>
            ) : (
              <span>The image was built before, so the cache holds every step. Edit something, then Rebuild.</span>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <Label className="mb-1">myapp:latest · {hsize(imgSize)}</Label>
          <div className="flex flex-col gap-[3px]">
            <div className="flex items-center justify-between rounded border border-dashed border-fuchsia-400/60 bg-fuchsia-500/10 px-2 py-0.5 font-mono text-[10px] text-fuchsia-200">
              <span>container layer (rw)</span>
              <span>{hsize(rw)}</span>
            </div>
            {stack.map(({ l, i }) => {
              const st = status[i];
              const col = IL_TONE[st] || C.ink600;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-2 rounded border px-2 font-mono text-[10px] transition-colors duration-300 ${st === "running" ? "animate-pulse" : ""}`}
                  style={{ height: layerH(l.size), borderColor: col, background: st === "pending" ? "#2a1f0b" : st === "rebuilt" || st === "running" ? "#0c2a3d" : st === "cached" ? "#0f2a22" : C.ink800, borderStyle: st === "pending" ? "dashed" : "solid" }}
                >
                  <span className="truncate text-slate-200">{l.s}</span>
                  <span className="shrink-0 text-slate-400">{st === "cached" ? "CACHED" : st === "rebuilt" ? "rebuilt" : st === "pending" ? "invalid" : hsize(l.size)}</span>
                </div>
              );
            })}
            <div className="flex min-h-[2.75rem] flex-col justify-center rounded border px-2 py-1 font-mono text-[10px] leading-snug" style={{ borderColor: IL_TONE[status[0]] || C.ink600, background: "repeating-linear-gradient(135deg, #161a28, #161a28 6px, #1b2032 6px, #1b2032 12px)" }}>
              <span className="text-slate-200">{D.base}</span>
              <span className="text-slate-500">{D.baseLayers} layers · {hsize(D.baseSize)} · shared with other images</span>
            </div>
          </div>
          <div className="mt-1.5 rounded border border-ink-700 bg-ink-800 px-2 py-1 font-mono text-[10px] leading-snug text-slate-400">
            <span className="text-slate-500">config: </span>
            {meta.join(" · ")}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Legend color={C.emerald} label="cached" />
            <Legend color={C.sky} label="rebuilt" />
            <Legend color={C.amber} label="invalidated" dashed />
          </div>
        </div>
      </div>
      <Label className="mb-1 mt-3">build output</Label>
      <pre style={NOLIG} className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-2.5 font-mono text-[10.5px] leading-relaxed text-slate-400">
        <div className="text-slate-300">[+] Building {res && !building ? `${totalTime.toFixed(1)}s (${nSteps + 2}/${nSteps + 2}) FINISHED` : building ? "…" : "—"}</div>
        {lines.map((l, i) => {
          if (l.k === "meta") return null;
          const st = status[i];
          const name = l.k === "base" ? `FROM docker.io/library/${D.base}` : l.t.length > 44 ? l.t.slice(0, 43) + "…" : l.t;
          const t = st === "rebuilt" ? `${(l.time || 0).toFixed(1)}s` : st === "cached" ? "0.0s" : st === "running" ? "…" : "";
          return (
            <div key={i} className="whitespace-pre">
              {" => "}
              {st === "cached" && i > 0 && <span className="text-emerald-300">CACHED </span>}
              <span className={st === "rebuilt" || st === "running" ? "text-sky-200" : st === "pending" ? "text-amber-200" : ""}>[{stepNo(i)}/{nSteps}] {name}</span>
              <span className="text-slate-500">{t ? "  " + t : st === "pending" ? "  (will run)" : ""}</span>
            </div>
          );
        })}
        <div className="whitespace-pre">{" => "}exporting to image{res && !building ? "  0.3s" : ""}</div>
      </pre>
      <div className="mt-4 rounded-lg border border-ink-700 bg-ink-950 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Label>copy-on-write in a running container (overlay2)</Label>
          <span className="font-mono text-[10px] text-slate-500">docker ps -s → SIZE {hsize(rw)} (virtual {hsize(imgSize + rw)})</span>
        </div>
        <div className="mt-2 space-y-1.5">
          {files.map((f) => {
            const st = cow.st[f.p];
            return (
              <div key={f.p} className="flex flex-wrap items-center gap-1.5 rounded-md bg-ink-800 px-2 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-slate-200" title={f.p}>{f.short || f.p}</span>
                <button type="button" onClick={() => cowAct(f.p, "mod")} aria-pressed={st === "mod"} className={`rounded px-1.5 py-0.5 text-[10px] ${st === "mod" ? "bg-sky-500/25 text-sky-200" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}>modify</button>
                <button type="button" onClick={() => cowAct(f.p, "del")} aria-pressed={st === "del"} className={`rounded px-1.5 py-0.5 text-[10px] ${st === "del" ? "bg-rose-500/25 text-rose-200" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}>delete</button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setCow((c) => ({ ...c, created: !c.created }))} aria-pressed={cow.created} className={`rounded px-1.5 py-0.5 text-[10px] ${cow.created ? "bg-fuchsia-500/25 text-fuchsia-200" : "bg-ink-700 text-slate-300 hover:bg-ink-600"}`}>
              {cow.created ? "✓ " : ""}create /tmp/cache.db (1.2 MB)
            </button>
            <button type="button" onClick={() => setCow({ st: {}, created: false })} className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-ink-600">docker rm + run again (fresh rw layer)</button>
          </div>
        </div>
        <div className="mt-3 grid gap-1.5 font-mono text-[10px]">
          {[
            ["merged view (what the process sees)", "border-slate-500/50", files.map((f) => {
              const st = cow.st[f.p];
              return st === "del" ? null : [base(f.p), st === "mod" ? "← rw layer (modified copy)" : `← ${fromLabel(f)}`, st === "mod" ? "text-sky-200" : "text-slate-300"];
            }).filter(Boolean).concat(cow.created ? [["cache.db", "← rw layer", "text-fuchsia-200"]] : [])],
            ["upperdir: container layer (rw)", "border-fuchsia-400/50", files.map((f) => {
              const st = cow.st[f.p];
              return st === "mod" ? [base(f.p), `copied up whole: ${hsize(f.size)}`, "text-sky-200"] : st === "del" ? [`.wh.${base(f.p)}`, "whiteout: hides the lower file", "text-rose-300"] : null;
            }).filter(Boolean).concat(cow.created ? [["cache.db", "new file: 1.2MB", "text-fuchsia-200"]] : [])],
            ["lowerdir: image layers (read-only)", "border-emerald-400/40", files.map((f) => [base(f.p), `${fromLabel(f)} · never changes`, "text-slate-400"])],
          ].map(([title, border, items]) => (
            <div key={title} className={`rounded-md border ${border} px-2 py-1.5`}>
              <div className="mb-1 text-[9.5px] uppercase tracking-wider text-slate-500">{title}</div>
              {items.length === 0 ? <div className="text-slate-600">empty</div> : (
                <div className="flex flex-wrap gap-1">
                  {items.map(([n, why, cls]) => (
                    <span key={n} className="rounded bg-ink-800 px-1.5 py-0.5">
                      <span className={cls}>{n}</span> <span className="text-slate-500">{why}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
          Modifying even one byte of a file from an image layer first copies the whole file up into the writable layer. Deleting it only adds a whiteout, so the image (and its size) never changes. The writable layer disappears with docker rm: keep data you care about in a volume.
        </div>
      </div>
    </Card>
  );
}

/* ---------- multi-stage-build: build with the SDK, ship only the artefact ---------- */

// step: [line, stage ("b" builder / "r" runtime), kind, label, size (bytes), explanation]
const MS_LANG = {
  go: {
    label: "Go",
    df: [
      "# syntax=docker/dockerfile:1",
      "FROM golang:1.22 AS builder",
      "WORKDIR /src",
      "COPY go.mod go.sum ./",
      "RUN go mod download",
      "COPY . .",
      'RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/app ./cmd/server',
      "",
      "FROM gcr.io/distroless/static-debian12:nonroot",
      "COPY --from=builder /out/app /app",
      "USER nonroot:nonroot",
      "EXPOSE 8080",
      'ENTRYPOINT ["/app"]',
    ],
    single: ["FROM golang:1.22", "WORKDIR /src", "COPY go.mod go.sum ./", "RUN go mod download", "COPY . .", "RUN go build -o /app ./cmd/server", "EXPOSE 8080", 'ENTRYPOINT ["/app"]'],
    artefact: "/out/app",
    steps: [
      [1, "b", "base", "golang:1.22", 814e6, "The builder stage starts from the full Go SDK image: the Go toolchain, git, gcc and a Debian userland. Big, but you only need it while compiling."],
      [3, "b", "layer", "go.mod go.sum", 9.8e3, "Copy only the module files first, so the dependency download below stays cached until go.mod or go.sum change."],
      [4, "b", "layer", "module cache", 95e6, "go mod download fills the module cache (/go/pkg/mod) with every dependency's source."],
      [5, "b", "layer", "source code", 0.1e6, "Now the rest of the source. Editing code only invalidates this step and the build after it."],
      [6, "b", "layer", "binary + build cache", 68e6, "CGO_ENABLED=0 produces a fully static binary that needs no libc; -ldflags=\"-s -w\" strips debug info. Besides the 9.6 MB binary, the layer also holds Go's build cache."],
      [8, "r", "base", "distroless/static", 2.0e6, "The runtime stage starts from scratch-like distroless/static: CA certificates, /etc/passwd with a nonroot user, timezone data. No shell, no package manager, nothing to exploit. BuildKit can pull this in parallel with the builder."],
      [9, "r", "copy", "/app binary", 9.6e6, "COPY --from=builder copies just the compiled binary out of the builder stage. The SDK, the module cache and the source code stay behind."],
      [10, "r", "meta", "USER · EXPOSE · ENTRYPOINT", 0, "Run as the unprivileged nonroot user. These are config only, no layers."],
    ],
    singleSeg: [["golang:1.22 SDK", 814e6, "base"], ["module cache", 95e6, "deps"], ["source", 0.1e6, "app"], ["binary + build cache", 68e6, "junk"]],
    multiSeg: [["distroless/static", 2.0e6, "base"], ["binary", 9.6e6, "app"]],
  },
  node: {
    label: "Node.js",
    df: [
      "# syntax=docker/dockerfile:1",
      "FROM node:20 AS builder",
      "WORKDIR /app",
      "COPY package.json package-lock.json ./",
      "RUN npm ci",
      "COPY . .",
      "RUN npm run build",
      "",
      "FROM node:20-alpine",
      "WORKDIR /app",
      "ENV NODE_ENV=production",
      "COPY package.json package-lock.json ./",
      "RUN npm ci --omit=dev && npm cache clean --force",
      "COPY --from=builder /app/dist ./dist",
      "USER node",
      "EXPOSE 3000",
      'CMD ["node", "dist/server.js"]',
    ],
    single: ["FROM node:20", "WORKDIR /app", "COPY package.json package-lock.json ./", "RUN npm ci", "COPY . .", "RUN npm run build", "EXPOSE 3000", 'CMD ["node", "dist/server.js"]'],
    artefact: "/app/dist",
    steps: [
      [1, "b", "base", "node:20", 1.1e9, "The builder uses the full node:20 image (Debian with build tools such as python3, make and g++ for native add-ons)."],
      [3, "b", "layer", "package*.json", 61e3, "Copy the manifests first so npm ci stays cached while only source files change."],
      [4, "b", "layer", "all deps (incl. dev)", 310e6, "npm ci installs everything, including devDependencies such as TypeScript, the bundler and the test runner."],
      [5, "b", "layer", "source code", 1.2e6, "The source, tests and config (.dockerignore keeps node_modules and .git out)."],
      [6, "b", "layer", "dist/", 4.1e6, "npm run build compiles TypeScript and bundles the app into dist/."],
      [8, "r", "base", "node:20-alpine", 135e6, "The runtime stage starts from the small Alpine-based Node image."],
      [12, "r", "layer", "prod deps only", 48e6, "Production dependencies are installed here, in the runtime stage, so any native add-ons are compiled against Alpine's musl libc instead of being copied from the Debian (glibc) builder."],
      [13, "r", "copy", "dist/", 4.1e6, "COPY --from=builder brings over only the built dist/ folder. devDependencies, sources and tests stay in the builder."],
      [14, "r", "meta", "USER · EXPOSE · CMD", 0, "Run as the image's unprivileged node user. Config only, no layers."],
    ],
    singleSeg: [["node:20", 1.1e9, "base"], ["all deps (incl. dev)", 310e6, "deps"], ["source + dist", 5.3e6, "app"]],
    multiSeg: [["node:20-alpine", 135e6, "base"], ["prod deps", 48e6, "deps"], ["dist/", 4.1e6, "app"]],
  },
  python: {
    label: "Python",
    df: [
      "# syntax=docker/dockerfile:1",
      "FROM python:3.12 AS builder",
      "RUN python -m venv /opt/venv",
      'ENV PATH="/opt/venv/bin:$PATH"',
      "COPY requirements.txt .",
      "RUN pip install --no-cache-dir -r requirements.txt",
      "",
      "FROM python:3.12-slim",
      "COPY --from=builder /opt/venv /opt/venv",
      'ENV PATH="/opt/venv/bin:$PATH"',
      "WORKDIR /app",
      "COPY . .",
      "USER 1000",
      "EXPOSE 8000",
      'CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]',
    ],
    single: ["FROM python:3.12", "WORKDIR /app", "COPY requirements.txt .", "RUN pip install -r requirements.txt", "COPY . .", "EXPOSE 8000", 'CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:app"]'],
    artefact: "/opt/venv",
    steps: [
      [1, "b", "base", "python:3.12", 1.02e9, "The builder uses the full python:3.12 image, which has gcc and the C headers needed to build wheels for packages that don't ship a prebuilt one."],
      [2, "b", "layer", "empty venv", 21e6, "A virtual environment in /opt/venv gives us one self-contained folder to copy later."],
      [4, "b", "layer", "requirements.txt", 0.4e3, "Copy the requirements first: the install below stays cached until they change."],
      [5, "b", "layer", "venv with deps", 92e6, "pip builds or downloads the wheels and installs them into the venv. The compilers that were needed stay in this stage."],
      [7, "r", "base", "python:3.12-slim", 124e6, "The runtime stage uses python:3.12-slim: the same Python build (so the venv works unchanged) without compilers and headers."],
      [8, "r", "copy", "/opt/venv", 92e6, "COPY --from=builder copies the ready-made venv. No gcc, no build artefacts, no pip cache."],
      [11, "r", "layer", "app code", 0.2e6, "Your application code goes in last, so editing it rebuilds only this small layer."],
      [12, "r", "meta", "USER · EXPOSE · CMD", 0, "Run as an unprivileged user. Config only, no layers."],
    ],
    singleSeg: [["python:3.12", 1.02e9, "base"], ["deps (+ pip cache)", 118e6, "deps"], ["app code", 0.2e6, "app"]],
    multiSeg: [["python:3.12-slim", 124e6, "base"], ["venv", 92e6, "deps"], ["app code", 0.2e6, "app"]],
  },
  java: {
    label: "Java",
    df: [
      "# syntax=docker/dockerfile:1",
      "FROM maven:3.9-eclipse-temurin-21 AS builder",
      "WORKDIR /build",
      "COPY pom.xml .",
      "RUN mvn -B -q dependency:go-offline",
      "COPY src ./src",
      "RUN mvn -B -q package -DskipTests",
      "",
      "FROM eclipse-temurin:21-jre",
      "WORKDIR /app",
      "COPY --from=builder /build/target/app.jar app.jar",
      "USER 1000",
      "EXPOSE 8080",
      'ENTRYPOINT ["java", "-jar", "app.jar"]',
    ],
    single: ["FROM maven:3.9-eclipse-temurin-21", "WORKDIR /build", "COPY pom.xml .", "RUN mvn dependency:go-offline", "COPY src ./src", "RUN mvn package -DskipTests", "EXPOSE 8080", 'ENTRYPOINT ["java", "-jar", "target/app.jar"]'],
    artefact: "app.jar",
    steps: [
      [1, "b", "base", "maven + JDK 21", 518e6, "The builder has Maven and a full JDK 21 (compiler, jlink, debugging tools)."],
      [3, "b", "layer", "pom.xml", 4e3, "Copy pom.xml alone so the dependency download stays cached between code changes."],
      [4, "b", "layer", "~/.m2 repository", 162e6, "dependency:go-offline downloads every dependency and plugin into the local Maven repository."],
      [5, "b", "layer", "src/", 0.4e6, "The Java sources."],
      [6, "b", "layer", "target/ (classes + jar)", 41e6, "mvn package compiles and produces target/app.jar, a fat jar with the dependencies inside (Spring Boot style)."],
      [8, "r", "base", "eclipse-temurin:21-jre", 263e6, "The runtime stage only needs a JRE: no compiler, no Maven. (A jlink-built custom runtime can go even smaller.)"],
      [10, "r", "copy", "app.jar", 38e6, "COPY --from=builder takes just the jar. The Maven repository, sources and classes stay behind."],
      [11, "r", "meta", "USER · EXPOSE · ENTRYPOINT", 0, "Run as an unprivileged user. Config only, no layers."],
    ],
    singleSeg: [["maven + JDK 21", 518e6, "base"], ["~/.m2 repository", 162e6, "deps"], ["src + target/", 41.4e6, "app"]],
    multiSeg: [["temurin 21 JRE", 263e6, "base"], ["app.jar", 38e6, "app"]],
  },
};
const MS_SEG = { base: "#475569", deps: C.amber, app: C.emerald, junk: C.rose };
const MS_SEG_NAME = { base: "base image", deps: "dependencies", app: "your app", junk: "build leftovers" };

export function MultiStageBuild({ params = {} }) {
  const prm = obj(params);
  const [lang, setLang] = useState(() => oneOf(prm.lang, ["go", "node", "python", "java"], "go", { golang: "go", js: "node", nodejs: "node", "node.js": "node", javascript: "node", typescript: "node", ts: "node", py: "python", jvm: "java", spring: "java", kotlin: "java" }));
  const [showSingle, setShowSingle] = useState(false);
  const L = MS_LANG[lang];
  const steps = L.steps;
  // one extra final step: the result
  const sp = useStepper(steps.length + 1, { dwell: 2.6, move: 0.6 });
  const pick = (k) => {
    setLang(k);
    sp.reset();
  };
  const at = sp.at;
  const final = at === steps.length;
  const cur = final ? null : steps[at];
  const shown = steps.slice(0, Math.min(at + 1, steps.length));
  const copyIdx = steps.findIndex((s) => s[2] === "copy");
  const moving = sp.moving && at + 1 === copyIdx;
  const sum = (seg) => seg.reduce((a, s) => a + s[1], 0);
  const single = sum(L.singleSeg), multi = sum(L.multiSeg);
  const max = single;
  const firstR = L.df.findIndex((l, i) => i > 1 && l.startsWith("FROM"));
  const marks = {};
  L.df.forEach((l, i) => {
    if (!l || l.startsWith("#")) return;
    marks[i] = i < firstR ? "amberDim" : "emeraldDim";
  });
  if (cur) marks[cur[0]] = "sky";
  if (final) L.df.forEach((l, i) => i >= firstR && l && (marks[i] = "emerald"));

  const col = (stage) => {
    const ls = shown.filter((s) => s[1] === stage);
    const discarded = stage === "b" && final;
    return (
      <div className={`min-w-0 rounded-lg border p-2 transition-opacity duration-500 ${stage === "b" ? "border-amber-400/40" : "border-emerald-400/40"} ${discarded ? "opacity-45" : ""}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-[11px] font-semibold ${stage === "b" ? "text-amber-200" : "text-emerald-200"}`}>{stage === "b" ? "stage 1 · builder" : "stage 2 · runtime (final image)"}</span>
          <span className="shrink-0 font-mono text-[10px] text-slate-500">{hsize(ls.reduce((a, s) => a + s[4], 0))}</span>
        </div>
        <div className="mt-1.5 flex min-h-[7.5rem] flex-col-reverse justify-end gap-[3px]">
          {ls.map((s, i) => {
            const isCur = cur && s === cur;
            const kindCls = s[2] === "base" ? "bg-ink-700 text-slate-200" : s[2] === "copy" ? "bg-emerald-500/20 text-emerald-100" : s[2] === "meta" ? "bg-transparent text-slate-500 border-dashed" : "bg-ink-800 text-slate-300";
            return (
              <div key={i} className={`flex items-center justify-between gap-2 rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${isCur ? "border-sky-400" : "border-ink-600"} ${kindCls}`} style={{ minHeight: s[2] === "base" ? 26 : 18 }}>
                <span className="truncate">{s[2] === "copy" ? `⇐ ${s[3]}` : s[3]}</span>
                <span className="shrink-0 text-slate-500">{s[2] === "meta" ? "config" : hsize(s[4])}</span>
              </div>
            );
          })}
          {ls.length === 0 && <div className="text-[10px] text-slate-600">waiting…</div>}
        </div>
        {discarded && <div className="mt-1 text-[10px] text-slate-400">not part of the final image (kept only in the build cache)</div>}
      </div>
    );
  };

  return (
    <Card
      title={`Multi-stage build: ${L.label}`}
      params={params}
      caption="Press Play or Step to build both stages. The builder stage has the full SDK and compiles your app; COPY --from=builder moves only the artefact into a small runtime image, and the builder is thrown away. The bars compare the final size with a single-stage Dockerfile that ships the whole toolchain. Smaller images pull faster and have far fewer packages that could carry vulnerabilities."
    >
      <Choice label="Language" options={[["go", "Go"], ["node", "Node.js"], ["python", "Python"], ["java", "Java"]]} value={lang} onChange={pick} />
      <div className="relative mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {col("b")}
        {col("r")}
        {(moving || (cur && cur[2] === "copy" && !sp.moving)) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span
              className="rounded-full border border-emerald-300 bg-emerald-400 px-2 py-0.5 font-mono text-[10px] font-bold text-ink-950 shadow-lg"
              style={{ transform: `translate(${moving ? lerp(-60, 0, sp.p) : 0}%, 0)`, opacity: moving ? 1 : 0.9 }}
            >
              COPY --from=builder {L.artefact}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 min-h-[64px] rounded-lg bg-ink-800 px-3 py-2" aria-live="polite">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">
          Step {at + 1} / {steps.length + 1}
          {cur && <span className={cur[1] === "b" ? "text-amber-300" : "text-emerald-300"}> · {cur[1] === "b" ? "builder" : "runtime"}</span>}
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-slate-300">
          {cur ? cur[5] : `Done. The final image is just the runtime stage: ${hsize(multi)} instead of ${hsize(single)} for the single-stage build (${Math.round(single / multi)}× smaller). docker build --target builder would stop at stage 1, which is handy for running tests.`}
        </div>
      </div>
      <StepperControls sp={sp} />
      <div className="mt-3 space-y-2">
        {[["single-stage", L.singleSeg, single], ["multi-stage", L.multiSeg, multi]].map(([name, seg, tot]) => (
          <div key={name}>
            <div className="mb-0.5 flex items-baseline justify-between text-[11px]">
              <span className={name === "multi-stage" ? "text-emerald-200" : "text-slate-300"}>{name}</span>
              <span className="font-mono text-slate-200">{hsize(tot)}</span>
            </div>
            <div className="flex h-4 w-full overflow-hidden rounded bg-ink-800" role="img" aria-label={`${name} image: ${hsize(tot)}: ${seg.map((s) => `${s[0]} ${hsize(s[1])}`).join(", ")}`}>
              {seg.map((s, i) => (
                <div key={i} title={`${s[0]}: ${hsize(s[1])}`} style={{ width: `${Math.max(0.6, (s[1] / max) * 100)}%`, background: MS_SEG[s[2]], opacity: name === "multi-stage" && !final ? 0.55 : 1, transition: "opacity 0.5s" }} className="h-full border-r border-ink-950 last:border-r-0" />
              ))}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-slate-500">{seg.map((s) => `${s[0]} ${hsize(s[1])}`).join(" + ")}</div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {["base", "deps", "app", "junk"].map((k) => <Legend key={k} color={MS_SEG[k]} label={MS_SEG_NAME[k]} />)}
        </div>
      </div>
      <Row>
        <Toggle label="show the single-stage Dockerfile" on={showSingle} onChange={setShowSingle} />
      </Row>
      <div className="mt-2 grid gap-2">
        <DockerfileView label={`Dockerfile (multi-stage) · builder lines in amber, runtime in green`} lines={L.df} marks={marks} />
        {showSingle && <DockerfileView label="Dockerfile (single-stage, for comparison)" lines={L.single} marks={{}} />}
      </div>
    </Card>
  );
}

export const WIDGETS_H = {
  "docker-architecture": DockerArchitecture,
  "container-lifecycle": ContainerLifecycle,
  "docker-terminal": DockerTerminal,
  "image-layers": ImageLayers,
  "multi-stage-build": MultiStageBuild,
};
