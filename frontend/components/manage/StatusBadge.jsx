"use client";

const WORKFLOW = {
  DRAFT: ["Draft", "bg-slate-500/20 text-slate-300"],
  IN_REVIEW: ["In review", "bg-amber-500/20 text-amber-300"],
  REJECTED: ["Changes requested", "bg-rose-500/20 text-rose-300"],
};

/** Live/hidden state plus any unpublished work on a question. */
export default function StatusBadge({ problem }) {
  const live = problem.published && problem.approvedAt;
  const [label, style] = WORKFLOW[problem.workflow] || [];
  return (
    <span className="inline-flex flex-wrap gap-1">
      {live ? (
        <span className="pill bg-emerald-500/15 text-emerald-400">Live</span>
      ) : problem.approvedAt ? (
        <span className="pill bg-ink-700 text-slate-400">Hidden</span>
      ) : null}
      {label && (
        <span className={`pill ${style}`}>
          {live && problem.workflow === "DRAFT" ? "Unpublished changes" : label}
        </span>
      )}
    </span>
  );
}
