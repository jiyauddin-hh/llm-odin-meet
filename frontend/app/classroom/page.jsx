"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { canTeach, useRequireAuth } from "@/lib/auth";
import { ErrorBox, LANGUAGE_LABEL, Skeleton, Spinner, timeAgo } from "@/components/ui";
import Icon from "@/components/Icons";

const CODE_LEN = 6;

const FEATURES = [
  { icon: "code", title: "Live code editor", text: "Students see every keystroke, with the presenter's cursor." },
  { icon: "video", title: "Video & screen share", text: "Camera, microphone and screen presenting, right in the room." },
  { icon: "edit", title: "Pass the pen", text: "Hand the editor to any student and watch them solve it live." },
  { icon: "terminal", title: "Shared terminal", text: "Run the code in the sandbox; the whole class sees the output." },
];

const STEPS = [
  { icon: "hash", title: "Get the code", text: "Your teacher shares a 6-character class code." },
  { icon: "arrow-right", title: "Join the room", text: "Type it above. No installs, it runs in the browser." },
  { icon: "hand", title: "Follow and take part", text: "Watch live, chat, raise your hand and code when you get the pen." },
];

export default function ClassroomHub() {
  const { user, loading } = useRequireAuth();
  if (loading || !user) return <Spinner />;
  const teacher = canTeach(user);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live classroom
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl sm:leading-[1.1]">
            Teach and code together, <span className="text-gradient">live</span>.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
            One shared editor, terminal and video room. The teacher presents, students follow every keystroke, and anyone can be handed the pen.
          </p>
          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                  <Icon name={f.icon} className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{f.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <JoinCard />
      </section>

      <AiClassCard />

      {teacher ? (
        <TeacherPanel />
      ) : (
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">How it works</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-sm font-bold text-white">{i + 1}</span>
                  <Icon name={s.icon} className="h-4 w-4 text-brand-300" />
                </div>
                <h3 className="mt-3 font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Six single-character boxes, like a verification code. Supports typing, paste and backspace. */
function CodeInput({ value, onChange, onComplete, disabled }) {
  const refs = useRef([]);
  const chars = Array.from({ length: CODE_LEN }, (_, i) => value[i] || "");

  const setAt = (i, text) => {
    const clean = text.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!clean) return;
    const next = (value.slice(0, i) + clean).slice(0, CODE_LEN);
    onChange(next);
    refs.current[Math.min(next.length, CODE_LEN - 1)]?.focus();
    if (next.length === CODE_LEN) onComplete?.(next);
  };

  const onKey = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const cut = chars[i] ? i : Math.max(0, i - 1);
      onChange(value.slice(0, cut));
      refs.current[cut]?.focus();
    } else if (e.key === "ArrowLeft") refs.current[Math.max(0, i - 1)]?.focus();
    else if (e.key === "ArrowRight") refs.current[Math.min(CODE_LEN - 1, i + 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-1.5 sm:gap-2" onPaste={(e) => (e.preventDefault(), setAt(0, e.clipboardData.getData("text")))}>
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={c}
          disabled={disabled}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label={`Character ${i + 1} of the class code`}
          maxLength={CODE_LEN}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            // The box's old character may still be there (caret after it): keep only what was typed.
            const v = e.target.value;
            setAt(Math.min(i, value.length), c && v.startsWith(c) ? v.slice(c.length) : v);
          }}
          onKeyDown={(e) => onKey(i, e)}
          className={`h-14 w-full min-w-0 rounded-xl border bg-ink-950/80 text-center font-mono text-2xl font-bold uppercase text-white outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/20 sm:h-16 ${
            c ? "border-brand-500/40" : "border-white/[0.1]"
          }`}
        />
      ))}
    </div>
  );
}

function JoinCard() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  const join = async (value = code) => {
    if (value.length < CODE_LEN) return setError("Class codes are 6 characters long");
    setJoining(true);
    setError("");
    try {
      await api(`/classrooms/${value}`);
      router.push(`/classroom/${value}`);
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  };

  return (
    <section className="card card-glow relative overflow-hidden p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-sky-500 text-white shadow-lg shadow-brand-500/30">
          <Icon name="users" className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-xl font-bold text-white">Join a class</h2>
        <p className="mt-1 text-sm text-slate-400">Enter the 6-character code your teacher shared.</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <CodeInput value={code} onChange={(v) => (setCode(v), setError(""))} onComplete={join} disabled={joining} />
          <button className="btn-primary w-full justify-center py-3 text-base" disabled={joining || code.length < CODE_LEN}>
            {joining ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Joining…
              </>
            ) : (
              <>
                Join class <Icon name="arrow-right" className="h-4 w-4" />
              </>
            )}
          </button>
          <ErrorBox error={error} />
        </form>
        <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
          <Icon name="shield" className="h-3.5 w-3.5" /> Only people with the code can join. Your teacher can remove anyone.
        </p>
      </div>
    </section>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

function CopyCode({ code }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-ink-950/60 px-2 py-1 font-mono text-xs tracking-[0.2em] text-slate-200 transition hover:border-white/20"
      title="Copy the class code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
    >
      {code}
      <Icon name={done ? "check" : "share"} className={`h-3 w-3 ${done ? "text-emerald-300" : "text-slate-500"}`} />
    </button>
  );
}

function TeacherPanel() {
  const router = useRouter();
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("python");
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [query, setQuery] = useState("");

  const load = () =>
    api("/classrooms/mine")
      .then((d) => setRooms(d.classrooms))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const d = await api("/classrooms", { method: "POST", body: { title: title.trim() || "Untitled class", language } });
      router.push(`/classroom/${d.classroom.code}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  const act = async (fn) => {
    setError("");
    try {
      await fn();
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const live = rooms?.filter((r) => r.status === "LIVE") || [];
  const past = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rooms || []).filter((r) => r.status !== "LIVE" && (!q || r.title.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)));
  }, [rooms, query]);

  return (
    <div className="mt-14 space-y-10">
      {/* Start a class */}
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <Icon name="zap" className="h-5 w-5 text-emerald-300" /> Start a new class
            </h2>
            <p className="mt-1 text-sm text-slate-400">You get a code to share. Students who enter it see your editor, terminal and video live.</p>
          </div>
        </div>
        <form onSubmit={create} className="relative mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400" htmlFor="class-title">
              Class title
            </label>
            <input id="class-title" className="input py-3 text-base" placeholder="e.g. Recursion basics" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Language</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Language">
              {Object.entries(LANGUAGE_LABEL).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={language === k}
                  onClick={() => setLanguage(k)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    language === k ? "border-brand-400/60 bg-brand-500/15 text-white ring-2 ring-brand-500/20" : "border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-white/20"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button className="btn-success px-6 py-3 text-base" disabled={creating}>
              {creating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Starting…
                </>
              ) : (
                <>
                  <Icon name="play" className="h-4 w-4" /> Start class
                </>
              )}
            </button>
            <span className="text-xs text-slate-500">Camera and mic stay off until you turn them on.</span>
          </div>
          <ErrorBox error={error} />
        </form>
      </section>

      {/* Live now */}
      {live.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-300">
            <LiveDot /> Live now
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {live.map((r) => (
              <article key={r.id} className="card flex flex-col gap-4 border-emerald-500/20 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-white">{r.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {LANGUAGE_LABEL[r.language]} · started {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <span className="pill shrink-0 bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
                    <Icon name="users" className="h-3 w-3" /> {r.live?.online ?? 0} online
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyCode code={r.code} />
                  <div className="ml-auto flex items-center gap-2">
                    {confirm === `end:${r.code}` ? (
                      <>
                        <button className="btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                          Cancel
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => act(() => api(`/classrooms/${r.code}/end`, { method: "POST" }))}>
                          End for everyone
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost btn-sm" onClick={() => setConfirm(`end:${r.code}`)}>
                          End
                        </button>
                        <Link href={`/classroom/${r.code}`} className="btn-primary btn-sm">
                          Rejoin <Icon name="arrow-right" className="h-3.5 w-3.5" />
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Past classes {rooms && <span className="ml-1 text-slate-600">{past.length}</span>}
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input className="input w-52 py-1.5 pl-8 text-sm" placeholder="Search classes" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <button className="btn-ghost btn-icon" onClick={load} title="Refresh" aria-label="Refresh">
              <Icon name="refresh" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="card mt-4 overflow-hidden">
          {!rooms ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : past.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-slate-500">
                <Icon name="calendar" className="h-5 w-5" />
              </span>
              <p className="mt-3 font-medium text-white">{query ? "No classes match" : "No past classes yet"}</p>
              <p className="mt-1 text-sm text-slate-500">{query ? "Try another title or code." : "Classes you end will show up here."}</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {past.map((r) => (
                <li key={r.id} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-white/[0.02]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-slate-400">
                    <Icon name="code" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-white">{r.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span>{LANGUAGE_LABEL[r.language]}</span>
                      <span className="text-slate-700">·</span>
                      <span>ended {timeAgo(r.endedAt || r.createdAt)}</span>
                    </div>
                  </div>
                  <CopyCode code={r.code} />
                  {confirm === `del:${r.code}` ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Delete for good?</span>
                      <button className="btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                        No
                      </button>
                      <button className="btn-danger btn-sm" onClick={() => act(() => api(`/classrooms/${r.code}`, { method: "DELETE" }))}>
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-ghost btn-icon text-slate-500 opacity-100 transition hover:text-rose-300 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      onClick={() => setConfirm(`del:${r.code}`)}
                      title="Delete class"
                      aria-label={`Delete ${r.title}`}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/** The daily class taught by the AI teacher: join it without a code. */
function AiClassCard() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const load = () => api("/ai-class/today").then(setInfo).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!info || (!info.enabled && !info.current)) return null;
  const { current, next, teacher } = info;
  const when = (d) => new Date(d).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  const live = current?.status === "LIVE";

  return (
    <section className={`card relative mt-10 overflow-hidden p-5 sm:p-6 ${live ? "border-emerald-500/25" : ""}`}>
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-5">
        <span className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teacher.avatarUrl} alt="" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10" />
          {live && (
            <span className="absolute -bottom-1 -right-1 rounded-full bg-ink-900 p-1">
              <LiveDot />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-300">
            <Icon name="sparkles" className="h-3.5 w-3.5" /> Daily AI class with {teacher.name}
          </p>
          {current ? (
            <>
              <h2 className="mt-1 truncate text-lg font-bold text-white sm:text-xl">{current.title}</h2>
              <p className="mt-0.5 text-sm text-slate-400">
                {live ? "Live now. Your AI teacher is teaching, with live code and answers to your questions." : `Starts ${when(current.startsAt)}. The room is open: join now and wait.`}
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">Next class {next ? when(next) : "to be announced"}</h2>
              <p className="mt-0.5 text-sm text-slate-400">A new Python lesson every day: live code, questions in the chat, and homework.</p>
            </>
          )}
        </div>
        {current?.code && (
          <Link href={`/classroom/${current.code}`} className={`${live ? "btn-success" : "btn-primary"} shrink-0 px-5 py-2.5`}>
            {live ? "Join class" : "Join and wait"} <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
