import { z } from "zod";
import { prisma } from "./db.js";

const isActive = (access) => !access.expiresAt || access.expiresAt > new Date();

/**
 * The user's standing for one course:
 * "granted" | "expired" | "pending" | "rejected" | "locked" (or "guest" when logged out).
 * Admins always have access.
 */
export async function accessStatus(user, courseId) {
  if (!user) return { status: "guest" };
  if (user.role === "ADMIN") return { status: "granted", expiresAt: null };
  const [access, request] = await Promise.all([
    prisma.courseAccess.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } }),
    prisma.accessRequest.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } }),
  ]);
  if (access && isActive(access)) return { status: "granted", expiresAt: access.expiresAt };
  if (request?.status === "PENDING") return { status: "pending" };
  if (access) return { status: "expired", expiresAt: access.expiresAt };
  if (request?.status === "REJECTED") return { status: "rejected" };
  return { status: "locked" };
}

/** Same as accessStatus but for every course at once: Map<courseId, status>. */
export async function accessStatuses(user) {
  const map = new Map();
  if (!user) return map;
  const [access, requests] = await Promise.all([
    prisma.courseAccess.findMany({ where: { userId: user.id } }),
    prisma.accessRequest.findMany({ where: { userId: user.id } }),
  ]);
  for (const r of requests) map.set(r.courseId, { status: r.status === "PENDING" ? "pending" : r.status === "REJECTED" ? "rejected" : "locked" });
  for (const a of access) {
    if (isActive(a)) map.set(a.courseId, { status: "granted", expiresAt: a.expiresAt });
    else if (map.get(a.courseId)?.status !== "pending") map.set(a.courseId, { status: "expired", expiresAt: a.expiresAt });
  }
  return map;
}

/** Map<courseId, {done, total, percent}> of a user's lesson progress. */
export async function courseProgress(userId, courseIds) {
  const [lessons, done] = await Promise.all([
    prisma.lesson.findMany({
      where: { module: { courseId: { in: courseIds } } },
      select: { id: true, module: { select: { courseId: true } } },
    }),
    prisma.lessonProgress.findMany({
      where: { userId, lesson: { module: { courseId: { in: courseIds } } } },
      select: { lessonId: true },
    }),
  ]);
  const doneSet = new Set(done.map((d) => d.lessonId));
  const map = new Map(courseIds.map((id) => [id, { done: 0, total: 0, percent: 0 }]));
  for (const l of lessons) {
    const p = map.get(l.module.courseId);
    p.total++;
    if (doneSet.has(l.id)) p.done++;
  }
  for (const p of map.values()) p.percent = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return map;
}

/**
 * Which chapters of a course a user may open, and why.
 * `course.modules` must be ordered and include `lessons: [{ id }]`.
 * Returns:
 *   access   – whole-course status (as accessStatus), used for full-course requests
 *   level    – "full" | "partial" (some chapters given) | "preview" (only free chapters) | "none"
 *   chapters – per module: { moduleId, open, status, reason, mode, expiresAt }
 *   completed – ids of lessons the user finished in this course
 */
export async function courseState(user, course) {
  const access = await accessStatus(user, course.id);
  const moduleIds = course.modules.map((m) => m.id);

  if (!user) {
    return {
      access,
      level: "none",
      completed: [],
      chapters: course.modules.map((m) => ({
        moduleId: m.id, open: false, status: m.unlockMode === "FREE" ? "login" : "guest", reason: null, mode: m.unlockMode, expiresAt: null,
      })),
    };
  }

  const full = access.status === "granted";
  const [grants, requests, done] = await Promise.all([
    prisma.moduleAccess.findMany({ where: { userId: user.id, moduleId: { in: moduleIds } } }),
    prisma.chapterRequest.findMany({ where: { userId: user.id, moduleId: { in: moduleIds } } }),
    prisma.lessonProgress.findMany({
      where: { userId: user.id, lesson: { moduleId: { in: moduleIds } } },
      select: { lessonId: true },
    }),
  ]);
  const grantMap = new Map(grants.map((g) => [g.moduleId, g]));
  const requestMap = new Map(requests.map((r) => [r.moduleId, r.status]));
  const doneSet = new Set(done.map((d) => d.lessonId));

  let prevOpen = false;
  let prevDone = false;
  const chapters = course.modules.map((m, i) => {
    const grant = grantMap.get(m.id);
    const autoReady = m.unlockMode === "AUTO" && i > 0 && prevOpen && prevDone;
    let reason = null;
    if (full) reason = "course";
    else if (m.unlockMode === "FREE") reason = "free";
    else if (grant && isActive(grant)) reason = "chapter";
    else if (autoReady) reason = "auto";

    let status = "open";
    if (!reason) {
      const request = requestMap.get(m.id);
      if (request === "PENDING") status = "pending";
      else if (m.unlockMode === "AUTO" && i > 0 && prevOpen) status = "finish-previous";
      else if (grant) status = "expired";
      else if (request === "REJECTED") status = "rejected";
      else status = "locked";
    }
    prevOpen = !!reason;
    prevDone = m.lessons.every((l) => doneSet.has(l.id));
    return {
      moduleId: m.id,
      open: !!reason,
      status,
      reason,
      mode: m.unlockMode,
      expiresAt: reason === "chapter" ? grant.expiresAt : null,
      grantExpiresAt: grant?.expiresAt ?? null,
    };
  });

  const level = full
    ? "full"
    : chapters.some((c) => c.reason === "chapter" || c.reason === "auto")
      ? "partial"
      : chapters.some((c) => c.reason === "free")
        ? "preview"
        : "none";
  return { access, level, chapters, completed: [...doneSet] };
}

/** Modules in order with lesson ids, as courseState expects. */
export const MODULES_FOR_STATE = {
  orderBy: [{ order: "asc" }, { id: "asc" }],
  include: { lessons: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, title: true, videoUrl: true } } },
};

/** A lesson's quiz: multiple-choice questions with the index of the right option. */
export const quizSchema = z
  .array(
    z
      .object({
        question: z.string().trim().min(1).max(1000),
        options: z.array(z.string().trim().min(1).max(400)).min(2).max(6),
        answer: z.number().int().min(0),
        explanation: z.string().trim().max(2000).default(""),
      })
      .refine((q) => q.answer < q.options.length, { message: "The answer must be one of the options", path: ["answer"] }),
  )
  .max(20);
