"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Heatmap from "@/components/Heatmap";
import { Avatar, Difficulty, EmptyState, ErrorBox, LANGUAGE_LABEL, ProgressBar, SectionCard, Spinner, StatCard, Verdict, timeAgo } from "@/components/ui";
import Icon from "@/components/Icons";

const BADGE_ICON = { "first-solve": "🎯", five: "🔥", "twenty-five": "💎", hard: "⚔️", "streak-7": "⚡" };
const BAR = { EASY: "bg-emerald-400", MEDIUM: "bg-amber-400", HARD: "bg-rose-400" };

export default function ProfilePage({ params }) {
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/users/${params.username}`).then(setData).catch((e) => setError(e.message));
  }, [params.username]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorBox error={error} />
      </div>
    );
  if (!data) return <Spinner />;
  const { user, stats, badges, heatmap, recent, courses } = data;
  const isMe = me?.id === user.id;
  const totalSolved = Object.values(stats.byDifficulty).reduce((a, b) => a + b, 0);
  const totalAll = Object.values(stats.totals).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 page-enter">
      {/* Banner */}
      <div className="card-glow overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-brand-600/40 via-indigo-500/25 to-accent-500/30 sm:h-32" />
        <div className="relative px-6 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
            <div className="-mt-12 w-fit rounded-full bg-ink-900 p-1.5 ring-1 ring-white/[0.08]">
              <Avatar user={user} size={96} />
            </div>
            <div className="min-w-0 flex-1 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">{user.name || user.username}</h1>
                {user.role === "ADMIN" && (
                  <span className="pill bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30">
                    <Icon name="shield" className="h-3 w-3" /> Admin
                  </span>
                )}
                {user.role === "TEACHER" && (
                  <span className="pill bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                    <Icon name="users" className="h-3 w-3" /> Teacher
                  </span>
                )}
                {user.role === "EDITOR" && (
                  <span className="pill bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30">
                    <Icon name="edit" className="h-3 w-3" /> Editor
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                <span>@{user.username}</span>
                {user.country && (
                  <span className="flex items-center gap-1">
                    <Icon name="pin" className="h-3.5 w-3.5" /> {user.country}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Icon name="calendar" className="h-3.5 w-3.5" /> Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </span>
              </div>
              {user.bio && <p className="mt-3 max-w-2xl text-sm text-slate-300">{user.bio}</p>}
            </div>
            {isMe && (
              <Link href="/settings" className="btn-ghost w-full sm:w-auto">
                <Icon name="edit" className="h-4 w-4" /> Edit profile
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Global rank" value={stats.rank ? `#${stats.rank}` : "—"} icon="trophy" tone="amber" />
        <StatCard label="Score" value={stats.score} icon="star" tone="brand" />
        <StatCard label="Solved" value={stats.solved} icon="check-circle" tone="emerald" />
        <StatCard label="Day streak" value={stats.streak} icon="flame" tone={stats.streak ? "rose" : "slate"} hint={stats.streak ? "Keep it going!" : "Solve today to start one"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <SectionCard title="Solved by difficulty" icon="bar-chart">
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-white">{totalSolved}</span>
              <span className="text-sm text-slate-400">/ {totalAll} problems</span>
            </div>
            <div className="space-y-3.5">
              {["EASY", "MEDIUM", "HARD"].map((d) => {
                const solved = stats.byDifficulty[d];
                const total = stats.totals[d] || 0;
                return (
                  <div key={d}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <Difficulty value={d} />
                      <span className="tabular-nums text-slate-400">
                        <span className="font-semibold text-white">{solved}</span> / {total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className={`h-full rounded-full ${BAR[d]} transition-all duration-700`} style={{ width: total ? `${(solved / total) * 100}%` : 0 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Badges" icon="award" actions={<span className="text-xs text-slate-500">{badges.length} earned</span>}>
            {badges.length ? (
              <div className="space-y-3">
                {badges.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/20 to-orange-500/10 text-xl ring-1 ring-inset ring-amber-400/20">
                      {b.icon || BADGE_ICON[b.id] || "🏅"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{b.name}</div>
                      <div className="text-xs text-slate-400">{b.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No badges yet. Solve a problem to earn the first one!</p>
            )}
          </SectionCard>
        </aside>

        <div className="space-y-6">
          <SectionCard title="Activity" icon="activity">
            <Heatmap data={heatmap} />
          </SectionCard>

          {courses.length > 0 && (
            <SectionCard title={isMe ? "My courses" : "Courses"} icon="book-open">
              <div className="grid gap-3 sm:grid-cols-2">
                {courses.map((c) => (
                  <Link key={c.id} href={`/courses/${c.slug}`} className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition hover:border-brand-500/40 hover:bg-white/[0.04]">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{c.icon}</span>
                      <span className="truncate font-medium text-white group-hover:text-brand-200">{c.title}</span>
                      {c.progress.percent === 100 && (
                        <span className="pill ml-auto bg-emerald-500/15 text-emerald-300">
                          <Icon name="check" className="h-3 w-3" strokeWidth={3} /> Done
                        </span>
                      )}
                    </div>
                    <div className="mb-1.5 mt-3 flex justify-between text-xs text-slate-400">
                      <span>
                        {c.progress.done}/{c.progress.total} lessons
                      </span>
                      <span className="font-semibold text-white">{c.progress.percent}%</span>
                    </div>
                    <ProgressBar percent={c.progress.percent} size="sm" />
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Recent submissions" icon="send" bodyClass="">
            {recent.length ? (
              <div className="overflow-x-auto">
                <table className="table table-hover">
                  <tbody>
                    {recent.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <Link href={`/problems/${s.problem.slug}`} className="font-medium text-white hover:text-brand-200">
                            {s.problem.title}
                          </Link>
                        </td>
                        <td>{isMe ? <Link href={`/submissions/${s.id}`} className="hover:underline"><Verdict value={s.verdict} /></Link> : <Verdict value={s.verdict} />}</td>
                        <td className="text-slate-400">{LANGUAGE_LABEL[s.language]}</td>
                        <td className="text-right text-xs text-slate-500">{timeAgo(s.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="send" title="No submissions yet" className="py-8" />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
