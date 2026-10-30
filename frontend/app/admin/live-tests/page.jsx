"use client";

// Admin: schedule the daily live tests (5:30 PM IST by default) and their questions.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import AdminTabs from "@/components/AdminTabs";
import { QuizEditor } from "@/components/LessonExtras";
import { ErrorBox, Spinner, formatDate } from "@/components/ui";
import { timeOfDay } from "@/components/live/clock";

const IST = 330 * 60_000;
const STATUS_STYLE = {
  UPCOMING: "bg-sky-500/15 text-sky-300",
  LIVE: "bg-rose-500/20 text-rose-300",
  ENDED: "bg-ink-700 text-slate-400",
};

/** A Date as the date and time in India, for the form. */
function toIST(d) {
  const iso = new Date(new Date(d).getTime() + IST).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Tomorrow (or the day after the last test) at 5:30 PM IST. */
function nextSlot(tests) {
  const latest = Math.max(Date.now(), ...tests.map((t) => new Date(t.startsAt).getTime()));
  return { date: toIST(latest + 86_400_000).date, time: "17:30" };
}

const blank = (tests) => ({ title: "", topic: "", ...nextSlot(tests), durationMin: 10, questions: [] });

export default function LiveTestsAdmin() {
  const { user } = useRequireAuth({ admin: true });
  const [tests, setTests] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api("/live-tests/admin/all").then((d) => setTests(d.tests)).catch((e) => setError(e.message));
  useEffect(() => {
    if (user?.role === "ADMIN") load();
  }, [user]);

  const edit = async (id) => {
    setError("");
    try {
      const { test } = await api(`/live-tests/admin/${id}`);
      setForm({ id, title: test.title, topic: test.topic, ...toIST(test.startsAt), durationMin: test.durationMin, questions: test.questions });
    } catch (e) {
      setError(e.message);
    }
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const body = {
        title: form.title,
        topic: form.topic,
        startsAt: new Date(`${form.date}T${form.time}:00+05:30`).toISOString(),
        durationMin: Number(form.durationMin),
        questions: form.questions,
      };
      await api(form.id ? `/live-tests/admin/${form.id}` : "/live-tests/admin", { method: form.id ? "PUT" : "POST", body });
      setForm(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.title}" and all its results?`)) return;
    try {
      await api(`/live-tests/admin/${t.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const copy = async (id) => {
    await edit(id);
    setForm((f) => f && { ...f, id: undefined, title: `${f.title} (copy)`, ...nextSlot(tests) });
  };

  if (user?.role !== "ADMIN") return <Spinner />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-white">Admin</h1>
      <AdminTabs />
      <ErrorBox error={error} />

      {form ? (
        <div className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold text-white">{form.id ? "Edit live test" : "New live test"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Title</label>
              <input className="input" value={form.title} placeholder="Python Live Test #2" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="label">Topic (shown on the home page)</label>
              <input className="input" value={form.topic} placeholder="Python · Chapter 2: Variables" onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start (IST)</label>
                <input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
              <div>
                <label className="label">Minutes</label>
                <input type="number" min={1} max={180} className="input" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
              </div>
            </div>
          </div>
          <QuizEditor
            quiz={form.questions}
            onChange={(questions) => setForm({ ...form, questions })}
            label={`Questions (${form.questions.length}). Students see them and their options in a shuffled order.`}
            addLabel="+ Add question"
            withCode
          />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : form.id ? "Save changes" : "Schedule test"}
            </button>
            <button className="btn-ghost" onClick={() => setForm(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-400">A live test every day at 5:30 PM. The top 3 show on the home page as Performers of the Day.</p>
            <button className="btn-primary" onClick={() => setForm(blank(tests || []))}>
              + New live test
            </button>
          </div>
          {!tests ? (
            <Spinner />
          ) : tests.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">No live tests yet.</div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Test</th>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Questions</th>
                    <th className="px-4 py-3 text-right">Students</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{t.title}</div>
                        <div className="text-xs text-slate-400">{t.topic}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(t.startsAt)}, {timeOfDay(t.startsAt)} · {t.durationMin} min
                      </td>
                      <td className="px-4 py-3">
                        <span className={`pill ${STATUS_STYLE[t.status]}`}>{t.status.toLowerCase()}</span>
                      </td>
                      <td className="px-4 py-3 text-right">{t.questionCount}</td>
                      <td className="px-4 py-3 text-right">{t.entries}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link href={`/live/${t.id}`} className="tab">
                          {t.status === "ENDED" ? "Results" : "Open"}
                        </Link>
                        <button className="tab" onClick={() => edit(t.id)}>
                          Edit
                        </button>
                        <button className="tab" onClick={() => copy(t.id)}>
                          Copy
                        </button>
                        <button className="tab text-rose-400" onClick={() => remove(t)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
