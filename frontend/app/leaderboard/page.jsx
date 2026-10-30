"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Avatar, EmptyState, ErrorBox, PageHeader, Pager, SkeletonRows } from "@/components/ui";
import Icon from "@/components/Icons";

const PERIODS = [
  ["week", "This week"],
  ["month", "This month"],
  ["all", "All time"],
];

const PODIUM = [
  { ring: "ring-amber-400/70", glow: "from-amber-400/25", badge: "bg-amber-400 text-amber-950", label: "1st", size: 72 },
  { ring: "ring-slate-300/60", glow: "from-slate-300/15", badge: "bg-slate-300 text-slate-900", label: "2nd", size: 60 },
  { ring: "ring-orange-600/60", glow: "from-orange-600/20", badge: "bg-orange-500 text-orange-950", label: "3rd", size: 60 },
];

function Podium({ entries }) {
  if (entries.length < 3) return null;
  const order = [entries[1], entries[0], entries[2]];
  return (
    <div className="mt-6 grid grid-cols-3 items-end gap-3">
      {order.map((e, i) => {
        const place = i === 1 ? 0 : i === 0 ? 1 : 2;
        const p = PODIUM[place];
        return (
          <Link
            key={e.id}
            href={`/u/${e.username}`}
            className={`card-hover group relative flex flex-col items-center overflow-hidden px-3 pb-4 text-center animate-fade-up ${place === 0 ? "pt-6" : "pt-4"}`}
            style={{ animationDelay: `${place * 100}ms` }}
          >
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent ${p.glow}`} />
            <div className="relative">
              <Avatar user={e} size={p.size} className={`ring-2 ring-offset-2 ring-offset-ink-900 ${p.ring}`} />
              <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold ${p.badge}`}>{p.label}</span>
            </div>
            <div className="relative mt-4 w-full truncate text-sm font-semibold text-white group-hover:text-brand-200">{e.name || e.username}</div>
            <div className="relative truncate text-xs text-slate-500">@{e.username}</div>
            <div className="relative mt-2 text-lg font-bold tabular-nums text-white">
              {e.score}
              <span className="ml-1 text-xs font-medium text-slate-400">pts</span>
            </div>
            <div className="relative text-xs text-slate-500">{e.solved} solved</div>
          </Link>
        );
      })}
    </div>
  );
}

export default function LeaderboardPage() {
  const { user, loading } = useAuth();
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    setData(null);
    api(`/leaderboard?period=${period}&page=${page}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [period, page, loading, user]);

  const showPodium = page === 1 && data?.entries.length >= 3;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 page-enter">
      <PageHeader
        eyebrow={
          <>
            <Icon name="trophy" className="h-3.5 w-3.5" /> Leaderboard
          </>
        }
        title="Top coders"
        subtitle="Easy = 10, Medium = 20, Hard = 40 points. Only your first accepted solve of each problem counts."
        actions={
          <div className="segmented">
            {PERIODS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setPeriod(k);
                  setPage(1);
                }}
                className={`tab ${period === k ? "tab-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <ErrorBox error={error} className="mt-6" />

      {data?.me && (
        <div className="card-glow mt-6 flex flex-wrap items-center gap-4 p-4 sm:px-6">
          <div className="relative flex items-center gap-3">
            <Avatar user={user} size={44} ring />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-300">Your rank</div>
              <div className="text-2xl font-bold leading-tight text-white">#{data.me.rank}</div>
            </div>
          </div>
          <div className="relative ml-auto flex items-center gap-6 text-sm">
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums text-white">{data.me.score}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">points</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums text-white">{data.me.solved}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">solved</div>
            </div>
          </div>
        </div>
      )}

      {showPodium && <Podium entries={data.entries} />}

      <div className="card mt-6 overflow-hidden">
        {!data ? (
          <SkeletonRows rows={10} className="p-5" />
        ) : data.entries.length === 0 ? (
          <EmptyState
            icon="trophy"
            title="No one has scored in this period yet"
            text="Be the first: solve a problem and claim the top spot."
            action={
              <Link href="/problems" className="btn-primary btn-sm">
                Start solving
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th className="w-20">Rank</th>
                  <th>User</th>
                  <th className="text-right">Solved</th>
                  <th className="text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.slice(showPodium ? 3 : 0).map((e) => {
                  const me = user?.id === e.id;
                  return (
                    <tr key={e.id} className={me ? "!bg-brand-500/10" : ""}>
                      <td>
                        <span className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg px-1.5 font-mono text-xs font-semibold ${e.rank <= 3 ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.04] text-slate-300"}`}>
                          #{e.rank}
                        </span>
                      </td>
                      <td>
                        <Link href={`/u/${e.username}`} className="group flex items-center gap-3">
                          <Avatar user={e} size={34} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-white group-hover:text-brand-200">
                              {e.name || e.username}
                              {me && <span className="pill ml-2 bg-brand-500/15 text-brand-300">You</span>}
                            </div>
                            <div className="truncate text-xs text-slate-500">
                              @{e.username}
                              {e.country && ` · ${e.country}`}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="text-right tabular-nums text-slate-300">{e.solved}</td>
                      <td className="text-right font-semibold tabular-nums text-white">{e.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pager page={data.page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
