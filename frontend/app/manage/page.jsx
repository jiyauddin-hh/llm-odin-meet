"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import ManageNav from "@/components/manage/ManageNav";
import StatusBadge from "@/components/manage/StatusBadge";
import { Difficulty, ErrorBox, Spinner, timeAgo } from "@/components/ui";

export default function ManagePage() {
  const { user } = useRequireAuth({ editor: true });
  const [tree, setTree] = useState(null);
  const [sel, setSel] = useState({}); // { subject } | { chapter } | { topic }
  const [filters, setFilters] = useState({ q: "", status: "", difficulty: "" });
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api("/manage/tree").then(setTree).catch((e) => setError(e.message));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(Object.entries({ ...sel, ...filters }).filter(([, v]) => v));
    const t = setTimeout(() => {
      api(`/manage/problems?${params}`).then((d) => setProblems(d.problems)).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [user, sel, filters]);

  if (!user || !tree) return <Spinner />;
  const is = (k, id) => sel[k] === String(id);
  const pick = (k, id) => setSel(k ? { [k]: String(id) } : {});
  const item = (active) => `block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm transition ${active ? "bg-brand-500/15 text-white ring-1 ring-inset ring-brand-500/30" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 page-enter">
      <ManageNav inReview={tree.inReview} />
      <ErrorBox error={error} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="card h-fit p-3 lg:sticky lg:top-24">
          <button className={item(!Object.keys(sel).length)} onClick={() => pick()}>
            All my questions
          </button>
          {tree.unassigned > 0 && (
            <button className={item(sel.topic === "none")} onClick={() => setSel({ topic: "none" })}>
              ⚠️ No topic yet ({tree.unassigned})
            </button>
          )}
          <div className="mt-2 max-h-[65vh] space-y-3 overflow-y-auto">
            {tree.subjects.map((s) => (
              <div key={s.id}>
                <button className={`${item(is("subject", s.id))} font-semibold`} onClick={() => pick("subject", s.id)}>
                  {s.icon} {s.name}
                </button>
                {s.chapters.map((c) => (
                  <div key={c.id} className="ml-3">
                    <button className={item(is("chapter", c.id))} onClick={() => pick("chapter", c.id)}>
                      📂 {c.name}
                    </button>
                    {c.topics.map((t) => (
                      <button key={t.id} className={`${item(is("topic", t.id))} ml-4 flex justify-between`} onClick={() => pick("topic", t.id)}>
                        <span className="truncate">{t.name}</span>
                        <span className="text-xs text-slate-600">{t.count}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {tree.subjects.length === 0 && (
              <p className="p-2 text-sm text-amber-300">No subjects assigned to you yet. Ask an admin.</p>
            )}
          </div>
          <Link href="/manage/structure" className="btn-ghost mt-3 w-full text-xs">
            Edit chapters & topics
          </Link>
        </aside>

        <section className="min-w-0">
          <div className="card grid gap-3 p-3 sm:grid-cols-3">
            <input className="input" placeholder="Search title or slug…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Any status</option>
              <option value="live">Live</option>
              <option value="hidden">Hidden / not live</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_REVIEW">In review</option>
              <option value="REJECTED">Changes requested</option>
            </select>
            <select className="input" value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}>
              <option value="">Any difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {!problems ? (
            <Spinner />
          ) : (
            <div className="card mt-4 overflow-hidden"><div className="overflow-x-auto">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Question</th>
                    <th className="px-4 py-3">Topic</th>
                    <th className="px-4 py-3">Difficulty</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Tests</th>
                    <th className="px-4 py-3 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3">
                        <Link href={`/manage/${p.id}`} className="font-medium text-white hover:text-brand-400">
                          {p.draftTitle || p.title}
                        </Link>
                        {p.workflow === "REJECTED" && p.reviewComment && (
                          <div className="mt-0.5 max-w-xs truncate text-xs text-rose-300">↳ {p.reviewComment}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {p.topic ? (
                          <>
                            {p.topic.chapter.name} › <span className="text-slate-300">{p.topic.name}</span>
                          </>
                        ) : (
                          <span className="text-amber-300">none</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Difficulty value={p.difficulty} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge problem={p} />
                      </td>
                      <td className="px-4 py-3 text-slate-400">{p._count.testCases}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{timeAgo(p.updatedAt)}</td>
                    </tr>
                  ))}
                  {problems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                        No questions here yet. <Link href="/manage/new" className="text-brand-400">Write one →</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div></div>
          )}
        </section>
      </div>
    </div>
  );
}
