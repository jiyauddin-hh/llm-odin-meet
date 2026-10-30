"use client";

// Home page: the daily live test countdown and the Performers of the Day.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/ui";
import Icon from "@/components/Icons";
import { CountdownDigits, dayLabel, duration, serverOffset, timeOfDay, useNow } from "./clock";

const SOON_MS = 10 * 60_000;

export default function LiveTestBanner() {
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const load = useCallback(
    () =>
      api("/live-tests/home")
        .then((d) => {
          setOffset(serverOffset(d.now));
          setData(d);
        })
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    load();
    // Keep the "students ready / playing" counts fresh.
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (!data || (!data.test && !data.performers)) return null;
  return (
    <section className="grid gap-4 pb-12 lg:grid-cols-5">
      <div className={data.performers ? "lg:col-span-3" : "lg:col-span-5"}>
        {data.test ? <Countdown test={data.test} offset={offset} reload={load} onChange={setData} /> : <NoTest />}
      </div>
      {data.performers && (
        <div className="lg:col-span-2">
          <Performers {...data.performers} />
        </div>
      )}
    </section>
  );
}

function NoTest() {
  return (
    <div className="card-glow flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30">
        <Icon name="timer" className="h-6 w-6" />
      </div>
      <h2 className="relative mt-4 text-xl font-bold text-white">The next live test is coming soon</h2>
      <p className="relative mt-2 text-sm text-slate-400">A new 10-minute challenge every day at 5:30 PM. Watch this space!</p>
    </div>
  );
}

function Countdown({ test, offset, reload, onChange }) {
  const { user } = useAuth();
  const router = useRouter();
  const now = useNow(offset);
  const [busy, setBusy] = useState(false);
  const start = new Date(test.startsAt).getTime();
  const end = new Date(test.endsAt).getTime();
  const phase = now < start ? (start - now <= SOON_MS ? "SOON" : "UPCOMING") : now < end ? "LIVE" : "ENDED";

  // Refresh when the test goes live and when it ends (results are out).
  const last = useRef(phase);
  useEffect(() => {
    if ((phase === "LIVE" || phase === "ENDED") && last.current !== phase) reload();
    last.current = phase;
  }, [phase, reload]);

  const ready = async () => {
    if (!user) return router.push("/login");
    setBusy(true);
    try {
      const d = await api(`/live-tests/${test.id}/ready`, { method: "POST" });
      onChange((prev) => ({ ...prev, test: d.test }));
    } catch {}
    setBusy(false);
  };

  const me = test.me;
  const live = phase === "LIVE";
  const soon = phase === "SOON";
  const frame = live
    ? "border-rose-500/60 bg-gradient-to-br from-rose-950/80 via-ink-900 to-ink-900 live-glow-red"
    : soon
      ? "border-amber-400/60 bg-gradient-to-br from-amber-950/60 via-ink-900 to-ink-900 live-glow-amber"
      : "border-brand-500/40 bg-gradient-to-br from-brand-600/20 via-ink-900 to-accent-900/20 shadow-glow";

  return (
    <div className={`relative h-full overflow-hidden rounded-2xl border p-6 text-center sm:p-8 ${frame}`}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl live-float" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl live-float" />

      <div className="relative">
        {live ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
            <span className="h-2 w-2 rounded-full bg-white live-blink" /> Live now
          </span>
        ) : soon ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300 live-blink">
            <Icon name="zap" className="h-3.5 w-3.5" /> Starting soon
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-brand-400">
            <Icon name="trophy" className="h-3.5 w-3.5" /> Daily Live Test · {dayLabel(test.startsAt, now)} {timeOfDay(test.startsAt)}
          </span>
        )}

        <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl">{test.title}</h2>
        {test.topic && <p className="mt-1 text-sm text-slate-300">{test.topic}</p>}
        <p className="mt-1 text-xs text-slate-400">
          {test.questionCount} questions · {test.durationMin} minutes · fastest top scorer wins
        </p>

        <p className="mt-6 text-sm font-medium text-slate-300">{live ? "Closes in" : "Starts in"}</p>
        <div className="mt-2">
          <CountdownDigits msLeft={(live ? end : start) - now} tone={live ? "red" : soon ? "amber" : "brand"} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {live ? (
            me?.submitted ? (
              <span className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                <Icon name="check-circle" className="h-4 w-4" /> Submitted. Results at {timeOfDay(test.endsAt)}
              </span>
            ) : (
              <Link
                href={user ? `/live/${test.id}` : "/login"}
                className="btn bg-rose-600 px-8 py-3 text-base font-bold text-white hover:bg-rose-500 live-pulse"
              >
                <Icon name={me?.started ? "play" : "zap"} className="h-4 w-4" /> {me?.started ? "Continue test" : "Join now"}
              </Link>
            )
          ) : me ? (
            <span className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
              <Icon name="check-circle" className="h-4 w-4" /> You're in! Come back at {timeOfDay(test.startsAt)}
            </span>
          ) : (
            <button onClick={ready} disabled={busy} className={`btn-primary px-6 py-3 text-base ${soon ? "live-pulse" : ""}`}>
              <Icon name="flame" className="h-4 w-4" /> I'm in!
            </button>
          )}
          <Link href={`/live/${test.id}`} className="btn-ghost px-4 py-3">
            Details
          </Link>
        </div>

        <p className="mt-4 text-sm text-slate-300">
          {live ? (
            <>
              <span className="font-bold text-rose-300">{test.playing}</span> student{test.playing === 1 ? " is" : "s are"} taking the test right now
            </>
          ) : test.ready > 0 ? (
            <>
              <Icon name="flame" className="inline h-4 w-4 text-orange-400" /> <span className="font-bold text-white">{test.ready}</span> student{test.ready === 1 ? " is" : "s are"} ready
            </>
          ) : (
            "Be the first to say you're in!"
          )}
        </p>
      </div>
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];
const PODIUM = [
  "border-amber-400/60 bg-gradient-to-r from-amber-500/20 to-transparent",
  "border-slate-300/40 bg-gradient-to-r from-slate-300/10 to-transparent",
  "border-orange-700/50 bg-gradient-to-r from-orange-700/15 to-transparent",
];

function Performers({ test, top }) {
  return (
    <div className="card h-full p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Icon name="trophy" className="h-5 w-5 text-amber-300" /> Performers of the Day
        </h2>
        <span className="text-xs text-slate-400">{dayLabel(test.startsAt)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{test.topic || test.title}</p>
      <ol className="mt-4 space-y-3">
        {top.map((r, i) => (
          <li key={r.user.id} className={`flex items-center gap-3 rounded-xl border p-3 ${PODIUM[i]} live-rise`} style={{ animationDelay: `${i * 120}ms` }}>
            <span className={i === 0 ? "text-3xl" : "text-2xl"}>{MEDALS[i]}</span>
            <Avatar user={r.user} size={i === 0 ? 40 : 34} />
            <div className="min-w-0 flex-1">
              <Link href={`/u/${r.user.username}`} className="block truncate font-semibold text-white hover:text-brand-400">
                {r.user.name || r.user.username}
              </Link>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Icon name="clock" className="h-3 w-3" /> {duration(r.timeMs)}
              </span>
            </div>
            <span className="font-mono text-lg font-bold text-white">
              {r.score}
              <span className="text-xs text-slate-400">/{test.questionCount}</span>
            </span>
          </li>
        ))}
      </ol>
      <Link href={`/live/${test.id}`} className="btn-ghost btn-sm mt-4 w-full">
        See the full leaderboard <Icon name="arrow-right" className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
