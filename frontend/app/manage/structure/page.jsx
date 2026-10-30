"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import ManageNav from "@/components/manage/ManageNav";
import { ErrorBox, Spinner } from "@/components/ui";

/** One editable name with rename / move / delete controls. */
function Row({ label, prefix, count, onRename, onDelete, onUp, onDown, canEdit = true }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);
  const [confirm, setConfirm] = useState(false);

  if (editing)
    return (
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onRename(name)) setEditing(false);
        }}
      >
        <input className="input py-1" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary px-3 py-1">Save</button>
        <button type="button" className="btn-ghost px-3 py-1" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </form>
    );

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-ink-800/60">
      <span className="flex-1 truncate">
        {prefix} {label}
        {count !== undefined && <span className="ml-2 text-xs text-slate-500">{count} questions</span>}
      </span>
      {canEdit && (
        <span className="flex items-center gap-1 text-xs opacity-60 group-hover:opacity-100">
          {confirm ? (
            <>
              <span className="text-slate-400">Delete?</span>
              <button type="button" className="tab text-rose-400" onClick={async () => (await onDelete()) || setConfirm(false)}>
                Yes
              </button>
              <button type="button" className="tab" onClick={() => setConfirm(false)}>
                No
              </button>
            </>
          ) : (
            <>
              <button type="button" className="tab px-1.5" onClick={onUp} title="Move up">↑</button>
              <button type="button" className="tab px-1.5" onClick={onDown} title="Move down">↓</button>
              <button type="button" className="tab" onClick={() => setEditing(true)}>Rename</button>
              <button type="button" className="tab text-rose-400" onClick={() => setConfirm(true)}>Delete</button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

function AddForm({ placeholder, onAdd }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim() && (await onAdd(name.trim()))) setName("");
      }}
    >
      <input className="input py-1 text-sm" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn-ghost px-3 py-1 text-sm" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}

export default function StructurePage() {
  const { user } = useRequireAuth({ editor: true });
  const [tree, setTree] = useState(null);
  const [error, setError] = useState("");

  const load = () => api("/manage/tree").then(setTree).catch((e) => setError(e.message));
  useEffect(() => {
    if (user) load();
  }, [user]);

  /** Calls the API, reloads the tree, and reports success. */
  const call = async (path, method, body) => {
    setError("");
    try {
      await api(path, { method, body });
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };
  const move = (type, list, i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const ids = list.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    call("/manage/reorder", "PUT", { type, ids });
  };

  if (!tree) return <Spinner />;
  const admin = tree.canManageSubjects;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <ManageNav inReview={tree.inReview} />
      <p className="mb-4 text-sm text-slate-400">
        Organise questions as <b>Subject → Chapter → Topic</b>. A chapter or topic can only be deleted once it's empty.
        {!admin && " Only admins can add or rename subjects."}
      </p>
      <div className="mb-4">
        <ErrorBox error={error} />
      </div>

      <div className="space-y-5">
        {tree.subjects.map((s, si) => (
          <div key={s.id} className="card p-5">
            <div className="text-lg font-semibold text-white">
              <Row
                label={s.name}
                prefix={s.icon}
                canEdit={admin}
                onRename={(name) => call(`/manage/subjects/${s.id}`, "PUT", { name })}
                onDelete={() => call(`/manage/subjects/${s.id}`, "DELETE")}
                onUp={() => move("subject", tree.subjects, si, -1)}
                onDown={() => move("subject", tree.subjects, si, 1)}
              />
            </div>
            <div className="mt-3 space-y-3 pl-4">
              {s.chapters.map((c, ci) => (
                <div key={c.id} className="rounded-lg border border-ink-700 p-3">
                  <div className="font-medium text-slate-200">
                    <Row
                      label={c.name}
                      prefix="📂"
                      onRename={(name) => call(`/manage/chapters/${c.id}`, "PUT", { name })}
                      onDelete={() => call(`/manage/chapters/${c.id}`, "DELETE")}
                      onUp={() => move("chapter", s.chapters, ci, -1)}
                      onDown={() => move("chapter", s.chapters, ci, 1)}
                    />
                  </div>
                  <div className="mt-2 space-y-1 pl-6 text-sm text-slate-300">
                    {c.topics.map((t, ti) => (
                      <Row
                        key={t.id}
                        label={t.name}
                        prefix="•"
                        count={t.count}
                        onRename={(name) => call(`/manage/topics/${t.id}`, "PUT", { name })}
                        onDelete={() => call(`/manage/topics/${t.id}`, "DELETE")}
                        onUp={() => move("topic", c.topics, ti, -1)}
                        onDown={() => move("topic", c.topics, ti, 1)}
                      />
                    ))}
                    <div className="pt-1">
                      <AddForm placeholder="New topic name" onAdd={(name) => call("/manage/topics", "POST", { name, chapterId: c.id })} />
                    </div>
                  </div>
                </div>
              ))}
              <AddForm placeholder="New chapter name" onAdd={(name) => call("/manage/chapters", "POST", { name, subjectId: s.id })} />
            </div>
          </div>
        ))}
        {tree.subjects.length === 0 && <div className="card p-6 text-slate-400">No subjects assigned to you yet.</div>}
        {admin && (
          <div className="card p-5">
            <h2 className="mb-2 font-semibold text-white">Add a subject</h2>
            <AddForm placeholder="e.g. Python, SQL, Machine Learning" onAdd={(name) => call("/manage/subjects", "POST", { name })} />
          </div>
        )}
      </div>
    </div>
  );
}
