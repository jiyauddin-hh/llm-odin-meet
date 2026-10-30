"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import LiveTestBanner from "@/components/live/LiveTestBanner";
import Icon from "@/components/Icons";
import { LEVEL_STYLE } from "@/components/ui";

const FEATURES = [
  {
    icon: "zap",
    tone: "from-amber-400/20 to-orange-500/10 text-amber-300",
    title: "Instant, sandboxed judging",
    text: "Every submission runs in an isolated container with no network. Verdicts in seconds: Accepted, Wrong Answer, TLE, MLE, RE, CE.",
  },
  {
    icon: "layers",
    tone: "from-brand-400/20 to-indigo-500/10 text-brand-300",
    title: "Structured curriculum",
    text: "Python, C++, DSA and Machine Learning, organised into chapters and lessons with quizzes, diagrams and linked practice.",
  },
  {
    icon: "film",
    tone: "from-fuchsia-400/20 to-pink-500/10 text-fuchsia-300",
    title: "Concept reels",
    text: "15 to 60 second animated explainers with voice-over. Swipe through a topic, then jump straight into a matching problem.",
  },
  {
    icon: "timer",
    tone: "from-rose-400/20 to-red-500/10 text-rose-300",
    title: "Daily live test",
    text: "A 10-minute timed challenge every day. Fastest top scorer wins and lands on the Performers of the Day board.",
  },
  {
    icon: "trophy",
    tone: "from-emerald-400/20 to-teal-500/10 text-emerald-300",
    title: "Leaderboard & streaks",
    text: "Earn 10, 20 or 40 points per first solve. Weekly, monthly and all-time ranks, badges and a year-long activity heatmap.",
  },
  {
    icon: "brain",
    tone: "from-accent-400/20 to-sky-500/10 text-accent-300",
    title: "Interactive ML diagrams",
    text: "Gradient descent, k-means, neural networks and more as live, animated widgets inside every lesson.",
  },
];

const STEPS = [
  { n: "01", icon: "search", title: "Pick a problem", text: "Filter by subject, chapter, topic, difficulty or the companies that ask it." },
  { n: "02", icon: "terminal", title: "Code in the browser", text: "A full VS Code editor with Python, JavaScript, C++, Java and Go. Drafts auto-save." },
  { n: "03", icon: "check-circle", title: "Submit and climb", text: "Hidden tests, instant verdict, points on the board and a streak that keeps you coming back." },
];

const LANGUAGES = [
  ["Python 3", "py"],
  ["JavaScript", "js"],
  ["C++17", "cpp"],
  ["Java 21", "java"],
  ["Go 1.22", "go"],
];

/* ---- Animated "judge" window in the hero ---- */
const CODE_LINES = [
  [["kw", "def "], ["fn", "two_sum"], ["p", "(nums, target):"]],
  [["p", "    seen = {}"]],
  [["kw", "    for "], ["p", "i, n "], ["kw", "in "], ["fn", "enumerate"], ["p", "(nums):"]],
  [["kw", "        if "], ["p", "target - n "], ["kw", "in "], ["p", "seen:"]],
  [["kw", "            return "], ["p", "[seen[target - n], i]"]],
  [["p", "        seen[n] = i"]],
];
const TOKEN = { kw: "text-brand-300", fn: "text-accent-300", p: "text-slate-200", c: "text-slate-500" };

function JudgeWindow() {
  const [stage, setStage] = useState(0); // 0 typing, 1 running, 2 accepted
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 1400);
    const t2 = setTimeout(() => setStage(2), 2600);
    const loop = setInterval(() => {
      setStage(0);
      setTimeout(() => setStage(1), 1400);
      setTimeout(() => setStage(2), 2600);
    }, 7000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(loop);
    };
  }, []);
  return (
    <div className="relative mx-auto w-full max-w-xl animate-fade-up [animation-delay:200ms]">
      <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-500/25 via-indigo-500/10 to-accent-500/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-ink-900/90 shadow-card-hover backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-rose-500/80" />
          <span className="h-3 w-3 rounded-full bg-amber-400/80" />
          <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
          <span className="ml-3 rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-slate-400">two_sum.py</span>
          <span className="ml-auto pill bg-brand-500/15 text-brand-300">Python 3</span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6">
          {CODE_LINES.map((line, i) => (
            <div key={i} className="flex">
              <span className="mr-4 w-4 select-none text-right text-slate-600">{i + 1}</span>
              <span>
                {line.map(([t, s], j) => (
                  <span key={j} className={TOKEN[t]}>
                    {s}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </pre>
        <div className="flex items-center gap-3 border-t border-white/[0.06] bg-ink-950/60 px-4 py-3 text-sm">
          {stage === 0 && (
            <>
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <span className="text-slate-400">Ready</span>
            </>
          )}
          {stage === 1 && (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-400" />
              <span className="text-slate-300">Judging 12 tests…</span>
            </>
          )}
          {stage === 2 && (
            <span className="flex animate-scale-in items-center gap-2 font-semibold text-emerald-300">
              <Icon name="check-circle" className="h-4 w-4" strokeWidth={2.25} />
              Accepted · 12/12 · 38 ms
              <span className="pill bg-brand-500/20 text-brand-200">+20 pts</span>
            </span>
          )}
          <span className="ml-auto hidden font-mono text-[11px] text-slate-500 sm:inline">sandbox · 512 MB · 1 CPU</span>
        </div>
      </div>

      {/* Floating chips */}
      <div className="absolute -left-5 -top-5 hidden animate-float rounded-xl border border-white/[0.1] bg-ink-900/95 px-3 py-2 text-xs shadow-card-hover backdrop-blur md:block [animation-delay:600ms]">
        <div className="flex items-center gap-2">
          <Icon name="flame" className="h-4 w-4 text-orange-400" />
          <span className="font-semibold text-white">7-day streak</span>
        </div>
      </div>
      <div className="absolute -bottom-5 -right-5 hidden animate-float rounded-xl border border-white/[0.1] bg-ink-900/95 px-3 py-2 text-xs shadow-card-hover backdrop-blur md:block [animation-delay:1400ms]">
        <div className="flex items-center gap-2">
          <Icon name="trophy" className="h-4 w-4 text-amber-300" />
          <span className="font-semibold text-white">Rank #3 this week</span>
        </div>
      </div>
    </div>
  );
}

function useStats() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    Promise.all([api("/problems").catch(() => null), api("/problems/structure").catch(() => null), api("/courses").catch(() => null)]).then(
      ([p, s, c]) => {
        const lessons = c?.courses?.reduce((n, x) => n + (x.lessonCount || 0), 0) ?? 0;
        setStats({
          problems: p?.problems?.length ?? 0,
          topics: s?.subjects?.flatMap((x) => x.chapters.flatMap((ch) => ch.topics)).length ?? 0,
          courses: c?.courses?.length ?? 0,
          lessons,
          courseList: c?.courses ?? [],
        });
      },
    );
  }, []);
  return stats;
}

export default function Home() {
  const { user } = useAuth();
  const stats = useStats();

  return (
    <div className="overflow-x-clip">
      {/* ---------------- Hero ---------------- */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-hero-glow" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-24">
          <div className="animate-fade-up">
            <span className="eyebrow">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-accent-400" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
              </span>
              Practice · Learn · Compete
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              The coding platform built to make you <span className="text-gradient">unstoppable</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
              Solve curated problems with instant verdicts, learn DSA and Machine Learning step by step, and prove it every day on the
              live leaderboard.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/problems" className="btn-primary btn-lg">
                Start practising
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              {user ? (
                <Link href="/courses" className="btn-ghost btn-lg">
                  <Icon name="book-open" className="h-4 w-4" />
                  Continue learning
                </Link>
              ) : (
                <Link href="/register" className="btn-ghost btn-lg">
                  Create a free account
                </Link>
              )}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <Icon name="check" className="h-4 w-4 text-emerald-400" strokeWidth={2.5} /> Free to start
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="check" className="h-4 w-4 text-emerald-400" strokeWidth={2.5} /> No setup, code in the browser
              </span>
              <span className="flex items-center gap-1.5">
                <Icon name="check" className="h-4 w-4 text-emerald-400" strokeWidth={2.5} /> 5 languages
              </span>
            </div>
          </div>
          <JudgeWindow />
        </div>
      </section>

      {/* ---------------- Stats strip ---------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="card-glass grid grid-cols-2 divide-white/[0.06] md:grid-cols-4 md:divide-x">
          {[
            ["Problems", stats?.problems, "code"],
            ["Topics", stats?.topics, "hash"],
            ["Courses", stats?.courses, "book-open"],
            ["Lessons", stats?.lessons, "layers"],
          ].map(([label, value, icon]) => (
            <div key={label} className="flex items-center gap-4 px-6 py-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                <Icon name={icon} className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums text-white">{value == null ? <span className="skeleton inline-block h-6 w-12 align-middle" /> : value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Live test ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6">
        <LiveTestBanner />
      </section>

      {/* ---------------- Features ---------------- */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Everything in one place</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Built like the tools the best engineers use</h2>
          <p className="mt-4 text-slate-400">A serious judge, a real curriculum and the competitive edge that keeps you consistent.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card-hover group p-6 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset ring-white/[0.08] ${f.tone}`}>
                <Icon name={f.icon} className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="border-y border-white/[0.06] bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <span className="eyebrow">How it works</span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">From first line to leaderboard in three steps</h2>
              <p className="mt-4 text-slate-400">
                No installs, no configuration. Open a problem, write your solution and let the judge do the rest.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {LANGUAGES.map(([name, ext]) => (
                  <span key={name} className="chip !cursor-default">
                    <span className="font-mono text-[10px] text-brand-300">.{ext}</span>
                    {name}
                  </span>
                ))}
              </div>
            </div>
            <ol className="relative space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.n} className="card-hover flex gap-5 p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow-sm">
                    <Icon name={s.icon} className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-mono text-[11px] font-semibold tracking-widest text-brand-300">STEP {s.n}</div>
                    <h3 className="mt-1 text-base font-semibold text-white">{s.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------- Courses preview ---------------- */}
      {stats?.courseList?.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">Courses</span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">Learn it properly, then practise it</h2>
            </div>
            <Link href="/courses" className="btn-ghost">
              All courses <Icon name="arrow-right" className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {stats.courseList.slice(0, 4).map((c) => (
              <Link key={c.id} href={`/courses/${c.slug}`} className="card-hover group relative overflow-hidden p-5">
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-500/15 blur-2xl transition group-hover:bg-brand-500/25" />
                <div className="text-4xl">{c.icon}</div>
                <h3 className="mt-4 text-base font-semibold text-white group-hover:text-brand-200">{c.title}</h3>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <span className={`pill ${LEVEL_STYLE[c.level] || "bg-ink-700"}`}>{c.level}</span>
                  {c.lessonCount} lessons
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-slate-400">{c.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-600/30 via-ink-900 to-accent-600/20 px-6 py-14 text-center shadow-glow sm:px-12">
          <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Ready to level up?</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-300">Your first accepted solution is minutes away. Join the leaderboard today.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={user ? "/problems" : "/register"} className="btn-primary btn-lg">
                {user ? "Open the problem set" : "Create your free account"}
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
              <Link href="/leaderboard" className="btn-ghost btn-lg">
                <Icon name="trophy" className="h-4 w-4" /> See the leaderboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
