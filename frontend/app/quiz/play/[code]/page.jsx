"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRequireAuth } from "@/lib/auth";
import { quizSocket, request } from "@/lib/socket";
import { Spinner } from "@/components/ui";
import Icon from "@/components/Icons";
import Finale, { Face } from "@/components/quiz/Finale";
import * as sfx from "@/components/quiz/sound";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function QuizPlay({ params }) {
  const code = String(params.code || "").toUpperCase();
  const { user, loading } = useRequireAuth();
  const socketRef = useRef(null);
  const clock = useRef(0); // server time minus ours
  const [state, setState] = useState(null);
  const [you, setYou] = useState(null);
  const [status, setStatus] = useState("connecting"); // connecting | live | closed | error
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [sound, setSound] = useState(false);
  const [busy, setBusy] = useState(false);

  const host = !!you?.host;

  useEffect(() => {
    if (loading || !user) return;
    const s = quizSocket();
    socketRef.current = s;
    const sync = (v) => v?.now && (clock.current = v.now - Date.now());
    s.on("connect", () =>
      request(s, "join", { code })
        .then((r) => {
          sync(r.state);
          setState(r.state);
          setYou(r.you);
          setStatus("live");
        })
        .catch((e) => {
          setError(e.message);
          setStatus("error");
        }),
    );
    s.on("state", (v) => {
      sync(v);
      setState(v);
    });
    s.on("you", setYou);
    s.on("answered", ({ answered, players }) => setState((v) => (v ? { ...v, answered, players } : v)));
    s.on("closed", () => setStatus("closed"));
    s.on("connect_error", (e) => {
      setError(e.message === "Please log in" ? "Please log in again" : "Can't reach the quiz right now");
      setStatus((st) => (st === "live" ? st : "error"));
    });
    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, [loading, user, code]);

  const send = useCallback(async (event, payload) => {
    setBusy(true);
    try {
      return await request(socketRef.current, event, payload);
    } catch (e) {
      setFlash(e.message);
      setTimeout(() => setFlash(""), 2500);
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleSound = () => {
    if (sound) {
      sfx.mute();
      setSound(false);
    } else setSound(sfx.unlock());
  };

  const hostNext = () => {
    if (!sound && state?.phase === "lobby") setSound(sfx.unlock()); // the host's first click turns the show's sound on
    send("next");
  };

  // Keyboard: the host advances with Enter/Space; players answer with A-D or 1-4.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest("input, textarea")) return;
      if (host && (e.key === "Enter" || e.key === " ") && state?.phase !== "finale") {
        e.preventDefault();
        hostNext();
      }
      if (!host && state?.phase === "question" && you?.choice == null) {
        const i = "abcdef".indexOf(e.key.toLowerCase()) >= 0 ? "abcdef".indexOf(e.key.toLowerCase()) : Number(e.key) - 1;
        if (i >= 0 && i < (state.question?.options.length || 0)) answer(i);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const answer = (choice) => {
    if (you?.choice != null) return;
    setYou((y) => ({ ...y, choice }));
    sfx.lock();
    send("answer", { index: state.index, choice }).then((r) => {
      if (!r) setYou((y) => ({ ...y, choice: null }));
    });
  };

  if (loading || !user) return <Spinner />;

  if (status === "error" || status === "closed") {
    return (
      <Screen>
        <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-black/40 p-8 text-center backdrop-blur">
          <span className="text-5xl">{status === "closed" ? "🏁" : "🔍"}</span>
          <h1 className="mt-4 text-2xl font-black text-white">{status === "closed" ? "The quiz is over" : "Can't join this quiz"}</h1>
          <p className="mt-2 text-slate-300">{status === "closed" ? "Thanks for playing!" : error}</p>
          <Link href="/quiz" className="btn-primary mt-6 inline-flex">
            <Icon name="arrow-left" className="h-4 w-4" /> Back to quizzes
          </Link>
        </div>
      </Screen>
    );
  }
  if (!state) {
    return (
      <Screen>
        <p className="animate-pulse text-center text-lg font-semibold text-amber-100">Joining quiz {code}…</p>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar state={state} you={you} host={host} sound={sound} onSound={toggleSound} />
      {state.phase === "lobby" && <Lobby state={state} host={host} user={user} onStart={hostNext} busy={busy} sound={sound} />}
      {(state.phase === "question" || state.phase === "reveal") && (
        <Question state={state} you={you} host={host} clock={clock} onAnswer={answer} onNext={hostNext} busy={busy} sound={sound} />
      )}
      {state.phase === "leaderboard" && <Board state={state} you={you} host={host} onNext={hostNext} busy={busy} />}
      {state.phase === "finale" && (
        <>
          <Finale state={state} clock={clock} you={you && { ...you, userId: user.id }} host={host} />
          {host && (
            <button className="fixed bottom-4 right-4 z-[70] rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20" onClick={() => send("close")}>
              Close quiz
            </button>
          )}
        </>
      )}
      {flash && <div className="fixed left-1/2 top-20 z-[80] -translate-x-1/2 rounded-xl bg-rose-500/90 px-4 py-2 text-sm font-semibold text-white shadow-xl">{flash}</div>}
    </Screen>
  );
}

function Screen({ children }) {
  return <div className="qz-bg relative min-h-[calc(100dvh-4rem)] px-4 pb-10 pt-4 sm:px-6">{children}</div>;
}

function TopBar({ state, you, host, sound, onSound }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 pb-4">
      <span className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">Live quiz</span>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-white/80">{state.title}</h1>
      {state.index >= 0 && state.phase !== "finale" && (
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
          Q {state.index + 1}/{state.total}
        </span>
      )}
      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
        <Icon name="users" className="mr-1 inline h-3.5 w-3.5" />
        {state.players}
      </span>
      {!host && you && state.phase !== "lobby" && (
        <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-300/30">
          {you.score.toLocaleString()} pts{you.rank ? ` · #${you.rank}` : ""}
        </span>
      )}
      <button onClick={onSound} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" title={sound ? "Sound off" : "Sound on"} aria-label={sound ? "Sound off" : "Sound on"}>
        <Icon name={sound ? "volume" : "volume-x"} className="h-4 w-4" />
      </button>
    </div>
  );
}

function Lobby({ state, host, user, onStart, busy, sound }) {
  const count = useRef(state.players);
  useEffect(() => {
    if (host && sound && state.players > count.current) sfx.pop();
    count.current = state.players;
  }, [state.players, host, sound]);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/quiz/play/${state.code}`;

  if (!host) {
    return (
      <div className="mx-auto mt-10 max-w-md text-center">
        <div className="qz-pop mx-auto w-fit rounded-full bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 p-1">
          <Face user={user} size={112} />
        </div>
        <h2 className="mt-5 text-3xl font-black text-white">You&apos;re in!</h2>
        <p className="mt-2 text-amber-100/80">Waiting for the host to start. Get ready: the fastest right answers win.</p>
        <p className="mt-6 text-sm text-white/60">{state.players} {state.players === 1 ? "player" : "players"} in the lobby</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">Join at {url.replace(/^https?:\/\//, "").replace(/\/quiz\/play\/.*/, "/quiz")} with code</p>
      <p className="qz-gold mt-2 font-mono text-6xl font-black tracking-[0.25em] sm:text-8xl">{state.code}</p>
      <button className="mt-8 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-4 text-xl font-black uppercase tracking-wide text-amber-950 shadow-[0_10px_40px_-8px_rgba(251,191,36,0.7)] transition hover:brightness-110 disabled:opacity-50" onClick={onStart} disabled={busy || !state.players}>
        {state.players ? `Start the quiz · ${state.total} questions` : "Waiting for players…"}
      </button>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {(state.lobby || []).map((p) => (
          <span key={p.id} className="qz-pop flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-4 text-sm font-semibold text-white ring-1 ring-white/10">
            <Face user={p} size={32} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function useNow(clock, active) {
  const [now, setNow] = useState(() => Date.now() + clock.current);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now() + clock.current), 100);
    return () => clearInterval(id);
  }, [clock, active]);
  return now;
}

function Question({ state, you, host, clock, onAnswer, onNext, busy, sound }) {
  const reveal = state.phase === "reveal";
  const now = useNow(clock, !reveal);
  const intro = !reveal && now < state.startAt;
  const left = Math.max(0, state.deadline - now);
  const secs = Math.ceil(left / 1000);
  const q = state.question;
  const picked = you?.choice;
  const last = you?.last;

  // Sounds: the question arrives, the last seconds tick, then right or wrong.
  const heard = useRef({});
  useEffect(() => {
    if (!sound) return;
    const h = heard.current;
    const key = `${state.index}`;
    if (!intro && !reveal && h.in !== key) {
      h.in = key;
      sfx.questionIn();
    }
    if (!reveal && !intro && secs <= 5 && secs > 0 && h.tick !== `${key}:${secs}`) {
      h.tick = `${key}:${secs}`;
      sfx.tick(secs <= 3);
    }
    if (reveal && h.out !== key) {
      h.out = key;
      if (host) sfx.correct();
      else if (last?.correct) sfx.correct();
      else sfx.wrong();
    }
  });

  if (intro) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-sm font-bold uppercase tracking-[0.4em] text-amber-200/80">Get ready</p>
        <p key={state.index} className="qz-pop qz-gold mt-3 text-6xl font-black sm:text-8xl">
          Question {state.index + 1}
        </p>
        <p className="mt-3 text-white/60">of {state.total}</p>
      </div>
    );
  }

  const optState = (i) => {
    if (reveal) return i === state.answer ? "right" : i === picked ? "wrong" : "dim";
    return i === picked ? "locked" : "";
  };
  const most = Math.max(1, ...(state.counts || [1]));

  return (
    <div className="mx-auto max-w-5xl">
      {/* Timer and answer count */}
      <div className="mb-5 flex items-center justify-center gap-6">
        <Ring left={reveal ? 0 : left} total={state.limitMs} label={reveal ? "✓" : secs} />
        {host && !reveal && (
          <p className="text-lg font-bold text-white">
            <span className="qz-gold text-3xl">{state.answered}</span> / {state.players} answered
          </p>
        )}
      </div>

      <div className="qz-question px-10 py-6 text-center sm:px-16 sm:py-8">
        <p className="text-lg font-bold leading-snug text-white sm:text-2xl">{q.text}</p>
        {q.code && <pre className="mx-auto mt-4 max-w-2xl overflow-x-auto rounded-lg bg-black/40 p-3 text-left font-mono text-sm text-sky-100">{q.code}</pre>}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <button
            key={i}
            className="qz-option relative flex min-h-[64px] items-center gap-3 px-8 py-4 text-left text-base font-semibold text-white disabled:cursor-default sm:text-lg"
            data-state={optState(i)}
            disabled={host || reveal || picked != null}
            onClick={() => onAnswer(i)}
          >
            <span className="font-black text-amber-300 [[data-state=locked]_&]:text-amber-950">{LETTERS[i]}:</span>
            <span className="flex-1">{o}</span>
            {reveal && host && <span className="text-sm font-bold tabular-nums">{state.counts[i]}</span>}
            {reveal && host && (
              <span className="absolute inset-x-8 bottom-1.5 h-1 rounded-full bg-white/15">
                <span className="block h-full rounded-full bg-white/70 transition-all duration-700" style={{ width: `${(state.counts[i] / most) * 100}%` }} />
              </span>
            )}
          </button>
        ))}
      </div>

      {/* What happened to me / what's next */}
      {!host && !reveal && picked != null && (
        <p className="mt-6 text-center text-lg font-bold text-amber-200">🔒 Answer locked! Waiting for the others…</p>
      )}
      {!host && reveal && last && (
        <div className={`qz-pop mx-auto mt-6 max-w-md rounded-2xl px-6 py-4 text-center ${last.correct ? "bg-emerald-500/20 ring-1 ring-emerald-400/40" : "bg-rose-500/15 ring-1 ring-rose-400/30"}`}>
          <p className="text-2xl font-black text-white">{last.correct ? `Correct! +${last.points}` : last.choice == null ? "Time's up!" : "Not this time"}</p>
          <p className="mt-1 text-sm text-white/70">
            {last.correct ? `Answered in ${(last.ms / 1000).toFixed(1)}s${you.streak > 1 ? ` · 🔥 ${you.streak} in a row` : ""}` : "Keep going, the next one is yours."} · You&apos;re #{you.rank} of {you.players}
          </p>
        </div>
      )}
      {reveal && state.explanation && <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-white/70">{state.explanation}</p>}

      {host && (
        <div className="mt-8 flex justify-center">
          <button className="rounded-2xl bg-gradient-to-b from-amber-300 to-amber-600 px-8 py-3 text-lg font-black uppercase text-amber-950 transition hover:brightness-110 disabled:opacity-50" onClick={onNext} disabled={busy}>
            {!reveal ? "Reveal the answer" : state.index + 1 >= state.total ? "🏆 Reveal the winners" : "Show the leaderboard"}
          </button>
        </div>
      )}
    </div>
  );
}

function Ring({ left, total, label }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const frac = total ? left / total : 0;
  const color = frac > 0.5 ? "#34d399" : frac > 0.2 ? "#fbbf24" : "#f87171";
  return (
    <svg viewBox="0 0 72 72" className="h-16 w-16 -rotate-90 sm:h-20 sm:w-20" aria-label={`${label} seconds left`}>
      <circle cx="36" cy="36" r={r} fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.3s" }} />
      <text x="36" y="36" className="rotate-90 fill-white text-[22px] font-black" style={{ transformOrigin: "36px 36px" }} textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
    </svg>
  );
}

function Board({ state, you, host, onNext, busy }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="qz-gold text-center text-4xl font-black uppercase sm:text-5xl">Leaderboard</h2>
      <p className="mt-1 text-center text-white/60">
        After question {state.index + 1} of {state.total}
      </p>
      <ol className="mt-6 space-y-2">
        {(state.leaderboard || []).map((p, i) => {
          const moved = p.prevRank ? p.prevRank - p.rank : 0;
          return (
            <li key={p.id} className="qz-pop flex items-center gap-3 rounded-2xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10" style={{ animationDelay: `${i * 90}ms` }}>
              <span className={`w-8 text-center text-2xl font-black ${i === 0 ? "qz-gold" : i === 1 ? "qz-silver" : i === 2 ? "qz-bronze" : "text-white/60"}`}>{p.rank}</span>
              <Face user={p} size={40} />
              <span className="min-w-0 flex-1 truncate text-lg font-bold text-white">{p.name}</span>
              {moved > 0 && <span className="text-xs font-bold text-emerald-300">▲{moved}</span>}
              {p.gained > 0 && <span className="text-xs font-semibold text-amber-200/80">+{p.gained}</span>}
              <span className="w-24 text-right text-xl font-black tabular-nums text-white">{p.score.toLocaleString()}</span>
            </li>
          );
        })}
      </ol>
      {!host && you && (
        <p className="mt-6 text-center text-lg font-bold text-amber-100">
          You&apos;re #{you.rank} of {you.players} with {you.score.toLocaleString()} points
        </p>
      )}
      {host && (
        <div className="mt-8 flex justify-center">
          <button className="rounded-2xl bg-gradient-to-b from-amber-300 to-amber-600 px-8 py-3 text-lg font-black uppercase text-amber-950 transition hover:brightness-110 disabled:opacity-50" onClick={onNext} disabled={busy}>
            Next question
          </button>
        </div>
      )}
    </div>
  );
}
