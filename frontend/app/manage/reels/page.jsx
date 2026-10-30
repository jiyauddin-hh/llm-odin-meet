"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import ManageNav from "@/components/manage/ManageNav";
import { REEL_STATUS } from "@/components/reels/status";
import { ErrorBox, Spinner, timeAgo } from "@/components/ui";

export default function ReelStudioPage() {
  const { user } = useRequireAuth({ editor: true });
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [reels, setReels] = useState(null);
  const [error, setError] = useState("");
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    if (user) api("/manage/reels/settings").then((d) => setPolicy(d.reelDownloads)).catch(() => {});
  }, [user]);

  const changePolicy = async (value) => {
    try {
      setPolicy((await api("/manage/reels/settings", { method: "PUT", body: { reelDownloads: value } })).reelDownloads);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      api(`/manage/reels?${new URLSearchParams({ ...(status && { status }), ...(q && { q }) })}`)
        .then((d) => setReels(d.reels))
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [user, status, q]);

  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ManageNav />
      {user.role === "ADMIN" && policy && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-3 text-sm">
          <span className="text-slate-300">⬇ Who can download reels as video?</span>
          {[["users", "Logged-in users"], ["everyone", "Everyone"], ["nobody", "Nobody"]].map(([k, label]) => (
            <button key={k} className={`tab ${policy === k ? "tab-active" : ""}`} onClick={() => changePolicy(k)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Search reels…" value={q} onChange={(e) => setQ(e.target.value)} />
        {[["", "All"], ...Object.entries(REEL_STATUS).map(([k, [label]]) => [k, label])].map(([k, label]) => (
          <button key={k} className={`tab ${status === k ? "tab-active" : ""}`} onClick={() => setStatus(k)}>
            {label}
          </button>
        ))}
        <Link href="/manage/reels/new" className="btn-primary ml-auto">
          + New reel
        </Link>
      </div>
      <ErrorBox error={error} />
      {!reels ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="px-4 py-3">Reel</th>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Views · ❤️ · 🔖 · ⬇</th>
                <th className="px-4 py-3 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {reels.map((r) => {
                const [label, style] = REEL_STATUS[r.status];
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <Link href={`/manage/reels/${r.id}`} className="font-medium text-white hover:text-brand-400">
                        {r.title}
                      </Link>
                      {r.status === "REJECTED" && r.reviewComment && <div className="max-w-xs truncate text-xs text-rose-300">↳ {r.reviewComment}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{r.topic ? `${r.topic.chapter.subject.name} › ${r.topic.name}` : "—"}</td>
                    <td className="px-4 py-3 text-slate-400">{r.kind === "VIDEO" ? "🎬 Video" : "✨ Animation"}</td>
                    <td className="px-4 py-3">
                      <span className={`pill ${style}`}>{label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {r.views} · {r._count.likes} · {r._count.saves} · {r.downloads}
                      {r.kind === "ANIMATION" && r.status === "PUBLISHED" && r.renderStatus !== "READY" && (
                        <span className="ml-2 text-xs text-amber-300">{r.renderStatus === "FAILED" ? "video failed" : "making video…"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{timeAgo(r.updatedAt)}</td>
                  </tr>
                );
              })}
              {reels.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No reels here. <Link href="/manage/reels/new" className="text-brand-400">Make one →</Link>
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
