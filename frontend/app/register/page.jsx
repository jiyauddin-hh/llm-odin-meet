"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ErrorBox } from "@/components/ui";
import AuthShell, { Field, PasswordField } from "@/components/AuthShell";
import Icon from "@/components/Icons";

function strength(pw) {
  let n = 0;
  if (pw.length >= 6) n++;
  if (pw.length >= 10) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) n++;
  return n;
}
const STRENGTH = ["", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["", "bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-400"];

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const s = strength(form.password);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(form);
      router.push("/problems");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. Start solving in under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-300 hover:text-brand-200 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <ErrorBox error={error} />
        <Field label="Full name" icon="user" autoComplete="name" value={form.name} onChange={set("name")} placeholder="Ada Lovelace" />
        <Field
          label="Username"
          icon="hash"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          autoComplete="username"
          value={form.username}
          onChange={set("username")}
          placeholder="ada_l"
          hint="3–20 letters, numbers or underscores. This is your public handle."
        />
        <Field label="Email" icon="mail" type="email" required autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@example.com" />
        <div>
          <PasswordField required minLength={6} autoComplete="new-password" value={form.password} onChange={set("password")} hint="At least 6 characters." />
          {form.password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-1 flex-1 rounded-full transition ${i <= s ? STRENGTH_COLOR[s] : "bg-white/[0.08]"}`} />
                ))}
              </div>
              <span className="w-12 text-right text-xs text-slate-400">{STRENGTH[s]}</span>
            </div>
          )}
        </div>
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
          {!busy && <Icon name="arrow-right" className="h-4 w-4" />}
        </button>
        <p className="text-center text-xs text-slate-500">By signing up you agree to practise honestly and have fun.</p>
      </form>
    </AuthShell>
  );
}
