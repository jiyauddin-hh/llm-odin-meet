"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ErrorBox } from "./ui";
import { LessonContentEditor, QuizEditor } from "./LessonExtras";

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const newLesson = () => ({ title: "", content: "", videoUrl: "", problemIds: [], quiz: [] });

const EMPTY = {
  slug: "",
  title: "",
  description: "",
  level: "Beginner",
  icon: "📘",
  published: true,
  order: 0,
  modules: [{ title: "Chapter 1", unlockMode: "FREE", lessons: [newLesson()] }],
};

function move(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export default function CourseForm({ initial }) {
  const router = useRouter();
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...initial,
          modules: initial.modules.map((m) => ({
            id: m.id,
            title: m.title,
            unlockMode: m.unlockMode,
            lessons: m.lessons.map((l) => ({
              id: l.id,
              title: l.title,
              content: l.content,
              videoUrl: l.videoUrl || "",
              problemIds: l.problemIds,
              quiz: l.quiz || [],
            })),
          })),
        }
      : EMPTY,
  );
  const [problems, setProblems] = useState([]);
  const [openLesson, setOpenLesson] = useState(null);
  const [problemQuery, setProblemQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/admin/problems").then((d) => setProblems(d.problems)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const setModules = (modules) => setForm({ ...form, modules });
  const setModule = (mi, patch) => setModules(form.modules.map((m, i) => (i === mi ? { ...m, ...patch } : m)));
  const setLesson = (mi, li, patch) =>
    setModule(mi, { lessons: form.modules[mi].lessons.map((l, i) => (i === li ? { ...l, ...patch } : l)) });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      slug: form.slug,
      title: form.title,
      description: form.description,
      level: form.level,
      icon: form.icon,
      published: form.published,
      order: Number(form.order) || 0,
      modules: form.modules,
    };
    try {
      if (initial) await api(`/admin/courses/${initial.id}`, { method: "PUT", body });
      else await api("/admin/courses", { method: "POST", body });
      router.push("/admin/courses");
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <ErrorBox error={error} />
      <div className="card grid gap-4 p-5 sm:grid-cols-[80px_1fr_1fr]">
        <div>
          <label className="label">Icon</label>
          <input className="input text-center text-xl" maxLength={8} value={form.icon} onChange={set("icon")} />
        </div>
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value, ...(!initial && { slug: slugify(e.target.value) }) })}
          />
        </div>
        <div>
          <label className="label">URL slug</label>
          <input className="input" required value={form.slug} onChange={set("slug")} />
        </div>
        <div className="sm:col-span-3">
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={set("description")} />
        </div>
        <div>
          <label className="label">Order</label>
          <input className="input" type="number" value={form.order} onChange={set("order")} />
        </div>
        <div>
          <label className="label">Level</label>
          <select className="input" value={form.level} onChange={set("level")}>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={form.published} onChange={set("published")} /> Published (shown in Courses)
        </label>
      </div>

      {form.modules.map((m, mi) => (
        <div key={m.id ?? `new-${mi}`} className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400">Chapter {mi + 1}</span>
            <input className="input flex-1" required value={m.title} onChange={(e) => setModule(mi, { title: e.target.value })} />
            <select
              className="input w-auto py-2 text-xs"
              value={m.unlockMode}
              onChange={(e) => setModule(mi, { unlockMode: e.target.value })}
              title="How this chapter opens for users without the whole course"
            >
              <option value="PERMISSION">Admin permission</option>
              <option value="FREE">Free preview</option>
              <option value="AUTO" disabled={mi === 0}>Auto after previous chapter</option>
            </select>
            <button type="button" className="tab" onClick={() => setModules(move(form.modules, mi, -1))} title="Move up">
              ↑
            </button>
            <button type="button" className="tab" onClick={() => setModules(move(form.modules, mi, 1))} title="Move down">
              ↓
            </button>
            <button
              type="button"
              className="tab text-rose-400"
              onClick={() => setModules(form.modules.filter((_, i) => i !== mi))}
              title="Delete chapter and its lessons"
            >
              Delete
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {m.lessons.map((l, li) => {
              const key = `${mi}-${li}`;
              const expanded = openLesson === key;
              return (
                <div key={l.id ?? key} className="rounded-lg border border-ink-700">
                  <div className="flex items-center gap-2 p-2">
                    <span className="w-6 text-center text-xs text-slate-500">{li + 1}</span>
                    <input
                      className="input flex-1 py-1.5"
                      required
                      placeholder="Lesson title"
                      value={l.title}
                      onChange={(e) => setLesson(mi, li, { title: e.target.value })}
                    />
                    <button type="button" className="tab" onClick={() => setOpenLesson(expanded ? null : key)}>
                      {expanded ? "Close" : "Edit"}
                    </button>
                    <button type="button" className="tab" onClick={() => setModule(mi, { lessons: move(m.lessons, li, -1) })}>
                      ↑
                    </button>
                    <button type="button" className="tab" onClick={() => setModule(mi, { lessons: move(m.lessons, li, 1) })}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className="tab text-rose-400"
                      onClick={() => setModule(mi, { lessons: m.lessons.filter((_, i) => i !== li) })}
                    >
                      ✕
                    </button>
                  </div>
                  {expanded && (
                    <div className="space-y-3 border-t border-ink-700 p-3">
                      <LessonContentEditor value={l.content} onChange={(content) => setLesson(mi, li, { content })} />
                      <div>
                        <label className="label">Video URL (optional, YouTube links are embedded)</label>
                        <input
                          className="input"
                          type="url"
                          value={l.videoUrl}
                          onChange={(e) => setLesson(mi, li, { videoUrl: e.target.value })}
                          placeholder="https://www.youtube.com/watch?v=…"
                        />
                      </div>
                      <div>
                        <label className="label">Practice problems</label>
                        <input
                          className="input mb-2 py-1 text-sm"
                          placeholder="Search problems to add…"
                          value={problemQuery}
                          onChange={(e) => setProblemQuery(e.target.value)}
                        />
                        <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                          {problems
                            .filter((p) => l.problemIds.includes(p.id) || (problemQuery.trim() && p.title.toLowerCase().includes(problemQuery.trim().toLowerCase())))
                            .map((p) => {
                            const on = l.problemIds.includes(p.id);
                            return (
                              <button
                                type="button"
                                key={p.id}
                                onClick={() =>
                                  setLesson(mi, li, {
                                    problemIds: on ? l.problemIds.filter((x) => x !== p.id) : [...l.problemIds, p.id],
                                  })
                                }
                                className={`pill border ${
                                  on ? "border-brand-500 bg-brand-500/20 text-brand-400" : "border-ink-600 text-slate-400"
                                }`}
                              >
                                {on ? "✓ " : ""}
                                {p.title}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <QuizEditor quiz={l.quiz} onChange={(quiz) => setLesson(mi, li, { quiz })} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="btn-ghost mt-3"
            onClick={() => {
              setModule(mi, { lessons: [...m.lessons, newLesson()] });
              setOpenLesson(`${mi}-${m.lessons.length}`);
            }}
          >
            + Add lesson
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn-ghost"
        onClick={() => setModules([...form.modules, { title: `Chapter ${form.modules.length + 1}`, unlockMode: "PERMISSION", lessons: [] }])}
      >
        + Add chapter
      </button>

      <p className="text-xs text-slate-500">
        Unlock rules apply to users without the whole course: <b>Admin permission</b> opens when you give that chapter,{" "}
        <b>Free preview</b> is open to anyone logged in, <b>Auto</b> opens once the previous chapter is completed.
        {initial && " Deleting a lesson also deletes learners' progress on it."}
      </p>
      <div className="flex gap-3">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save changes" : "Create course"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.push("/admin/courses")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
