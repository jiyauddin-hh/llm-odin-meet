"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import { Avatar, ErrorBox, Spinner, formatDate, timeAgo } from "@/components/ui";

const key = (r) => `${r.kind}-${r.id}`;

export default function AccessRequestsPage() {
  const { user } = useRequireAuth({ admin: true });
  const [status, setStatus] = useState("PENDING");
  const [requests, setRequests] = useState(null);
  const [expiry, setExpiry] = useState({});
  const [error, setError] = useState("");

  const load = () => {
    setRequests(null);
    api(`/admin/requests?status=${status}`).then((d) => setRequests(d.requests)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (user?.role === "ADMIN") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status]);

  const decide = async (r, action) => {
    setError("");
    try {
      await api(`/admin/requests/${r.kind}/${r.id}`, { method: "POST", body: { action, expiresAt: expiry[key(r)] || null } });
      setRequests((rs) => rs.filter((x) => key(x) !== key(r)));
    } catch (e) {
      setError(e.message);
    }
  };

  if (user?.role !== "ADMIN") return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-white">Admin</h1>
      <AdminTabs pending={status === "PENDING" ? requests?.length : 0} />
      <div className="mb-4 flex gap-1">
        {[
          ["PENDING", "Waiting"],
          ["APPROVED", "Approved"],
          ["REJECTED", "Rejected"],
        ].map(([k, label]) => (
          <button key={k} className={`tab ${status === k ? "tab-active" : ""}`} onClick={() => setStatus(k)}>
            {label}
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      {!requests ? (
        <Spinner />
      ) : requests.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          {status === "PENDING" ? "No requests waiting. 🎉" : "Nothing here."}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Asking for</th>
                <th className="px-4 py-3">{status === "PENDING" ? "Asked" : "Decided"}</th>
                {status === "PENDING" && <th className="px-4 py-3">Access until</th>}
                {status === "PENDING" && <th className="px-4 py-3 text-right">Decision</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={key(r)}>
                  <td className="px-4 py-3">
                    <Link href={`/u/${r.user.username}`} className="flex items-center gap-2 hover:text-brand-400">
                      <Avatar user={r.user} size={28} />
                      <div>
                        <div>{r.user.username}</div>
                        <div className="text-xs text-slate-500">{r.user.email}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-white">
                    {r.course.icon} {r.course.title}
                    <div className="mt-0.5 text-xs">
                      {r.chapter ? (
                        <span className="text-sky-300">
                          Chapter {r.chapter.number}: {r.chapter.title}
                        </span>
                      ) : (
                        <span className="text-emerald-400">Whole course</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {status === "PENDING" ? timeAgo(r.createdAt) : r.decidedAt ? formatDate(r.decidedAt) : "—"}
                  </td>
                  {status === "PENDING" && (
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        className="input w-auto py-1"
                        value={expiry[key(r)] || ""}
                        onChange={(e) => setExpiry({ ...expiry, [key(r)]: e.target.value })}
                        title="Leave empty for permanent access"
                      />
                    </td>
                  )}
                  {status === "PENDING" && (
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex gap-2">
                        <button className="btn-success px-3 py-1" onClick={() => decide(r, "approve")}>
                          Approve
                        </button>
                        <button className="btn-ghost px-3 py-1" onClick={() => decide(r, "reject")}>
                          Reject
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
