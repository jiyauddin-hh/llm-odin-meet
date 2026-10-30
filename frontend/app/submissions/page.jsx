"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { Difficulty, EmptyState, ErrorBox, LANGUAGE_LABEL, PageHeader, Pager, SkeletonRows, Verdict, timeAgo } from "@/components/ui";
import Icon from "@/components/Icons";

export default function SubmissionsPage() {
  const { user } = useRequireAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api(`/submissions?page=${page}`).then(setData).catch((e) => setError(e.message));
  }, [user, page]);

  const accepted = data?.submissions.filter((s) => s.verdict === "Accepted").length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 page-enter">
      <PageHeader
        eyebrow={
          <>
            <Icon name="activity" className="h-3.5 w-3.5" /> History
          </>
        }
        title="My submissions"
        subtitle="Every run against the full test set, newest first. Open one to see the code and per-test results."
        actions={
          data &&
          data.submissions.length > 0 && (
            <div className="card flex items-center gap-3 px-4 py-2.5 text-sm">
              <Icon name="check-circle" className="h-4 w-4 text-emerald-300" />
              <span className="text-slate-300">
                <span className="font-semibold text-white">{accepted}</span> of {data.submissions.length} accepted on this page
              </span>
            </div>
          )
        }
      />
      <ErrorBox error={error} className="mt-6" />
      <div className="card mt-6 overflow-hidden">
        {!data ? (
          <SkeletonRows rows={8} className="p-5" />
        ) : data.submissions.length === 0 ? (
          <EmptyState
            icon="send"
            title="Nothing here yet"
            text="Your submissions will appear here once you solve your first problem."
            action={
              <Link href="/problems" className="btn-primary btn-sm">
                Solve your first problem <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Verdict</th>
                  <th className="hidden sm:table-cell">Tests</th>
                  <th className="hidden md:table-cell">Language</th>
                  <th className="hidden md:table-cell">Runtime</th>
                  <th className="text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/problems/${s.problem.slug}`} className="font-medium text-white hover:text-brand-200">
                          {s.problem.title}
                        </Link>
                        <Difficulty value={s.problem.difficulty} />
                      </div>
                    </td>
                    <td>
                      <Link href={`/submissions/${s.id}`} className="hover:underline">
                        <Verdict value={s.verdict} />
                      </Link>
                    </td>
                    <td className="hidden tabular-nums text-slate-400 sm:table-cell">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/[0.06]">
                          <span className={`block h-full rounded-full ${s.passed === s.total ? "bg-emerald-400" : "bg-rose-400"}`} style={{ width: s.total ? `${(s.passed / s.total) * 100}%` : 0 }} />
                        </span>
                        {s.passed}/{s.total}
                      </span>
                    </td>
                    <td className="hidden text-slate-400 md:table-cell">{LANGUAGE_LABEL[s.language]}</td>
                    <td className="hidden font-mono text-xs text-slate-400 md:table-cell">{s.runtimeMs != null ? `${s.runtimeMs} ms` : "—"}</td>
                    <td className="text-right text-xs text-slate-500">
                      <Link href={`/submissions/${s.id}`} className="inline-flex items-center gap-1 hover:text-slate-300">
                        {timeAgo(s.createdAt)} <Icon name="chevron-right" className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pager page={data.page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
