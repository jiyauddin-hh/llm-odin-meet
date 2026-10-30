"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { Avatar, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import Icon from "@/components/Icons";

export default function SettingsPage() {
  const { user, setUser } = useRequireAuth();
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && !form) {
      setForm({ name: user.name || "", bio: user.bio || "", country: user.country || "", avatarUrl: user.avatarUrl || "" });
    }
  }, [user, form]);

  if (!form) return <Spinner />;
  const set = (k) => (e) => {
    setSaved(false);
    setForm({ ...form, [k]: e.target.value });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/users/me", { method: "PATCH", body: form });
      setUser(d.user);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 page-enter">
      <PageHeader
        eyebrow={
          <>
            <Icon name="settings" className="h-3.5 w-3.5" /> Settings
          </>
        }
        title="Edit profile"
        subtitle="This is what other coders see on your public profile and the leaderboard."
        actions={
          <Link href={`/u/${user.username}`} className="btn-ghost">
            <Icon name="eye" className="h-4 w-4" /> View profile
          </Link>
        }
      />

      <form onSubmit={submit} className="mt-8 grid gap-6 md:grid-cols-[260px_1fr]">
        <aside className="card h-fit p-6 text-center">
          <div className="flex justify-center">
            <Avatar user={{ ...user, ...form }} size={96} ring />
          </div>
          <div className="mt-4 truncate font-semibold text-white">{form.name || user.username}</div>
          <div className="text-sm text-slate-400">@{user.username}</div>
          <div className="mt-1 truncate text-xs text-slate-500">{user.email}</div>
          <p className="mt-4 text-xs text-slate-500">Your username and email can't be changed here.</p>
        </aside>

        <div className="card space-y-5 p-6">
          <ErrorBox error={error} />
          <div>
            <label className="label">Display name</label>
            <input className="input" maxLength={60} value={form.name} onChange={set("name")} placeholder="How you'd like to be shown" />
          </div>
          <div>
            <label className="label">Bio</label>
            <textarea className="input" rows={3} maxLength={300} value={form.bio} onChange={set("bio")} placeholder="A line about you" />
            <p className="help text-right">{form.bio.length}/300</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label">Country</label>
              <div className="relative">
                <Icon name="pin" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input className="input pl-10" maxLength={60} value={form.country} onChange={set("country")} placeholder="India" />
              </div>
            </div>
            <div>
              <label className="label">Avatar image URL</label>
              <div className="relative">
                <Icon name="globe" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input className="input pl-10" type="url" value={form.avatarUrl} onChange={set("avatarUrl")} placeholder="https://…" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-white/[0.06] pt-5">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            {saved && (
              <span className="flex animate-fade-in items-center gap-1.5 text-sm text-emerald-300">
                <Icon name="check-circle" className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
