"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { Markdown } from "@/components/ProblemStatement";
import WatchReels from "@/components/reels/WatchReels";
import LessonQuiz from "@/components/LessonQuiz";
import { Difficulty, ErrorBox, ProgressBar, Spinner } from "@/components/ui";
import Icon from "@/components/Icons";

/** Turns a YouTube watch/short link into an embeddable URL, or null. */
function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    let id = null;
    if (u.hostname.includes("youtu.be")) id = u.pathname.slice(1);
    else if (u.hostname.includes("youtube.com")) id = u.searchParams.get("v") || u.pathname.split("/").pop();
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

export default function LessonPage({ params }) {
  const { user } = useRequireAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setData(null);
    setNavOpen(false);
    api(`/courses/${params.slug}/lessons/${params.lessonId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [user, params.slug, params.lessonId]);

  if (error)
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <ErrorBox error={error} />
        <Link href={`/courses/${params.slug}`} className="btn-ghost">
          <Icon name="arrow-left" className="h-4 w-4" /> Back to course
        </Link>
      </div>
    );
  if (!data) return <Spinner />;

  const { course, lesson, problems, completed, chapters, prev, next, quizScore } = data;
  const done = new Set(completed);
  const openModules = new Set(chapters.filter((c) => c.open).map((c) => c.moduleId));
  const isDone = done.has(lesson.id);
  const total = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const embed = lesson.videoUrl && youtubeEmbed(lesson.videoUrl);
  const pct = total ? Math.round((completed.length / total) * 100) : 0;

  const toggle = async () => {
    setBusy(true);
    try {
      const d = await api(`/courses/${course.slug}/lessons/${lesson.id}/complete`, { method: "POST", body: { completed: !isDone } });
      // Finishing a chapter can auto-unlock the next one.
      const nowOpen = new Set(d.chapters.filter((c) => c.open).map((c) => c.moduleId));
      const nextModule = course.modules.find((m) => m.lessons.some((l) => l.id === next?.id));
      setData({
        ...data,
        chapters: d.chapters,
        completed: isDone ? completed.filter((id) => id !== lesson.id) : [...completed, lesson.id],
        next: next && { ...next, open: nextModule ? nowOpen.has(nextModule.id) : next.open },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sidebar = (
    <>
      <Link href={`/courses/${course.slug}`} className="flex items-center gap-2.5 font-semibold text-white transition hover:text-brand-200">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] text-lg ring-1 ring-inset ring-white/[0.08]">{course.icon}</span>
        <span className="truncate">{course.title}</span>
      </Link>
      <div className="mt-4 mb-1.5 flex justify-between text-xs text-slate-400">
        <span>
          {completed.length}/{total} lessons
        </span>
        <span className="font-semibold text-white">{pct}%</span>
      </div>
      <ProgressBar percent={pct} size="sm" />
      <nav className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {course.modules.map((m, mi) => (
          <div key={m.id}>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              {!openModules.has(m.id) && <Icon name="lock" className="h-3 w-3" />}
              <span className="text-slate-600">{mi + 1}.</span> {m.title}
            </div>
            {m.lessons.map((l) =>
              !openModules.has(m.id) ? (
                <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-600">
                  <Icon name="lock" className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{l.title}</span>
                </div>
              ) : (
                <Link
                  key={l.id}
                  href={`/courses/${course.slug}/${l.id}`}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
                    l.id === lesson.id ? "bg-brand-500/15 text-white ring-1 ring-inset ring-brand-500/30" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${done.has(l.id) ? "bg-emerald-500/20 text-emerald-300" : "border-2 border-ink-600"}`}>
                    {done.has(l.id) && <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{l.title}</span>
                </Link>
              ),
            )}
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[290px_1fr]">
      {/* Mobile course nav toggle */}
      <div className="lg:hidden">
        <button className="btn-ghost w-full justify-between" onClick={() => setNavOpen((o) => !o)}>
          <span className="flex items-center gap-2">
            <Icon name="list" className="h-4 w-4" /> Course outline · {pct}%
          </span>
          <Icon name="chevron-down" className={`h-4 w-4 transition ${navOpen ? "rotate-180" : ""}`} />
        </button>
        {navOpen && <aside className="card mt-3 animate-fade-in p-4">{sidebar}</aside>}
      </div>

      <aside className="card hidden h-fit p-4 lg:sticky lg:top-24 lg:block">{sidebar}</aside>

      <article className="min-w-0 page-enter">
        <div className="card p-6 sm:p-9">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">
            <Icon name="book-open" className="h-3.5 w-3.5" /> {lesson.module}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{lesson.title}</h1>
          <WatchReels topicIds={problems.map((p) => p.topicId)} className="mt-4" />

          {lesson.videoUrl &&
            (embed ? (
              <div className="mt-6 aspect-video max-w-full overflow-hidden rounded-2xl border border-white/[0.08] shadow-card">
                <iframe src={embed} title={lesson.title} className="h-full w-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            ) : (
              <a href={lesson.videoUrl} target="_blank" rel="noreferrer" className="btn-ghost mt-6">
                <Icon name="play" className="h-4 w-4" /> Watch the video
              </a>
            ))}

          <Markdown size="base" className="mt-7 prose-table:text-sm prose-headings:scroll-mt-24">
            {/* The lesson title is already shown above; drop a matching first heading. */}
            {lesson.content.replace(new RegExp(`^#\\s+${lesson.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`), "")}
          </Markdown>

          <LessonQuiz key={lesson.id} courseSlug={course.slug} lessonId={lesson.id} quiz={lesson.quiz} initialScore={quizScore} />

          {problems.length > 0 && (
            <div className="card-glow mt-8 p-5">
              <h2 className="relative flex items-center gap-2 font-semibold text-white">
                <Icon name="code" className="h-4 w-4 text-brand-300" /> Practice what you learned
              </h2>
              <ul className="relative mt-3 divide-y divide-white/[0.05]">
                {problems.map((p) => (
                  <li key={p.id}>
                    <Link href={`/problems/${p.slug}`} className="group flex items-center gap-3 py-2.5 transition">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full ${p.solved ? "bg-emerald-500/15 text-emerald-300" : "border-2 border-ink-600"}`}>
                        {p.solved && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="text-slate-100 group-hover:text-brand-200">{p.title}</span>
                      <Difficulty value={p.difficulty} />
                      <Icon name="arrow-right" className="ml-auto h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-brand-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-6">
            <button onClick={toggle} disabled={busy} className={isDone ? "btn-ghost" : "btn-success"}>
              <Icon name={isDone ? "check-circle" : "check"} className="h-4 w-4" />
              {isDone ? "Completed · undo" : "Mark as complete"}
            </button>
            <div className="ml-auto flex gap-2">
              {prev && (
                <Link href={`/courses/${course.slug}/${prev.id}`} className="btn-ghost">
                  <Icon name="arrow-left" className="h-4 w-4" /> Previous
                </Link>
              )}
              {next?.open ? (
                <Link href={`/courses/${course.slug}/${next.id}`} className="btn-primary max-w-[16rem]">
                  <span className="truncate">Next: {next.title}</span>
                  <Icon name="arrow-right" className="h-4 w-4 shrink-0" />
                </Link>
              ) : next ? (
                <Link href={`/courses/${course.slug}`} className="btn-ghost" title="The next chapter is locked">
                  <Icon name="lock" className="h-4 w-4" /> Next chapter is locked
                </Link>
              ) : (
                <Link href={`/courses/${course.slug}`} className="btn-primary">
                  <Icon name="award" className="h-4 w-4" /> Finish course
                </Link>
              )}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
