"use client";

// Admin: who may use voice, video, screen share, chat, the code editor and Run
// in live classes. Role defaults, plus per-person "always allow" / "block".
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import { Avatar, ErrorBox, SectionCard, Spinner } from "@/components/ui";
import Icon from "@/components/Icons";

const FEATURES = [
  { key: "mic", label: "Voice", icon: "mic", hint: "Microphone" },
  { key: "cam", label: "Video", icon: "video", hint: "Camera" },
  { key: "screen", label: "Screen", icon: "monitor", hint: "Screen share" },
  { key: "chat", label: "Chat", icon: "message-circle", hint: "Send chat messages" },
  { key: "pen", label: "Code", icon: "edit", hint: "Type in the code editor when given the pen" },
  { key: "run", label: "Run", icon: "play", hint: "Run code while holding the pen" },
];
const ROLES = [
  { key: "USER", label: "Students", hint: "Everyone with the USER role" },
  { key: "EDITOR", label: "Editors", hint: "Question editors joining a class" },
  { key: "TEACHER", label: "Teachers", hint: "When they join someone else's class" },
];
const ROLE_PILL = {
  USER: "bg-white/[0.06] text-slate-300",
  EDITOR: "bg-amber-500/15 text-amber-300",
  TEACHER: "bg-sky-500/15 text-sky-300",
  ADMIN: "bg-brand-500/20 text-brand-300",
};

function Switch({ on, onChange, disabled, label }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-ink-600"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/** One feature for one person: follow the role default, always allow, or block. */
function PermCell({ feature, override, effective, onSet, disabled }) {
  // The menu is fixed to the viewport so the scrolling table can't clip it.
  const [open, setOpen] = useState(null); // { top, left } while open
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => box.current && !box.current.contains(e.target) && setOpen(null);
    const key = (e) => e.key === "Escape" && setOpen(null);
    const close = () => setOpen(null);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const toggle = (e) => {
    if (open) return setOpen(null);
    const b = e.currentTarget.getBoundingClientRect();
    const w = 208;
    const below = window.innerHeight - b.bottom > 190;
    setOpen({
      left: Math.min(Math.max(8, b.left + b.width / 2 - w / 2), window.innerWidth - w - 8),
      ...(below ? { top: b.bottom + 6 } : { bottom: window.innerHeight - b.top + 6 }),
    });
  };

  const custom = override !== undefined;
  const style = custom
    ? effective
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
      : "bg-rose-500/15 text-rose-300 ring-rose-500/40"
    : effective
      ? "text-slate-300 ring-white/[0.08] hover:ring-white/20"
      : "text-slate-600 ring-white/[0.06] hover:ring-white/20";
  const state = custom ? (effective ? "Always allowed" : "Blocked") : effective ? "Allowed (role default)" : "Off (role default)";
  const choose = (v) => {
    setOpen(null);
    if (v !== override) onSet(v);
  };

  return (
    <div ref={box} className="relative flex justify-center">
      <button
        disabled={disabled}
        onClick={toggle}
        title={`${feature.hint}: ${state}`}
        aria-label={`${feature.label}: ${state}`}
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-60 ${style}`}
      >
        <Icon name={feature.icon} className="h-4 w-4" />
        {!effective && <span className="absolute h-0.5 w-6 rotate-45 rounded-full bg-current" />}
      </button>
      {open && (
        <div style={open} className="fixed z-50 w-52 animate-scale-in overflow-hidden rounded-xl border border-white/[0.1] bg-ink-850 p-1 text-left shadow-2xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{feature.hint}</p>
          {[
            [undefined, "Use role default", "layers"],
            [true, "Always allow", "check-circle"],
            [false, "Block", "x-circle"],
          ].map(([v, text, icon]) => (
            <button
              key={text}
              onClick={() => choose(v)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition hover:bg-white/[0.06] ${override === v ? "text-white" : "text-slate-300"}`}
            >
              <Icon name={icon} className={`h-4 w-4 ${v === true ? "text-emerald-300" : v === false ? "text-rose-300" : "text-slate-400"}`} />
              <span className="flex-1 text-left">{text}</span>
              {override === v && <Icon name="check" className="h-3.5 w-3.5 text-brand-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClassroomPermissionsPage() {
  const { user: me } = useRequireAuth({ admin: true });
  const [defaults, setDefaults] = useState(null);
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const savedTimer = useRef(null);

  const flashSaved = (text = "Saved · applied to live classes") => {
    setSaved(text);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(""), 2500);
  };
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  // Opened from Admin → Users with ?q=<username>.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) setQ(initial);
  }, []);

  useEffect(() => {
    if (me?.role !== "ADMIN") return;
    api("/admin/class-permissions")
      .then((d) => setDefaults(d.defaults))
      .catch((e) => setError(e.message));
  }, [me]);

  useEffect(() => {
    if (me?.role !== "ADMIN") return;
    const t = setTimeout(() => {
      api(`/admin/class-permissions/users?q=${encodeURIComponent(q)}${onlyCustom ? "&custom=1" : ""}`)
        .then((d) => setUsers(d.users))
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [me, q, onlyCustom, defaults]);

  const setDefault = async (role, feature, value) => {
    setError("");
    const apply = (v) => (d) => ({ ...d, [role]: { ...d[role], [feature]: v } });
    setDefaults(apply(value));
    try {
      await api("/admin/class-permissions/defaults", { method: "PUT", body: { defaults: { [role]: { [feature]: value } } } });
      flashSaved();
    } catch (e) {
      setDefaults(apply(!value));
      setError(e.message);
    }
  };

  const setOverride = async (u, overrides) => {
    setError("");
    try {
      const d = await api(`/admin/class-permissions/users/${u.id}`, { method: "PUT", body: { overrides } });
      setUsers((list) => (onlyCustom && !Object.keys(d.user.overrides).length ? list.filter((x) => x.id !== u.id) : list.map((x) => (x.id === u.id ? d.user : x))));
      flashSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  if (me?.role !== "ADMIN") return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-white">Admin</h1>
      <AdminTabs />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Classroom permissions</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Choose who can use each feature in live classes. Changes take effect immediately, even in classes that are running. The host of a class and
            admins can always use everything.
          </p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs text-emerald-300 transition ${saved ? "opacity-100" : "opacity-0"}`} role="status">
          <Icon name="check" className="h-3.5 w-3.5" /> {saved || "Saved"}
        </span>
      </div>

      <ErrorBox error={error} className="mb-4" />

      <SectionCard title="Defaults by role" icon="shield" bodyClass="overflow-x-auto">
        {!defaults ? (
          <div className="p-5">
            <Spinner />
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-slate-500">
                <th className="px-5 py-3 text-left font-medium">Role</th>
                {FEATURES.map((f) => (
                  <th key={f.key} className="px-2 py-3 font-medium" title={f.hint}>
                    <span className="flex flex-col items-center gap-1">
                      <Icon name={f.icon} className="h-4 w-4 text-slate-400" />
                      {f.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {ROLES.map((r) => (
                <tr key={r.key}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-white">{r.label}</p>
                    <p className="text-xs text-slate-500">{r.hint}</p>
                  </td>
                  {FEATURES.map((f) => (
                    <td key={f.key} className="px-2 py-3.5 text-center">
                      <span className="inline-flex">
                        <Switch on={defaults[r.key][f.key]} onChange={(v) => setDefault(r.key, f.key, v)} label={`${r.label}: ${f.hint}`} />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-white/[0.015]">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-white">Admins</p>
                  <p className="text-xs text-slate-500">Always allowed</p>
                </td>
                {FEATURES.map((f) => (
                  <td key={f.key} className="px-2 py-3.5 text-center">
                    <span className="inline-flex">
                      <Switch on disabled onChange={() => {}} label={`Admins: ${f.hint} (always allowed)`} />
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard
        className="mt-6"
        title="Per person"
        icon="users"
        bodyClass=""
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" className="accent-brand-500" checked={onlyCustom} onChange={(e) => setOnlyCustom(e.target.checked)} />
            Only people with custom settings
          </label>
        }
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/[0.06] px-5 py-3">
          <div className="relative w-full max-w-xs">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="input !pl-9" placeholder="Search name, username or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded ring-1 ring-inset ring-white/20" /> Role default
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-500/30 ring-1 ring-inset ring-emerald-500/50" /> Always allowed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-rose-500/30 ring-1 ring-inset ring-rose-500/50" /> Blocked
            </span>
            <span>Click an icon to change it.</span>
          </div>
        </div>

        {!users ? (
          <div className="p-5">
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{onlyCustom ? "Nobody has custom settings. Everyone follows their role's defaults." : "No users match that search."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Person</th>
                  {FEATURES.map((f) => (
                    <th key={f.key} className="w-14 px-1 py-2.5 font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="w-24 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {users.map((u) => {
                  const isAdmin = u.role === "ADMIN";
                  const custom = Object.keys(u.overrides).length > 0;
                  return (
                    <tr key={u.id} className="transition hover:bg-white/[0.015]">
                      <td className="px-5 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar user={u} size={30} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/u/${u.username}`} className="truncate font-medium text-white hover:text-brand-300">
                                {u.name || u.username}
                              </Link>
                              <span className={`pill shrink-0 !px-1.5 !py-0 text-[10px] font-semibold ${ROLE_PILL[u.role]}`}>{u.role}</span>
                            </div>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      {FEATURES.map((f) => (
                        <td key={f.key} className="px-1 py-2.5">
                          <PermCell
                            feature={f}
                            override={u.overrides[f.key]}
                            effective={u.effective[f.key]}
                            disabled={isAdmin}
                            onSet={(v) => setOverride(u, { [f.key]: v === undefined ? null : v })}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right">
                        {isAdmin ? (
                          <span className="text-xs text-slate-600">Always all</span>
                        ) : (
                          custom && (
                            <button
                              className="text-xs text-slate-400 hover:text-white hover:underline"
                              onClick={() => setOverride(u, Object.fromEntries(Object.keys(u.overrides).map((k) => [k, null])))}
                              title="Remove this person's custom settings"
                            >
                              Reset
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
