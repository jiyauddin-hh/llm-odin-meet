"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox, Spinner } from "./ui";

/** Choose which subjects an editor may write questions for. */
export default function EditorSubjectsModal({ user, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/admin/users/${user.id}/subjects`).then((d) => setRows(d.subjects)).catch((e) => setError(e.message));
  }, [user.id]);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${user.id}/subjects`, {
        method: "PUT",
        body: { subjectIds: rows.filter((r) => r.assigned).map((r) => r.id) },
      });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white">Subjects for {user.username}</h2>
        <p className="mt-1 text-xs text-slate-400">
          This editor can write questions, chapters and topics only in the ticked subjects. Their work still needs your approval.
        </p>
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
        {!rows ? (
          <Spinner />
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink-700 px-3 py-2">
                <input
                  type="checkbox"
                  checked={r.assigned}
                  onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, assigned: e.target.checked } : x)))}
                />
                <span className="text-lg">{r.icon}</span>
                <span className="text-sm text-white">{r.name}</span>
              </label>
            ))}
            {rows.length === 0 && <p className="text-sm text-slate-500">No subjects yet. Add one in Question Manager → Structure.</p>}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !rows} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
