"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox, Spinner } from "./ui";

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** Tick exactly which courses one user may open. */
export default function UserCoursesModal({ user, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/admin/users/${user.id}/courses`)
      .then((d) => setRows(d.courses.map((c) => ({ ...c, expiresAt: toDateInput(c.expiresAt) }))))
      .catch((e) => setError(e.message));
  }, [user.id]);

  const update = (id, patch) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${user.id}/courses`, {
        method: "PUT",
        body: { courses: rows.filter((r) => r.granted).map((r) => ({ courseId: r.id, expiresAt: r.expiresAt || null })) },
      });
      onClose(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => onClose(false)}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white">Courses for {user.username}</h2>
        <p className="mt-1 text-xs text-slate-400">Ticked courses are open to this user. Leave the date empty for permanent access.</p>
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
        {!rows ? (
          <Spinner />
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-700 px-3 py-2">
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={r.granted} onChange={(e) => update(r.id, { granted: e.target.checked })} />
                  <span className="text-lg">{r.icon}</span>
                  <span className="text-sm text-white">{r.title}</span>
                </label>
                {r.granted && (
                  <input
                    type="date"
                    className="input w-auto py-1 text-xs"
                    value={r.expiresAt}
                    onChange={(e) => update(r.id, { expiresAt: e.target.value })}
                    title="Access until (optional)"
                  />
                )}
              </div>
            ))}
            {rows.length === 0 && <p className="text-sm text-slate-500">No courses exist yet.</p>}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !rows} onClick={save}>
            {busy ? "Saving…" : "Save access"}
          </button>
        </div>
      </div>
    </div>
  );
}
