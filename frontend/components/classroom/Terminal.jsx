"use client";

import { useEffect, useRef, useState } from "react";
import { Verdict } from "@/components/ui";
import Icon from "@/components/Icons";

const COMMAND = { python: "python3 main.py", javascript: "node main.js", cpp: "g++ -O2 main.cpp && ./a.out", java: "javac Main.java && java Main", go: "go build && ./main" };

function Out({ children, tone = "text-slate-200" }) {
  if (!children) return null;
  return <pre className={`whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed ${tone}`}>{children}</pre>;
}

/** Shared terminal: program input plus the history of runs everyone sees, newest at the bottom. */
export default function Terminal({ terminal, running, stdin, canEdit, isTeacher, language, onStdin, onClear }) {
  const [local, setLocal] = useState(stdin);
  const [tab, setTab] = useState("output"); // output | input
  const timer = useRef(null);
  const scroller = useRef(null);

  // Mirror the shared value unless I'm the one editing it.
  useEffect(() => {
    if (!canEdit) setLocal(stdin);
  }, [stdin, canEdit]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (running) setTab("output");
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [terminal.length, running]);

  const change = (v) => {
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onStdin(v), 350);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#07080d]">
      <div className="flex items-center gap-1 border-b border-white/[0.06] bg-ink-950/80 px-2">
        {[
          ["output", "terminal", "Console"],
          ["input", "list", "Input"],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition ${tab === key ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
          >
            <Icon name={icon} className="h-3.5 w-3.5" /> {label}
            {key === "input" && stdin && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
            {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-400" />}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 py-1">
          {running && (
            <span className="flex items-center gap-1.5 text-xs text-sky-300">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-300" /> Running
            </span>
          )}
          {isTeacher && terminal.length > 0 && (
            <button className="btn-ghost btn-sm !py-1 text-xs" onClick={onClear} title="Clear the console for everyone">
              <Icon name="trash" className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {tab === "input" ? (
        <div className="flex min-h-0 flex-1 flex-col p-2">
          <textarea
            className="min-h-0 flex-1 resize-none rounded-lg bg-transparent p-2 font-mono text-[13px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
            placeholder={canEdit ? "Type the program input (stdin) here. It is sent to the program when you run." : "No program input. Only the person with the pen can edit it."}
            value={local}
            readOnly={!canEdit}
            spellCheck={false}
            onChange={(e) => change(e.target.value)}
          />
        </div>
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {terminal.length === 0 && !running && (
            <div className="flex h-full flex-col items-center justify-center py-6 text-center">
              <Icon name="terminal" className="h-6 w-6 text-slate-700" />
              <p className="mt-2 text-sm text-slate-500">Output from every run appears here for the whole class.</p>
              {canEdit && (
                <p className="mt-1 text-xs text-slate-600">
                  Press <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to run.
                </p>
              )}
            </div>
          )}
          {terminal.map((e) => (
            <div key={e.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 font-mono text-xs">
                <span className="text-emerald-400">❯</span>
                <span className="text-slate-300">{COMMAND[language] || "run"}</span>
                <span className="text-slate-600">
                  · {e.by?.name || e.by?.username}
                  {e.timeMs != null && ` · ${e.timeMs} ms`} · {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <Verdict value={e.verdict} className="ml-auto text-xs" />
              </div>
              <div className="border-l-2 border-white/[0.06] pl-3">
                {e.error && <Out tone="text-rose-300">{e.error}</Out>}
                {e.compileOutput && <Out tone="text-rose-300">{e.compileOutput}</Out>}
                {e.stdout ? <Out>{e.stdout}</Out> : !e.stderr && !e.compileOutput && !e.error && <p className="font-mono text-xs italic text-slate-600">(no output)</p>}
                {e.stderr && <Out tone="text-amber-300">{e.stderr}</Out>}
              </div>
            </div>
          ))}
          {running && (
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-emerald-400">❯</span>
              <span className="text-slate-300">{COMMAND[language] || "run"}</span>
              <span className="text-slate-600">· {running.by?.name || running.by?.username}</span>
              <span className="ml-1 inline-block h-3.5 w-2 animate-pulse bg-slate-300" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
