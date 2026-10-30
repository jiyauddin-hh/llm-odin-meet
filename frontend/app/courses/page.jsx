"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import AccessButton from "@/components/AccessButton";
import { EmptyState, ErrorBox, LEVEL_STYLE, PageHeader, ProgressBar, ProgressRing, Skeleton, formatDate } from "@/components/ui";
import Icon from "@/components/Icons";

const BADGE = {
  full: (
    <span className="pill bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25">
      <Icon name="unlock" className="h-3 w-3" /> Unlocked
    </span>
  ),
  partial: (
    <span className="pill bg-sky-500/12 text-sky-300 ring-1 ring-inset ring-sky-500/25">
      <Icon name="unlock" className="h-3 w-3" /> Partly unlocked
    </span>
  ),
  preview: (
    <span className="pill bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-500/25">
      <Icon name="sparkles" className="h-3 w-3" /> Free preview
    </span>
  ),
  none: (
    <span className="pill bg-white/[0.05] text-slate-400">
      <Icon name="lock" className="h-3 w-3" /> Locked
    </span>
  ),
};

// A different glow per card so the grid doesn't look repetitive.
const GLOWS = ["from-brand-500/25 to-indigo-500/5", "from-accent-500/20 to-sky-500/5", "from-emerald-500/20 to-teal-500/5", "from-fuchsia-500/20 to-pink-500/5", "from-amber-500/20 to-orange-500/5"];

function CourseSkeleton() {
  return (
    <div className="card p-5">
      <Skeleton className="h-12 w-12 rounded-xl" />
      <Skeleton className="mt-4 h-5 w-2/3" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-5/6" />
      <Skeleton className="mt-6 h-10 w-full" />
    </div>
  );
}

export default function CoursesPage() {
  const { user, loading } = useAuth();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    api("/courses").then((d) => setCourses(d.courses)).catch((e) => setError(e.message));
  }, [loading, user]);

  const setPending = (id) => setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, access: { status: "pending" } } : c)));
  const mine = courses?.filter((c) => c.unlock === "full" || c.unlock === "partial") ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 page-enter">
      <PageHeader
        eyebrow={
          <>
            <Icon name="book-open" className="h-3.5 w-3.5" /> Courses
          </>
        }
        title="Learn step by step"
        subtitle="Structured chapters with lessons, quizzes, interactive diagrams and linked practice. The first chapter of every course is a free preview."
        actions={
          user &&
          courses && (
            <div className="card flex items-center gap-3 px-4 py-2.5 text-sm">
              <Icon name="unlock" className="h-4 w-4 text-emerald-300" />
              <span className="text-slate-300">
                <span className="font-semibold text-white">{mine.length}</span> of {courses.length} courses unlocked
              </span>
            </div>
          )
        }
      />
      <ErrorBox error={error} className="mt-6" />

      {!courses ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <CourseSkeleton key={i} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="card mt-8">
          <EmptyState icon="book-open" title="No courses yet" text="Check back soon." />
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => {
            const canStart = c.unlock !== "none";
            const inProgress = c.progress && (c.unlock === "full" || c.unlock === "partial");
            return (
              <div key={c.id} className="card-hover group relative flex flex-col overflow-hidden p-5 animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br blur-3xl transition-opacity group-hover:opacity-100 ${GLOWS[i % GLOWS.length]} opacity-70`} />
                <div className="relative flex items-start justify-between">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-3xl ring-1 ring-inset ring-white/[0.08]">{c.icon}</span>
                  <div className="flex items-center gap-2">
                    {inProgress && <ProgressRing percent={c.progress.percent} size={40} stroke={4} className="text-[10px]" />}
                    {BADGE[c.unlock]}
                  </div>
                </div>
                <Link href={`/courses/${c.slug}`} className="relative mt-4 text-lg font-semibold text-white transition group-hover:text-brand-200">
                  {c.title}
                </Link>
                <div className="relative mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className={`pill ${LEVEL_STYLE[c.level] || "bg-ink-700"}`}>{c.level}</span>
                  <span className="flex items-center gap-1">
                    <Icon name="layers" className="h-3.5 w-3.5" /> {c.moduleCount} chapters
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="book" className="h-3.5 w-3.5" /> {c.lessonCount} lessons
                  </span>
                </div>
                <p className="relative mt-3 flex-1 text-sm leading-relaxed text-slate-400">{c.description}</p>

                <div className="relative mt-5 space-y-2.5">
                  {canStart && (
                    <>
                      {inProgress && (
                        <div>
                          <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                            <span>
                              {c.progress.done}/{c.progress.total} lessons
                              {c.unlock === "partial" && ` · ${c.openChapters}/${c.moduleCount} chapters open`}
                            </span>
                            <span className="font-semibold text-white">{c.progress.percent}%</span>
                          </div>
                          <ProgressBar percent={c.progress.percent} size="sm" />
                        </div>
                      )}
                      <Link href={`/courses/${c.slug}`} className="btn-primary w-full">
                        {c.unlock === "preview" ? "Try the free chapter" : c.progress?.done ? "Continue" : "Start course"}
                        <Icon name="arrow-right" className="h-4 w-4" />
                      </Link>
                      {c.unlock === "full" && c.access.expiresAt && <p className="text-center text-xs text-slate-500">Access until {formatDate(c.access.expiresAt)}</p>}
                    </>
                  )}
                  {c.unlock !== "full" && (
                    <AccessButton
                      course={c}
                      status={c.access.status}
                      expiresAt={c.access.expiresAt}
                      label={canStart ? "Request the full course" : undefined}
                      quiet={canStart}
                      onChange={() => setPending(c.id)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
