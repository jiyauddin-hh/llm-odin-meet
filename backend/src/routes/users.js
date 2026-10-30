import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { publicUser, requireAuth } from "../lib/auth.js";
import { ranking } from "./leaderboard.js";
import { courseProgress } from "../lib/courses.js";

const router = Router();

const dayKey = (d) => d.toISOString().slice(0, 10);

function currentStreak(days) {
  const set = new Set(days);
  const cursor = new Date();
  // A streak still counts if the user hasn't practised yet today.
  if (!set.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(dayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function badges({ solvedTotal, byDifficulty, streak, coursesDone }) {
  const list = [];
  if (solvedTotal >= 1) list.push({ id: "first-solve", name: "First Blood", description: "Solved your first problem" });
  if (solvedTotal >= 5) list.push({ id: "five", name: "Getting Warm", description: "Solved 5 problems" });
  if (solvedTotal >= 25) list.push({ id: "twenty-five", name: "Problem Crusher", description: "Solved 25 problems" });
  if (byDifficulty.HARD >= 1) list.push({ id: "hard", name: "Hard Hitter", description: "Solved a Hard problem" });
  if (streak >= 7) list.push({ id: "streak-7", name: "On Fire", description: "7-day practice streak" });
  for (const c of coursesDone) {
    list.push({ id: `course-${c.slug}`, name: `${c.title} Graduate`, description: `Completed the ${c.title} course`, icon: c.icon });
  }
  return list;
}

router.get("/:username", async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { username: { equals: req.params.username, mode: "insensitive" } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const yearAgo = new Date(Date.now() - 366 * 86_400_000);
  const [solves, recent, activity, totalProblems] = await Promise.all([
    prisma.solve.findMany({ where: { userId: user.id }, include: { problem: { select: { difficulty: true } } } }),
    prisma.submission.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, verdict: true, language: true, createdAt: true,
        problem: { select: { slug: true, title: true, difficulty: true } },
      },
    }),
    prisma.submission.findMany({
      where: { userId: user.id, createdAt: { gte: yearAgo } },
      select: { createdAt: true },
    }),
    prisma.problem.groupBy({ by: ["difficulty"], where: { published: true }, _count: true }),
  ]);

  const byDifficulty = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const s of solves) byDifficulty[s.problem.difficulty]++;
  const totals = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const t of totalProblems) totals[t.difficulty] = t._count;

  const heatmap = {};
  for (const a of activity) {
    const k = dayKey(a.createdAt);
    heatmap[k] = (heatmap[k] || 0) + 1;
  }
  const streak = currentStreak(Object.keys(heatmap));
  const entry = (await ranking("all")).find((r) => r.id === user.id);

  // Courses the user can open (admins see every course), with progress.
  const courseRows = await prisma.course.findMany({
    where: {
      published: true,
      ...(user.role !== "ADMIN" && {
        OR: [
          { access: { some: { userId: user.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } },
          { modules: { some: { access: { some: { userId: user.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } } },
        ],
      }),
    },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, slug: true, title: true, icon: true, level: true },
  });
  const progress = await courseProgress(user.id, courseRows.map((c) => c.id));
  const courses = courseRows.map((c) => ({ ...c, progress: progress.get(c.id) }));
  const coursesDone = courses.filter((c) => c.progress.total && c.progress.done === c.progress.total);

  const { email, ...profile } = publicUser(user);
  res.json({
    user: profile,
    stats: {
      score: solves.reduce((sum, s) => sum + s.points, 0),
      rank: entry?.rank ?? null,
      solved: solves.length,
      byDifficulty,
      totals,
      streak,
    },
    badges: badges({ solvedTotal: solves.length, byDifficulty, streak, coursesDone }),
    courses,
    heatmap,
    recent,
  });
});

const profileSchema = z.object({
  name: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(300).optional(),
  country: z.string().trim().max(60).optional(),
  avatarUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
});

router.patch("/me", requireAuth, async (req, res) => {
  const data = profileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { ...data, avatarUrl: data.avatarUrl === "" ? null : data.avatarUrl },
  });
  res.json({ user: publicUser(user) });
});

export default router;
