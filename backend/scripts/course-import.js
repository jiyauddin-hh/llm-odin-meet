// Loads a course from content/<course>/ into a running Quantum Code (default
// http://localhost:7319): course.json describes it, syllabus.json lists chapters
// and topics, and part*.json hold lessons (with quizzes) and practice questions.
// Creates the question subject with its chapters and topics, uploads and
// publishes every practice question (publishing re-runs each reference
// solution), and fills the course with one lesson per topic. The course is
// created on the first run. Safe to re-run: existing questions are kept and
// lesson ids are reused, so learners keep their progress.
//   node scripts/course-import.js system-design
import "../src/lib/env.js";
import { readdirSync, readFileSync } from "node:fs";
import { prisma } from "../src/lib/db.js";

const A = `http://localhost:${process.env.PORT || 7319}/api`;
const DIR = new URL(`../../content/${process.argv[2]}/`, import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
const { subject: SUBJECT, subjectIcon, slugPrefix: _p, ...COURSE } = read("course.json");
const SYLLABUS = read("syllabus.json");
const parts = readdirSync(DIR).filter((f) => /^part\d+\.json$/.test(f)).sort().map(read);
const lessons = parts.flatMap((p) => p.lessons);
const questions = parts.flatMap((p) => p.questions);

const login = await fetch(`${A}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ login: process.env.ADMIN_LOGIN || "admin", password: process.env.ADMIN_PASSWORD || "admin123" }),
});
const { token } = await login.json();
if (!token) throw new Error("Admin login failed");
async function call(path, method = "GET", body) {
  const r = await fetch(A + path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${d.error}`);
  return d;
}

// 1. Subject → chapters → topics, in syllabus order.
let subject = await prisma.subject.findFirst({ where: { name: SUBJECT } });
subject ||= (await call("/manage/subjects", "POST", { name: SUBJECT, icon: subjectIcon })).subject;
for (const [chapterName, topics] of SYLLABUS) {
  let chapter = await prisma.chapter.findFirst({ where: { subjectId: subject.id, name: chapterName } });
  chapter ||= (await call("/manage/chapters", "POST", { name: chapterName, subjectId: subject.id })).chapter;
  for (const topic of topics) {
    if (!(await prisma.topic.findFirst({ where: { chapterId: chapter.id, name: topic } }))) {
      await call("/manage/topics", "POST", { name: topic, chapterId: chapter.id });
    }
  }
}

// 2. New questions → drafts, uploaded in batches (the endpoint caps the request size).
const slugs = questions.map((q) => q.slug);
const known = new Set((await prisma.problem.findMany({ where: { slug: { in: slugs } }, select: { slug: true } })).map((p) => p.slug));
const fresh = questions.filter((q) => !known.has(q.slug));
let uploaded = 0;
for (let i = 0; i < fresh.length; i += 10) {
  const bulk = await call("/manage/bulk", "POST", { questions: fresh.slice(i, i + 10) });
  bulk.report.filter((r) => !r.ok).forEach((r) => console.log("Upload failed:", r.title, r.error));
  uploaded += bulk.report.filter((r) => r.ok).length;
}

// Then publish every draft that isn't live yet, including ones left by an interrupted run
// (publishing re-runs every reference solution).
const drafts = await prisma.problem.findMany({ where: { slug: { in: slugs }, published: false }, select: { id: true, title: true } });
let published = 0;
for (let i = 0; i < drafts.length; i += 6) {
  await Promise.all(
    drafts.slice(i, i + 6).map((d) =>
      call(`/manage/problems/${d.id}/publish`, "POST", { comment: `${COURSE.title} course import` })
        .then(() => published++)
        .catch((e) => console.log("Publish failed:", d.title, e.message)),
    ),
  );
}
const existing = new Map((await prisma.problem.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })).map((p) => [p.slug, p.id]));
console.log(`Questions: ${uploaded} uploaded, ${published} of ${drafts.length} drafts published, ${existing.size} in total.`);

// 3. The course: one chapter per syllabus chapter, one lesson per topic. Chapter 1 is a free preview.
const all = (await call("/admin/courses")).courses;
let course = all.find((c) => c.slug === COURSE.slug);
course ||= (await call("/admin/courses", "POST", { ...COURSE, order: Math.max(0, ...all.map((c) => c.order)) + 1 })).course;
const full = (await call(`/admin/courses/${course.id}`)).course;
const oldModule = new Map(full.modules.map((m) => [m.title, m]));
const modules = SYLLABUS.map(([chapter, topics], mi) => {
  const old = oldModule.get(chapter);
  return {
    id: old?.id,
    title: chapter,
    unlockMode: old?.unlockMode || (mi === 0 ? "FREE" : "PERMISSION"),
    lessons: topics.map((topic) => {
      const l = lessons.find((x) => x.chapter === chapter && x.topic === topic);
      if (!l) console.log("Missing lesson:", chapter, "/", topic);
      return {
        id: old?.lessons.find((x) => x.title === topic)?.id,
        title: topic,
        content: l?.content || "",
        videoUrl: null,
        quiz: l?.quiz || [],
        problemIds: questions.filter((q) => q.chapter === chapter && q.topic === topic).map((q) => existing.get(q.slug)).filter(Boolean),
      };
    }),
  };
});
await call(`/admin/courses/${course.id}`, "PUT", { ...COURSE, icon: full.icon, published: true, order: full.order, modules });
const total = modules.reduce((n, m) => n + m.lessons.length, 0);
console.log(`Course: ${modules.length} chapters, ${total} lessons, ${modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.quiz.length, 0), 0)} quiz questions.`);
await prisma.$disconnect();
