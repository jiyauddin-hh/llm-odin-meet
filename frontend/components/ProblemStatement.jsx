"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Difficulty } from "./ui";
import Icon from "./Icons";
import Diagram from "./diagrams";
import Mermaid from "./diagrams/Mermaid";

const PROSE =
  "prose prose-invert max-w-none prose-code:before:content-none prose-code:after:content-none prose-th:text-left prose-td:align-top [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:border-0 [&_pre_code]:text-slate-200";

const text = (node) => (node.type === "text" ? node.value : (node.children || []).map(text).join(""));

// Wide tables scroll sideways instead of stretching the page. Code blocks
// tagged `mermaid` become flowcharts, and `diagram` an interactive widget.
const COMPONENTS = {
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
  pre: ({ node, ...props }) => {
    const code = node?.children?.[0];
    const lang = code?.tagName === "code" && code.properties?.className?.find((c) => String(c).startsWith("language-"))?.slice(9);
    if (lang === "mermaid") return <Mermaid code={text(code)} />;
    if (lang === "diagram") return <Diagram code={text(code)} />;
    return <pre {...props} />;
  },
};

export function Block({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</div>
      <pre className="code-block max-h-48 whitespace-pre-wrap p-3">{children === "" ? <span className="text-slate-600">(empty)</span> : children}</pre>
    </div>
  );
}

/** Markdown with tables (GitHub style). `size="base"` for long-form lessons. */
export function Markdown({ children, className = "", size = "sm" }) {
  return (
    <div className={`${PROSE} ${size === "sm" ? "prose-sm" : ""} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

function Hints({ hints }) {
  const [shown, setShown] = useState(0);
  if (!hints?.length) return null;
  return (
    <div className="mt-6 space-y-2">
      {hints.slice(0, shown).map((h, i) => (
        <div key={i} className="flex animate-fade-up gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm text-amber-50">
          <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <span className="font-semibold text-amber-300">Hint {i + 1}: </span>
            {h}
          </div>
        </div>
      ))}
      {shown < hints.length && (
        <button className="btn-ghost btn-sm text-amber-200" onClick={() => setShown(shown + 1)}>
          <Icon name="help-circle" className="h-3.5 w-3.5" /> Show hint {shown + 1} of {hints.length}
        </button>
      )}
    </div>
  );
}

/**
 * The learner-facing statement of a problem. Used on the practice page and in
 * the Question Manager preview, so editors see exactly what learners will see.
 */
export default function ProblemStatement({ problem }) {
  const path = problem.topic ? [problem.topic.chapter.subject.name, problem.topic.chapter.name, problem.topic.name] : null;
  return (
    <>
      {path && (
        <p className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <Icon name="chevron-right" className="h-3 w-3 text-slate-600" />}
              {p}
            </span>
          ))}
        </p>
      )}
      <h1 className="text-xl font-bold tracking-tight text-white">{problem.title}</h1>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Difficulty value={problem.difficulty} />
        <span className="pill bg-brand-500/12 text-brand-300 ring-1 ring-inset ring-brand-500/25">
          <Icon name="star" className="h-3 w-3" /> {problem.points} pts
        </span>
        {problem.tags.map((t) => (
          <span key={t} className="pill bg-white/[0.05] text-slate-300">
            {t}
          </span>
        ))}
        {problem.companies?.map((c) => (
          <span key={c} className="pill bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/25">
            <Icon name="building" className="h-3 w-3" /> {c}
          </span>
        ))}
      </div>
      <Markdown className="mt-5">{problem.description}</Markdown>
      {[
        ["Input format", problem.inputFormat],
        ["Output format", problem.outputFormat],
        ["Constraints", problem.constraints],
      ].map(
        ([label, body]) =>
          body && (
            <div key={label}>
              <h3 className="mt-6 text-sm font-semibold text-white">{label}</h3>
              <Markdown className="mt-1">{body}</Markdown>
            </div>
          ),
      )}
      <div className="mt-6 space-y-4">
        {problem.samples.map((s, i) => (
          <div key={i} className="surface space-y-2.5 p-3.5">
            <h3 className="text-sm font-semibold text-white">Example {i + 1}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <Block label="Input">{s.input}</Block>
              <Block label="Output">{s.expected}</Block>
            </div>
            {s.explanation && (
              <p className="text-sm text-slate-400">
                <span className="font-medium text-slate-300">Explanation: </span>
                {s.explanation}
              </p>
            )}
          </div>
        ))}
      </div>
      <Hints hints={problem.hints} />
      <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
        <Icon name="clock" className="h-3.5 w-3.5" /> Time limit: {problem.timeLimitMs / 1000}s per test
      </p>
    </>
  );
}
