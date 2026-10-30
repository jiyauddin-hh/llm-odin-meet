"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox } from "@/components/ui";
import Icon from "@/components/Icons";

const EXAMPLES = [
  "Python loops for beginners: for, while, range, break and continue",
  "Tricky output questions on Python lists and slicing, medium level",
  "OOP in Python: classes, inheritance and dunder methods",
  "SQL basics: SELECT, WHERE, JOIN and GROUP BY",
];

/**
 * "Generate with AI": a prompt and/or a course lesson in, N multiple-choice
 * questions out. The questions land in the editor for the teacher to review
 * before saving; nothing is saved here.
 */
export default function AiGenerator({ existing, onAdd }) {
  const [open, setOpen] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(20);
  const [difficulty, setDifficulty] = useState("mixed");
  const [lessonId, setLessonId] = useState("");
  const [replace, setReplace] = useState(false);
  const [courses, setCourses] = useState([]);
  const [job, setJob] = useState(null); // { id, seconds }
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const poll = useRef(null);

  useEffect(() => {
    api("/quizzes/lessons").then((d) => setCourses(d.courses)).catch(() => {});
    return () => clearTimeout(poll.current);
  }, []);

  const generate = async () => {
    setError("");
    setDone("");
    try {
      const { jobId } = await api("/quizzes/generate", {
        method: "POST",
        body: {
          prompt: prompt.trim(),
          count: Math.min(30, Math.max(1, Number(count) || 20)),
          difficulty,
          lessonId: lessonId ? Number(lessonId) : null,
          existing: replace ? [] : existing.map((q) => q.question + (q.code ? ` [${q.code}]` : "")),
        },
      });
      setJob({ id: jobId, seconds: 0 });
      const check = async () => {
        try {
          const s = await api(`/quizzes/generate/${jobId}`);
          if (s.status === "running") {
            setJob({ id: jobId, seconds: s.seconds });
            poll.current = setTimeout(check, 2000);
            return;
          }
          setJob(null);
          if (s.status === "failed") return setError(s.error);
          onAdd(s.questions, replace);
          setDone(`${replace ? "Replaced the quiz with" : "Added"} ${s.questions.length} questions. Review them below, then Save.`);
        } catch (e) {
          setJob(null);
          setError(e.message);
        }
      };
      poll.current = setTimeout(check, 2000);
    } catch (e) {
      setError(e.message);
    }
  };

  const running = !!job;
  const canGo = !running && (prompt.trim() || lessonId);

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-500/[0.08] via-brand-500/[0.06] to-transparent">
      <button type="button" className="flex w-full items-center gap-2 px-5 py-3.5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="sparkles" className="h-4 w-4 text-amber-300" />
        <span className="font-bold text-white">Generate questions with AI</span>
        <span className="hidden text-xs text-slate-400 sm:inline">Describe what you want and get ready-made multiple-choice questions.</span>
        <Icon name="chevron-down" className={`ml-auto h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-white/[0.06] px-5 pb-5 pt-4">
          <div>
            <label className="label" htmlFor="ai-prompt">
              What should the questions be about?
            </label>
            <textarea
              id="ai-prompt"
              className="input min-h-[84px]"
              maxLength={2000}
              placeholder="e.g. Python loops for beginners: for, while, range, break and continue"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={running}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-amber-300/40 hover:text-white" onClick={() => setPrompt(ex)} disabled={running}>
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[7rem_13rem_1fr]">
            <div>
              <label className="label" htmlFor="ai-count">
                Questions
              </label>
              <input id="ai-count" type="number" min={1} max={30} className="input" value={count} onChange={(e) => setCount(e.target.value)} disabled={running} />
            </div>
            <div>
              <label className="label" htmlFor="ai-level">
                Difficulty
              </label>
              <select id="ai-level" className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={running}>
                <option value="mixed">Mixed (easy → hard)</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ai-lesson">
                Based on a lesson (optional)
              </label>
              <select id="ai-lesson" className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)} disabled={running}>
                <option value="">No lesson, just my description</option>
                {courses.map((c) => (
                  <optgroup key={c.title} label={c.title}>
                    {c.lessons.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-amber-300 to-amber-600 px-5 py-2.5 font-black uppercase text-amber-950 transition hover:brightness-110 disabled:opacity-50"
              onClick={generate}
              disabled={!canGo}
            >
              {running ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-950/30 border-t-amber-950" /> Writing questions… {job.seconds}s
                </>
              ) : (
                <>
                  <Icon name="sparkles" className="h-4 w-4" /> Generate {Math.min(30, Math.max(1, Number(count) || 20))} questions
                </>
              )}
            </button>
            {existing.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={replace} onChange={(e) => setReplace(e.target.checked)} disabled={running} />
                Replace the {existing.length} questions already here
              </label>
            )}
          </div>
          {running && <p className="text-xs text-slate-400">This usually takes 20 to 40 seconds. You can keep editing below meanwhile.</p>}
          {done && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-100">
              <Icon name="check-circle" className="h-4 w-4 shrink-0" /> {done}
            </p>
          )}
          <ErrorBox error={error} />
        </div>
      )}
    </section>
  );
}
