"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import UserChaptersModal from "@/components/UserChaptersModal";
import { Avatar, ErrorBox, ProgressBar, Spinner, formatDate } from "@/components/ui";

const RULE = { FREE: "free preview", AUTO: "auto unlock", PERMISSION: "" };

export default function CourseAccessPage({ params }) {
  const { user } = useRequireAuth({ admin: true });
  const [course, setCourse] = useState(null);
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [what, setWhat] = useState("full"); // "full" | "chapters"
  const [chapters, setChapters] = useState(new Set());
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);

  const loadAccess = () => api(`/admin/courses/${params.id}/access`).then(setData).catch((e) => setError(e.message));

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    api(`/admin/courses/${params.id}`).then((d) => setCourse(d.course)).catch((e) => setError(e.message));
    loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    const t = setTimeout(() => {
      api(`/admin/users?q=${encodeURIComponent(q)}`).then((d) => setUsers(d.users)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [user, q]);

  if (user?.role !== "ADMIN" || !course || !data) return error ? <ErrorBox error={error} /> : <Spinner />;

  const fullActive = new Set(data.access.filter((a) => a.full && !a.full.expired).map((a) => a.user.id));
  const candidates = users.filter((u) => u.role !== "ADMIN" && !fullActive.has(u.id));
  const toggleIn = (set, setter) => (id) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };
  const ready = picked.size > 0 && (what === "full" || chapters.size > 0);

  const grant = async () => {
    setError("");
    setMessage("");
    try {
      const d = await api(`/admin/courses/${course.id}/access`, {
        method: "POST",
        body: { userIds: [...picked], expiresAt: expiresAt || null, ...(what === "chapters" && { moduleIds: [...chapters] }) },
      });
      setMessage(
        what === "full"
          ? `Whole course given to ${d.granted} user${d.granted === 1 ? "" : "s"}.`
          : `${chapters.size} chapter${chapters.size === 1 ? "" : "s"} given to ${d.granted} user${d.granted === 1 ? "" : "s"}.`,
      );
      setPicked(new Set());
      loadAccess();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/courses" className="text-sm text-slate-400 hover:text-white">
        ← Courses
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-white">
        {course.icon} {course.title}: access
      </h1>
      <p className="text-sm text-slate-400">
        Give the whole course, or only some chapters. Free-preview chapters are open to everyone already.{" "}
        <Link href={`/admin/courses/${course.id}`} className="text-brand-400 hover:underline">
          Change unlock rules →
        </Link>
      </p>
      <div className="mt-4 space-y-2">
        <ErrorBox error={error} />
        {message && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</div>}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[400px_1fr]">
        <section className="card h-fit space-y-4 p-5">
          <h2 className="font-semibold text-white">Give access</h2>
          <div>
            <label className="label">1. Users</label>
            <input className="input" placeholder="Search username or email" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {candidates.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ink-800">
                  <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggleIn(picked, setPicked)(u.id)} />
                  <Avatar user={u} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {u.username} <span className="text-slate-500">{u.email}</span>
                  </span>
                </label>
              ))}
              {candidates.length === 0 && <p className="py-3 text-center text-sm text-slate-500">No users without the whole course.</p>}
            </div>
            {candidates.length > 0 && (
              <button
                className="tab mt-1 text-xs"
                onClick={() => setPicked(picked.size === candidates.length ? new Set() : new Set(candidates.map((u) => u.id)))}
              >
                {picked.size === candidates.length ? "Clear all" : "Select all shown"}
              </button>
            )}
          </div>

          <div>
            <label className="label">2. What to give</label>
            <div className="flex gap-1">
              <button className={`tab ${what === "full" ? "tab-active" : ""}`} onClick={() => setWhat("full")}>
                Whole course
              </button>
              <button className={`tab ${what === "chapters" ? "tab-active" : ""}`} onClick={() => setWhat("chapters")}>
                Some chapters
              </button>
            </div>
            {what === "chapters" && (
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-ink-700 p-2">
                {course.modules.map((m, i) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-ink-800">
                    <input type="checkbox" checked={chapters.has(m.id)} onChange={() => toggleIn(chapters, setChapters)(m.id)} />
                    <span className="text-slate-500">{i + 1}.</span>
                    <span className="flex-1 truncate">{m.title}</span>
                    <span className="text-xs text-slate-500">{RULE[m.unlockMode]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label">3. Access until (optional)</label>
            <input className="input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Leave empty for permanent access.</p>
          </div>
          <button className="btn-success w-full" disabled={!ready} onClick={grant}>
            Give {what === "full" ? "whole course" : `${chapters.size || ""} chapter${chapters.size === 1 ? "" : "s"}`} to {picked.size || ""} user
            {picked.size === 1 ? "" : "s"}
          </button>
        </section>

        <section className="card overflow-x-auto">
          <div className="border-b border-ink-700 px-5 py-3 font-semibold text-white">Learners ({data.access.length})</div>
          <table className="table table-hover">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-2">User</th>
                <th className="px-5 py-2">Access</th>
                <th className="px-5 py-2">Progress</th>
                <th className="px-5 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {data.access.map((a) => (
                <tr key={a.user.id} className="border-t border-ink-800 align-top">
                  <td className="px-5 py-3">
                    <Link href={`/u/${a.user.username}`} className="flex items-center gap-2 hover:text-brand-400">
                      <Avatar user={a.user} size={28} /> {a.user.username}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {a.full &&
                      (a.full.expired ? (
                        <span className="pill bg-rose-500/15 text-rose-300">Course expired {formatDate(a.full.expiresAt)}</span>
                      ) : (
                        <span className="pill bg-emerald-500/15 text-emerald-400">
                          Whole course{a.full.expiresAt ? ` · until ${formatDate(a.full.expiresAt)}` : ""}
                        </span>
                      ))}
                    {a.chapters.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.chapters.map((c) => (
                          <span
                            key={c.moduleId}
                            title={c.expiresAt ? `until ${formatDate(c.expiresAt)}` : "permanent"}
                            className={`pill ${c.expired ? "bg-rose-500/15 text-rose-300 line-through" : "bg-sky-500/15 text-sky-300"}`}
                          >
                            Ch {c.number}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="w-44 px-5 py-3">
                    <div className="mb-1 text-xs text-slate-400">
                      {a.progress.done}/{a.progress.total} · {a.progress.percent}%
                    </div>
                    <ProgressBar percent={a.progress.percent} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button className="text-brand-400 hover:underline" onClick={() => setEditing(a)}>
                      Edit access
                    </button>
                  </td>
                </tr>
              ))}
              {data.access.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                    Nobody has access yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {editing && (
        <UserChaptersModal
          course={course}
          modules={course.modules}
          entry={editing}
          onClose={(changed) => {
            setEditing(null);
            if (changed) loadAccess();
          }}
        />
      )}
    </div>
  );
}
