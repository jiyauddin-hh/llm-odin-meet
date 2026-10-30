"use client";

// Write a live quiz: title, seconds per question, and the questions.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { QuizEditor } from "@/components/LessonExtras";
import AiGenerator from "@/components/quiz/AiGenerator";
import { ErrorBox, Spinner } from "@/components/ui";
import Icon from "@/components/Icons";

export default function EditQuiz({ params }) {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    api(`/quizzes/${params.id}`)
      .then(({ quiz }) => setForm({ title: quiz.title, timeSec: quiz.timeSec, questions: quiz.questions.map((q) => ({ code: "", explanation: "", ...q })) }))
      .catch((e) => setError(e.message));
  }, [user, params.id]);

  const save = async () => {
    await api(`/quizzes/${params.id}`, {
      method: "PUT",
      body: { title: form.title, timeSec: Number(form.timeSec) || 20, questions: form.questions },
    });
  };

  const run = (fn) => async () => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) return <Spinner />;
  if (user.role !== "ADMIN") return <div className="mx-auto max-w-xl p-10 text-center text-slate-400">Only admins can write quizzes.</div>;
  if (!form) return error ? <ErrorBox error={error} className="mx-auto mt-10 max-w-xl" /> : <Spinner />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/quiz" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <Icon name="arrow-left" className="h-4 w-4" /> Quizzes
      </Link>
      <div className="card mt-4 space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <div>
            <label className="label" htmlFor="quiz-title">
              Title
            </label>
            <input id="quiz-title" className="input" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="quiz-time">
              Seconds per question
            </label>
            <input id="quiz-time" type="number" min={5} max={120} className="input" value={form.timeSec} onChange={(e) => setForm({ ...form, timeSec: e.target.value })} />
          </div>
        </div>
        <AiGenerator existing={form.questions} onAdd={(qs, replace) => setForm((f) => ({ ...f, questions: replace ? qs : [...f.questions, ...qs] }))} />
        <QuizEditor
          quiz={form.questions}
          onChange={(questions) => setForm({ ...form, questions })}
          label={`Questions (${form.questions.length}). Tick the right option; the explanation shows after each answer is revealed.`}
          addLabel="+ Add question"
          withCode
        />
        <ErrorBox error={error} />
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={busy}
            onClick={run(async () => {
              await save();
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            })}
          >
            {saved ? "Saved" : "Save"}
          </button>
          <button
            className="rounded-xl bg-gradient-to-b from-amber-300 to-amber-600 px-5 py-2 font-black uppercase text-amber-950 transition hover:brightness-110 disabled:opacity-50"
            disabled={busy || !form.questions.length}
            onClick={run(async () => {
              await save();
              const { code } = await api(`/quizzes/${params.id}/launch`, { method: "POST" });
              router.push(`/quiz/play/${code}`);
            })}
          >
            <Icon name="play" className="mr-1 inline h-4 w-4" /> Save and launch
          </button>
        </div>
      </div>
    </div>
  );
}
