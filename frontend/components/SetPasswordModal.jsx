"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox } from "./ui";

// Easy to read out or type: no 0/O or 1/l/I.
const CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => CHARS[n % CHARS.length]).join("");

/** An admin sets a new password for a user, then shares it with them. */
export default function SetPasswordModal({ user, onClose }) {
  const [password, setPassword] = useState(randomPassword);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${user.id}/password`, { method: "PUT", body: { password } });
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setError("Couldn't copy. Select the password and copy it by hand.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white">New password for {user.username}</h2>
        <p className="mt-1 text-xs text-slate-400">
          {done
            ? "Saved. Send this password to the user. Their old password no longer works."
            : "Use the generated password or type your own (at least 6 characters). The old password stops working once you save."}
        </p>
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
        <div className="mt-4 flex gap-2">
          <input
            className="input font-mono"
            value={password}
            readOnly={done}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={(e) => done && e.target.select()}
          />
          {done ? (
            <button className="btn-ghost shrink-0" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          ) : (
            <button className="btn-ghost shrink-0" onClick={() => setPassword(randomPassword())}>
              Generate
            </button>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {done ? (
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" disabled={busy || password.length < 6} onClick={save}>
                {busy ? "Saving…" : "Set password"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
