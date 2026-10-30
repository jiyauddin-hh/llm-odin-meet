"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { ErrorBox, Spinner } from "@/components/ui";

const ACTION_STYLE = {
  published: "text-emerald-400",
  rejected: "text-rose-400",
  "sent for review": "text-amber-300",
  hidden: "text-slate-400",
};

export default function HistoryPage({ params }) {
  const { user } = useRequireAuth({ editor: true });
  const router = useRouter();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api(`/manage/problems/${params.id}/history`).then(setData).catch((e) => setError(e.message));
  }, [user, params.id]);

  const restore = async (rev) => {
    try {
      await api(`/manage/problems/${params.id}/restore/${rev.id}`, { method: "POST" });
      router.push(`/manage/${params.id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!data) return error ? <div className="mx-auto max-w-3xl px-4 py-10"><ErrorBox error={error} /></div> : <Spinner />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href={`/manage/${params.id}`} className="text-sm text-slate-400 hover:text-white">
        ← Back to editing
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-white">History: {data.title}</h1>
      <p className="text-sm text-slate-400">Every save and decision is recorded. Restoring a version makes it the current draft.</p>
      <div className="mt-4">
        <ErrorBox error={error} />
      </div>
      <ol className="mt-6 space-y-2">
        {data.revisions.map((r, i) => (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`font-medium capitalize ${ACTION_STYLE[r.action] || "text-white"}`}>{r.action}</span>
              <span className="text-slate-400">by {r.user?.username || "deleted user"}</span>
              <span className="text-slate-500">{new Date(r.createdAt).toLocaleString()}</span>
              {i === 0 && <span className="pill bg-ink-700 text-slate-300">latest</span>}
              <div className="ml-auto flex gap-3">
                <button className="text-brand-400 hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? "Hide" : "View"}
                </button>
                {i > 0 &&
                  (confirm === r.id ? (
                    <span className="flex gap-2">
                      <button className="btn-primary px-2 py-1" onClick={() => restore(r)}>
                        Restore this
                      </button>
                      <button className="btn-ghost px-2 py-1" onClick={() => setConfirm(null)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button className="text-emerald-400 hover:underline" onClick={() => setConfirm(r.id)}>
                      Restore
                    </button>
                  ))}
              </div>
            </div>
            {r.comment && <p className="mt-2 text-sm text-slate-300">💬 {r.comment}</p>}
            {open === r.id && (
              <div className="mt-3 space-y-2 text-sm">
                <p>
                  <span className="text-slate-500">Title:</span> {r.snapshot.title} · <span className="text-slate-500">Difficulty:</span>{" "}
                  {r.snapshot.difficulty} · <span className="text-slate-500">Tests:</span> {r.snapshot.testCases?.length}
                </p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950 p-3 text-xs text-slate-300">
                  {r.snapshot.description}
                </pre>
              </div>
            )}
          </li>
        ))}
        {data.revisions.length === 0 && <p className="text-slate-500">No history yet.</p>}
      </ol>
    </div>
  );
}
