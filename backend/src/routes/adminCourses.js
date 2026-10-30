// Admin: courses, their content, who may open them, and access requests.
import { Router } from "express";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";
import { courseProgress, quizSchema } from "../lib/courses.js";
import { UPLOAD_DIR } from "./manageReels.js";

const router = Router();
router.use(requireAdmin);

const expiresSchema = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v.length === 10 ? `${v}T23:59:59` : v) : null));

// ---- Courses ----

router.get("/courses", async (_req, res) => {
  const [courses, pending] = await Promise.all([
    prisma.course.findMany({
      orderBy: [{ order: "asc" }, { id: "asc" }],
      include: {
        modules: { select: { _count: { select: { lessons: true } } } },
        _count: { select: { access: true } },
      },
    }),
    prisma.accessRequest.groupBy({ by: ["courseId"], where: { status: "PENDING" }, _count: true }),
  ]);
  const pendingMap = new Map(pending.map((p) => [p.courseId, p._count]));
  const chapterPending = await prisma.chapterRequest.findMany({ where: { status: "PENDING" }, select: { module: { select: { courseId: true } } } });
  for (const r of chapterPending) pendingMap.set(r.module.courseId, (pendingMap.get(r.module.courseId) || 0) + 1);
  res.json({
    courses: courses.map(({ modules, _count, ...c }) => ({
      ...c,
      lessonCount: modules.reduce((n, m) => n + m._count.lessons, 0),
      moduleCount: modules.length,
      learners: _count.access,
      pending: pendingMap.get(c.id) || 0,
    })),
  });
});

router.get("/courses/:id", async (req, res) => {
  const course = await prisma.course.findUnique({
    where: { id: Number(req.params.id) || 0 },
    include: {
      modules: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        include: { lessons: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
      },
    },
  });
  if (!course) return res.status(404).json({ error: "Course not found" });
  res.json({ course });
});

const lessonSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().trim().min(1).max(160),
  content: z.string().default(""),
  videoUrl: z.union([z.string().trim().url(), z.literal(""), z.null()]).optional(),
  problemIds: z.array(z.number().int()).default([]),
  quiz: quizSchema.nullish(),
});

const courseSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and - only"),
  title: z.string().trim().min(2).max(120),
  description: z.string().default(""),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
  icon: z.string().trim().min(1).max(8).default("📘"),
  published: z.boolean().default(true),
  order: z.number().int().default(0),
  modules: z
    .array(
      z.object({
        id: z.number().int().optional(),
        title: z.string().trim().min(1).max(160),
        unlockMode: z.enum(["PERMISSION", "FREE", "AUTO"]).default("PERMISSION"),
        lessons: z.array(lessonSchema),
      }),
    )
    .default([]),
});

const lessonData = (l, order) => ({
  title: l.title,
  content: l.content,
  videoUrl: l.videoUrl || null,
  problemIds: l.problemIds,
  quiz: l.quiz?.length ? l.quiz : null,
  order,
});

// Lesson images (diagrams, screenshots): send the file as the raw request body.
// SVG is left out because it can carry scripts.
const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
router.post("/uploads/image", express.raw({ type: Object.keys(IMAGE_TYPES), limit: "8mb" }), async (req, res) => {
  const ext = IMAGE_TYPES[req.headers["content-type"]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: "Upload a PNG, JPG, WebP or GIF image (max 8 MB)" });
  }
  await mkdir(`${UPLOAD_DIR}/lessons`, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(`${UPLOAD_DIR}/lessons/${name}`, req.body);
  res.status(201).json({ url: `/uploads/lessons/${name}` });
});

router.post("/courses", async (req, res) => {
  const { modules, ...data } = courseSchema.parse(req.body);
  const course = await prisma.course.create({
    data: {
      ...data,
      modules: {
        create: modules.map((m, mi) => ({
          title: m.title,
          order: mi,
          unlockMode: m.unlockMode,
          lessons: { create: m.lessons.map((l, li) => lessonData(l, li)) },
        })),
      },
    },
  });
  res.status(201).json({ course });
});

// Updates in place so lessons keep their ids, and learners keep their progress.
router.put("/courses/:id", async (req, res) => {
  const id = Number(req.params.id) || 0;
  const { modules, ...data } = courseSchema.parse(req.body);

  const course = await prisma.$transaction(async (tx) => {
    const existing = await tx.courseModule.findMany({ where: { courseId: id }, include: { lessons: { select: { id: true } } } });
    const moduleIds = new Set(existing.map((m) => m.id));
    const lessonIds = new Set(existing.flatMap((m) => m.lessons.map((l) => l.id)));
    const keepModules = new Set();
    const keepLessons = new Set();

    const course = await tx.course.update({ where: { id }, data });
    for (const [mi, m] of modules.entries()) {
      const mod =
        m.id && moduleIds.has(m.id)
          ? await tx.courseModule.update({ where: { id: m.id }, data: { title: m.title, order: mi, unlockMode: m.unlockMode } })
          : await tx.courseModule.create({ data: { courseId: id, title: m.title, order: mi, unlockMode: m.unlockMode } });
      keepModules.add(mod.id);
      for (const [li, l] of m.lessons.entries()) {
        const data = { ...lessonData(l, li), moduleId: mod.id };
        const lesson =
          l.id && lessonIds.has(l.id)
            ? await tx.lesson.update({ where: { id: l.id }, data })
            : await tx.lesson.create({ data });
        keepLessons.add(lesson.id);
      }
    }
    await tx.lesson.deleteMany({ where: { id: { in: [...lessonIds].filter((x) => !keepLessons.has(x)) } } });
    await tx.courseModule.deleteMany({ where: { id: { in: [...moduleIds].filter((x) => !keepModules.has(x)) } } });
    return course;
  });
  res.json({ course });
});

router.delete("/courses/:id", async (req, res) => {
  await prisma.course.delete({ where: { id: Number(req.params.id) || 0 } });
  res.json({ ok: true });
});

// ---- Access, by course ----

const isExpired = (row) => !!row.expiresAt && row.expiresAt <= new Date();
const userSelect = { id: true, username: true, name: true, email: true, avatarUrl: true };

// Everyone with whole-course or chapter access, with their progress.
router.get("/courses/:id/access", async (req, res) => {
  const courseId = Number(req.params.id) || 0;
  const [full, chapters, modules] = await Promise.all([
    prisma.courseAccess.findMany({ where: { courseId }, include: { user: { select: userSelect } } }),
    prisma.moduleAccess.findMany({ where: { module: { courseId } }, include: { user: { select: userSelect } } }),
    prisma.courseModule.findMany({ where: { courseId }, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, title: true } }),
  ]);
  const number = new Map(modules.map((m, i) => [m.id, i + 1]));
  const byUser = new Map();
  const entry = (user) => byUser.get(user.id) || byUser.set(user.id, { user, full: null, chapters: [], lastGranted: 0 }).get(user.id);
  for (const a of full) {
    const e = entry(a.user);
    e.full = { grantedAt: a.grantedAt, expiresAt: a.expiresAt, expired: isExpired(a) };
    e.lastGranted = Math.max(e.lastGranted, +a.grantedAt);
  }
  for (const a of chapters) {
    const e = entry(a.user);
    e.chapters.push({ moduleId: a.moduleId, number: number.get(a.moduleId), expiresAt: a.expiresAt, expired: isExpired(a) });
    e.lastGranted = Math.max(e.lastGranted, +a.grantedAt);
  }
  const rows = [...byUser.values()].sort((a, b) => b.lastGranted - a.lastGranted);
  const progress = await Promise.all(rows.map((r) => courseProgress(r.user.id, [courseId])));
  res.json({
    modules,
    access: rows.map(({ lastGranted, ...r }, i) => ({
      ...r,
      chapters: r.chapters.sort((a, b) => a.number - b.number),
      progress: progress[i].get(courseId),
    })),
  });
});

async function grant(userIds, courseId, expiresAt) {
  await prisma.$transaction([
    ...userIds.map((userId) =>
      prisma.courseAccess.upsert({
        where: { userId_courseId: { userId, courseId } },
        update: { expiresAt, grantedAt: new Date() },
        create: { userId, courseId, expiresAt },
      }),
    ),
    prisma.accessRequest.updateMany({
      where: { courseId, userId: { in: userIds }, status: "PENDING" },
      data: { status: "APPROVED", decidedAt: new Date() },
    }),
  ]);
}

async function grantChapters(userIds, moduleIds, expiresAt) {
  await prisma.$transaction([
    ...userIds.flatMap((userId) =>
      moduleIds.map((moduleId) =>
        prisma.moduleAccess.upsert({
          where: { userId_moduleId: { userId, moduleId } },
          update: { expiresAt, grantedAt: new Date() },
          create: { userId, moduleId, expiresAt },
        }),
      ),
    ),
    prisma.chapterRequest.updateMany({
      where: { userId: { in: userIds }, moduleId: { in: moduleIds }, status: "PENDING" },
      data: { status: "APPROVED", decidedAt: new Date() },
    }),
  ]);
}

async function checkModules(courseId, moduleIds) {
  const count = await prisma.courseModule.count({ where: { courseId, id: { in: moduleIds } } });
  return count === moduleIds.length;
}

// Give many users the whole course, or only the chapters in `moduleIds`.
router.post("/courses/:id/access", async (req, res) => {
  const courseId = Number(req.params.id) || 0;
  const { userIds, expiresAt, moduleIds } = z
    .object({
      userIds: z.array(z.number().int()).min(1, "Pick at least one user"),
      expiresAt: expiresSchema,
      moduleIds: z.array(z.number().int()).optional(),
    })
    .parse(req.body);
  if (moduleIds?.length) {
    if (!(await checkModules(courseId, moduleIds))) return res.status(400).json({ error: "Those chapters aren't in this course" });
    await grantChapters(userIds, moduleIds, expiresAt);
  } else {
    await grant(userIds, courseId, expiresAt);
  }
  res.json({ ok: true, granted: userIds.length });
});

// Sets exactly what one user has in this course.
router.put("/courses/:id/users/:userId/access", async (req, res) => {
  const courseId = Number(req.params.id) || 0;
  const userId = Number(req.params.userId) || 0;
  const { full, moduleIds, expiresAt } = z
    .object({ full: z.boolean(), moduleIds: z.array(z.number().int()), expiresAt: expiresSchema })
    .parse(req.body);
  if (!(await checkModules(courseId, moduleIds))) return res.status(400).json({ error: "Those chapters aren't in this course" });

  if (full) await grant([userId], courseId, expiresAt);
  else await prisma.courseAccess.deleteMany({ where: { userId, courseId } });
  await prisma.moduleAccess.deleteMany({ where: { userId, module: { courseId }, moduleId: { notIn: moduleIds } } });
  if (moduleIds.length) await grantChapters([userId], moduleIds, expiresAt);
  res.json({ ok: true });
});

router.delete("/courses/:id/access/:userId", async (req, res) => {
  const courseId = Number(req.params.id) || 0;
  const userId = Number(req.params.userId) || 0;
  await prisma.$transaction([
    prisma.courseAccess.deleteMany({ where: { courseId, userId } }),
    prisma.moduleAccess.deleteMany({ where: { userId, module: { courseId } } }),
  ]);
  res.json({ ok: true });
});

// ---- Access, by user ----

router.get("/users/:id/courses", async (req, res) => {
  const userId = Number(req.params.id) || 0;
  const [courses, access] = await Promise.all([
    prisma.course.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, title: true, icon: true } }),
    prisma.courseAccess.findMany({ where: { userId } }),
  ]);
  const map = new Map(access.map((a) => [a.courseId, a]));
  res.json({
    courses: courses.map((c) => ({
      ...c,
      granted: map.has(c.id),
      expiresAt: map.get(c.id)?.expiresAt ?? null,
    })),
  });
});

// Sets exactly which courses a user may open (unticked ones are revoked).
router.put("/users/:id/courses", async (req, res) => {
  const userId = Number(req.params.id) || 0;
  const { courses } = z
    .object({ courses: z.array(z.object({ courseId: z.number().int(), expiresAt: expiresSchema })) })
    .parse(req.body);
  const keep = courses.map((c) => c.courseId);
  await prisma.courseAccess.deleteMany({ where: { userId, courseId: { notIn: keep } } });
  for (const c of courses) {
    await prisma.courseAccess.upsert({
      where: { userId_courseId: { userId, courseId: c.courseId } },
      update: { expiresAt: c.expiresAt },
      create: { userId, courseId: c.courseId, expiresAt: c.expiresAt },
    });
  }
  await prisma.accessRequest.updateMany({
    where: { userId, courseId: { in: keep }, status: "PENDING" },
    data: { status: "APPROVED", decidedAt: new Date() },
  });
  res.json({ ok: true });
});

// ---- Access requests ----

const requestUser = { select: { id: true, username: true, name: true, email: true, avatarUrl: true } };

// Whole-course and single-chapter requests together, newest decisions first.
router.get("/requests", async (req, res) => {
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(req.query.status) ? req.query.status : "PENDING";
  const [courseRequests, chapterRequests] = await Promise.all([
    prisma.accessRequest.findMany({
      where: { status },
      take: 200,
      include: { user: requestUser, course: { select: { id: true, title: true, icon: true, slug: true } } },
    }),
    prisma.chapterRequest.findMany({
      where: { status },
      take: 200,
      include: {
        user: requestUser,
        module: {
          select: { id: true, title: true, order: true, course: { select: { id: true, title: true, icon: true, slug: true, modules: { select: { id: true }, orderBy: [{ order: "asc" }, { id: "asc" }] } } } },
        },
      },
    }),
  ]);
  const requests = [
    ...courseRequests.map((r) => ({ ...r, kind: "course", chapter: null })),
    ...chapterRequests.map(({ module, ...r }) => {
      const { modules, ...course } = module.course;
      return {
        ...r,
        kind: "chapter",
        course,
        chapter: { id: module.id, title: module.title, number: modules.findIndex((m) => m.id === module.id) + 1 },
      };
    }),
  ].sort((a, b) => (status === "PENDING" ? a.createdAt - b.createdAt : (b.decidedAt || 0) - (a.decidedAt || 0)));
  res.json({ requests });
});

router.post("/requests/:kind/:id", async (req, res) => {
  const { action, expiresAt } = z
    .object({ action: z.enum(["approve", "reject"]), expiresAt: expiresSchema })
    .parse(req.body);
  const id = Number(req.params.id) || 0;
  const now = new Date();

  if (req.params.kind === "chapter") {
    const request = await prisma.chapterRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (action === "approve") await grantChapters([request.userId], [request.moduleId], expiresAt);
    else await prisma.chapterRequest.update({ where: { id }, data: { status: "REJECTED", decidedAt: now } });
    return res.json({ ok: true });
  }

  const request = await prisma.accessRequest.findUnique({ where: { id } });
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (action === "approve") await grant([request.userId], request.courseId, expiresAt);
  else await prisma.accessRequest.update({ where: { id }, data: { status: "REJECTED", decidedAt: now } });
  res.json({ ok: true });
});

export default router;
