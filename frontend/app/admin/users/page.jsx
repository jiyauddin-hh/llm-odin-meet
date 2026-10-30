"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import UserCoursesModal from "@/components/UserCoursesModal";
import EditorSubjectsModal from "@/components/EditorSubjectsModal";
import SetPasswordModal from "@/components/SetPasswordModal";
import { Avatar, ErrorBox, Spinner } from "@/components/ui";

export default function AdminUsersPage() {
  const { user: me } = useRequireAuth({ admin: true });
  const [q, setQ] = useState("");
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [coursesFor, setCoursesFor] = useState(null);
  const [subjectsFor, setSubjectsFor] = useState(null);
  const [passwordFor, setPasswordFor] = useState(null);

  const load = () =>
    api(`/admin/users?q=${encodeURIComponent(q)}`)
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (me?.role !== "ADMIN") return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, q]);

  const act = async (fn) => {
    setError("");
    try {
      await fn();
      setConfirmId(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (me?.role !== "ADMIN") return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-white">Admin</h1>
      <AdminTabs />
      <input className="input max-w-sm" placeholder="Search username or email" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-4">
        <ErrorBox error={error} />
      </div>
      {!users ? (
        <Spinner />
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Solved</th>
                <th className="px-4 py-3">Submissions</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <Link href={`/u/${u.username}`} className="flex items-center gap-2 hover:text-brand-400">
                      <Avatar user={u} size={28} /> {u.username}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3 text-slate-400">{u._count.solves}</td>
                  <td className="px-4 py-3 text-slate-400">{u._count.submissions}</td>
                  <td className="px-4 py-3">
                    {u.id === me.id ? (
                      <span className="pill bg-brand-500/20 text-brand-400">{u.role} (you)</span>
                    ) : (
                      <select
                        className="input w-auto py-1"
                        value={u.role}
                        onChange={(e) => act(() => api(`/admin/users/${u.id}`, { method: "PATCH", body: { role: e.target.value } }))}
                      >
                        <option value="USER">USER</option>
                        <option value="EDITOR">EDITOR</option>
                        <option value="TEACHER">TEACHER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role === "EDITOR" && confirmId !== u.id && (
                      <button className="mr-4 text-amber-300 hover:underline" onClick={() => setSubjectsFor(u)}>
                        Subjects
                      </button>
                    )}
                    {u.role !== "ADMIN" && confirmId !== u.id && (
                      <button className="mr-4 text-emerald-400 hover:underline" onClick={() => setCoursesFor(u)}>
                        Courses
                      </button>
                    )}
                    {u.role !== "ADMIN" && confirmId !== u.id && (
                      <Link className="mr-4 text-brand-300 hover:underline" href={`/admin/classroom?q=${encodeURIComponent(u.username)}`}>
                        Classroom
                      </Link>
                    )}
                    {u.id !== me.id && confirmId !== u.id && (
                      <button className="mr-4 text-sky-400 hover:underline" onClick={() => setPasswordFor(u)}>
                        Password
                      </button>
                    )}
                    {u.id === me.id ? null : confirmId === u.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          className="btn-danger px-2 py-1"
                          onClick={() => act(() => api(`/admin/users/${u.id}`, { method: "DELETE" }))}
                        >
                          Yes, delete
                        </button>
                        <button className="btn-ghost px-2 py-1" onClick={() => setConfirmId(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <button className="text-rose-400 hover:underline" onClick={() => setConfirmId(u.id)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {coursesFor && <UserCoursesModal user={coursesFor} onClose={() => setCoursesFor(null)} />}
      {subjectsFor && <EditorSubjectsModal user={subjectsFor} onClose={() => setSubjectsFor(null)} />}
      {passwordFor && <SetPasswordModal user={passwordFor} onClose={() => setPasswordFor(null)} />}
    </div>
  );
}
