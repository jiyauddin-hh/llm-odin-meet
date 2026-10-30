"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import { ErrorBox, LEVEL_STYLE, Spinner } from "@/components/ui";

export default function AdminCoursesPage() {
  const { user } = useRequireAuth({ admin: true });
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState(null);

  const load = () => api("/admin/courses").then((d) => setCourses(d.courses)).catch((e) => setError(e.message));

  useEffect(() => {
    if (user?.role === "ADMIN") load();
  }, [user]);

  const remove = async (id) => {
    try {
      await api(`/admin/courses/${id}`, { method: "DELETE" });
      setConfirmId(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (user?.role !== "ADMIN") return <Spinner />;
  const pending = courses?.reduce((n, c) => n + c.pending, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <Link href="/admin/courses/new" className="btn-primary">
          + New course
        </Link>
      </div>
      <AdminTabs pending={pending} />
      <ErrorBox error={error} />
      {!courses ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Lessons</th>
                <th className="px-4 py-3">Learners</th>
                <th className="px-4 py-3">Requests</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium text-white">
                    <span className="mr-2 text-lg">{c.icon}</span>
                    {c.title}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`pill ${LEVEL_STYLE[c.level] || "bg-ink-700"}`}>{c.level}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {c.lessonCount} in {c.moduleCount} modules
                  </td>
                  <td className="px-4 py-3 text-slate-400">{c.learners}</td>
                  <td className="px-4 py-3">
                    {c.pending > 0 ? (
                      <Link href="/admin/requests" className="pill bg-rose-500/20 text-rose-300">
                        {c.pending} pending
                      </Link>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.published ? (
                      <span className="pill bg-emerald-500/15 text-emerald-400">Live</span>
                    ) : (
                      <span className="pill bg-ink-700 text-slate-400">Draft</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmId === c.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-xs text-slate-400">Delete course and all progress?</span>
                        <button className="btn-danger px-2 py-1" onClick={() => remove(c.id)}>
                          Yes, delete
                        </button>
                        <button className="btn-ghost px-2 py-1" onClick={() => setConfirmId(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-3">
                        <Link href={`/admin/courses/${c.id}/access`} className="text-emerald-400 hover:underline">
                          Access
                        </Link>
                        <Link href={`/admin/courses/${c.id}`} className="text-brand-400 hover:underline">
                          Edit
                        </Link>
                        <button className="text-rose-400 hover:underline" onClick={() => setConfirmId(c.id)}>
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No courses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
