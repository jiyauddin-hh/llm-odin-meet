// The daily AI class. Students see what's on today and join it like any
// classroom; admins set the schedule, start a class now, or stop one.
// The class itself runs in ../lib/aiTeacher.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { ttsAvailable } from "../lib/narration.js";
import { brainAvailable, CLAUDE_BIN } from "../lib/aiTeacher/brain.js";
import { FACE_FILE, faceAvailable } from "../lib/aiTeacher/face.js";
import {
  courseLessons, createAiClass, getAiSettings, runningSession, saveAiSettings, scheduledStart, sessionFor, stopAiClass,
} from "../lib/aiTeacher/index.js";

export const publicRouter = Router();
export const adminRouter = Router();

const shape = (row) => ({
  id: row.id,
  title: row.title,
  status: row.status,
  startsAt: row.startsAt,
  endedAt: row.endedAt,
  error: row.error,
  code: row.classroom?.status === "LIVE" ? row.classroom.code : null,
  lesson: row.lesson ? { id: row.lesson.id, title: row.lesson.title } : null,
  stage: sessionFor(row.id)?.stage ?? null,
  questions: Array.isArray(row.questions) ? row.questions.length : 0,
});

const include = { classroom: { select: { code: true, status: true } }, lesson: { select: { id: true, title: true } } };

// The teacher's face, used as the AI teacher's profile picture.
publicRouter.get("/face", (_req, res) => {
  res.sendFile(FACE_FILE, { maxAge: "1d" }, (err) => err && !res.headersSent && res.status(404).end());
});

// What's on: the class open now (if any) and the next scheduled start.
publicRouter.get("/today", requireAuth, async (_req, res) => {
  const settings = await getAiSettings();
  const current = await prisma.aiClass.findFirst({
    where: { status: { in: ["PREPARING", "READY", "LIVE"] } },
    orderBy: { startsAt: "desc" },
    include,
  });
  let next = null;
  for (let d = 0; d < 8 && !next; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const at = scheduledStart(settings, day);
    if (at && at.getTime() > Date.now() && (!current || at.getTime() !== current.startsAt.getTime())) next = at;
  }
  res.json({
    teacher: { name: settings.teacherName, avatarUrl: "/api/ai-class/face" },
    enabled: settings.enabled,
    current: current && shape(current),
    next,
  });
});

adminRouter.get("/", requireAdmin, async (_req, res) => {
  const settings = await getAiSettings();
  const classes = await prisma.aiClass.findMany({ orderBy: { startsAt: "desc" }, take: 30, include });
  res.json({
    settings,
    health: {
      brain: brainAvailable(),
      claudeBin: CLAUDE_BIN,
      voice: ttsAvailable(),
      face: faceAvailable(),
      running: runningSession()?.id ?? null,
    },
    classes: classes.map(shape),
  });
});

adminRouter.get("/lessons", requireAdmin, async (_req, res) => {
  const settings = await getAiSettings();
  const lessons = await courseLessons(settings.courseSlug);
  res.json({ lessons: lessons.map((l) => ({ id: l.id, title: l.title, chapter: l.module.title })) });
});

adminRouter.put("/settings", requireAdmin, async (req, res) => {
  const body = z
    .object({
      enabled: z.boolean(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
      days: z.array(z.number().int().min(0).max(6)).min(1),
      minutes: z.number().int().min(5).max(60),
      prepMinutes: z.number().int().min(5).max(120),
      teacherName: z.string().trim().min(1).max(40),
      courseSlug: z.string().trim().min(1).max(80),
    })
    .parse(req.body);
  if (!(await prisma.course.findUnique({ where: { slug: body.courseSlug } }))) return res.status(400).json({ error: "No course with that slug" });
  await saveAiSettings(body);
  res.json({ settings: body });
});

// Start a class now (or in a few minutes), optionally on a chosen lesson.
adminRouter.post("/start", requireAdmin, async (req, res) => {
  const { lessonId, inMinutes } = z
    .object({ lessonId: z.number().int().optional(), inMinutes: z.number().int().min(0).max(120).default(0) })
    .parse(req.body);
  try {
    const row = await createAiClass({ lessonId, startsAt: new Date(Date.now() + inMinutes * 60_000) });
    const full = await prisma.aiClass.findUnique({ where: { id: row.id }, include });
    res.status(201).json({ class: shape(full) });
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

adminRouter.post("/:id/stop", requireAdmin, async (req, res) => {
  const ok = await stopAiClass(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});
