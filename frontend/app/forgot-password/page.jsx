"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { ErrorBox, Notice } from "@/components/ui";
import AuthShell, { Field } from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <Notice tone="success">
            If an account exists for <span className="font-semibold text-white">{email}</span>, a reset link is on its way. It's valid for 30 minutes.
          </Notice>
          <Link href="/login" className="btn-primary w-full">
            Back to log in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <ErrorBox error={error} />
          <Field label="Email" icon="mail" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-primary w-full py-2.5" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
