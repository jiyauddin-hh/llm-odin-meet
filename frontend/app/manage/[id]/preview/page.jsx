"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import ProblemStatement, { Markdown } from "@/components/ProblemStatement";
import { ErrorBox, LANGUAGE_LABEL, Spinner } from "@/components/ui";

const POINTS = { EASY: 10, MEDIUM: 20, HARD: 40 };

export default function PreviewPage({ params }) {
  const { user } = useRequireAuth({ editor: true });
  const [problem, setProblem] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    Promise.all([api(`/manage/problems/${params.id}`), api("/manage/tree")])
      .then(([{ question: q }, tree]) => {
        // Rebuild the topic path the same way the practice page receives it.
        let topic = null;
        for (const s of tree.subjects)
          for (const c of s.chapters)
            for (const t of c.topics)
              if (t.id === q.topicId) topic = { name: t.name, chapter: { name: c.name, subject: { name: s.name, icon: s.icon } } };
        setProblem({
          ...q,
          topic,
          points: POINTS[q.difficulty],
          samples: q.testCases.filter((t) => t.isSample).map(({ input, expected, explanation }) => ({ input, expected, explanation })),
        });
      })
      .catch((e) => setError(e.message));
  }, [user, params.id]);

  if (error) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorBox error={error} /></div>;
  if (!problem) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-200">
        <span>👁 Preview: this is what learners will see (latest saved draft).</span>
        <Link href={`/manage/${params.id}`} className="font-medium hover:underline">
          ← Back to editing
        </Link>
      </div>
      <div className="card p-6">
        <ProblemStatement problem={problem} />
      </div>
      <h2 className="mt-8 text-lg font-semibold text-white">After solving, learners also see:</h2>
      <div className="card mt-3 space-y-4 p-6">
        {problem.editorial ? <Markdown>{problem.editorial}</Markdown> : <p className="text-sm text-slate-500">No explanation written.</p>}
        {problem.solutionCode && (
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Reference solution · {LANGUAGE_LABEL[problem.solutionLanguage]}</div>
            <pre className="overflow-x-auto rounded-lg bg-ink-950 p-4 font-mono text-xs text-slate-200">{problem.solutionCode}</pre>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        {problem.testCases.filter((t) => !t.isSample).length} hidden test(s) are not shown to learners.
      </p>
    </div>
  );
}
