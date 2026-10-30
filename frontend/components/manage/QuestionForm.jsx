"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LANGUAGE_LABEL, Spinner } from "../ui";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: () => <Spinner label="Loading editor…" /> });

export const EMPTY_QUESTION = {
  title: "",
  slug: "",
  difficulty: "EASY",
  topicId: null,
  tags: [],
  companies: [],
  timeLimitMs: 2000,
  description: "",
  inputFormat: "",
  outputFormat: "",
  constraints: "",
  hints: [],
  editorial: "",
  solutionLanguage: "python",
  solutionCode: "",
  starterCode: {},
  testCases: [
    { input: "", expected: "", isSample: true, explanation: "" },
    { input: "", expected: "", isSample: false, explanation: "" },
  ],
};

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const csv = (list) => list.join(", ");
const fromCsv = (text) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

function Section({ title, hint, children }) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold text-white">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * The question editor. Controlled by the page: `value` is the question and
 * `onChange` receives the whole updated question.
 */
export default function QuestionForm({ value: q, onChange, isNew, readOnly }) {
  const [tree, setTree] = useState(null);
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [starterLang, setStarterLang] = useState("python");
  const [tagText, setTagText] = useState(csv(q.tags));
  const [companyText, setCompanyText] = useState(csv(q.companies));

  useEffect(() => {
    api("/manage/tree").then(setTree).catch(() => setTree({ subjects: [] }));
  }, []);

  // Pre-select the subject and chapter of the current topic.
  useEffect(() => {
    if (!tree || !q.topicId) return;
    for (const s of tree.subjects)
      for (const c of s.chapters)
        if (c.topics.some((t) => t.id === q.topicId)) {
          setSubjectId(String(s.id));
          setChapterId(String(c.id));
        }
  }, [tree, q.topicId]);

  const set = (patch) => onChange({ ...q, ...patch });
  const field = (k) => (e) => set({ [k]: e.target.value });
  const setTest = (i, patch) => set({ testCases: q.testCases.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const subject = tree?.subjects.find((s) => String(s.id) === subjectId);
  const chapter = subject?.chapters.find((c) => String(c.id) === chapterId);

  return (
    <fieldset disabled={readOnly} className="space-y-6 disabled:opacity-80">
      <Section title="Where it belongs" hint="Every question lives in one topic. Add chapters and topics under Structure.">
        {!tree ? (
          <Spinner />
        ) : tree.subjects.length === 0 ? (
          <p className="text-sm text-amber-300">You don't have any subjects yet. Ask an admin to assign you one.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Subject</label>
              <select
                className="input"
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setChapterId("");
                  set({ topicId: null });
                }}
              >
                <option value="">Choose…</option>
                {tree.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Chapter</label>
              <select
                className="input"
                value={chapterId}
                disabled={!subject}
                onChange={(e) => {
                  setChapterId(e.target.value);
                  set({ topicId: null });
                }}
              >
                <option value="">Choose…</option>
                {subject?.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Topic</label>
              <select
                className="input"
                value={q.topicId ?? ""}
                disabled={!chapter}
                onChange={(e) => set({ topicId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Choose…</option>
                {chapter?.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Section>

      <Section title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              value={q.title}
              onChange={(e) => set({ title: e.target.value, ...(isNew && { slug: slugify(e.target.value) }) })}
            />
          </div>
          <div>
            <label className="label">URL slug</label>
            <input className="input" value={q.slug} onChange={field("slug")} />
          </div>
          <div>
            <label className="label">Difficulty</label>
            <select className="input" value={q.difficulty} onChange={field("difficulty")}>
              <option value="EASY">Easy (10 pts)</option>
              <option value="MEDIUM">Medium (20 pts)</option>
              <option value="HARD">Hard (40 pts)</option>
            </select>
          </div>
          <div>
            <label className="label">Time limit per test (ms)</label>
            <input
              className="input"
              type="number"
              min={100}
              max={10000}
              value={q.timeLimitMs}
              onChange={(e) => set({ timeLimitMs: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Tags (comma separated)</label>
            <input
              className="input"
              value={tagText}
              placeholder="Arrays, Two Pointers"
              onChange={(e) => {
                setTagText(e.target.value);
                set({ tags: fromCsv(e.target.value) });
              }}
            />
          </div>
          <div>
            <label className="label">Asked by companies (comma separated)</label>
            <input
              className="input"
              value={companyText}
              placeholder="Amazon, Google"
              onChange={(e) => {
                setCompanyText(e.target.value);
                set({ companies: fromCsv(e.target.value) });
              }}
            />
          </div>
        </div>
      </Section>

      <Section title="Statement" hint="Markdown works: **bold**, `code`, lists, and ``` code blocks.">
        <div>
          <label className="label">Description</label>
          <textarea className="input font-mono text-sm" rows={7} value={q.description} onChange={field("description")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["inputFormat", "Input format"],
            ["outputFormat", "Output format"],
            ["constraints", "Constraints"],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <textarea className="input text-sm" rows={4} value={q[k]} onChange={field(k)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Test cases" hint="Samples are shown to learners as examples. Hidden tests are only used to judge submissions.">
        {q.testCases.map((t, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-ink-700 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Test #{i + 1}{" "}
                <span className={`pill ml-1 ${t.isSample ? "bg-sky-500/15 text-sky-300" : "bg-ink-700 text-slate-400"}`}>
                  {t.isSample ? "Sample" : "🔒 Hidden"}
                </span>
              </span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-400">
                  <input type="checkbox" checked={t.isSample} onChange={(e) => setTest(i, { isSample: e.target.checked })} />
                  Sample
                </label>
                {q.testCases.length > 1 && (
                  <button
                    type="button"
                    className="text-sm text-rose-400 hover:underline"
                    onClick={() => set({ testCases: q.testCases.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Input</label>
                <textarea className="input font-mono text-xs" rows={3} value={t.input} onChange={(e) => setTest(i, { input: e.target.value })} />
              </div>
              <div>
                <label className="label">Expected output</label>
                <textarea
                  className="input font-mono text-xs"
                  rows={3}
                  value={t.expected}
                  onChange={(e) => setTest(i, { expected: e.target.value })}
                />
              </div>
            </div>
            {t.isSample && (
              <input
                className="input"
                placeholder="Explanation shown under the example (optional)"
                value={t.explanation || ""}
                onChange={(e) => setTest(i, { explanation: e.target.value })}
              />
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => set({ testCases: [...q.testCases, { input: "", expected: "", isSample: false, explanation: "" }] })}
        >
          + Add test
        </button>
      </Section>

      <Section
        title="Reference solution"
        hint="Required. A correct solution must pass every test before the question can go live. Learners never see this code until they solve the question."
      >
        <select className="input w-auto" value={q.solutionLanguage} onChange={field("solutionLanguage")}>
          {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="h-72 overflow-hidden rounded-lg border border-ink-700">
          <Editor
            theme="vs-dark"
            language={q.solutionLanguage}
            value={q.solutionCode}
            onChange={(v) => set({ solutionCode: v ?? "" })}
            options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, readOnly }}
          />
        </div>
      </Section>

      <Section title="Hints and explanation" hint="Hints are revealed one at a time. The explanation unlocks after a learner solves the question.">
        {q.hints.map((h, i) => (
          <div key={i} className="flex gap-2">
            <span className="pt-2 text-xs text-slate-500">#{i + 1}</span>
            <input className="input" value={h} onChange={(e) => set({ hints: q.hints.map((x, j) => (j === i ? e.target.value : x)) })} />
            <button type="button" className="tab text-rose-400" onClick={() => set({ hints: q.hints.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost" onClick={() => set({ hints: [...q.hints, ""] })}>
          + Add hint
        </button>
        <div>
          <label className="label">Solution explanation (Markdown)</label>
          <textarea className="input font-mono text-sm" rows={5} value={q.editorial} onChange={field("editorial")} />
        </div>
      </Section>

      <Section title="Starter code (optional)" hint="The template learners begin with. Leave empty to use a blank editor.">
        <select className="input w-auto" value={starterLang} onChange={(e) => setStarterLang(e.target.value)}>
          {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <textarea
          className="input font-mono text-xs"
          rows={8}
          value={q.starterCode[starterLang] || ""}
          onChange={(e) => set({ starterCode: { ...q.starterCode, [starterLang]: e.target.value } })}
        />
      </Section>
    </fieldset>
  );
}

/** Prepares the form state for the API (drops empty hints and starter code). */
export function toPayload(q) {
  return {
    ...q,
    hints: q.hints.map((h) => h.trim()).filter(Boolean),
    starterCode: Object.fromEntries(Object.entries(q.starterCode || {}).filter(([, v]) => v.trim())),
  };
}
