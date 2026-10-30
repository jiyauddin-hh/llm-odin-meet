"use client";

// Admin: the daily class taught by the AI teacher. Schedule, start one now, stop one.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import Icon from "@/components/Icons";
import { ErrorBox, Notice, Spinner, formatDate } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_STYLE = {
  PREPARING: "bg-sky-500/15 text-sky-300",
  READY: "bg-indigo-500/15 text-indigo-300",
  LIVE: "bg-rose-500/20 text-rose-300",
  ENDED: "bg-ink-700 text-slate-400",
  FAILED: "bg-amber-500/15 text-amber-300",
};
const STAGE = { planning: "writing the script", voice: "recording the voice", face: "rendering the video", ready: "waiting to start", live: "teaching" };

export default function AiClassAdmin() {
  const { user } = useRequireAuth({ admin: true });
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [start, setStart] = useState({ lessonId: "", inMinutes: 0 });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api("/admin/ai-class")
      .then((d) => {
        setData(d);
        setForm((f) => f || d.settings);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    load();
    api("/admin/ai-class/lessons").then((d) => setLessons(d.lessons)).catch(() => {});
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [user]);

  const act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(async () => {
      const d = await api("/admin/ai-class/settings", {
        method: "PUT",
        body: { ...form, minutes: Number(form.minutes), prepMinutes: Number(form.prepMinutes) },
      });
      setForm(d.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  const startNow = () =>
    act(() =>
      api("/admin/ai-class/start", {
        method: "POST",
        body: { inMinutes: Number(start.inMinutes) || 0, ...(start.lessonId && { lessonId: Number(start.lessonId) }) },
      }),
    );

  if (user?.role !== "ADMIN" || !data || !form) return <Spinner />;
  const { health, classes } = data;
  const missing = [
    !health.brain && "the Claude CLI (set CLAUDE_BIN in backend/.env)",
    !health.voice && "the voice (run tools/tts/setup.sh)",
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-white">Admin</h1>
      <AdminTabs />
      <ErrorBox error={error} className="mb-4" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Health ok={health.brain} label="Brain" text={health.brain ? "Claude CLI found" : "Claude CLI not found"} />
        <Health ok={health.voice} label="Voice" text={health.voice ? "Piper voice installed" : "Run tools/tts/setup.sh"} />
        <Health ok={health.face} label="Face" text={health.face ? "MuseTalk on the GPU" : "Voice + photo only (run tools/avatar/setup.sh)"} warn />
      </div>
      {missing.length > 0 && (
        <Notice tone="warning" className="mb-6">
          The AI teacher can&apos;t teach without {missing.join(" and ")}.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Icon name="calendar" className="h-4 w-4 text-brand-300" /> Daily schedule
          </h2>
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Run a class automatically on the days below
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Start time (server time)</label>
              <input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <div>
              <label className="label">Teacher&apos;s name</label>
              <input className="input" maxLength={40} value={form.teacherName} onChange={(e) => setForm({ ...form, teacherName: e.target.value })} />
            </div>
            <div>
              <label className="label">Lesson length (minutes of speaking)</label>
              <input type="number" min={5} max={60} className="input" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
            </div>
            <div>
              <label className="label">Open the room early (minutes)</label>
              <input type="number" min={5} max={120} className="input" value={form.prepMinutes} onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Course (slug)</label>
              <input className="input" value={form.courseSlug} onChange={(e) => setForm({ ...form, courseSlug: e.target.value })} />
            </div>
          </div>
          <div>
            <span className="label">Days</span>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const on = form.days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== i) : [...form.days, i].sort() })}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${on ? "border-brand-400/60 bg-brand-500/15 text-white" : "border-white/[0.08] text-slate-400 hover:border-white/20"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            The room opens early while the teacher prepares: Claude writes the script from the next lesson, then the voice and video are made. Students can join and wait.
          </p>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {saved ? "Saved" : "Save schedule"}
          </button>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Icon name="zap" className="h-4 w-4 text-emerald-300" /> Start a class now
          </h2>
          <div>
            <label className="label">Lesson</label>
            <select className="input" value={start.lessonId} onChange={(e) => setStart({ ...start, lessonId: e.target.value })}>
              <option value="">Next lesson in the course</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.chapter} · {l.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Start teaching in (minutes)</label>
            <input type="number" min={0} max={120} className="input" value={start.inMinutes} onChange={(e) => setStart({ ...start, inMinutes: e.target.value })} />
            <p className="mt-1 text-xs text-slate-500">0 starts as soon as it&apos;s ready (usually 2 to 4 minutes).</p>
          </div>
          <button className="btn-success" onClick={startNow} disabled={busy || !!health.running || missing.length > 0}>
            <Icon name="play" className="h-4 w-4" /> {health.running ? "A class is running" : "Start AI class"}
          </button>
        </section>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wider text-slate-400">Classes</h2>
      {classes.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">No AI classes yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table table-hover">
            <thead>
              <tr>
                <th className="px-4 py-3">Lesson</th>
                <th className="px-4 py-3">Starts</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Questions</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const open = ["PREPARING", "READY", "LIVE"].includes(c.status);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{c.title}</div>
                      {c.error && <div className="text-xs text-amber-300">{c.error}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatDate(c.startsAt)}, {new Date(c.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`pill ${STATUS_STYLE[c.status]}`}>{c.status.toLowerCase()}</span>
                      {open && c.stage && STAGE[c.stage] && <span className="ml-2 text-xs text-slate-500">{STAGE[c.stage]}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{c.questions}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {c.code && (
                        <Link href={`/classroom/${c.code}`} className="tab">
                          Open
                        </Link>
                      )}
                      {open && (
                        <button className="tab text-rose-400" disabled={busy} onClick={() => act(() => api(`/admin/ai-class/${c.id}/stop`, { method: "POST" }))}>
                          Stop
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Health({ ok, label, text, warn = false }) {
  const tone = ok ? "text-emerald-300 bg-emerald-500/15" : warn ? "text-amber-300 bg-amber-500/15" : "text-rose-300 bg-rose-500/15";
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon name={ok ? "check-circle" : "alert-triangle"} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
        <div className="truncate text-sm text-white">{text}</div>
      </div>
    </div>
  );
}
