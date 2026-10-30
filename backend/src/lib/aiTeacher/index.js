// The daily AI class: its settings, the AI teacher's account, the scheduler
// that opens a class every day, and the sessions that are running now.
// One AI class runs at a time (they share the GPU).
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { getSetting, setSetting } from "../settings.js";
import { endRoom, freshCode } from "../classroom.js";
import { AiSession } from "./session.js";

export const DEFAULT_SETTINGS = {
  enabled: false,
  time: "19:00", // server's local time
  days: [0, 1, 2, 3, 4, 5, 6], // Sunday = 0
  minutes: 20, // speaking time of the lesson
  prepMinutes: 20, // the room opens and preparation starts this early
  teacherName: "Alex",
  courseSlug: "python",
};

export async function getAiSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await getSetting("aiClass", "{}")) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveAiSettings(settings) {
  await setSetting("aiClass", JSON.stringify(settings));
}

/** id -> AiSession for classes preparing or running in this process. */
const sessions = new Map();
let uploadDir = null;

export const runningSession = () => [...sessions.values()].find((s) => !s.stopped) || null;
export const sessionFor = (id) => sessions.get(id) || null;

const userView = (u) => ({ id: u.id, username: u.username, name: u.name, avatarUrl: u.avatarUrl, role: u.role });

/** The AI teacher's own account: the host of its classrooms. Nobody can log in to it. */
async function teacherAccount(name) {
  const data = { name, role: "TEACHER", avatarUrl: "/api/ai-class/face", bio: "Quantum Code's AI teacher" };
  return prisma.user.upsert({
    where: { username: "ai-teacher" },
    update: data,
    create: {
      username: "ai-teacher",
      email: "ai-teacher@quantumcode.local",
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      ...data,
    },
  });
}

/** Lessons of the course in teaching order. */
export async function courseLessons(slug) {
  return prisma.lesson.findMany({
    where: { module: { course: { slug } } },
    orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
    select: { id: true, title: true, module: { select: { title: true } } },
  });
}

/** The lesson after the last one the AI teacher taught (back to the start after the last). */
async function nextLesson(slug) {
  const lessons = await courseLessons(slug);
  if (!lessons.length) return null;
  const last = await prisma.aiClass.findFirst({
    where: { status: { in: ["LIVE", "ENDED"] }, lessonId: { in: lessons.map((l) => l.id) } },
    orderBy: { startsAt: "desc" },
  });
  const i = last ? lessons.findIndex((l) => l.id === last.lessonId) : -1;
  return lessons[(i + 1) % lessons.length];
}

function launch(row, room, teacher, settings) {
  const session = new AiSession({ row, room, teacher: userView(teacher), settings, uploadDir });
  sessions.set(row.id, session);
  session.start().finally(() => sessions.delete(row.id));
  return session;
}

/** Opens a classroom for an AI class starting at `startsAt` and starts preparing it. */
export async function createAiClass({ startsAt, lessonId } = {}) {
  if (runningSession()) throw new Error("An AI class is already running");
  const settings = await getAiSettings();
  const lesson = lessonId ? await prisma.lesson.findUnique({ where: { id: lessonId } }) : await nextLesson(settings.courseSlug);
  if (!lesson) throw new Error(`No lessons found in the "${settings.courseSlug}" course`);
  const teacher = await teacherAccount(settings.teacherName);
  const room = await prisma.classroom.create({
    data: {
      code: await freshCode(),
      title: `AI class · ${lesson.title}`,
      language: "python",
      content: `# Today's class: ${lesson.title}\n`,
      teacherId: teacher.id,
    },
  });
  const row = await prisma.aiClass.create({
    data: { title: lesson.title, lessonId: lesson.id, classroomId: room.id, startsAt: startsAt || new Date() },
  });
  launch(row, room, teacher, settings);
  return row;
}

/** Stops a class early and closes its room. */
export async function stopAiClass(id) {
  const row = await prisma.aiClass.findUnique({ where: { id }, include: { classroom: true } });
  if (!row) return false;
  sessions.get(id)?.stop();
  if (row.classroom?.status === "LIVE") await endRoom(row.classroom.code);
  await prisma.aiClass.updateMany({
    where: { id, status: { in: ["PREPARING", "READY", "LIVE"] } },
    data: { status: "ENDED", endedAt: new Date() },
  });
  return true;
}

/** Today's start time if the schedule has a class today. */
export function scheduledStart(settings, day = new Date()) {
  if (!settings.enabled || !settings.days.includes(day.getDay())) return null;
  const [h, m] = settings.time.split(":").map(Number);
  const at = new Date(day);
  at.setHours(h, m, 0, 0);
  return at;
}

async function tick() {
  const settings = await getAiSettings();
  const startsAt = scheduledStart(settings);
  if (!startsAt) return;
  const now = Date.now();
  // Open the room prepMinutes early; don't start a class that should have begun over half an hour ago.
  if (now < startsAt.getTime() - settings.prepMinutes * 60_000 || now > startsAt.getTime() + 30 * 60_000) return;
  if (runningSession()) return;
  if (await prisma.aiClass.findFirst({ where: { startsAt } })) return;
  console.log(`AI class: opening today's class (starts ${startsAt.toLocaleTimeString()})`);
  await createAiClass({ startsAt });
}

/**
 * Starts the scheduler. Classes interrupted by a restart: one that hadn't
 * started teaching yet is prepared again (its script is kept); one that was
 * teaching is closed.
 */
export async function startAiTeacher(dir) {
  uploadDir = dir;
  const open = await prisma.aiClass.findMany({
    where: { status: { in: ["PREPARING", "READY", "LIVE"] } },
    include: { classroom: true },
  });
  for (const row of open) {
    const resumable = row.status !== "LIVE" && row.classroom?.status === "LIVE" && row.startsAt.getTime() > Date.now() - 5 * 60_000;
    if (resumable && !runningSession()) {
      const settings = await getAiSettings();
      launch(row, row.classroom, await teacherAccount(settings.teacherName), settings);
      continue;
    }
    if (row.classroom?.status === "LIVE") await endRoom(row.classroom.code).catch(() => {});
    await prisma.aiClass.update({ where: { id: row.id }, data: { status: "FAILED", error: "The server restarted during the class", endedAt: new Date() } });
  }
  const loop = () => tick().catch((e) => console.error("AI class scheduler:", e.message));
  setInterval(loop, 30_000).unref();
  loop();
}
