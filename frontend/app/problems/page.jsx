"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Difficulty, EmptyState, ErrorBox, PageHeader, ProgressRing, SkeletonRows, StatusDot } from "@/components/ui";
import Icon from "@/components/Icons";

const EMPTY = { q: "", subject: "", chapter: "", topic: "", difficulty: "", company: "", status: "" };

const DIFF_SEG = [
  ["", "All"],
  ["easy", "Easy"],
  ["medium", "Medium"],
  ["hard", "Hard"],
];

export default function ProblemsPage() {
  const { user, loading: authLoading } = useAuth();
  const [filters, setFilters] = useState(EMPTY);
  const [structure, setStructure] = useState({ subjects: [], companies: [] });
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/problems/structure").then(setStructure).catch(() => {});
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/problems?${params}`)
        .then((d) => setProblems(d.problems))
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [filters, authLoading, user]);

  const subject = structure.subjects.find((s) => String(s.id) === filters.subject);
  const chapter = subject?.chapters.find((c) => String(c.id) === filters.chapter);
  const set = (k) => (e) => {
    const v = e.target.value;
    // Changing a level clears the levels below it.
    if (k === "subject") return setFilters({ ...filters, subject: v, chapter: "", topic: "" });
    if (k === "chapter") return setFilters({ ...filters, chapter: v, topic: "" });
    setFilters({ ...filters, [k]: v });
  };
  const solved = problems?.filter((p) => p.status === "solved").length ?? 0;
  const attempted = problems?.filter((p) => p.status === "attempted").length ?? 0;
  const active = Object.values(filters).some(Boolean);
  const byDiff = (d) => problems?.filter((p) => p.difficulty === d) ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 page-enter">
      <PageHeader
        eyebrow={
          <>
            <Icon name="code" className="h-3.5 w-3.5" /> Practice
          </>
        }
        title="Problem set"
        subtitle="Pick a subject, narrow it down by chapter and topic, then start coding. Your progress is tracked per problem."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {/* Subject tabs */}
          {structure.subjects.length > 0 && (
            <div className="mask-fade-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <button className={`chip whitespace-nowrap ${!filters.subject ? "chip-active" : ""}`} onClick={() => setFilters({ ...filters, subject: "", chapter: "", topic: "" })}>
                <Icon name="layers" className="h-3.5 w-3.5" /> All subjects
              </button>
              {structure.subjects.map((s) => (
                <button
                  key={s.id}
                  className={`chip whitespace-nowrap ${filters.subject === String(s.id) ? "chip-active" : ""}`}
                  onClick={() => setFilters({ ...filters, subject: String(s.id), chapter: "", topic: "" })}
                >
                  <span>{s.icon}</span> {s.name}
                </button>
              ))}
            </div>
          )}

          {/* Filter bar */}
          <div className="card mt-4 p-3 sm:p-4">
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input className="input pl-10" placeholder="Search problems…" value={filters.q} onChange={set("q")} />
              </div>
              <select className="input" value={filters.chapter} onChange={set("chapter")} disabled={!subject}>
                <option value="">{subject ? "All chapters" : "Pick a subject first"}</option>
                {subject?.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select className="input" value={filters.topic} onChange={set("topic")} disabled={!chapter}>
                <option value="">{chapter ? "All topics" : "Pick a chapter first"}</option>
                {chapter?.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="segmented">
                {DIFF_SEG.map(([v, label]) => (
                  <button key={v} className={`tab ${filters.difficulty === v ? "tab-active" : ""}`} onClick={() => setFilters({ ...filters, difficulty: v })}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="segmented">
                {[
                  ["", "Any status"],
                  ["solved", "Solved"],
                  ["attempted", "Attempted"],
                  ["unsolved", "Unsolved"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    disabled={!user && v}
                    title={!user && v ? "Log in to filter by status" : undefined}
                    className={`tab ${filters.status === v ? "tab-active" : ""} disabled:opacity-40`}
                    onClick={() => setFilters({ ...filters, status: v })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {active && (
                <button className="btn-ghost btn-sm ml-auto" onClick={() => setFilters(EMPTY)}>
                  <Icon name="x" className="h-3.5 w-3.5" /> Clear
                </button>
              )}
            </div>
            {structure.companies.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3 text-xs">
                <span className="mr-1 flex items-center gap-1 text-slate-500">
                  <Icon name="building" className="h-3.5 w-3.5" /> Asked by
                </span>
                {structure.companies.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilters({ ...filters, company: filters.company === c ? "" : c })}
                    className={`pill transition ${filters.company === c ? "bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/50" : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ErrorBox error={error} className="mt-4" />

          {/* List */}
          <div className="card mt-4 overflow-hidden">
            {!problems ? (
              <SkeletonRows rows={8} className="p-5" />
            ) : problems.length === 0 ? (
              <EmptyState
                icon="search"
                title="No problems match these filters"
                text="Try a broader search or clear the filters to see everything."
                action={
                  <button className="btn-ghost" onClick={() => setFilters(EMPTY)}>
                    Clear filters
                  </button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th className="w-12 text-center">Status</th>
                      <th>Title</th>
                      <th className="hidden md:table-cell">Chapter › Topic</th>
                      <th>Difficulty</th>
                      <th className="text-right">Points</th>
                      <th className="hidden text-right sm:table-cell">Acceptance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((p) => (
                      <tr key={p.id} className="group">
                        <td className="text-center">
                          <StatusDot status={p.status} className="h-3.5 w-3.5" />
                        </td>
                        <td>
                          <Link href={`/problems/${p.slug}`} className="font-medium text-white transition group-hover:text-brand-200">
                            {p.title}
                          </Link>
                          {p.companies.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-sky-300/80">
                              {p.companies.slice(0, 3).map((c) => (
                                <span key={c} className="rounded bg-sky-500/10 px-1.5 py-px">
                                  {c}
                                </span>
                              ))}
                              {p.companies.length > 3 && <span className="text-slate-500">+{p.companies.length - 3}</span>}
                            </div>
                          )}
                        </td>
                        <td className="hidden text-slate-400 md:table-cell">
                          {p.topic ? (
                            <span className="flex items-center gap-1.5">
                              <span className="text-slate-500">{p.topic.chapter.subject.icon}</span>
                              <span className="text-slate-500">{p.topic.chapter.name}</span>
                              <Icon name="chevron-right" className="h-3 w-3 text-slate-600" />
                              <span className="text-slate-300">{p.topic.name}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <Difficulty value={p.difficulty} />
                        </td>
                        <td className="text-right font-mono text-slate-300">{p.points}</td>
                        <td className="hidden text-right sm:table-cell">
                          {p.acceptance === null ? (
                            <span className="text-slate-500">—</span>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-slate-300">
                              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.06]">
                                <span className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300" style={{ width: `${p.acceptance}%` }} />
                              </span>
                              <span className="w-10 text-right tabular-nums">{p.acceptance}%</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: progress summary */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card-glow p-5">
            <div className="relative flex items-center gap-4">
              <ProgressRing percent={problems?.length ? (solved / problems.length) * 100 : 0} size={72} stroke={6}>
                <span className="text-sm font-bold">{problems?.length ? Math.round((solved / problems.length) * 100) : 0}%</span>
              </ProgressRing>
              <div>
                <div className="text-sm font-semibold text-white">{user ? "Your progress" : "Progress"}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {user ? (
                    <>
                      <span className="font-semibold text-emerald-300">{solved}</span> solved · <span className="font-semibold text-amber-300">{attempted}</span> attempted
                    </>
                  ) : (
                    <>
                      <Link href="/login" className="text-brand-300 hover:underline">
                        Log in
                      </Link>{" "}
                      to track your solves
                    </>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{problems?.length ?? "…"} problems shown</div>
              </div>
            </div>
            <div className="relative mt-5 space-y-2.5">
              {[
                ["EASY", "bg-emerald-400", "10 pts"],
                ["MEDIUM", "bg-amber-400", "20 pts"],
                ["HARD", "bg-rose-400", "40 pts"],
              ].map(([d, color, pts]) => {
                const list = byDiff(d);
                const done = list.filter((p) => p.status === "solved").length;
                return (
                  <div key={d}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
                        {d[0] + d.slice(1).toLowerCase()}
                        <span className="text-slate-600">· {pts}</span>
                      </span>
                      <span className="tabular-nums text-slate-400">
                        {done}/{list.length}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: list.length ? `${(done / list.length) * 100}%` : 0 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="sparkles" className="h-4 w-4 text-brand-300" /> Tips
            </h3>
            <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-400">
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />
                Run against the samples first, then submit to hit the hidden tests.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />
                Drafts save in your browser per language, so you can switch freely.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />
                Only your first accepted solve scores points. Solve daily to keep the streak.
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
