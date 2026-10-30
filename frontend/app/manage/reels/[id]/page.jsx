"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import ReelForm from "@/components/reels/ReelForm";
import { REEL_STATUS } from "@/components/reels/status";
import { ErrorBox, Spinner } from "@/components/ui";

const FIELDS = ["title", "slug", "description", "topicId", "practiceSlug", "kind", "animation", "videoUrl", "allowDownload"];
const pick = (r) => Object.fromEntries(FIELDS.map((k) => [k, r[k] ?? (k === "topicId" ? null : k === "animation" ? null : "")]));

const RENDER = {
  NONE: "Not made yet: it's made when the reel is published.",
  QUEUED: "Waiting in line to be made…",
  RENDERING: "Being made right now (takes about as long as the reel)…",
  READY: "Ready to download.",
  FAILED: "Making the video failed.",
};

function DownloadPanel({ meta, onRemake, busy }) {
  if (meta.kind === "VIDEO") {
    return (
      <p className="text-sm text-slate-400">
        {meta.videoUrl?.startsWith("/uploads/") ? "People download the uploaded file." : "Linked videos (YouTube etc.) can't be downloaded."}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className={meta.renderStatus === "READY" ? "text-emerald-400" : meta.renderStatus === "FAILED" ? "text-rose-400" : "text-slate-300"}>
        {RENDER[meta.renderStatus]}
      </span>
      {meta.renderStatus === "FAILED" && meta.renderError && <span className="text-xs text-rose-300">{meta.renderError}</span>}
      {meta.renderStatus === "READY" && (
        <a href={meta.renderUrl} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">
          ▶ Watch the MP4
        </a>
      )}
      {meta.status === "PUBLISHED" && (
        <button className="btn-ghost px-3 py-1 text-xs" disabled={busy || ["QUEUED", "RENDERING"].includes(meta.renderStatus)} onClick={onRemake}>
          ↻ Re-make video
        </button>
      )}
      <span className="text-xs text-slate-500">· {meta.downloads} downloads</span>
    </div>
  );
}

export default function EditReelPage({ params }) {
  const { user } = useRequireAuth({ editor: true });
  const router = useRouter();
  const [reel, setReel] = useState(null);
  const [saved, setSaved] = useState("");
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [comment, setComment] = useState("");

  const load = () =>
    api(`/manage/reels/${params.id}`)
      .then(({ reel }) => {
        const r = pick(reel);
        setReel(r);
        setSaved(JSON.stringify(r));
        setMeta(reel);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  if (error && !reel) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorBox error={error} /></div>;
  if (!user || !reel) return <Spinner />;

  const admin = user.role === "ADMIN";
  const dirty = JSON.stringify(reel) !== saved;
  const locked = meta.status === "IN_REVIEW" && !admin;
  const [label, style] = REEL_STATUS[meta.status];

  const run = async (name, fn, { save = true } = {}) => {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      if (save && dirty && !locked) await api(`/manage/reels/${meta.id}`, { method: "PUT", body: reel });
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(null);
    }
  };
  const post = (path, body) => api(`/manage/reels/${meta.id}/${path}`, { method: "POST", body });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link href="/manage/reels" className="text-sm text-slate-400 hover:text-white">
        ← Reel Studio
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">{reel.title || "Untitled reel"}</h1>
        <span className={`pill ${style}`}>{label}</span>
        {meta.status === "PUBLISHED" && (
          <Link href={`/reels?r=${meta.slug}`} className="text-sm text-brand-400 hover:underline">
            ↗ Open in feed
          </Link>
        )}
      </div>
      <div className="mt-4 space-y-3">
        <ErrorBox error={error} />
        {notice && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div>}
        {meta.status === "REJECTED" && meta.reviewComment && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <b>Changes requested:</b> {meta.reviewComment}
          </div>
        )}
        {meta.status === "IN_REVIEW" && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {admin ? "Waiting for your review: watch the preview, then publish or request changes." : "Waiting for an admin to review. Editing is locked until then."}
          </div>
        )}
        {meta.status === "PUBLISHED" && !admin && (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
            This reel is live. Saving changes takes it offline until an admin approves it again.
          </div>
        )}
      </div>

      <div className="card mt-6 p-4">
        <div className="label">⬇ Download video (1080×1920 MP4)</div>
        <DownloadPanel
          meta={meta}
          busy={!!busy}
          onRemake={() => run("render", async () => { await post("render"); setNotice("The video will be made again."); }, { save: false })}
        />
      </div>

      <div className="mt-6">
        <ReelForm value={reel} onChange={setReel} readOnly={locked} />
      </div>

      {confirm && (
        <div className="card mt-6 space-y-3 border-rose-500/40 p-4">
          {confirm === "reject" ? (
            <>
              <label className="label">What should the editor fix?</label>
              <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
            </>
          ) : (
            <p className="text-sm text-slate-300">Delete this reel with its likes and saves? This can't be undone.</p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-danger"
              disabled={confirm === "reject" && !comment.trim()}
              onClick={() =>
                confirm === "reject"
                  ? run("reject", async () => {
                      await post("reject", { comment });
                      setConfirm(null);
                      setComment("");
                      setNotice("Sent back with your comment.");
                    }, { save: false })
                  : run("delete", async () => {
                      await api(`/manage/reels/${meta.id}`, { method: "DELETE" });
                      router.push("/manage/reels");
                    }, { save: false })
              }
            >
              {confirm === "reject" ? "Send back" : "Yes, delete"}
            </button>
            <button className="btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-2 border-t border-ink-700 bg-ink-950/95 py-4">
        {!locked && (
          <button className="btn-ghost" disabled={!!busy || !dirty} onClick={() => run("save", async () => setNotice("Saved."))}>
            {busy === "save" ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </button>
        )}
        {admin ? (
          meta.status !== "PUBLISHED" || dirty ? (
            <button className="btn-success" disabled={!!busy} onClick={() => run("publish", async () => { await post("publish"); setNotice("Published: it's in the Reels feed."); })}>
              {meta.status === "IN_REVIEW" ? "Approve & publish" : "Publish"}
            </button>
          ) : null
        ) : (
          !locked &&
          meta.status !== "PUBLISHED" && (
            <button className="btn-success" disabled={!!busy} onClick={() => run("submit", async () => { await post("submit"); setNotice("Sent for review."); })}>
              Send for review
            </button>
          )
        )}
        {admin && meta.status === "IN_REVIEW" && (
          <button className="btn-ghost" onClick={() => setConfirm("reject")}>
            Request changes
          </button>
        )}
        <div className="ml-auto flex gap-2">
          {meta.status === "PUBLISHED" && (
            <button className="btn-ghost" disabled={!!busy} onClick={() => run("unpublish", async () => { await post("unpublish"); setNotice("Taken out of the feed."); }, { save: false })}>
              Unpublish
            </button>
          )}
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
