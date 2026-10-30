"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import ManageNav from "@/components/manage/ManageNav";
import StatusBadge from "@/components/manage/StatusBadge";
import { Difficulty, ErrorBox, Spinner, timeAgo } from "@/components/ui";

export default function ReviewQueuePage() {
  const { user } = useRequireAuth({ admin: true });
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role === "ADMIN") api("/manage/review").then((d) => setProblems(d.problems)).catch((e) => setError(e.message));
  }, [user]);

  if (user?.role !== "ADMIN") return <Spinner />;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ManageNav inReview={problems?.length} />
      <p className="mb-4 text-sm text-slate-400">
        Editors' questions waiting for approval. Open one, check the preview, then <b>Approve & publish</b> or <b>Request changes</b>.
      </p>
      <ErrorBox error={error} />
      {!problems ? (
        <Spinner />
      ) : problems.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">Nothing waiting for review. 🎉</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="px-4 py-3">Question</th>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Sent by</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-white">{p.draftTitle || p.title}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {p.topic ? `${p.topic.chapter.subject.name} › ${p.topic.chapter.name} › ${p.topic.name}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Difficulty value={p.difficulty} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {p.submitted ? (
                      <>
                        {p.submitted.user} <span className="text-slate-600">· {timeAgo(p.submitted.at)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge problem={p} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex gap-3">
                      <Link href={`/manage/${p.id}/preview`} className="text-slate-300 hover:underline">
                        Preview
                      </Link>
                      <Link href={`/manage/${p.id}`} className="text-brand-400 hover:underline">
                        Review →
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
