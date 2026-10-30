"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ProblemStatement, { Block, Markdown } from "@/components/ProblemStatement";
import WatchReels from "@/components/reels/WatchReels";
import { Difficulty, EmptyState, ErrorBox, LANGUAGE_LABEL, Spinner, Verdict, VerdictBadge, timeAgo } from "@/components/ui";
import Icon from "@/components/Icons";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: () => <Spinner label="Loading editor…" /> });

const MONACO_LANG = { python: "python", javascript: "javascript", cpp: "cpp", java: "java", go: "go" };
// Used when a problem has no starter code for a language (older problems predate Go).
const FALLBACK_STARTER = {
  go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\t_ = in\n\t// Write your code here\n\tfmt.Println()\n}\n',
};

function draftKey(slug, lang) {
  return `qc_draft:${slug}:${lang}`;
}

function loadDraft(slug, lang, fallback) {
  try {
    return localStorage.getItem(draftKey(slug, lang)) ?? fallback;
  } catch {
    return fallback;
  }
}

function ResultPanel({ result, mode }) {
  if (!result)
    return (
      <div className="flex h-full flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08]">
          <Icon name="terminal" className="h-5 w-5 text-slate-400" />
        </div>
        <p className="mt-3">Run your code to see results here.</p>
        <p className="mt-1 text-xs text-slate-600">
          <span className="kbd">Run</span> tests the samples · <span className="kbd">Submit</span> runs every hidden test
        </p>
      </div>
    );
  if (result.error && !result.results?.length && !result.compileOutput) return <ErrorBox error={result.error} />;

  const sub = result.submission;
  const verdict = sub ? sub.verdict : result.verdict;
  const tests = sub ? sub.results : result.results;
  const compileOutput = sub ? sub.compileOutput : result.compileOutput;
  const ok = verdict === "Accepted";

  return (
    <div className="space-y-4">
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3.5 ${
          ok ? "border-emerald-500/30 bg-emerald-500/[0.07]" : verdict === "Ran" ? "border-sky-500/30 bg-sky-500/[0.06]" : "border-rose-500/30 bg-rose-500/[0.06]"
        }`}
      >
        <VerdictBadge value={verdict} />
        {sub && (
          <span className="flex flex-wrap items-center gap-x-3 text-sm text-slate-300">
            <span>
              <span className="font-semibold text-white">{sub.passed}</span>/{sub.total} tests
            </span>
            {sub.runtimeMs != null && (
              <span className="flex items-center gap-1 text-slate-400">
                <Icon name="clock" className="h-3.5 w-3.5" /> {sub.runtimeMs} ms
              </span>
            )}
            {sub.memoryKb != null && (
              <span className="flex items-center gap-1 text-slate-400">
                <Icon name="cpu" className="h-3.5 w-3.5" /> {(sub.memoryKb / 1024).toFixed(1)} MB
              </span>
            )}
          </span>
        )}
        {result.pointsEarned > 0 && (
          <span className="pill ml-auto animate-scale-in bg-gradient-to-r from-brand-500 to-accent-500 text-white shadow-glow-sm">
            <Icon name="sparkles" className="h-3.5 w-3.5" /> +{result.pointsEarned} points
          </span>
        )}
      </div>
      {compileOutput && <Block label={verdict === "Compilation Error" ? "Compiler output" : "Error"}>{compileOutput}</Block>}
      {tests?.length > 0 && mode === "submit" && (
        <div className="flex flex-wrap gap-1.5">
          {tests.map((t, i) => (
            <span
              key={i}
              title={`${t.verdict} · ${t.timeMs} ms`}
              className={`pill ${t.verdict === "Accepted" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25" : "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/25"}`}
            >
              <Icon name={t.verdict === "Accepted" ? "check" : "x"} className="h-3 w-3" strokeWidth={2.5} />
              {i + 1}
              {!t.isSample && <Icon name="lock" className="h-3 w-3 opacity-60" />}
            </span>
          ))}
        </div>
      )}
      {tests
        ?.filter((t) => t.input !== undefined)
        .map((t, i) => (
          <div key={i} className="surface space-y-2.5 p-3.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-200">{t.expected === null ? "Custom input" : `Sample ${i + 1}`}</span>
              <span className="flex items-center gap-2">
                <Verdict value={t.verdict} className="text-xs" />
                <span className="text-xs text-slate-500">· {t.timeMs} ms</span>
              </span>
            </div>
            <Block label="Input">{t.input}</Block>
            <div className="grid gap-2 sm:grid-cols-2">
              <Block label="Your output">{t.stdout}</Block>
              {t.expected !== null && <Block label="Expected">{t.expected}</Block>}
            </div>
            {t.stderr && <Block label="Error output">{t.stderr}</Block>}
          </div>
        ))}
    </div>
  );
}

function MySubmissions({ slug }) {
  const [subs, setSubs] = useState(null);
  useEffect(() => {
    api(`/submissions?problem=${slug}`).then((d) => setSubs(d.submissions)).catch(() => setSubs([]));
  }, [slug]);
  if (!subs) return <Spinner />;
  if (!subs.length) return <EmptyState icon="activity" title="No submissions yet" text="Submit a solution and it will show up here." />;
  return (
    <table className="table">
      <tbody>
        {subs.map((s) => (
          <tr key={s.id}>
            <td className="!px-0">
              <Link href={`/submissions/${s.id}`} className="hover:underline">
                <Verdict value={s.verdict} />
              </Link>
            </td>
            <td className="text-slate-400">{LANGUAGE_LABEL[s.language]}</td>
            <td className="font-mono text-xs text-slate-400">{s.runtimeMs != null ? `${s.runtimeMs} ms` : "—"}</td>
            <td className="!px-0 text-right text-xs text-slate-500">{timeAgo(s.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SolutionPanel({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/problems/${slug}/solution`).then(setData).catch((e) => setError(e.message));
  }, [slug]);
  if (error) return <EmptyState icon="lock" title="Solution locked" text={error} />;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-5">
      {data.editorial ? <Markdown>{data.editorial}</Markdown> : <p className="text-sm text-slate-500">No written explanation yet.</p>}
      {data.code && (
        <div>
          <div className="label">Reference solution · {LANGUAGE_LABEL[data.language]}</div>
          <pre className="code-block">{data.code}</pre>
        </div>
      )}
    </div>
  );
}

function LoginPrompt({ what }) {
  return (
    <EmptyState
      icon="lock"
      title={`Log in to see ${what}`}
      action={
        <Link href="/login" className="btn-primary btn-sm">
          Log in
        </Link>
      }
    />
  );
}

const TABS = [
  ["description", "Description", "book-open"],
  ["solution", "Solution", "sparkles"],
  ["submissions", "Submissions", "activity"],
];

export default function ProblemPage({ params }) {
  const { slug } = params;
  const { user } = useAuth();
  const [problem, setProblem] = useState(null);
  const [error, setError] = useState("");
  const [leftTab, setLeftTab] = useState("description");
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState("run");
  const [subsKey, setSubsKey] = useState(0);

  useEffect(() => {
    api(`/problems/${slug}`)
      .then((d) => {
        setProblem(d.problem);
        setCustomInput(d.problem.samples[0]?.input || "");
        try {
          setLanguage(localStorage.getItem("qc_lang") || "python");
        } catch {}
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  const starter = useCallback((lang) => problem?.starterCode?.[lang] || FALLBACK_STARTER[lang] || "", [problem]);

  useEffect(() => {
    if (problem) setCode(loadDraft(slug, language, starter(language)));
  }, [problem, language, slug, starter]);

  const changeCode = (value) => {
    setCode(value ?? "");
    try {
      localStorage.setItem(draftKey(slug, language), value ?? "");
    } catch {}
  };

  const changeLanguage = (lang) => {
    setLanguage(lang);
    try {
      localStorage.setItem("qc_lang", lang);
    } catch {}
  };

  const resetCode = () => changeCode(starter(language));

  const execute = useCallback(
    async (kind) => {
      if (!user || busy) return;
      setBusy(kind);
      setMode(kind);
      setResult(null);
      try {
        const body = { language, code, ...(kind === "run" && useCustom && { customInput }) };
        const d = await api(`/problems/${slug}/${kind}`, { method: "POST", body });
        setResult(d);
        if (kind === "submit") setSubsKey((k) => k + 1);
      } catch (e) {
        setResult({ error: e.message });
      } finally {
        setBusy(null);
      }
    },
    [user, busy, language, code, useCustom, customInput, slug],
  );

  // Ctrl/Cmd+Enter runs, Ctrl/Cmd+Shift+Enter submits.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        execute(e.shiftKey ? "submit" : "run");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [execute]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorBox error={error} />
        <Link href="/problems" className="btn-ghost mt-4">
          <Icon name="arrow-left" className="h-4 w-4" /> Back to problems
        </Link>
      </div>
    );
  if (!problem) return <Spinner />;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-4rem)]">
      {/* Workspace header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-ink-950/60 px-4 py-2 text-sm backdrop-blur">
        <Link href="/problems" className="btn-ghost btn-sm">
          <Icon name="arrow-left" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Problems</span>
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-white">{problem.title}</span>
          <Difficulty value={problem.difficulty} />
          <span className="hidden text-xs text-slate-500 sm:inline">· {problem.points} pts</span>
        </div>
        <div className="ml-auto hidden items-center gap-2 text-xs text-slate-500 md:flex">
          <span className="kbd">Ctrl</span>+<span className="kbd">↵</span> run
          <span className="mx-1 text-slate-700">|</span>
          <span className="kbd">Ctrl</span>+<span className="kbd">⇧</span>+<span className="kbd">↵</span> submit
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-2">
        {/* Left: problem statement */}
        <section className="card flex min-h-[60vh] flex-col lg:min-h-0">
          <div className="flex gap-1 border-b border-white/[0.06] p-2">
            {TABS.map(([t, label, icon]) => (
              <button key={t} onClick={() => setLeftTab(t)} className={`tab ${leftTab === t ? "tab-active" : ""}`}>
                <Icon name={icon} className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {leftTab === "description" ? (
              <>
                <WatchReels topicIds={[problem.topicId]} className="mb-4" />
                <ProblemStatement problem={problem} />
              </>
            ) : leftTab === "solution" ? (
              user ? (
                <SolutionPanel slug={slug} />
              ) : (
                <LoginPrompt what="the solution" />
              )
            ) : user ? (
              <MySubmissions key={subsKey} slug={slug} />
            ) : (
              <LoginPrompt what="your submissions" />
            )}
          </div>
        </section>

        {/* Right: editor and results */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="card flex min-h-[460px] flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.06] p-2">
              <div className="relative">
                <Icon name="code" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <select className="input w-auto py-1.5 pl-8 text-xs font-medium" value={language} onChange={(e) => changeLanguage(e.target.value)}>
                  {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <button className="tab text-xs" onClick={resetCode} title="Restore the starter code">
                <Icon name="refresh" className="h-3.5 w-3.5" /> Reset
              </button>
              {language === "java" && <span className="text-xs text-slate-500">Class must be named Main</span>}
              <span className="ml-auto hidden items-center gap-1 text-[11px] text-slate-500 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Draft auto-saved
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <Editor
                theme="vs-dark"
                language={MONACO_LANG[language]}
                value={code}
                onChange={changeCode}
                options={{
                  fontSize: 14,
                  fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontLigatures: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  padding: { top: 12 },
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  renderLineHighlight: "gutter",
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] p-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
                Custom input
              </label>
              <div className="ml-auto flex gap-2">
                {user ? (
                  <>
                    <button className="btn-ghost" disabled={!!busy} onClick={() => execute("run")}>
                      <Icon name="play" className="h-3.5 w-3.5" />
                      {busy === "run" ? "Running…" : "Run"}
                    </button>
                    <button className="btn-success" disabled={!!busy} onClick={() => execute("submit")}>
                      <Icon name="send" className="h-3.5 w-3.5" />
                      {busy === "submit" ? "Judging…" : "Submit"}
                    </button>
                  </>
                ) : (
                  <Link href="/login" className="btn-primary">
                    <Icon name="lock" className="h-4 w-4" /> Log in to run code
                  </Link>
                )}
              </div>
            </div>
            {useCustom && (
              <textarea
                className="input m-2 w-auto font-mono text-xs"
                rows={4}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Your input here"
              />
            )}
          </div>
          <div className="card max-h-[45vh] min-h-[160px] overflow-y-auto p-4">
            {busy ? <Spinner label={busy === "submit" ? "Judging all tests…" : "Running…"} className="py-8" /> : <ResultPanel result={result} mode={mode} />}
          </div>
        </section>
      </div>
    </div>
  );
}
