"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox } from "./ui";

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** Exactly what one user may open in one course: the whole course, or ticked chapters. */
export default function UserChaptersModal({ course, modules, entry, onClose }) {
  const [full, setFull] = useState(!!entry.full && !entry.full.expired);
  const [picked, setPicked] = useState(new Set(entry.chapters.filter((c) => !c.expired).map((c) => c.moduleId)));
  const [expiresAt, setExpiresAt] = useState(toDateInput(entry.full?.expiresAt || entry.chapters[0]?.expiresAt));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/courses/${course.id}/users/${entry.user.id}/access`, {
        method: "PUT",
        body: { full, moduleIds: full ? [] : [...picked], expiresAt: expiresAt || null },
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
      <div className="card flex max-h-[90vh] w-full max-w-lg flex-col p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white">
          {entry.user.username} · {course.icon} {course.title}
        </h2>
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
          <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
          <span className="text-sm font-medium text-white">Whole course (every chapter)</span>
        </label>
        <div className={`mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto ${full ? "pointer-events-none opacity-40" : ""}`}>
          <p className="text-xs text-slate-400">…or only these chapters:</p>
          {modules.map((m, i) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ink-800">
              <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} />
              <span className="text-sm">
                <span className="text-slate-500">Chapter {i + 1}:</span> {m.title}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <label className="label">Access until (optional)</label>
          <input className="input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => onClose(false)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : full || picked.size ? "Save access" : "Remove all access"}
          </button>
        </div>
      </div>
    </div>
  );
}
