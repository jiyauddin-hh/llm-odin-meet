import { Router } from "express";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 20;
  const where = {
    userId: req.user.id,
    ...(req.query.problem && { problem: { slug: String(req.query.problem) } }),
  };
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, language: true, verdict: true, passed: true, total: true,
        runtimeMs: true, memoryKb: true, createdAt: true,
        problem: { select: { slug: true, title: true, difficulty: true } },
      },
    }),
    prisma.submission.count({ where }),
  ]);
  res.json({ submissions, total, page, pages: Math.ceil(total / pageSize) });
});

router.get("/:id", requireAuth, async (req, res) => {
  const submission = await prisma.submission.findUnique({
    where: { id: Number(req.params.id) || 0 },
    include: { problem: { select: { slug: true, title: true, difficulty: true } } },
  });
  if (!submission || (submission.userId !== req.user.id && req.user.role !== "ADMIN")) {
    return res.status(404).json({ error: "Submission not found" });
  }
  res.json({ submission });
});

export default router;
