"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ErrorBox } from "@/components/ui";
import AuthShell, { PasswordField } from "@/components/AuthShell";

function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const { setUser } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("The two passwords don't match");
    setBusy(true);
    setError("");
    try {
      const d = await api("/auth/reset-password", { method: "POST", body: { token, password: form.password } });
      setToken(d.token);
      setUser(d.user);
      router.push("/problems");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-4">
        <ErrorBox error="This reset link is incomplete. Open the full link from your email." />
        <Link href="/forgot-password" className="btn-primary w-full">
          Get a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <ErrorBox error={error} />
      <PasswordField label="New password" required minLength={6} autoComplete="new-password" autoFocus value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <PasswordField label="Confirm new password" required minLength={6} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
      <button className="btn-primary w-full py-2.5" disabled={busy}>
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Set a new password"
      subtitle="At least 6 characters. You'll be logged in straight away."
      footer={
        <>
          Link expired?{" "}
          <Link href="/forgot-password" className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
            Get a new one
          </Link>
        </>
      }
    >
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
