"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ErrorBox } from "@/components/ui";
import AuthShell, { Field, PasswordField } from "@/components/AuthShell";
import Icon from "@/components/Icons";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form.login, form.password);
      router.push("/problems");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to keep your streak alive."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <ErrorBox error={error} />
        <Field
          label="Username or email"
          icon="user"
          required
          autoComplete="username"
          autoFocus
          value={form.login}
          onChange={(e) => setForm({ ...form, login: e.target.value })}
        />
        <PasswordField
          required
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          right={
            <Link href="/forgot-password" className="mb-1.5 text-xs font-medium text-brand-300 hover:text-brand-200 hover:underline">
              Forgot password?
            </Link>
          }
        />
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
          {!busy && <Icon name="arrow-right" className="h-4 w-4" />}
        </button>
      </form>
    </AuthShell>
  );
}
