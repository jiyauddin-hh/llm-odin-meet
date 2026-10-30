// Loads the Machine Learning course from content/ml/part*.json into a running
// Quantum Code (default http://localhost:7319): the "Machine Learning" subject
// with its chapters and topics, every practice question (verified and
// published), and the course with one lesson (plus quiz) per topic.
// Then the ML reels (content/ml-reels.json), each linked to a practice
// question of its topic. Safe to re-run: existing questions and reels are
// kept and lesson ids are reused.
//   node scripts/ml-import.js            everything
//   node scripts/ml-import.js --reels    only the subject structure and reels
import "../src/lib/env.js";
import { readdirSync, readFileSync } from "node:fs";
import { prisma } from "../src/lib/db.js";

const A = `http://localhost:${process.env.PORT || 7319}/api`;
const DIR = new URL("../../content/ml/", import.meta.url);
const SUBJECT = "Machine Learning";
const read = (f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
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
subject ||= (await call("/manage/subjects", "POST", { name: SUBJECT, icon: "🤖" })).subject;
for (const [chapterName, topics] of SYLLABUS) {
  let chapter = await prisma.chapter.findFirst({ where: { subjectId: subject.id, name: chapterName } });
  chapter ||= (await call("/manage/chapters", "POST", { name: chapterName, subjectId: subject.id })).chapter;
  for (const topic of topics) {
    if (!(await prisma.topic.findFirst({ where: { chapterId: chapter.id, name: topic } }))) {
      await call("/manage/topics", "POST", { name: topic, chapterId: chapter.id });
    }
  }
}

const reelsOnly = process.argv.includes("--reels");
if (!reelsOnly) {
// 2. New questions → drafts → published (publishing re-runs every reference solution).
const existing = new Map((await prisma.problem.findMany({ where: { slug: { in: questions.map((q) => q.slug) } }, select: { id: true, slug: true } })).map((p) => [p.slug, p.id]));
const fresh = questions.filter((q) => !existing.has(q.slug));
if (fresh.length) {
  const bulk = await call("/manage/bulk", "POST", { questions: fresh });
  bulk.report.filter((r) => !r.ok).forEach((r) => console.log("Upload failed:", r.title, r.error));
  const created = bulk.report.filter((r) => r.ok);
  let published = 0;
  for (let i = 0; i < created.length; i += 6) {
    await Promise.all(
      created.slice(i, i + 6).map(async (r) => {
        try {
          await call(`/manage/problems/${r.id}/publish`, "POST", { comment: "Machine Learning course import" });
          published++;
        } catch (e) {
          console.log("Publish failed:", r.title, e.message);
        }
        existing.set(fresh[r.index - 1].slug, r.id);
      }),
    );
  }
  console.log(`Questions: ${created.length} uploaded, ${published} published.`);
} else console.log("Questions: all already imported.");

// 3. The course: one chapter per syllabus chapter, one lesson per topic. Chapter 1 is a free preview.
const course = (await call("/admin/courses")).courses.find((c) => c.slug === "machine-learning");
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
await call(`/admin/courses/${course.id}`, "PUT", {
  slug: full.slug,
  title: "Machine Learning",
  description:
    "Complete Machine Learning from zero to deployment: NumPy & pandas, the maths, regression, classification, trees, ensembles, SVM, clustering, PCA, neural networks and deep learning. Flowcharts and interactive diagrams in every lesson, quizzes and coding practice.",
  level: "Intermediate",
  icon: full.icon,
  published: true,
  order: full.order,
  modules,
});
const total = modules.reduce((n, m) => n + m.lessons.length, 0);
console.log(`Course: ${modules.length} chapters, ${total} lessons, ${modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.quiz.length, 0), 0)} quiz questions.`);
}

// 4. Reels: new ones are created and published (which queues their MP4); existing ones only get a
// practice link if they had none.
const reels = JSON.parse(readFileSync(new URL("../ml-reels.json", DIR), "utf8"));
const topics = await prisma.topic.findMany({ where: { chapter: { subjectId: subject.id } }, include: { chapter: true } });
const practiceFor = async (topicId) =>
  (await prisma.problem.findFirst({ where: { topicId, published: true }, orderBy: [{ difficulty: "asc" }, { id: "asc" }], select: { slug: true } }))?.slug ?? null;
let made = 0;
for (const { subject: _s, chapter, topic, ...reel } of reels) {
  const topicId = topics.find((t) => t.chapter.name === chapter && t.name === topic)?.id ?? null;
  const practiceSlug = reel.practiceSlug || (topicId && (await practiceFor(topicId)));
  const old = await prisma.reel.findUnique({ where: { slug: reel.slug } });
  if (old) {
    if (!old.practiceSlug && practiceSlug) {
      await prisma.reel.update({ where: { id: old.id }, data: { practiceSlug } });
      if (old.status === "PUBLISHED") await call(`/manage/reels/${old.id}/render`, "POST"); // the end card changed
    }
    continue;
  }
  const { id } = await call("/manage/reels", "POST", { ...reel, topicId, practiceSlug });
  await call(`/manage/reels/${id}/publish`, "POST");
  made++;
}
console.log(`Reels: ${made} created and published, ${reels.length - made} already there.`);
await prisma.$disconnect();
