"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import ReelForm, { EMPTY_REEL } from "@/components/reels/ReelForm";
import { ErrorBox, Spinner } from "@/components/ui";

export default function NewReelPage() {
  const { user } = useRequireAuth({ editor: true });
  const router = useRouter();
  const [reel, setReel] = useState(EMPTY_REEL);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const d = await api("/manage/reels", { method: "POST", body: reel });
      router.push(`/manage/reels/${d.id}`);
    } catch (e) {
      setError(e.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setBusy(false);
    }
  };

  if (!user) return <Spinner />;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">New reel</h1>
      <p className="mb-6 text-sm text-slate-400">Build it step by step and watch the preview on the right. It's saved as a draft.</p>
      <div className="mb-4">
        <ErrorBox error={error} />
      </div>
      <ReelForm value={reel} onChange={setReel} isNew />
      <div className="sticky bottom-0 mt-6 flex gap-3 border-t border-ink-700 bg-ink-950/95 py-4">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save draft"}
        </button>
        <button className="btn-ghost" onClick={() => router.push("/manage/reels")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
