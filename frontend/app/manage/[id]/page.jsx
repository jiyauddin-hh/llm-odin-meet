"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import QuestionForm, { toPayload } from "@/components/manage/QuestionForm";
import StatusBadge from "@/components/manage/StatusBadge";
import { Block } from "@/components/ProblemStatement";
import { ErrorBox, Spinner, Verdict } from "@/components/ui";

function CheckResult({ check }) {
  if (!check) return null;
  return (
    <div className={`card p-4 ${check.ok ? "border-emerald-500/40" : "border-rose-500/40"}`}>
      <div className="flex items-center gap-3">
        <Verdict value={check.verdict} className="text-lg" />
        <span className="text-sm text-slate-300">{check.message}</span>
      </div>
      {check.compileOutput && (
        <div className="mt-3">
          <Block label="Compiler / error output">{check.compileOutput}</Block>
        </div>
      )}
      {check.results?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {check.results.map((r, i) => (
            <span key={i} className={`pill ${r.verdict === "Accepted" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-300"}`}>
              Test {i + 1}: {r.verdict} · {r.timeMs} ms
            </span>
          ))}
        </div>
      )}
      {check.results
        ?.map((r, i) => ({ ...r, n: i + 1 }))
        .filter((r) => r.verdict !== "Accepted")
        .slice(0, 2)
        .map((r) => (
          <div key={r.n} className="mt-3 space-y-2 rounded-lg border border-ink-700 p-3">
            <div className="text-sm text-slate-300">Test {r.n} failed</div>
            <Block label="Input">{r.input}</Block>
            <div className="grid gap-2 sm:grid-cols-2">
              <Block label="Solution printed">{r.stdout}</Block>
              <Block label="Expected">{r.expected}</Block>
            </div>
            {r.stderr && <Block label="Error output">{r.stderr}</Block>}
          </div>
        ))}
    </div>
  );
}

export default function EditQuestionPage({ params }) {
  const { user } = useRequireAuth({ editor: true });
  const router = useRouter();
  const search = useSearchParams();
  const [q, setQ] = useState(null);
  const [saved, setSaved] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(search.get("created") ? "Draft created. Test the solution, then send it for review." : "");
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null); // "delete" | "discard" | "reject"
  const [comment, setComment] = useState("");

  const load = () =>
    api(`/manage/problems/${params.id}`)
      .then((d) => {
        setQ(d.question);
        setSaved(JSON.stringify(d.question));
        setMeta(d.meta);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  if (error && !q) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorBox error={error} /></div>;
  if (!user || !q || !meta) return <Spinner />;

  const admin = user.role === "ADMIN";
  const dirty = JSON.stringify(q) !== saved;
  const locked = meta.workflow === "IN_REVIEW" && !admin;

  /** Runs an action, saving unsaved edits first. */
  const run = async (name, fn, { save = true } = {}) => {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      if (save && dirty && !locked) await api(`/manage/problems/${meta.id}`, { method: "PUT", body: toPayload(q) });
      await fn();
    } catch (e) {
      setError(e.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(null);
    }
  };

  const actions = {
    save: () => run("save", async () => {
      await load();
      setNotice("Draft saved.");
    }),
    verify: () => run("verify", async () => {
      await load();
      setCheck(await api(`/manage/problems/${meta.id}/verify`, { method: "POST" }));
    }),
    submit: () => run("submit", async () => {
      try {
        const d = await api(`/manage/problems/${meta.id}/submit`, { method: "POST" });
        setCheck(d.check);
        setNotice("Sent for review. An admin will publish it or ask for changes.");
      } finally {
        await load();
      }
    }),
    publish: () => run("publish", async () => {
      try {
        const d = await api(`/manage/problems/${meta.id}/publish`, { method: "POST", body: {} });
        setCheck(d.check);
        setNotice("Published. It's live on the Practice page.");
      } finally {
        await load();
      }
    }),
    reject: () => run("reject", async () => {
      await api(`/manage/problems/${meta.id}/reject`, { method: "POST", body: { comment } });
      setConfirm(null);
      setComment("");
      await load();
      setNotice("Sent back to the editor with your comment.");
    }, { save: false }),
    discard: () => run("discard", async () => {
      await api(`/manage/problems/${meta.id}/discard`, { method: "POST" });
      setConfirm(null);
      await load();
      setNotice("Changes discarded. Showing the live version.");
    }, { save: false }),
    visibility: (published) => run("visibility", async () => {
      await api(`/manage/problems/${meta.id}/visibility`, { method: "POST", body: { published } });
      await load();
      setNotice(published ? "Visible on the Practice page again." : "Hidden from learners.");
    }, { save: false }),
    duplicate: () => run("duplicate", async () => {
      const d = await api(`/manage/problems/${meta.id}/duplicate`, { method: "POST" });
      router.push(`/manage/${d.id}`);
    }),
    remove: () => run("delete", async () => {
      await api(`/manage/problems/${meta.id}`, { method: "DELETE" });
      router.push("/manage");
    }, { save: false }),
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/manage" className="text-sm text-slate-400 hover:text-white">
        ← Question Manager
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">{q.title || "Untitled question"}</h1>
        <StatusBadge problem={meta} />
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        <Link href={`/manage/${meta.id}/preview`} className="text-brand-400 hover:underline">
          👁 Preview
        </Link>
        <Link href={`/manage/${meta.id}/history`} className="text-brand-400 hover:underline">
          🕘 History
        </Link>
        <button className="text-brand-400 hover:underline" onClick={actions.duplicate}>
          ⧉ Duplicate
        </button>
        {meta.published && meta.approvedAt && (
          <Link href={`/problems/${meta.liveSlug}`} className="text-brand-400 hover:underline">
            ↗ Open live page
          </Link>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <ErrorBox error={error} />
        {notice && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div>}
        {meta.workflow === "REJECTED" && meta.reviewComment && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <b>Changes requested:</b> {meta.reviewComment}
          </div>
        )}
        {meta.workflow === "IN_REVIEW" && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {admin ? "An editor sent this for review. Check the preview, then publish or request changes." : "Waiting for an admin to review. Editing is locked until then."}
          </div>
        )}
        {meta.hasPendingChanges && meta.workflow !== "IN_REVIEW" && (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            Learners still see the last published version. Your edits go live once {admin ? "you publish" : "an admin approves them"}.
          </div>
        )}
        <CheckResult check={check} />
      </div>

      <div className="mt-6">
        <QuestionForm value={q} onChange={setQ} readOnly={locked} />
      </div>

      {confirm && (
        <div className="card mt-6 space-y-3 border-rose-500/40 p-4">
          {confirm === "reject" && (
            <>
              <label className="label">What should the editor fix?</label>
              <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
            </>
          )}
          <p className="text-sm text-slate-300">
            {confirm === "delete" && "Delete this question with all its submissions and history? This can't be undone."}
            {confirm === "discard" && "Throw away the unpublished changes and go back to the live version?"}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-danger"
              disabled={!!busy || (confirm === "reject" && !comment.trim())}
              onClick={{ delete: actions.remove, discard: actions.discard, reject: actions.reject }[confirm]}
            >
              {{ delete: "Yes, delete", discard: "Yes, discard", reject: "Send back" }[confirm]}
            </button>
            <button className="btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-2 border-t border-ink-700 bg-ink-950/95 py-4">
        {!locked && (
          <button className="btn-ghost" disabled={!!busy || !dirty} onClick={actions.save}>
            {busy === "save" ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </button>
        )}
        <button className="btn-ghost" disabled={!!busy} onClick={actions.verify}>
          {busy === "verify" ? "Testing…" : "▶ Test solution"}
        </button>
        {admin ? (
          <button className="btn-success" disabled={!!busy} onClick={actions.publish}>
            {busy === "publish" ? "Checking & publishing…" : meta.workflow === "IN_REVIEW" ? "Approve & publish" : "Publish"}
          </button>
        ) : (
          !locked && (
            <button className="btn-success" disabled={!!busy || (!meta.workflow && !dirty)} onClick={actions.submit}>
              {busy === "submit" ? "Checking…" : "Send for review"}
            </button>
          )
        )}
        {admin && meta.workflow === "IN_REVIEW" && (
          <button className="btn-ghost" onClick={() => setConfirm("reject")}>
            Request changes
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {meta.hasPendingChanges && !locked && (
            <button className="btn-ghost" onClick={() => setConfirm("discard")}>
              Discard changes
            </button>
          )}
          {meta.approvedAt &&
            (meta.published ? (
              <button className="btn-ghost" disabled={!!busy} onClick={() => actions.visibility(false)}>
                Hide
              </button>
            ) : (
              admin && (
                <button className="btn-ghost" disabled={!!busy} onClick={() => actions.visibility(true)}>
                  Show again
                </button>
              )
            ))}
          {admin && (
            <button className="btn-danger" onClick={() => setConfirm("delete")}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
