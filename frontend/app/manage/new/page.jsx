"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import QuestionForm, { EMPTY_QUESTION, toPayload } from "@/components/manage/QuestionForm";
import { ErrorBox, Spinner } from "@/components/ui";

export default function NewQuestionPage() {
  const { user } = useRequireAuth({ editor: true });
  const router = useRouter();
  const [q, setQ] = useState(EMPTY_QUESTION);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const d = await api("/manage/problems", { method: "POST", body: toPayload(q) });
      router.push(`/manage/${d.id}?created=1`);
    } catch (e) {
      setError(e.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setBusy(false);
    }
  };

  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">New question</h1>
      <p className="mb-6 text-sm text-slate-400">It's saved as a draft. Nobody else sees it until it's published.</p>
      <div className="mb-4">
        <ErrorBox error={error} />
      </div>
      <QuestionForm value={q} onChange={setQ} isNew />
      <div className="sticky bottom-0 mt-6 flex gap-3 border-t border-ink-700 bg-ink-950/95 py-4">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save draft"}
        </button>
        <button className="btn-ghost" onClick={() => router.push("/manage")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
