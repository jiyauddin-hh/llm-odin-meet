"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AccessButton from "@/components/AccessButton";
import { Breadcrumbs, ErrorBox, LEVEL_STYLE, ProgressBar, ProgressRing, Spinner, formatDate } from "@/components/ui";
import Icon from "@/components/Icons";

const REASON = {
  free: <span className="pill bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-500/25">Free preview</span>,
  chapter: <span className="pill bg-sky-500/12 text-sky-300 ring-1 ring-inset ring-sky-500/25">Unlocked for you</span>,
  auto: <span className="pill bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25">Unlocked by progress</span>,
};

export default function CoursePage({ params }) {
  const { user, loading } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () => api(`/courses/${params.slug}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug, loading, user]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorBox error={error} />
      </div>
    );
  if (!data) return <Spinner />;

  const { course, access, unlock, chapters, completed } = data;
  const state = new Map(chapters.map((c) => [c.moduleId, c]));
  const done = new Set(completed);
  const openLessons = course.modules.filter((m) => state.get(m.id).open).flatMap((m) => m.lessons);
  const allLessons = course.modules.flatMap((m) => m.lessons);
  const percent = allLessons.length ? Math.round((allLessons.filter((l) => done.has(l.id)).length / allLessons.length) * 100) : 0;
  const nextLesson = openLessons.find((l) => !done.has(l.id)) || openLessons[0];
  const openCount = chapters.filter((c) => c.open).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 page-enter">
      <Breadcrumbs items={[{ href: "/courses", label: "Courses" }, { label: course.title }]} />

      {/* Hero card */}
      <div className="card-glow mt-4 overflow-hidden">
        <div className="relative grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_320px]">
          <div>
            <div className="flex items-start gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] text-4xl ring-1 ring-inset ring-white/[0.08]">{course.icon}</span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{course.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className={`pill ${LEVEL_STYLE[course.level] || "bg-ink-700"}`}>{course.level}</span>
                  <span className="flex items-center gap-1">
                    <Icon name="layers" className="h-3.5 w-3.5" /> {course.modules.length} chapters
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="book" className="h-3.5 w-3.5" /> {allLessons.length} lessons
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-5 leading-relaxed text-slate-300">{course.description}</p>
          </div>
          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-white/[0.06] bg-ink-950/50 p-5">
            {user && openCount > 0 && (
              <>
                <div className="flex items-center gap-4">
                  <ProgressRing percent={percent} size={64} stroke={6} />
                  <div className="text-sm">
                    <div className="font-semibold text-white">{unlock === "full" ? "Your progress" : `${openCount} of ${course.modules.length} chapters open`}</div>
                    <div className="text-xs text-slate-400">
                      {completed.length}/{allLessons.length} lessons done
                    </div>
                  </div>
                </div>
                <ProgressBar percent={percent} size="sm" />
                {nextLesson && (
                  <Link href={`/courses/${course.slug}/${nextLesson.id}`} className="btn-primary w-full">
                    {completed.length === 0 ? (unlock === "preview" ? "Start the free chapter" : "Start learning") : "Continue learning"}
                    <Icon name="arrow-right" className="h-4 w-4" />
                  </Link>
                )}
              </>
            )}
            {unlock === "full" ? (
              access.expiresAt && <p className="text-center text-xs text-slate-500">Access until {formatDate(access.expiresAt)}</p>
            ) : (
              <>
                {!user && openCount === 0 && <p className="text-sm text-slate-400">Log in to try the free chapter.</p>}
                {user && openCount === 0 && <p className="text-sm text-slate-400">This course is locked. Ask for access below.</p>}
                <AccessButton course={course} status={access.status} expiresAt={access.expiresAt} label={openCount ? "Request the full course" : undefined} quiet={openCount > 0} onChange={load} />
                {user && <p className="text-center text-xs text-slate-500">…or request single chapters below.</p>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10 flex items-end justify-between">
        <h2 className="text-lg font-semibold text-white">Course content</h2>
        <span className="text-xs text-slate-500">
          {openCount}/{course.modules.length} chapters open
        </span>
      </div>
      <div className="mt-4 space-y-4">
        {course.modules.map((m, mi) => {
          const ch = state.get(m.id);
          const lessonsDone = m.lessons.filter((l) => done.has(l.id)).length;
          const chapterPct = m.lessons.length ? (lessonsDone / m.lessons.length) * 100 : 0;
          return (
            <div key={m.id} className={`card overflow-hidden ${ch.open ? "" : "opacity-80"}`}>
              <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-5 py-3.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    ch.open && chapterPct === 100 ? "bg-emerald-500/15 text-emerald-300" : ch.open ? "bg-brand-500/15 text-brand-300" : "bg-white/[0.05] text-slate-500"
                  }`}
                >
                  {ch.open ? mi + 1 : <Icon name="lock" className="h-3.5 w-3.5" />}
                </span>
                <span className="font-semibold text-white">{m.title}</span>
                {ch.open && unlock !== "full" && REASON[ch.reason]}
                {!ch.open && m.unlockMode === "AUTO" && <span className="pill bg-white/[0.05] text-slate-400">Unlocks after Chapter {mi}</span>}
                {ch.open && m.lessons.length > 0 && (
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                      <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-400" style={{ width: `${chapterPct}%` }} />
                    </span>
                    {lessonsDone}/{m.lessons.length}
                  </span>
                )}
                {ch.expiresAt && <span className="text-xs text-slate-500">until {formatDate(ch.expiresAt)}</span>}
                {!ch.open && user && (
                  <div className="ml-auto">
                    <AccessButton course={course} moduleId={m.id} status={ch.status} expiresAt={ch.grantExpiresAt} onChange={load} compact label="Request this chapter" />
                  </div>
                )}
              </div>
              <ul>
                {m.lessons.map((l, li) => (
                  <li key={l.id} className="border-b border-white/[0.04] last:border-0">
                    {ch.open ? (
                      <Link href={`/courses/${course.slug}/${l.id}`} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.03]">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${done.has(l.id) ? "bg-emerald-500/15 text-emerald-300" : "border-2 border-ink-600"}`}>
                          {done.has(l.id) && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="w-6 font-mono text-[11px] text-slate-600">{String(li + 1).padStart(2, "0")}</span>
                        <span className="text-slate-200 transition group-hover:text-white">{l.title}</span>
                        {l.videoUrl && (
                          <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                            <Icon name="play" className="h-3 w-3" /> video
                          </span>
                        )}
                        <Icon name="chevron-right" className={`h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300 ${l.videoUrl ? "" : "ml-auto"}`} />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-5 py-3 text-slate-500">
                        <Icon name="lock" className="h-4 w-4 text-slate-600" />
                        <span className="w-6 font-mono text-[11px] text-slate-700">{String(li + 1).padStart(2, "0")}</span>
                        {l.title}
                        {l.videoUrl && (
                          <span className="ml-auto flex items-center gap-1 text-xs">
                            <Icon name="play" className="h-3 w-3" /> video
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
