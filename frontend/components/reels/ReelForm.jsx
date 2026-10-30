"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import ReelPlayer from "./ReelPlayer";

export const TEMPLATES = {
  code: { label: "Code walkthrough", hint: "Highlight lines, show variables and output as a program runs." },
  array: { label: "Array / bars", hint: "Boxes or bars that highlight, move and swap (searching, sorting, slicing)." },
  stack: { label: "Stack / queue / calls", hint: "Items pushed and popped, a queue, or a recursion call stack." },
  dict: { label: "Dictionary", hint: "Keys and values appearing and changing." },
  slides: { label: "Slides", hint: "Simple animated cards with a title, text and code." },
  plot: { label: "Plot (ML)", hint: "Points, a line, a curve, centroids or a moving ball on x/y axes: regression, clustering, KNN, gradient descent." },
  graph: { label: "Graph (ML)", hint: "Boxes and arrows (decision tree, pipeline) or a neural network by layer sizes, with nodes and edges lighting up." },
};

const STEP_DEFAULTS = {
  code: { caption: "", line: 1, vars: {}, output: "" },
  array: { caption: "", array: [3, 1, 2] },
  stack: { caption: "", items: [] },
  dict: { caption: "", entries: [] },
  slides: { caption: "", title: "", body: "" },
  plot: { caption: "", points: [[2, 3], [4, 5], [6, 6], [8, 9]] },
  graph: { caption: "", active: [] },
};

export function newAnimation(template) {
  return {
    template,
    stepMs: 2800,
    ...(template === "code" && { language: "python", code: "x = 1\nprint(x)" }),
    ...(template === "array" && { bars: false }),
    ...(template === "stack" && { mode: "stack" }),
    ...(template === "plot" && { xRange: [0, 10], yRange: [0, 10], xLabel: "x", yLabel: "y" }),
    ...(template === "graph" && { layers: [3, 4, 2] }),
    steps: [{ ...STEP_DEFAULTS[template], caption: "First step" }, { ...STEP_DEFAULTS[template], caption: "Second step" }],
  };
}

export const EMPTY_REEL = {
  title: "",
  slug: "",
  description: "",
  topicId: null,
  practiceSlug: "",
  kind: "ANIMATION",
  animation: newAnimation("code"),
  videoUrl: "",
  allowDownload: true,
};

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Small text formats so steps are quick to type.
const toCsv = (list) => (list || []).join(", ");
const fromCsv = (text, numbers) =>
  text
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "")
    .map((x) => (numbers || /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x));
const toPairs = (obj, sep = "=") => Object.entries(obj || {}).map(([k, v]) => `${k}${sep}${v}`).join("\n");
const fromPairs = (text, sep = "=") =>
  Object.fromEntries(
    text
      .split("\n")
      .map((l) => l.split(sep))
      .filter(([k, ...rest]) => k.trim() && rest.length)
      .map(([k, ...rest]) => [k.trim(), rest.join(sep).trim()]),
  );

/** Uncontrolled text box that converts on blur, so typing commas isn't fought. */
function Lazy({ value, parse, format, className = "input", multiline, placeholder }) {
  const [text, setText] = useState(format(value));
  useEffect(() => setText(format(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const Tag = multiline ? "textarea" : "input";
  return (
    <Tag
      className={`${className} font-mono text-xs`}
      rows={multiline ? 3 : undefined}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => parse(text)}
    />
  );
}

function StepFields({ template, step, set }) {
  const f = (k) => (e) => set({ [k]: e.target.value });
  const opt = (k, v) => set({ [k]: v === "" || v === undefined || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) ? undefined : v });
  switch (template) {
    case "code":
      return (
        <div className="grid gap-2 sm:grid-cols-[90px_1fr_1fr]">
          <div>
            <label className="label">Line</label>
            <input className="input" type="number" min={1} value={step.line ?? ""} onChange={(e) => opt("line", e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div>
            <label className="label">Variables (name=value per line)</label>
            <Lazy multiline value={step.vars} format={(v) => toPairs(v)} parse={(t) => opt("vars", fromPairs(t))} placeholder={"i=0\ntotal=5"} />
          </div>
          <div>
            <label className="label">Output so far</label>
            <textarea className="input font-mono text-xs" rows={3} value={step.output ?? ""} onChange={f("output")} />
          </div>
        </div>
      );
    case "array":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="label">Array values (comma separated)</label>
            <Lazy value={step.array} format={toCsv} parse={(t) => set({ array: fromCsv(t) })} />
          </div>
          <div>
            <label className="label">Highlight indexes</label>
            <Lazy value={step.highlight} format={toCsv} parse={(t) => opt("highlight", fromCsv(t, true))} placeholder="2, 3" />
          </div>
          <div>
            <label className="label">Done (green) indexes</label>
            <Lazy value={step.done} format={toCsv} parse={(t) => opt("done", fromCsv(t, true))} />
          </div>
          <div>
            <label className="label">Swapped since last step</label>
            <Lazy value={step.swap} format={toCsv} parse={(t) => opt("swap", fromCsv(t, true).slice(0, 2))} placeholder="1, 2" />
          </div>
          <div>
            <label className="label">Pointers (label=index)</label>
            <Lazy multiline value={step.pointers} format={(v) => toPairs(v)} parse={(t) => opt("pointers", Object.fromEntries(Object.entries(fromPairs(t)).map(([k, v]) => [k, Number(v)])))} placeholder={"lo=0\nhi=5"} />
          </div>
          <div>
            <label className="label">Visible range (lo, hi)</label>
            <Lazy value={step.range} format={toCsv} parse={(t) => opt("range", fromCsv(t, true).slice(0, 2))} placeholder="0, 7" />
          </div>
        </div>
      );
    case "stack":
      return (
        <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
          <div>
            <label className="label">Items, bottom / front first (comma separated)</label>
            <Lazy value={step.items} format={toCsv} parse={(t) => set({ items: fromCsv(t).map(String) })} />
          </div>
          <div>
            <label className="label">Just popped</label>
            <input className="input font-mono text-xs" value={step.popped ?? ""} onChange={(e) => opt("popped", e.target.value)} />
          </div>
        </div>
      );
    case "dict":
      return (
        <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
          <div>
            <label className="label">Entries (key: value per line)</label>
            <Lazy multiline value={step.entries} format={(e) => (e || []).map(([k, v]) => `${k}: ${v}`).join("\n")} parse={(t) => set({ entries: Object.entries(fromPairs(t, ":")) })} />
          </div>
          <div>
            <label className="label">Highlight key</label>
            <input className="input font-mono text-xs" value={step.highlight ?? ""} onChange={(e) => opt("highlight", e.target.value)} />
          </div>
        </div>
      );
    case "plot":
    case "graph": {
      // These have many optional parts, so they're edited as JSON (everything except caption and spoken text).
      const { caption: _c, say: _s, ...rest } = step;
      const hint =
        template === "plot"
          ? '{"points": [[x, y, group]], "line": [m, b], "curve": "sigmoid", "marker": [x, y], "centroids": [[x, y, group]], "query": [x, y], "radius": 2, "segments": [[x1, y1, x2, y2]], "highlight": [0], "shade": [x1, x2], "label": "loss = 2.3"}'
          : '{"active": ["id"], "done": ["id"], "path": [["from", "to"]], "flow": "forward", "values": {"id": "0.7"}}';
      return (
        <div>
          <label className="label">Step data (JSON) · e.g. {hint}</label>
          <Lazy
            multiline
            value={rest}
            format={(v) => JSON.stringify(v)}
            parse={(t) => {
              try {
                const v = JSON.parse(t || "{}");
                set(Object.fromEntries(Object.keys({ ...rest, ...v }).map((k) => [k, v[k]])));
              } catch {}
            }}
          />
        </div>
      );
    }
    default:
      return (
        <div className="grid gap-2">
          <input className="input" placeholder="Title" value={step.title ?? ""} onChange={(e) => opt("title", e.target.value)} />
          <textarea className="input text-sm" rows={2} placeholder="Body text" value={step.body ?? ""} onChange={(e) => opt("body", e.target.value)} />
          <textarea className="input font-mono text-xs" rows={2} placeholder="Code (optional)" value={step.code ?? ""} onChange={(e) => opt("code", e.target.value)} />
        </div>
      );
  }
}

function AnimationEditor({ anim, onChange }) {
  const [jsonMode, setJsonMode] = useState(false);
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState("");
  const set = (patch) => onChange({ ...anim, ...patch });
  const setStep = (i, patch) =>
    set({
      steps: anim.steps.map((s, j) => {
        if (j !== i) return s;
        const next = { ...s, ...patch };
        Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
        return next;
      }),
    });
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= anim.steps.length) return;
    const steps = [...anim.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    set({ steps });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label">Template</label>
          <select
            className="input"
            value={anim.template}
            onChange={(e) => onChange(newAnimation(e.target.value))}
            title="Changing the template starts the steps again"
          >
            {Object.entries(TEMPLATES).map(([k, t]) => (
              <option key={k} value={k}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{TEMPLATES[anim.template].hint}</p>
        </div>
        <div>
          <label className="label">Seconds per step</label>
          <input
            className="input"
            type="number"
            min={1.2}
            max={8}
            step={0.1}
            value={anim.stepMs / 1000}
            onChange={(e) => set({ stepMs: Math.round(Number(e.target.value) * 1000) })}
          />
        </div>
        {anim.template === "array" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!anim.bars} onChange={(e) => set({ bars: e.target.checked })} /> Show values as bars
          </label>
        )}
        {anim.template === "stack" && (
          <div>
            <label className="label">Kind</label>
            <select className="input" value={anim.mode} onChange={(e) => set({ mode: e.target.value })}>
              <option value="stack">Stack</option>
              <option value="queue">Queue</option>
              <option value="calls">Call stack (recursion)</option>
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="label">Hook: big opening line, shown and spoken first (optional)</label>
        <input
          className="input"
          maxLength={70}
          placeholder="e.g. Binary search in 30 seconds ⚡"
          value={anim.hook || ""}
          onChange={(e) => set({ hook: e.target.value || undefined })}
        />
      </div>
      {(anim.template === "plot" || anim.template === "graph") && (
        <div>
          <label className="label">
            {anim.template === "plot"
              ? 'Axes (JSON): {"xRange": [0, 10], "yRange": [0, 10], "xLabel": "size", "yLabel": "price"}'
              : 'Graph (JSON): {"layers": [3, 4, 2]} for a neural network (node ids "layer-index"), or {"nodes": [{"id", "label", "x": 0-100, "y": 0-100, "shape": "box"|"circle"}], "edges": [["from", "to", "yes"]]}'}
          </label>
          <Lazy
            multiline
            value={anim}
            format={(a) =>
              JSON.stringify(
                Object.fromEntries(
                  (a.template === "plot" ? ["xRange", "yRange", "xLabel", "yLabel"] : ["layers", "nodes", "edges"]).filter((k) => a[k] !== undefined).map((k) => [k, a[k]]),
                ),
              )
            }
            parse={(t) => {
              try {
                const keys = anim.template === "plot" ? ["xRange", "yRange", "xLabel", "yLabel"] : ["layers", "nodes", "edges"];
                const v = JSON.parse(t || "{}");
                set(Object.fromEntries(keys.map((k) => [k, v[k]])));
              } catch {}
            }}
          />
        </div>
      )}
      {anim.template === "code" && (
        <div>
          <label className="label">Code (keep it short, about 12 lines)</label>
          <textarea className="input font-mono text-xs" rows={8} value={anim.code} onChange={(e) => set({ code: e.target.value })} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">
          Steps <span className="text-sm font-normal text-slate-500">· {((anim.steps.length * anim.stepMs) / 1000).toFixed(0)}s total</span>
        </h3>
        <button
          type="button"
          className="tab text-xs"
          onClick={() => {
            if (!jsonMode) setJson(JSON.stringify(anim, null, 2));
            setJsonMode(!jsonMode);
            setJsonError("");
          }}
        >
          {jsonMode ? "Back to form" : "Edit as JSON"}
        </button>
      </div>

      {jsonMode ? (
        <div className="space-y-2">
          <textarea className="input font-mono text-xs" rows={18} value={json} onChange={(e) => setJson(e.target.value)} />
          {jsonError && <p className="text-xs text-rose-400">{jsonError}</p>}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              try {
                onChange(JSON.parse(json));
                setJsonError("");
                setJsonMode(false);
              } catch (e) {
                setJsonError(e.message);
              }
            }}
          >
            Apply JSON
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {anim.steps.map((s, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-ink-700 p-3">
              <div className="flex items-center gap-2">
                <span className="w-6 text-xs text-slate-500">{i + 1}</span>
                <input className="input" placeholder="Caption shown on screen" maxLength={160} value={s.caption} onChange={(e) => setStep(i, { caption: e.target.value })} />
                <button type="button" className="tab px-1.5" onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="tab px-1.5" onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="tab px-1.5" title="Duplicate" onClick={() => set({ steps: [...anim.steps.slice(0, i + 1), structuredClone(s), ...anim.steps.slice(i + 1)] })}>⧉</button>
                {anim.steps.length > 2 && (
                  <button type="button" className="tab px-1.5 text-rose-400" onClick={() => set({ steps: anim.steps.filter((_, j) => j !== i) })}>✕</button>
                )}
              </div>
              <StepFields template={anim.template} step={s} set={(patch) => setStep(i, patch)} />
              <input
                className="input text-xs"
                maxLength={300}
                placeholder="🔊 Spoken text (optional): how the voice should say it, e.g. x equals five"
                value={s.say || ""}
                onChange={(e) => setStep(i, { say: e.target.value || undefined })}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => set({ steps: [...anim.steps, { ...structuredClone(anim.steps[anim.steps.length - 1]), caption: "" }] })}
          >
            + Add step (copies the last one)
          </button>
        </div>
      )}
    </div>
  );
}

function VideoEditor({ url, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/manage/reels/upload`, {
        method: "POST",
        headers: { "Content-Type": file.type, Authorization: `Bearer ${getToken()}` },
        body: file,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Upload failed");
      onChange(d.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <label className="btn-ghost cursor-pointer">
        {busy ? "Uploading…" : "⬆ Upload a video (MP4, WebM, MOV · max 100 MB)"}
        <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <div>
        <label className="label">…or paste a link (YouTube Shorts or a direct .mp4 URL)</label>
        <input className="input" value={url || ""} onChange={(e) => onChange(e.target.value)} placeholder="https://youtube.com/shorts/…" />
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <p className="text-xs text-slate-500">Vertical (9:16) videos of 15–60 seconds look best.</p>
    </div>
  );
}

/** The reel editor with a live preview. Controlled: `value` + `onChange`. */
export default function ReelForm({ value: r, onChange, isNew, readOnly }) {
  const [tree, setTree] = useState(null);
  const [problems, setProblems] = useState([]);
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [safeZones, setSafeZones] = useState(false);

  useEffect(() => {
    api("/manage/tree").then(setTree).catch(() => setTree({ subjects: [] }));
    api("/manage/problems?status=live").then((d) => setProblems(d.problems)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!tree || !r.topicId) return;
    for (const s of tree.subjects)
      for (const c of s.chapters)
        if (c.topics.some((t) => t.id === r.topicId)) {
          setSubjectId(String(s.id));
          setChapterId(String(c.id));
        }
  }, [tree, r.topicId]);

  const set = (patch) => onChange({ ...r, ...patch });
  const subject = tree?.subjects.find((s) => String(s.id) === subjectId);
  const chapter = subject?.chapters.find((c) => String(c.id) === chapterId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        <section className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Title</label>
              <input className="input" value={r.title} maxLength={80} onChange={(e) => set({ title: e.target.value, ...(isNew && { slug: slugify(e.target.value) }) })} />
            </div>
            <div>
              <label className="label">URL slug</label>
              <input className="input" value={r.slug} onChange={(e) => set({ slug: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">One-line description</label>
            <input className="input" maxLength={300} value={r.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select className="input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setChapterId(""); set({ topicId: null }); }}>
              <option value="">Subject…</option>
              {tree?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
            <select className="input" value={chapterId} disabled={!subject} onChange={(e) => { setChapterId(e.target.value); set({ topicId: null }); }}>
              <option value="">Chapter…</option>
              {subject?.chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="input" value={r.topicId ?? ""} disabled={!chapter} onChange={(e) => set({ topicId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Topic…</option>
              {chapter?.topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">"Practice this" question (optional)</label>
            <select className="input" value={r.practiceSlug || ""} onChange={(e) => set({ practiceSlug: e.target.value })}>
              <option value="">None</option>
              {problems
                .filter((p) => !r.topicId || p.topic?.id === r.topicId)
                .map((p) => (
                  <option key={p.id} value={p.slug}>{p.title}</option>
                ))}
            </select>
            {r.topicId && <p className="mt-1 text-xs text-slate-500">Showing live questions in the chosen topic.</p>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={r.allowDownload !== false} onChange={(e) => set({ allowDownload: e.target.checked })} />
            Let people download this reel as a video
          </label>
          <div className="flex gap-1">
            {[["ANIMATION", "✨ Animation"], ["VIDEO", "🎬 Video"]].map(([k, label]) => (
              <button key={k} type="button" className={`tab ${r.kind === k ? "tab-active" : ""}`} onClick={() => set({ kind: k, ...(k === "ANIMATION" && !r.animation && { animation: newAnimation("code") }) })}>
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="card p-5">
          {r.kind === "ANIMATION" ? (
            <AnimationEditor anim={r.animation} onChange={(animation) => set({ animation })} />
          ) : (
            <VideoEditor url={r.videoUrl} onChange={(videoUrl) => set({ videoUrl })} />
          )}
        </section>
      </fieldset>

      <aside className="lg:sticky lg:top-20 lg:h-fit">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-400">Live preview</span>
          <span className="flex gap-1">
            <button type="button" className={`tab text-xs ${safeZones ? "tab-active" : ""}`} onClick={() => setSafeZones(!safeZones)} title="Show where Instagram's buttons and caption cover the video">
              📱 Insta safe zones
            </button>
            <button type="button" className="tab text-xs" onClick={() => setPreviewKey((k) => k + 1)}>
              ↻ Restart
            </button>
          </span>
        </div>
        <div className="h-[600px]">
          <ReelPlayer key={previewKey} reel={r} active showSafeZones={safeZones} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The downloaded MP4 is 1080×1920 with a natural voice-over, ready to upload to Instagram Reels, YouTube Shorts or WhatsApp.
        </p>
      </aside>
    </div>
  );
}
