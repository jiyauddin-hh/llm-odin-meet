"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { Breadcrumbs, Difficulty, ErrorBox, LANGUAGE_LABEL, SectionCard, Spinner, StatCard, VerdictBadge } from "@/components/ui";
import Icon from "@/components/Icons";

export default function SubmissionDetail({ params }) {
  const { user } = useRequireAuth();
  const [sub, setSub] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    api(`/submissions/${params.id}`).then((d) => setSub(d.submission)).catch((e) => setError(e.message));
  }, [user, params.id]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorBox error={error} />
      </div>
    );
  if (!sub) return <Spinner />;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sub.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  const ok = sub.verdict === "Accepted";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 page-enter">
      <div>
        <Breadcrumbs items={[{ href: "/submissions", label: "Submissions" }, { label: `#${sub.id}` }]} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="page-title">
            <Link href={`/problems/${sub.problem.slug}`} className="hover:text-brand-200">
              {sub.problem.title}
            </Link>
          </h1>
          <Difficulty value={sub.problem.difficulty} />
          <Link href={`/problems/${sub.problem.slug}`} className="btn-ghost btn-sm ml-auto">
            <Icon name="code" className="h-3.5 w-3.5" /> Open problem
          </Link>
        </div>
      </div>

      <div className={`card flex flex-wrap items-center gap-4 p-5 ${ok ? "border-emerald-500/30" : ""}`}>
        <VerdictBadge value={sub.verdict} className="text-base" />
        <span className="text-sm text-slate-400">Submitted {new Date(sub.createdAt).toLocaleString()}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tests passed" value={`${sub.passed}/${sub.total}`} icon="check-circle" tone={sub.passed === sub.total ? "emerald" : "rose"} />
        <StatCard label="Runtime" value={sub.runtimeMs != null ? `${sub.runtimeMs} ms` : "—"} icon="clock" tone="cyan" />
        <StatCard label="Language" value={LANGUAGE_LABEL[sub.language]} icon="code" tone="brand" />
      </div>

      {sub.compileOutput && (
        <SectionCard title="Compiler / error output" icon="alert-triangle">
          <pre className="code-block whitespace-pre-wrap text-rose-200">{sub.compileOutput}</pre>
        </SectionCard>
      )}

      {sub.results?.length > 0 && (
        <SectionCard title="Test cases" icon="list" actions={<span className="text-xs text-slate-500">Locked tests are hidden from the statement</span>}>
          <div className="flex flex-wrap gap-2">
            {sub.results.map((t, i) => (
              <span
                key={i}
                className={`pill ${t.verdict === "Accepted" ? "bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25" : "bg-rose-500/12 text-rose-300 ring-1 ring-inset ring-rose-500/25"}`}
              >
                <Icon name={t.verdict === "Accepted" ? "check" : "x"} className="h-3 w-3" strokeWidth={2.5} />#{i + 1} {t.verdict} · {t.timeMs} ms
                {!t.isSample && <Icon name="lock" className="h-3 w-3 opacity-60" />}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Code"
        icon="terminal"
        bodyClass=""
        actions={
          <button onClick={copy} className="btn-ghost btn-sm">
            <Icon name={copied ? "check" : "share"} className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
          </button>
        }
      >
        <pre className="overflow-x-auto bg-ink-950 p-5 font-mono text-[13px] leading-relaxed text-slate-200">{sub.code}</pre>
      </SectionCard>
    </div>
  );
}
