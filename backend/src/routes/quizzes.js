// Live quizzes: admins write them and launch them; anyone logged in joins a
// live one with its code. The game itself runs in ../lib/quiz.js.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { closeQuiz, gameInfo, launchQuiz } from "../lib/quiz.js";
import { generationStatus, startGeneration } from "../lib/quizGen.js";

const router = Router();

const question = z.object({
  question: z.string().trim().min(1).max(1000),
  code: z.string().max(4000).optional().default(""),
  options: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  answer: z.number().int().min(0),
  explanation: z.string().max(2000).optional().default(""),
});

const body = z
  .object({
    title: z.string().trim().min(1).max(120),
    timeSec: z.number().int().min(5).max(120).default(20),
    questions: z.array(question).max(100).default([]),
  })
  .refine((b) => b.questions.every((q) => q.answer < q.options.length), { message: "Every question needs its correct option ticked", path: ["questions"] });

const summary = (q) => ({
  id: q.id,
  title: q.title,
  timeSec: q.timeSec,
  status: q.status,
  code: q.status === "LIVE" ? q.code : null,
  questions: Array.isArray(q.questions) ? q.questions.length : 0,
  players: Array.isArray(q.results) ? q.results.length : 0,
  winners: Array.isArray(q.results) ? q.results.slice(0, 3) : [],
  updatedAt: q.updatedAt,
  endedAt: q.endedAt,
  host: q.host,
});

async function ownQuiz(req, res) {
  const quiz = await prisma.quiz.findUnique({ where: { id: Number(req.params.id) } });
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return null;
  }
  if (quiz.hostId !== req.user.id && req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Only the quiz's host can do that" });
    return null;
  }
  return quiz;
}

// Winners of the most recent quizzes (for the quiz page).
router.get("/recent", requireAuth, async (_req, res) => {
  const rows = await prisma.quiz.findMany({
    where: { status: "ENDED" },
    orderBy: { endedAt: "desc" },
    take: 12,
    include: { host: { select: { name: true, username: true } } },
  });
  res.json({ quizzes: rows.filter((q) => Array.isArray(q.results) && q.results.length).slice(0, 6).map(summary) });
});

// A live game by its join code.
router.get("/code/:code", requireAuth, (req, res) => {
  const info = gameInfo(req.params.code);
  if (!info) return res.status(404).json({ error: "No live quiz with that code" });
  res.json({ game: info });
});

// ---- AI question generator ----

// Lessons to base questions on, grouped by course.
router.get("/lessons", requireAdmin, async (_req, res) => {
  const courses = await prisma.course.findMany({
    orderBy: { order: "asc" },
    select: {
      title: true,
      modules: { orderBy: { order: "asc" }, select: { title: true, lessons: { orderBy: { order: "asc" }, select: { id: true, title: true } } } },
    },
  });
  res.json({
    courses: courses.map((c) => ({ title: c.title, lessons: c.modules.flatMap((m) => m.lessons.map((l) => ({ id: l.id, title: `${m.title} · ${l.title}` }))) })),
  });
});

router.post("/generate", requireAdmin, async (req, res) => {
  const opts = z
    .object({
      prompt: z.string().trim().max(2000).default(""),
      count: z.number().int().min(1).max(30).default(20),
      difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
      lessonId: z.number().int().nullable().optional(),
      existing: z.array(z.string().max(1000)).max(100).default([]),
    })
    .parse(req.body);
  let lesson = null;
  if (opts.lessonId) {
    const l = await prisma.lesson.findUnique({ where: { id: opts.lessonId }, include: { module: { include: { course: { select: { title: true } } } } } });
    if (!l) return res.status(404).json({ error: "Lesson not found" });
    lesson = { title: l.title, course: l.module.course.title, content: l.content };
  }
  if (!opts.prompt && !lesson) return res.status(400).json({ error: "Describe the questions you want, or pick a lesson" });
  try {
    res.status(202).json({ jobId: startGeneration(req.user.id, { ...opts, lesson }) });
  } catch (e) {
    res.status(429).json({ error: e.message });
  }
});

router.get("/generate/:jobId", requireAdmin, (req, res) => {
  const job = generationStatus(req.params.jobId, req.user.id);
  if (!job) return res.status(404).json({ error: "That generation has expired" });
  res.json(job);
});

router.get("/mine", requireAdmin, async (req, res) => {
  const rows = await prisma.quiz.findMany({ where: { hostId: req.user.id }, orderBy: { updatedAt: "desc" }, take: 100 });
  res.json({ quizzes: rows.map(summary) });
});

router.post("/", requireAdmin, async (req, res) => {
  const data = body.parse(req.body);
  const quiz = await prisma.quiz.create({ data: { ...data, hostId: req.user.id } });
  res.status(201).json({ quiz: { ...summary(quiz), questions: quiz.questions } });
});

router.get("/:id", requireAdmin, async (req, res) => {
  const quiz = await ownQuiz(req, res);
  if (quiz) res.json({ quiz: { ...summary(quiz), questions: quiz.questions, results: quiz.results } });
});

router.put("/:id", requireAdmin, async (req, res) => {
  const quiz = await ownQuiz(req, res);
  if (!quiz) return;
  const data = body.parse(req.body);
  const saved = await prisma.quiz.update({ where: { id: quiz.id }, data });
  res.json({ quiz: { ...summary(saved), questions: saved.questions } });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const quiz = await ownQuiz(req, res);
  if (!quiz) return;
  closeQuiz(quiz.id);
  await prisma.quiz.delete({ where: { id: quiz.id } });
  res.json({ ok: true });
});

// Opens the quiz for players and returns its join code.
router.post("/:id/launch", requireAdmin, async (req, res) => {
  const quiz = await ownQuiz(req, res);
  if (!quiz) return;
  try {
    res.json({ code: await launchQuiz(quiz) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
