"use client";

// Lesson editor helpers for admins: a Markdown toolbar (image upload,
// flowchart and interactive diagram snippets, preview) and the quiz editor.
import { useRef, useState } from "react";
import { getToken } from "@/lib/api";
import { Markdown } from "./ProblemStatement";
import { DIAGRAM_NAMES } from "./diagrams";

const BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

const FLOWCHART = `\`\`\`mermaid
flowchart LR
  A["Collect data"] --> B["Clean data"] --> C{"Good enough?"}
  C -->|yes| D["Train model"]
  C -->|no| B
\`\`\``;

export function LessonContentEditor({ value, onChange }) {
  const area = useRef(null);
  const file = useRef(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Inserts text at the cursor (or the end) on its own lines.
  const insert = (snippet) => {
    const el = area.current;
    const at = el && document.activeElement === el ? el.selectionStart : value.length;
    const before = value.slice(0, at).replace(/\n*$/, "");
    const after = value.slice(at).replace(/^\n*/, "");
    onChange(`${before}${before ? "\n\n" : ""}${snippet}\n\n${after}`);
  };

  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/admin/uploads/image`, {
        method: "POST",
        headers: { "Content-Type": f.type, Authorization: `Bearer ${getToken()}` },
        body: f,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Upload failed");
      insert(`![${f.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "")}](${d.url})`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <label className="label mb-0 mr-auto">Content (Markdown, use ``` for code blocks)</label>
        <button type="button" className="tab" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? "Uploading…" : "🖼 Image"}
        </button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={upload} />
        <button type="button" className="tab" onClick={() => insert(FLOWCHART)} title="A Mermaid flowchart you can edit">
          🔀 Flowchart
        </button>
        <select
          className="input w-auto py-1 text-xs"
          value=""
          onChange={(e) => e.target.value && insert("```diagram\n" + e.target.value + "\n```")}
          title="An interactive animated diagram"
        >
          <option value="">✨ Interactive diagram…</option>
          {DIAGRAM_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className={`tab ${preview ? "tab-active" : ""}`} onClick={() => setPreview(!preview)}>
          👁 Preview
        </button>
      </div>
      {error && <p className="mb-1 text-xs text-rose-300">{error}</p>}
      {preview ? (
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-ink-700 bg-ink-950 p-4">
          <Markdown size="base">{value || "_Nothing yet._"}</Markdown>
        </div>
      ) : (
        <textarea ref={area} className="input font-mono text-xs" rows={14} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

const newQuestion = () => ({ question: "", options: ["", "", "", ""], answer: 0, explanation: "" });

export function QuizEditor({
  quiz,
  onChange,
  label = "Quiz (optional multiple-choice check at the end of the lesson)",
  addLabel = "+ Add quiz question",
  withCode = false,
}) {
  const setQ = (i, patch) => onChange(quiz.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  return (
    <div>
      <label className="label">{label}</label>
      <div className="space-y-3">
        {quiz.map((q, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
            <div className="flex gap-2">
              <span className="pt-2 text-xs text-slate-500">{i + 1}.</span>
              <input className="input" placeholder="Question" value={q.question} onChange={(e) => setQ(i, { question: e.target.value })} />
              <button type="button" className="tab text-rose-400" title="Remove question" onClick={() => onChange(quiz.filter((_, k) => k !== i))}>
                ✕
              </button>
            </div>
            {withCode && (
              <textarea
                className="input ml-5 w-[calc(100%-1.25rem)] font-mono text-xs"
                rows={Math.max(2, (q.code || "").split("\n").length)}
                placeholder="Code shown with the question (optional)"
                value={q.code || ""}
                onChange={(e) => setQ(i, { code: e.target.value })}
              />
            )}
            {q.options.map((o, j) => (
              <div key={j} className="flex items-center gap-2 pl-5">
                <input
                  type="radio"
                  className="accent-emerald-500"
                  name={`quiz-${i}-${q.question.length}`}
                  checked={q.answer === j}
                  onChange={() => setQ(i, { answer: j })}
                  title="Correct answer"
                />
                <input
                  className={`input py-1 text-sm ${q.answer === j ? "border-emerald-500/60" : ""}`}
                  placeholder={`Option ${String.fromCharCode(65 + j)}`}
                  value={o}
                  onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                />
                {q.options.length > 2 && (
                  <button
                    type="button"
                    className="tab text-xs"
                    onClick={() =>
                      setQ(i, {
                        options: q.options.filter((_, k) => k !== j),
                        answer: q.answer === j ? 0 : q.answer > j ? q.answer - 1 : q.answer,
                      })
                    }
                  >
                    −
                  </button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pl-5">
              {q.options.length < 6 && (
                <button type="button" className="tab text-xs" onClick={() => setQ(i, { options: [...q.options, ""] })}>
                  + Option
                </button>
              )}
              <input
                className="input flex-1 py-1 text-sm"
                placeholder="Why is it right? (shown after checking)"
                value={q.explanation}
                onChange={(e) => setQ(i, { explanation: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost mt-2" onClick={() => onChange([...quiz, newQuestion()])}>
        {addLabel}
      </button>
    </div>
  );
}
