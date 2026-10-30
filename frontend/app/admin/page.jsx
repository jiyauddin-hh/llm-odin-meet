"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import StatusBadge from "@/components/manage/StatusBadge";
import { Difficulty, ErrorBox, PageHeader, Spinner, StatCard } from "@/components/ui";
import Icon from "@/components/Icons";

export default function AdminPage() {
  const { user } = useRequireAuth({ admin: true });
  const [stats, setStats] = useState(null);
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const load = () => {
    api("/admin/stats").then(setStats).catch((e) => setError(e.message));
    api("/admin/problems").then((d) => setProblems(d.problems)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (user?.role === "ADMIN") load();
  }, [user]);

  const remove = async (id) => {
    try {
      await api(`/admin/problems/${id}`, { method: "DELETE" });
      setConfirmId(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (user?.role !== "ADMIN") return <Spinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 page-enter">
      <PageHeader
        eyebrow={
          <>
            <Icon name="shield" className="h-3.5 w-3.5" /> Admin
          </>
        }
        title="Dashboard"
        subtitle="Platform overview and every problem in the bank."
        actions={
          <Link href="/manage/new" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" /> New problem
          </Link>
        }
        className="mb-6"
      />
      <AdminTabs pending={stats?.pendingRequests} />
      <ErrorBox error={error} className="mb-4" />

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Users" value={stats.users} icon="users" tone="brand" />
          <StatCard label="Problems" value={stats.problems} icon="code" tone="cyan" />
          <StatCard label="Submissions" value={stats.submissions} icon="send" tone="slate" />
          <StatCard label="Accepted" value={stats.accepted} icon="check-circle" tone="emerald" />
          <StatCard label="Courses" value={stats.courses} icon="book-open" tone="amber" />
          <StatCard label="Requests" value={stats.pendingRequests} icon="unlock" tone={stats.pendingRequests ? "rose" : "slate"} />
        </div>
      )}

      {!problems ? (
        <Spinner />
      ) : (
        <div className="card mt-6 overflow-hidden"><div className="overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Difficulty</th>
                <th className="px-4 py-3">Tests</th>
                <th className="px-4 py-3">Submissions</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-slate-500">{p.id}</td>
                  <td className="px-4 py-3 font-medium text-white">{p.title}</td>
                  <td className="px-4 py-3">
                    <Difficulty value={p.difficulty} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">{p._count.testCases}</td>
                  <td className="px-4 py-3 text-slate-400">{p._count.submissions}</td>
                  <td className="px-4 py-3">
                    <StatusBadge problem={p} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmId === p.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-slate-400">Delete with all submissions?</span>
                        <button className="btn-danger px-2 py-1" onClick={() => remove(p.id)}>
                          Yes, delete
                        </button>
                        <button className="btn-ghost px-2 py-1" onClick={() => setConfirmId(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-3">
                        <Link href={`/problems/${p.slug}`} className="text-slate-400 hover:text-white">
                          View
                        </Link>
                        <Link href={`/manage/${p.id}`} className="text-brand-400 hover:underline">
                          Edit
                        </Link>
                        <button className="text-rose-400 hover:underline" onClick={() => setConfirmId(p.id)}>
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </div>
  );
}
