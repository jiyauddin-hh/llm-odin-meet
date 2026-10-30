"use client";

// The daily live test: wait for the start, take the 10-minute test, then see
// the leaderboard and the answers once it closes.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Avatar, ErrorBox, Spinner } from "@/components/ui";
import { CountdownDigits, clock, dayLabel, duration, serverOffset, timeOfDay, useNow } from "@/components/live/clock";

export default function LiveTestPage({ params }) {
  const { user, loading } = useAuth();
  const [info, setInfo] = useState(null);
  const [offset, setOffset] = useState(0);
  const [exam, setExam] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(`/live-tests/${params.id}`)
      .then((d) => {
        setOffset(serverOffset(d.now));
        setInfo(d.test);
      })
      .catch((e) => setError(e.message));
  }, [params.id]);

  useEffect(() => {
    if (!loading) load();
  }, [loading, user, load]);

  const join = async () => {
    setError("");
    try {
      const d = await api(`/live-tests/${params.id}/join`, { method: "POST" });
      setOffset(serverOffset(d.now));
      setExam(d);
    } catch (e) {
      setError(e.message);
      load();
    }
  };

  if (error && !info) return <Page><ErrorBox error={error} /></Page>;
  if (!info) return <Spinner />;
  if (exam) {
    return (
      <Exam
        exam={exam}
        offset={offset}
        onDone={() => {
          setExam(null);
          load();
        }}
      />
    );
  }
  return (
    <Page>
      <ErrorBox error={error} />
      <Lobby info={info} offset={offset} user={user} onJoin={join} reload={load} setInfo={setInfo} />
    </Page>
  );
}

function Page({ children }) {
  return <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>;
}

function Lobby({ info, offset, user, onJoin, reload, setInfo }) {
  const router = useRouter();
  const now = useNow(offset);
  const start = new Date(info.startsAt).getTime();
  const end = new Date(info.endsAt).getTime();
  const phase = now < start ? "UPCOMING" : now < end ? "LIVE" : "ENDED";

  // Move on by itself when the test opens or closes.
  const last = useRef(phase);
  useEffect(() => {
    if (last.current !== phase) reload();
    last.current = phase;
  }, [phase, reload]);

  if (phase === "ENDED") return <Results id={info.id} />;

  const me = info.me;
  const ready = async () => {
    if (!user) return router.push("/login");
    try {
      const d = await api(`/live-tests/${info.id}/ready`, { method: "POST" });
      setInfo(d.test);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl border p-6 text-center sm:p-10 ${
          phase === "LIVE" ? "border-rose-500/60 bg-gradient-to-br from-rose-950/70 to-ink-900 live-glow-red" : "border-brand-500/40 bg-gradient-to-br from-brand-600/20 to-ink-900"
        }`}
      >
        {phase === "LIVE" ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
            <span className="h-2 w-2 rounded-full bg-white live-blink" /> Live now
          </span>
        ) : (
          <span className="pill border border-brand-500/40 bg-brand-500/10 text-brand-400">
            {dayLabel(info.startsAt, now)} · {timeOfDay(info.startsAt)} – {timeOfDay(info.endsAt)}
          </span>
        )}
        <h1 className="mt-4 text-3xl font-bold text-white">{info.title}</h1>
        {info.topic && <p className="mt-1 text-slate-300">{info.topic}</p>}
        <p className="mt-6 text-sm text-slate-300">{phase === "LIVE" ? "Closes in" : "Starts in"}</p>
        <div className="mt-2">
          <CountdownDigits msLeft={(phase === "LIVE" ? end : start) - now} tone={phase === "LIVE" ? "red" : "brand"} />
        </div>

        <div className="mt-8">
          {!user ? (
            <Link href="/login" className="btn-primary px-6 py-3 text-base">
              Log in to take part
            </Link>
          ) : phase === "LIVE" ? (
            me?.submitted ? (
              <p className="text-emerald-300">✓ You've submitted. Results come out at {timeOfDay(info.endsAt)}. Stay on this page!</p>
            ) : (
              <button onClick={onJoin} className="btn bg-rose-600 px-10 py-3 text-lg font-bold text-white hover:bg-rose-500 live-pulse">
                {me?.started ? "▶ Continue test" : "🚀 Start the test"}
              </button>
            )
          ) : me ? (
            <p className="text-emerald-300">✓ You're in! This page opens the test at {timeOfDay(info.startsAt)}.</p>
          ) : (
            <button onClick={ready} className="btn-primary px-6 py-3 text-base">
              🙋 I'm in!
            </button>
          )}
        </div>
        <p className="mt-4 text-sm text-slate-400">
          {phase === "LIVE" ? `${info.playing} taking the test now` : `🔥 ${info.ready} student${info.ready === 1 ? "" : "s"} ready`}
        </p>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-white">How it works</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          <li>📝 {info.questionCount} multiple-choice questions. The test closes for everyone at {timeOfDay(info.endsAt)}.</li>
          <li>☝️ One attempt only. Your answers are saved as you pick them.</li>
          <li>⏰ When time runs out, your answers are submitted automatically.</li>
          <li>🏆 Highest score wins. On a tie, the faster student ranks higher.</li>
          <li>🥇 The top 3 appear on the home page as Performers of the Day.</li>
        </ul>
      </div>
    </div>
  );
}

function Exam({ exam, offset, onDone }) {
  const now = useNow(offset);
  const end = new Date(exam.test.endsAt).getTime();
  const left = end - now;
  const [answers, setAnswers] = useState(() => exam.questions.map((q) => q.chosen));
  const [at, setAt] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  const latest = useRef(answers);
  latest.current = answers;

  const submit = useCallback(async () => {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    try {
      await api(`/live-tests/${exam.test.id}/submit`, { method: "POST", body: { answers: latest.current } });
    } catch (e) {
      // "Already submitted" or "Time is up": the saved answers still count.
      setError(e.message);
    }
    onDone();
  }, [exam.test.id, onDone]);

  // The bell: submit automatically when time runs out.
  useEffect(() => {
    if (left <= 0) submit();
  }, [left, submit]);

  // Ask before closing the tab mid-test.
  useEffect(() => {
    const warn = (e) => {
      if (!sent.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const choose = (choice) => {
    const value = answers[at] === choice ? null : choice;
    setAnswers(answers.map((a, i) => (i === at ? value : a)));
    api(`/live-tests/${exam.test.id}/answer`, { method: "PUT", body: { position: at, choice: value } }).catch((e) => setError(e.message));
  };

  const q = exam.questions[at];
  const answered = answers.filter((a) => a !== null).length;
  const total = exam.questions.length;
  const tone = left <= 60_000 ? "red" : left <= 120_000 ? "amber" : "brand";
  const timerStyle = {
    brand: "border-brand-500/50 bg-brand-500/10 text-white",
    amber: "border-amber-400/70 bg-amber-500/15 text-amber-200",
    red: "border-rose-500 bg-rose-600/25 text-rose-100 live-glow-red",
  }[tone];

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <div className="sticky top-14 z-20 -mx-4 border-b border-ink-700 bg-ink-950/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{exam.test.title}</p>
            <p className="text-xs text-slate-400">
              {answered}/{total} answered
            </p>
          </div>
          <div className={`rounded-xl border px-4 py-1.5 text-center ${timerStyle}`}>
            <div className={`font-mono text-2xl font-bold tabular-nums sm:text-3xl ${tone === "red" ? "live-blink" : ""}`}>{clock(left)}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-70">{tone === "red" ? "Hurry up!" : tone === "amber" ? "2 minutes left" : "time left"}</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all" style={{ width: `${(answered / total) * 100}%` }} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {exam.questions.map((_, i) => (
          <button
            key={i}
            onClick={() => setAt(i)}
            className={`h-9 w-9 rounded-lg border text-sm font-medium transition ${
              i === at
                ? "border-brand-400 bg-brand-600 text-white"
                : answers[i] !== null
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : "border-ink-600 text-slate-400 hover:bg-ink-800"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div key={at} className="card mt-5 p-5 sm:p-6 live-rise">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Question {at + 1} of {total}
        </p>
        <p className="mt-2 text-lg font-medium text-white">{q.question}</p>
        {q.code && <pre className="mt-3 overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-4 font-mono text-sm text-cyan-100">{q.code}</pre>}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {q.options.map((o, j) => (
            <button
              key={j}
              onClick={() => choose(j)}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition ${
                answers[at] === j ? "border-brand-400 bg-brand-500/20 text-white" : "border-ink-700 text-slate-200 hover:border-ink-600 hover:bg-ink-800"
              }`}
            >
              <span className="font-mono text-xs opacity-70">{String.fromCharCode(65 + j)}</span>
              <span className="whitespace-pre-wrap font-mono text-sm">{o}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-2">
          <button className="btn-ghost" disabled={at === 0} onClick={() => setAt(at - 1)}>
            ← Previous
          </button>
          {at < total - 1 ? (
            <button className="btn-primary ml-auto" onClick={() => setAt(at + 1)}>
              Next →
            </button>
          ) : (
            <button className="btn-success ml-auto" onClick={() => setConfirm(true)}>
              Submit test
            </button>
          )}
        </div>
      </div>

      <ErrorBox error={error} />
      <div className="mt-4 text-center">
        <button className="text-sm text-slate-400 hover:text-white" onClick={() => setConfirm(true)}>
          Finish early and submit
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="card w-full max-w-sm p-6 text-center">
            <h3 className="text-lg font-bold text-white">Submit your test?</h3>
            <p className="mt-2 text-sm text-slate-300">
              You answered {answered} of {total}.{answered < total && " Unanswered questions score 0."} You can't change your answers after this.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button className="btn-ghost" onClick={() => setConfirm(false)} disabled={busy}>
                Keep going
              </button>
              <button className="btn-success" onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Yes, submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

function Results({ id }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/live-tests/${id}/results`).then(setData).catch((e) => setError(e.message));
  }, [id, user]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner label="Counting the scores…" />;
  const { test, leaderboard, mine } = data;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="pill bg-ink-700 text-slate-300">
          {dayLabel(test.startsAt)} · Results
        </span>
        <h1 className="mt-3 text-3xl font-bold text-white">{test.title}</h1>
        {test.topic && <p className="mt-1 text-slate-300">{test.topic}</p>}
      </div>

      {mine && (
        <div className="rounded-2xl border border-brand-500/40 bg-gradient-to-br from-brand-600/25 to-ink-900 p-6 text-center live-rise">
          <p className="text-sm text-slate-300">Your result</p>
          <div className="mt-3 flex flex-wrap justify-center gap-8">
            <div>
              <div className="text-4xl font-bold text-white">
                {mine.rank && mine.rank <= 3 ? MEDALS[mine.rank - 1] : "#"}
                {mine.rank}
              </div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Rank of {leaderboard.length}</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white">
                {mine.score}
                <span className="text-xl text-slate-400">/{test.questionCount}</span>
              </div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Score</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white">{duration(mine.timeMs)}</div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Time taken</div>
            </div>
          </div>
          {mine.rank <= 3 && <p className="mt-4 font-semibold text-amber-300">🎉 You're a Performer of the Day! Your name is on the home page.</p>}
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="border-b border-ink-700 px-4 py-3 font-semibold text-white">🏆 Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="p-8 text-center text-slate-400">Nobody took this test.</p>
        ) : (
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => (
                <tr key={r.user.id} className={r.user.id === user?.id ? "!bg-brand-500/10" : ""}>
                  <td className="px-4 py-3 font-semibold text-white">{r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</td>
                  <td className="px-4 py-3">
                    <Link href={`/u/${r.user.username}`} className="flex items-center gap-2 hover:text-brand-400">
                      <Avatar user={r.user} size={28} />
                      {r.user.name || r.user.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {r.score}/{test.questionCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">{duration(r.timeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mine && (
        <div className="card p-5">
          <h2 className="font-semibold text-white">Your answers</h2>
          <ol className="mt-4 space-y-5">
            {mine.review.map((q, i) => {
              const right = q.chosen === q.answer;
              return (
                <li key={i}>
                  <p className="text-sm font-medium text-white">
                    {right ? "✅" : "❌"} {i + 1}. {q.question}
                  </p>
                  {q.code && <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-cyan-100">{q.code}</pre>}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {q.options.map((o, j) => (
                      <div
                        key={j}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          j === q.answer
                            ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                            : j === q.chosen
                              ? "border-rose-400 bg-rose-500/15 text-rose-100"
                              : "border-ink-700 text-slate-500"
                        }`}
                      >
                        <span className="mr-2 font-mono text-xs opacity-70">{String.fromCharCode(65 + j)}</span>
                        <span className="whitespace-pre-wrap font-mono">{o}</span>
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <p className={`mt-2 text-xs ${right ? "text-emerald-300/90" : "text-amber-200/90"}`}>
                      {q.chosen === null ? "Not answered. " : ""}
                      {q.explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="text-center">
        <Link href="/" className="btn-ghost">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
