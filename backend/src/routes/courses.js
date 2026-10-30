import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { optionalAuth, requireAuth } from "../lib/auth.js";
import { courseProgress, courseState, MODULES_FOR_STATE } from "../lib/courses.js";

const router = Router();

const withModules = { modules: MODULES_FOR_STATE };

router.get("/", optionalAuth, async (req, res) => {
  const courses = await prisma.course.findMany({
    where: { published: true },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: withModules,
  });
  const progress = req.user ? await courseProgress(req.user.id, courses.map((c) => c.id)) : new Map();

  res.json({
    courses: await Promise.all(
      courses.map(async ({ modules, ...c }) => {
        const state = await courseState(req.user, { ...c, modules });
        return {
          ...c,
          moduleCount: modules.length,
          lessonCount: modules.reduce((n, m) => n + m.lessons.length, 0),
          access: state.access,
          unlock: state.level,
          openChapters: state.chapters.filter((ch) => ch.open).length,
          freeChapters: modules.filter((m) => m.unlockMode === "FREE").length,
          progress: progress.get(c.id) || null,
        };
      }),
    ),
  });
});

async function findCourse(slug) {
  return prisma.course.findFirst({ where: { slug, published: true }, include: withModules });
}

// The outline is public so people can see what they'd learn; lessons open per chapter.
router.get("/:slug", optionalAuth, async (req, res) => {
  const course = await findCourse(req.params.slug);
  if (!course) return res.status(404).json({ error: "Course not found" });
  const state = await courseState(req.user, course);
  const { level, ...rest } = state;
  res.json({ course, unlock: level, ...rest });
});

// Ask for the whole course, or for one chapter with { moduleId }.
router.post("/:slug/request", requireAuth, async (req, res) => {
  const { moduleId } = z.object({ moduleId: z.number().int().optional() }).parse(req.body || {});
  const course = await findCourse(req.params.slug);
  if (!course) return res.status(404).json({ error: "Course not found" });
  const state = await courseState(req.user, course);
  if (state.level === "full") return res.status(400).json({ error: "You already have the whole course" });

  if (moduleId !== undefined) {
    const chapter = state.chapters.find((c) => c.moduleId === moduleId);
    if (!chapter) return res.status(404).json({ error: "Chapter not found" });
    if (chapter.open) return res.status(400).json({ error: "This chapter is already open" });
    await prisma.chapterRequest.upsert({
      where: { userId_moduleId: { userId: req.user.id, moduleId } },
      update: { status: "PENDING", createdAt: new Date(), decidedAt: null },
      create: { userId: req.user.id, moduleId },
    });
    return res.json({ ok: true });
  }

  await prisma.accessRequest.upsert({
    where: { userId_courseId: { userId: req.user.id, courseId: course.id } },
    update: { status: "PENDING", createdAt: new Date(), decidedAt: null },
    create: { userId: req.user.id, courseId: course.id },
  });
  res.json({ ok: true, access: { status: "pending" } });
});

const LOCKED_MESSAGE = {
  pending: "Your request for this chapter is waiting for an admin.",
  "finish-previous": "Finish the previous chapter to unlock this one.",
  expired: "Your access to this chapter has ended.",
  default: "This chapter is locked. Ask an admin for access.",
};

/** Loads a lesson only if it belongs to the course and its chapter is open for the user. */
async function loadLesson(req, res) {
  const course = await findCourse(req.params.slug);
  if (!course) return res.status(404).json({ error: "Course not found" }), null;
  const lessonId = Number(req.params.lessonId) || 0;
  const module = course.modules.find((m) => m.lessons.some((l) => l.id === lessonId));
  if (!module) return res.status(404).json({ error: "Lesson not found" }), null;
  const state = await courseState(req.user, course);
  const chapter = state.chapters.find((c) => c.moduleId === module.id);
  if (!chapter.open) {
    return res.status(403).json({ error: LOCKED_MESSAGE[chapter.status] || LOCKED_MESSAGE.default, chapter }), null;
  }
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  return { course, lesson, state };
}

router.get("/:slug/lessons/:lessonId", requireAuth, async (req, res) => {
  const found = await loadLesson(req, res);
  if (!found) return;
  const { course, lesson, state } = found;

  const ordered = course.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.title, moduleId: m.id })));
  const index = ordered.findIndex((l) => l.id === lesson.id);
  const openModules = new Set(state.chapters.filter((c) => c.open).map((c) => c.moduleId));
  const [problems, solves, quizScore] = await Promise.all([
    prisma.problem.findMany({
      where: { id: { in: lesson.problemIds }, published: true },
      select: { id: true, slug: true, title: true, difficulty: true, topicId: true },
    }),
    prisma.solve.findMany({ where: { userId: req.user.id, problemId: { in: lesson.problemIds } }, select: { problemId: true } }),
    prisma.quizScore.findUnique({ where: { userId_lessonId: { userId: req.user.id, lessonId: lesson.id } } }),
  ]);
  const solved = new Set(solves.map((s) => s.problemId));
  const neighbour = (l) => (l ? { id: l.id, title: l.title, open: openModules.has(l.moduleId) } : null);

  res.json({
    course: { id: course.id, slug: course.slug, title: course.title, icon: course.icon, modules: course.modules },
    chapters: state.chapters,
    // Answers stay on the server until the learner submits.
    lesson: { ...lesson, module: ordered[index].module, quiz: (lesson.quiz || []).map(({ question, options }) => ({ question, options })) },
    quizScore: quizScore && { best: quizScore.best, total: quizScore.total, attempts: quizScore.attempts },
    problems: problems.map((p) => ({ ...p, solved: solved.has(p.id) })),
    completed: state.completed,
    prev: neighbour(ordered[index - 1]),
    next: neighbour(ordered[index + 1]),
  });
});

router.post("/:slug/lessons/:lessonId/complete", requireAuth, async (req, res) => {
  const found = await loadLesson(req, res);
  if (!found) return;
  const { completed } = z.object({ completed: z.boolean() }).parse(req.body);
  const key = { userId: req.user.id, lessonId: found.lesson.id };
  if (completed) {
    await prisma.lessonProgress.upsert({ where: { userId_lessonId: key }, update: {}, create: key });
  } else {
    await prisma.lessonProgress.deleteMany({ where: key });
  }
  // Completing a chapter may auto-unlock the next one, so send fresh chapter states.
  const state = await courseState(req.user, found.course);
  const progress = (await courseProgress(req.user.id, [found.course.id])).get(found.course.id);
  res.json({ completed, progress, chapters: state.chapters });
});

// Checks quiz answers ({ answers: [optionIndex | null] }) and keeps the best score.
router.post("/:slug/lessons/:lessonId/quiz", requireAuth, async (req, res) => {
  const found = await loadLesson(req, res);
  if (!found) return;
  const quiz = found.lesson.quiz || [];
  if (!quiz.length) return res.status(400).json({ error: "This lesson has no quiz" });
  const { answers } = z.object({ answers: z.array(z.number().int().nullable()).length(quiz.length) }).parse(req.body);
  const results = quiz.map((q, i) => ({ chosen: answers[i], answer: q.answer, correct: answers[i] === q.answer, explanation: q.explanation }));
  const score = results.filter((r) => r.correct).length;
  const key = { userId: req.user.id, lessonId: found.lesson.id };
  const prev = await prisma.quizScore.findUnique({ where: { userId_lessonId: key } });
  const saved = await prisma.quizScore.upsert({
    where: { userId_lessonId: key },
    update: { best: Math.max(prev?.best ?? 0, score), total: quiz.length, attempts: { increment: 1 } },
    create: { ...key, best: score, total: quiz.length },
  });
  res.json({ score, total: quiz.length, results, quizScore: { best: saved.best, total: saved.total, attempts: saved.attempts } });
});

export default router;
