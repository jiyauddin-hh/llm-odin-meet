"use client";

import Link from "next/link";
import Icon from "./Icons";

export const DIFFICULTY_STYLE = {
  EASY: "bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25",
  MEDIUM: "bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-500/25",
  HARD: "bg-rose-500/12 text-rose-300 ring-1 ring-inset ring-rose-500/25",
};
const DIFFICULTY_DOT = { EASY: "bg-emerald-400", MEDIUM: "bg-amber-400", HARD: "bg-rose-400" };

export const LANGUAGE_LABEL = { python: "Python 3", javascript: "JavaScript", cpp: "C++17", java: "Java 21", go: "Go 1.22" };

export function Difficulty({ value, className = "" }) {
  if (!value) return null;
  return (
    <span className={`pill ${DIFFICULTY_STYLE[value]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY_DOT[value]}`} />
      {value[0] + value.slice(1).toLowerCase()}
    </span>
  );
}

const VERDICT_STYLE = {
  Accepted: ["text-emerald-300", "check-circle"],
  Ran: ["text-sky-300", "play"],
  "Wrong Answer": ["text-rose-300", "x-circle"],
};

export function Verdict({ value, className = "", icon = true }) {
  const [color, name] = VERDICT_STYLE[value] || ["text-amber-300", "alert-triangle"];
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${color} ${className}`}>
      {icon && <Icon name={name} className="h-[1em] w-[1em] shrink-0" strokeWidth={2.25} />}
      {value}
    </span>
  );
}

/** Verdict as a filled badge, for banners and summaries. */
export function VerdictBadge({ value, className = "" }) {
  const ok = value === "Accepted";
  const ran = value === "Ran";
  const bad = value === "Wrong Answer";
  const style = ok
    ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
    : ran
      ? "bg-sky-500/15 text-sky-200 ring-sky-500/30"
      : bad
        ? "bg-rose-500/15 text-rose-200 ring-rose-500/30"
        : "bg-amber-500/15 text-amber-200 ring-amber-500/30";
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold ring-1 ring-inset ${style} ${className}`}>
      <Verdict value={value} className="!font-semibold !text-inherit" />
    </span>
  );
}

export function Avatar({ user, size = 40, ring = false, className = "" }) {
  const letter = (user?.name || user?.username || "?")[0].toUpperCase();
  const ringCls = ring ? "ring-2 ring-brand-500/60 ring-offset-2 ring-offset-ink-900" : "";
  if (user?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${ringCls} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 via-indigo-500 to-accent-500 font-bold text-white shadow-glow-sm ${ringCls} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </div>
  );
}

export function Spinner({ label = "Loading…", className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-16 text-sm text-slate-400 ${className}`} role="status">
      <span className="relative flex h-5 w-5">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-brand-400/30 border-t-brand-400" />
      </span>
      {label}
    </div>
  );
}

/** Grey placeholder blocks while data loads. */
export function Skeleton({ className = "", ...props }) {
  return <div className={`skeleton ${className}`} aria-hidden {...props} />;
}

export function SkeletonRows({ rows = 6, className = "" }) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 + ((i * 13) % 35)}%` }} />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ error, className = "" }) {
  if (!error) return null;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200 ${className}`} role="alert">
      <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
      <span>{error}</span>
    </div>
  );
}

export function Notice({ children, tone = "info", className = "" }) {
  const tones = {
    info: "border-sky-500/30 bg-sky-500/10 text-sky-100",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  };
  const icons = { info: "info", success: "check-circle", warning: "alert-triangle" };
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${tones[tone]} ${className}`}>
      <Icon name={icons[tone]} className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

export function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-center gap-3 text-sm">
      <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <Icon name="chevron-left" className="h-3.5 w-3.5" /> Previous
      </button>
      <span className="text-slate-400">
        Page <span className="font-semibold text-white">{page}</span> of {pages}
      </span>
      <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next <Icon name="chevron-right" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ProgressBar({ percent, className = "", size = "md" }) {
  const h = size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2";
  return (
    <div className={`${h} overflow-hidden rounded-full bg-white/[0.06] ${className}`} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-500 via-indigo-400 to-accent-400 transition-all duration-700 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/** Circular progress, e.g. for course cards. */
export function ProgressRing({ percent, size = 56, stroke = 5, className = "", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#qc-ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c - (p / 100) * c}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="qc-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">{children ?? `${Math.round(p)}%`}</div>
    </div>
  );
}

export const LEVEL_STYLE = {
  Beginner: "bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25",
  Intermediate: "bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-500/25",
  Advanced: "bg-rose-500/12 text-rose-300 ring-1 ring-inset ring-rose-500/25",
};

export function formatDate(d) {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Standard page header: eyebrow / title / subtitle on the left, actions on the right. */
export function PageHeader({ eyebrow, title, subtitle, actions, className = "" }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Breadcrumbs({ items, className = "" }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex flex-wrap items-center gap-1.5 text-sm text-slate-400 ${className}`}>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <Icon name="chevron-right" className="h-3.5 w-3.5 text-slate-600" />}
          {it.href ? (
            <Link href={it.href} className="transition hover:text-white">
              {it.label}
            </Link>
          ) : (
            <span className="text-slate-200">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** A metric tile. `tone` tints the icon tile. */
export function StatCard({ label, value, icon, hint, tone = "brand", className = "" }) {
  const tones = {
    brand: "bg-brand-500/15 text-brand-300",
    cyan: "bg-accent-500/15 text-accent-300",
    emerald: "bg-emerald-500/15 text-emerald-300",
    amber: "bg-amber-500/15 text-amber-300",
    rose: "bg-rose-500/15 text-rose-300",
    slate: "bg-white/[0.06] text-slate-300",
  };
  return (
    <div className={`card-hover flex items-center gap-4 p-4 ${className}`}>
      {icon && (
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon name={icon} className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-2xl font-bold tabular-nums tracking-tight text-white">{value}</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = "compass", title, text, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08]">
        <Icon name={icon} className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-400">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Small circular status icon used in problem lists. */
export function StatusDot({ status, className = "h-4 w-4" }) {
  if (status === "solved")
    return (
      <span title="Solved" className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 p-0.5">
        <Icon name="check" className={className} strokeWidth={2.5} />
      </span>
    );
  if (status === "attempted")
    return (
      <span title="Attempted" className="inline-flex items-center justify-center rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30 p-0.5">
        <Icon name="dot" className={className} strokeWidth={2.5} />
      </span>
    );
  return <span title="Not started" className={`inline-block rounded-full border-2 border-ink-600 p-0.5 ${className}`} />;
}

export function SectionCard({ title, icon, actions, children, className = "", bodyClass = "p-5" }) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            {icon && <Icon name={icon} className="h-4 w-4 text-brand-300" />}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export { Icon };
