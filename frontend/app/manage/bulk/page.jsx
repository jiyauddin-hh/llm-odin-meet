"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import ManageNav from "@/components/manage/ManageNav";
import { ErrorBox, Spinner } from "@/components/ui";

export default function BulkUploadPage() {
  const { user } = useRequireAuth({ editor: true });
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTemplate = async () => {
    const res = await fetch("/question-template.json");
    setText(await res.text());
  };

  const readFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result));
    reader.readAsText(file);
  };

  const upload = async () => {
    setError("");
    setResult(null);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return setError(`That isn't valid JSON: ${e.message}`);
    }
    const questions = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(questions)) return setError('Expected a list of questions, or { "questions": [...] }');
    setBusy(true);
    try {
      setResult(await api("/manage/bulk", { method: "POST", body: { questions } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <ManageNav />
      <div className="card space-y-4 p-5">
        <div className="text-sm text-slate-300">
          <p>Add many questions at once from a JSON file. Each one is saved as a <b>draft</b>. Then open it, test the solution and send it for review.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
            <li>
              <code>subject</code> must already exist. Missing <code>chapter</code> and <code>topic</code> names are created for you.
            </li>
            <li>
              <code>difficulty</code> is <code>EASY</code>, <code>MEDIUM</code> or <code>HARD</code>. Each question needs at least one test case.
            </li>
            <li>Up to 200 questions per upload.</li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={loadTemplate}>
            Load example template
          </button>
          <label className="btn-ghost cursor-pointer">
            Choose .json file
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
        </div>
        <textarea
          className="input font-mono text-xs"
          rows={18}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{ "questions": [ ... ] }'
        />
        <ErrorBox error={error} />
        <button className="btn-primary" disabled={busy || !text.trim()} onClick={upload}>
          {busy ? "Uploading…" : "Upload questions"}
        </button>
      </div>

      {result && (
        <div className="card mt-6 p-5">
          <h2 className="font-semibold text-white">
            {result.created} created
            {result.failed > 0 && <span className="text-rose-400"> · {result.failed} failed</span>}
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            {result.report.map((r) => (
              <li key={r.index} className="flex gap-2">
                <span className={r.ok ? "text-emerald-400" : "text-rose-400"}>{r.ok ? "✓" : "✕"}</span>
                <span className="text-slate-300">
                  #{r.index} {r.title}
                </span>
                {r.ok ? (
                  <Link href={`/manage/${r.id}`} className="text-brand-400 hover:underline">
                    open →
                  </Link>
                ) : (
                  <span className="text-rose-300">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
