"use client";

// The quick check at the end of a lesson. Answers are checked on the server,
// which also keeps the learner's best score.
import { useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox } from "./ui";
import Icon from "./Icons";

export default function LessonQuiz({ courseSlug, lessonId, quiz, initialScore }) {
  const [answers, setAnswers] = useState(() => (quiz || []).map(() => null));
  const [result, setResult] = useState(null);
  const [best, setBest] = useState(initialScore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!quiz?.length) return null;

  const answered = answers.filter((a) => a !== null).length;
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const d = await api(`/courses/${courseSlug}/lessons/${lessonId}/quiz`, { method: "POST", body: { answers } });
      setResult(d);
      setBest(d.quizScore);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const retry = () => {
    setAnswers(quiz.map(() => null));
    setResult(null);
  };

  const pct = result ? Math.round((result.score / result.total) * 100) : 0;
  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/[0.07] to-transparent">
      <div className="flex flex-wrap items-center gap-3 border-b border-sky-500/15 px-5 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
          <Icon name="brain" className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-semibold text-white">Quick quiz</h2>
          <span className="text-xs text-slate-400">{quiz.length} questions · checked on the server</span>
        </div>
        {best && (
          <span className="pill ml-auto bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
            <Icon name="award" className="h-3 w-3" /> Best: {best.best}/{best.total}
          </span>
        )}
      </div>

      <ol className="space-y-6 p-5">
        {quiz.map((q, i) => {
          const r = result?.results[i];
          return (
            <li key={i}>
              <p className="flex gap-2.5 text-sm font-medium text-white">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] font-mono text-[11px] text-slate-300">{i + 1}</span>
                {q.question}
              </p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {q.options.map((o, j) => {
                  const chosen = answers[i] === j;
                  const style = r
                    ? j === r.answer
                      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-50"
                      : chosen
                        ? "border-rose-400/70 bg-rose-500/15 text-rose-50"
                        : "border-white/[0.06] text-slate-500"
                    : chosen
                      ? "border-brand-400/70 bg-brand-500/20 text-white shadow-glow-sm"
                      : "border-white/[0.08] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]";
                  return (
                    <button
                      key={j}
                      type="button"
                      disabled={!!r}
                      onClick={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))}
                      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${style}`}
                    >
                      <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[11px] ${chosen && !r ? "bg-brand-500 text-white" : "bg-white/[0.06]"}`}>
                        {String.fromCharCode(65 + j)}
                      </span>
                      <span className="flex-1">{o}</span>
                      {r && j === r.answer && <Icon name="check" className="mt-0.5 h-4 w-4 text-emerald-300" strokeWidth={3} />}
                      {r && chosen && j !== r.answer && <Icon name="x" className="mt-0.5 h-4 w-4 text-rose-300" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
              {r?.explanation && (
                <p className={`mt-2 flex gap-2 rounded-lg px-3 py-2 text-xs ${r.correct ? "bg-emerald-500/[0.08] text-emerald-200" : "bg-amber-500/[0.08] text-amber-100"}`}>
                  <Icon name={r.correct ? "check-circle" : "info"} className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">{r.correct ? "Correct! " : r.chosen === null ? "Not answered. " : "Not quite. "}</span>
                    {r.explanation}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="border-t border-sky-500/15 px-5 py-4">
        <ErrorBox error={error} className="mb-3" />
        <div className="flex flex-wrap items-center gap-3">
          {result ? (
            <>
              <span className={`flex items-center gap-2 text-sm font-semibold ${pct >= 70 ? "text-emerald-300" : "text-amber-300"}`}>
                <Icon name={pct === 100 ? "award" : pct >= 70 ? "check-circle" : "trending-up"} className="h-4 w-4" />
                {pct === 100 ? "Perfect! " : pct >= 70 ? "Well done! " : "Keep going! "}
                You scored {result.score}/{result.total}
              </span>
              <button onClick={retry} className="btn-ghost btn-sm ml-auto">
                <Icon name="refresh" className="h-3.5 w-3.5" /> Try again
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full bg-sky-400 transition-all" style={{ width: `${(answered / quiz.length) * 100}%` }} />
                </span>
                {answered}/{quiz.length} answered
              </span>
              <button onClick={submit} disabled={busy || answered === 0} className="btn-primary ml-auto">
                {busy ? "Checking…" : "Check answers"}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
