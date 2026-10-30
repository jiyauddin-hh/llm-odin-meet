"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "./ui";
import Icon from "./Icons";

/**
 * Request button for a locked course, or for one chapter when `moduleId` is given.
 * `status` is the lock status from the API.
 */
export default function AccessButton({ course, moduleId, status, expiresAt, onChange, compact = false, label, quiet = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const request = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/courses/${course.slug}/request`, { method: "POST", body: moduleId ? { moduleId } : {} });
      onChange?.("pending");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const note = (text) => <p className={`text-xs ${compact ? "mt-1" : "mt-2"} text-slate-400`}>{text}</p>;
  const size = compact ? "btn-sm" : "w-full";

  if (status === "guest" || status === "login")
    return (
      <Link href="/login" className={`btn-ghost ${size}`}>
        <Icon name="lock" className="h-3.5 w-3.5" /> Log in {status === "login" ? "to open" : "to request access"}
      </Link>
    );
  if (status === "pending")
    return (
      <div>
        <button className={`btn-ghost ${size}`} disabled>
          <Icon name="clock" className="h-3.5 w-3.5" /> Request sent
        </button>
        {!compact && note("An admin will review your request soon.")}
      </div>
    );
  if (status === "finish-previous")
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <Icon name="unlock" className="h-3.5 w-3.5" /> Opens when you finish the previous chapter
      </span>
    );

  return (
    <div>
      <button className={`${quiet ? "btn-ghost" : "btn-primary"} ${size}`} onClick={request} disabled={busy}>
        <Icon name="lock" className="h-3.5 w-3.5" />
        {busy ? "Sending…" : label || (status === "locked" ? "Request access" : "Request again")}
      </button>
      {status === "expired" && note(`Access ended${expiresAt ? ` on ${formatDate(expiresAt)}` : ""}.`)}
      {status === "rejected" && note("Your last request was declined. You can ask again.")}
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
