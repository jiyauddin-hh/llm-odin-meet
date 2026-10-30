import { Router } from "express";
import { prisma } from "../lib/db.js";
import { optionalAuth } from "../lib/auth.js";

const router = Router();

const PERIOD_DAYS = { week: 7, month: 30, all: null };

/** Ranked list of every user with points in the period (ties share a rank). */
export async function ranking(period = "all") {
  const days = PERIOD_DAYS[period] ?? null;
  const since = days ? new Date(Date.now() - days * 86_400_000) : new Date(0);
  const rows = await prisma.$queryRaw`
    SELECT u.id, u.username, u.name, u."avatarUrl", u.country,
           SUM(s.points)::int AS score, COUNT(*)::int AS solved, MAX(s."solvedAt") AS "lastSolve"
    FROM "Solve" s JOIN "User" u ON u.id = s."userId"
    WHERE s."solvedAt" >= ${since}
    GROUP BY u.id
    ORDER BY score DESC, "lastSolve" ASC`;
  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || row.score !== rows[i - 1].score) rank = i + 1;
    return { ...row, rank };
  });
}

router.get("/", optionalAuth, async (req, res) => {
  const period = PERIOD_DAYS[req.query.period] !== undefined ? req.query.period : "all";
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 25;
  const all = await ranking(period);
  res.json({
    period,
    page,
    pages: Math.max(1, Math.ceil(all.length / pageSize)),
    total: all.length,
    entries: all.slice((page - 1) * pageSize, page * pageSize),
    me: req.user ? all.find((r) => r.id === req.user.id) || null : null,
  });
});

export default router;
