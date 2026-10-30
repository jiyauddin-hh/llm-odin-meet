"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { ErrorBox, Spinner, timeAgo } from "@/components/ui";
import Icon from "@/components/Icons";
import { Face } from "@/components/quiz/Finale";

export default function QuizHub() {
  const { user, loading } = useRequireAuth();
  if (loading || !user) return <Spinner />;
  return (
    <div className="qz-bg min-h-[calc(100dvh-4rem)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">Live quiz</span>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">
              Fastest finger <span className="qz-gold">wins.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-300">
              Everyone gets the same question at the same moment. Lock your answer before the clock runs out: the quicker you are, the more points you score. The top three take the podium.
            </p>
          </div>
          <JoinCard />
        </section>
        <RecentWinners />
        {user.role === "ADMIN" && <HostPanel />}
      </div>
    </div>
  );
}

function JoinCard() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const join = async (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return setError("Quiz codes are 6 characters long");
    setBusy(true);
    setError("");
    try {
      await api(`/quizzes/code/${c}`);
      router.push(`/quiz/play/${c}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={join} className="rounded-3xl border border-amber-300/20 bg-black/40 p-6 shadow-[0_20px_60px_-20px_rgba(251,191,36,0.35)] backdrop-blur sm:p-8">
      <h2 className="text-xl font-black text-white">Join a quiz</h2>
      <p className="mt-1 text-sm text-slate-400">Enter the code on the host&apos;s screen.</p>
      <input
        className="mt-5 w-full rounded-2xl border border-white/15 bg-black/50 px-4 py-4 text-center font-mono text-3xl font-black uppercase tracking-[0.4em] text-amber-200 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-400/20"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 6))}
        placeholder="CODE"
        aria-label="Quiz code"
        autoCapitalize="characters"
        autoComplete="off"
      />
      <button className="mt-4 w-full rounded-2xl bg-gradient-to-b from-amber-300 to-amber-600 py-3.5 text-lg font-black uppercase text-amber-950 transition hover:brightness-110 disabled:opacity-50" disabled={busy || code.length < 6}>
        {busy ? "Joining…" : "Let's play"}
      </button>
      <ErrorBox error={error} className="mt-4" />
    </form>
  );
}

function RecentWinners() {
  const [quizzes, setQuizzes] = useState([]);
  useEffect(() => {
    api("/quizzes/recent").then((d) => setQuizzes(d.quizzes)).catch(() => {});
  }, []);
  if (!quizzes.length) return null;
  return (
    <section className="mt-14">
      <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-amber-200/80">Recent champions</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quizzes.map((q) => (
          <article key={q.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="truncate font-bold text-white">{q.title}</h3>
            <p className="text-xs text-slate-400">
              {q.players} players · {timeAgo(q.endedAt)}
            </p>
            <div className="mt-4 flex items-end justify-center gap-3">
              {[1, 0, 2].map((i) => {
                const w = q.winners[i];
                if (!w) return <span key={i} className="w-16" />;
                return (
                  <div key={i} className="flex w-20 flex-col items-center text-center">
                    <span className={`rounded-full bg-gradient-to-br p-0.5 ${i === 0 ? "from-amber-200 to-amber-600" : i === 1 ? "from-slate-100 to-slate-500" : "from-orange-300 to-orange-800"}`}>
                      <Face user={w} size={i === 0 ? 56 : 44} />
                    </span>
                    <span className="mt-1 w-full truncate text-xs font-semibold text-white">{w.name || w.username}</span>
                    <span className={`text-[11px] font-black ${i === 0 ? "qz-gold" : i === 1 ? "qz-silver" : "qz-bronze"}`}>#{w.rank}</span>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HostPanel() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api("/quizzes/mine").then((d) => setQuizzes(d.quizzes)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const act = async (fn) => {
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
  const create = () => act(async () => router.push(`/quiz/edit/${(await api("/quizzes", { method: "POST", body: { title: "Untitled quiz", timeSec: 20, questions: [] } })).quiz.id}`));
  const launch = (q) => act(async () => router.push(`/quiz/play/${(await api(`/quizzes/${q.id}/launch`, { method: "POST" })).code}`));
  const remove = (q) =>
    act(async () => {
      await api(`/quizzes/${q.id}`, { method: "DELETE" });
      setConfirm(null);
      await load();
    });

  return (
    <section className="mt-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-white/70">Your quizzes</h2>
        <button className="rounded-xl bg-gradient-to-b from-amber-300 to-amber-600 px-4 py-2 text-sm font-black uppercase text-amber-950 transition hover:brightness-110 disabled:opacity-50" onClick={create} disabled={busy}>
          + New quiz
        </button>
      </div>
      <ErrorBox error={error} className="mt-4" />
      {!quizzes ? (
        <Spinner />
      ) : quizzes.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">No quizzes yet. Create one, add questions, and launch it for your class.</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {quizzes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-white">{q.title}</span>
                  {q.status === "LIVE" && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-300">Live · {q.code}</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {q.questions} {q.questions === 1 ? "question" : "questions"} · {q.timeSec}s each{q.players ? ` · last played by ${q.players}` : ""} · edited {timeAgo(q.updatedAt)}
                </p>
              </div>
              {confirm === q.id ? (
                <span className="flex items-center gap-2 text-xs text-slate-300">
                  Delete for good?
                  <button className="tab" onClick={() => setConfirm(null)}>
                    No
                  </button>
                  <button className="tab text-rose-400" onClick={() => remove(q)} disabled={busy}>
                    Delete
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Link href={`/quiz/edit/${q.id}`} className="tab">
                    <Icon name="edit" className="h-3.5 w-3.5" /> Edit
                  </Link>
                  {q.status === "LIVE" ? (
                    <Link href={`/quiz/play/${q.code}`} className="tab text-amber-300">
                      Open
                    </Link>
                  ) : (
                    <button className="tab text-amber-300" onClick={() => launch(q)} disabled={busy || !q.questions}>
                      <Icon name="play" className="h-3.5 w-3.5" /> Launch
                    </button>
                  )}
                  <button className="tab text-rose-400" onClick={() => setConfirm(q.id)} aria-label={`Delete ${q.title}`}>
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
