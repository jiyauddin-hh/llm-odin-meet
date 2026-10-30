import { Router } from "express";
import { z } from "zod";
import { prisma, POINTS } from "../lib/db.js";
import { optionalAuth, requireAuth } from "../lib/auth.js";
import { judge, LANGUAGES } from "../lib/judge.js";

const router = Router();

router.get("/", optionalAuth, async (req, res) => {
  const { difficulty, tag, status, q, subject, chapter, topic, company } = req.query;
  const problems = await prisma.problem.findMany({
    where: {
      published: true,
      ...(difficulty && { difficulty: String(difficulty).toUpperCase() }),
      ...(tag && { tags: { has: String(tag) } }),
      ...(company && { companies: { has: String(company) } }),
      ...(q && { title: { contains: String(q), mode: "insensitive" } }),
      ...(topic ? { topicId: Number(topic) } : chapter ? { topic: { chapterId: Number(chapter) } } : subject ? { topic: { chapter: { subjectId: Number(subject) } } } : {}),
    },
    select: {
      id: true, slug: true, title: true, difficulty: true, tags: true, companies: true,
      topic: { select: { name: true, chapter: { select: { name: true, subject: { select: { name: true, icon: true } } } } } },
    },
    orderBy: [{ topic: { chapter: { subject: { order: "asc" } } } }, { topic: { chapter: { order: "asc" } } }, { topic: { order: "asc" } }, { id: "asc" }],
  });

  const ids = problems.map((p) => p.id);
  const [totals, accepted] = await Promise.all([
    prisma.submission.groupBy({ by: ["problemId"], where: { problemId: { in: ids } }, _count: true }),
    prisma.submission.groupBy({
      by: ["problemId"],
      where: { problemId: { in: ids }, verdict: "Accepted" },
      _count: true,
    }),
  ]);
  const totalMap = new Map(totals.map((t) => [t.problemId, t._count]));
  const acceptedMap = new Map(accepted.map((t) => [t.problemId, t._count]));

  let solved = new Set();
  let attempted = new Set();
  if (req.user) {
    const [s, a] = await Promise.all([
      prisma.solve.findMany({ where: { userId: req.user.id }, select: { problemId: true } }),
      prisma.submission.findMany({
        where: { userId: req.user.id },
        select: { problemId: true },
        distinct: ["problemId"],
      }),
    ]);
    solved = new Set(s.map((x) => x.problemId));
    attempted = new Set(a.map((x) => x.problemId));
  }

  let list = problems.map((p) => {
    const total = totalMap.get(p.id) || 0;
    return {
      ...p,
      points: POINTS[p.difficulty],
      acceptance: total ? Math.round(((acceptedMap.get(p.id) || 0) / total) * 100) : null,
      status: solved.has(p.id) ? "solved" : attempted.has(p.id) ? "attempted" : "unsolved",
    };
  });
  if (status) list = list.filter((p) => p.status === status);
  res.json({ problems: list });
});

// Subjects → chapters → topics that contain at least one live question.
router.get("/structure", async (_req, res) => {
  const live = { problems: { some: { published: true } } };
  const subjects = await prisma.subject.findMany({
    where: { chapters: { some: { topics: { some: live } } } },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true, name: true, icon: true,
      chapters: {
        where: { topics: { some: live } },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true, name: true, topics: { where: live, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, name: true } } },
      },
    },
  });
  const rows = await prisma.problem.findMany({ where: { published: true }, select: { companies: true } });
  res.json({ subjects, companies: [...new Set(rows.flatMap((r) => r.companies))].sort() });
});

router.get("/tags", async (_req, res) => {
  const rows = await prisma.problem.findMany({ where: { published: true }, select: { tags: true } });
  res.json({ tags: [...new Set(rows.flatMap((r) => r.tags))].sort() });
});

async function findProblem(slug, withAllTests = false) {
  return prisma.problem.findFirst({
    where: { slug, published: true },
    include: {
      testCases: { where: withAllTests ? {} : { isSample: true }, orderBy: [{ order: "asc" }, { id: "asc" }] },
      topic: { select: { name: true, chapter: { select: { name: true, subject: { select: { name: true, icon: true } } } } } },
    },
  });
}

// Only what learners may see. Drafts, the reference solution and review notes stay private.
export function publicProblem(problem) {
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    description: problem.description,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    difficulty: problem.difficulty,
    tags: problem.tags,
    companies: problem.companies,
    hints: problem.hints,
    timeLimitMs: problem.timeLimitMs,
    starterCode: problem.starterCode,
    topic: problem.topic ?? null,
    topicId: problem.topicId,
    hasSolution: !!(problem.editorial.trim() || problem.solutionCode.trim()),
    points: POINTS[problem.difficulty],
    samples: problem.testCases
      .filter((t) => t.isSample)
      .map(({ input, expected, explanation }) => ({ input, expected, explanation })),
  };
}

router.get("/:slug", async (req, res) => {
  const problem = await findProblem(req.params.slug);
  if (!problem) return res.status(404).json({ error: "Problem not found" });
  res.json({ problem: publicProblem(problem) });
});

// The worked solution unlocks once you've solved the problem.
router.get("/:slug/solution", requireAuth, async (req, res) => {
  const problem = await prisma.problem.findFirst({ where: { slug: req.params.slug, published: true } });
  if (!problem) return res.status(404).json({ error: "Problem not found" });
  const staff = ["ADMIN", "EDITOR"].includes(req.user.role);
  const solved = await prisma.solve.findUnique({ where: { userId_problemId: { userId: req.user.id, problemId: problem.id } } });
  if (!staff && !solved) return res.status(403).json({ error: "Solve the problem to unlock its solution" });
  res.json({ editorial: problem.editorial, language: problem.solutionLanguage, code: problem.solutionCode });
});

const codeSchema = z.object({
  language: z.enum(LANGUAGES),
  code: z.string().min(1).max(64 * 1024),
  customInput: z.string().max(64 * 1024).optional(),
});

// "Run": sample tests only (or the user's own input). Nothing is saved.
router.post("/:slug/run", requireAuth, async (req, res) => {
  const { language, code, customInput } = codeSchema.parse(req.body);
  const problem = await findProblem(req.params.slug);
  if (!problem) return res.status(404).json({ error: "Problem not found" });

  const tests =
    customInput !== undefined
      ? [{ input: customInput, expected: null }]
      : problem.testCases.map((t) => ({ input: t.input, expected: t.expected }));
  const result = await judge({ language, code, timeLimitMs: problem.timeLimitMs, tests });

  res.json({
    verdict: result.verdict,
    compileOutput: result.compileOutput,
    error: result.error,
    results: (result.results || []).map((r, i) => ({
      ...r,
      input: tests[i].input,
      expected: tests[i].expected,
    })),
  });
});

// "Submit": every test, saved as a submission. First accept earns points.
router.post("/:slug/submit", requireAuth, async (req, res) => {
  const { language, code } = codeSchema.parse(req.body);
  const problem = await findProblem(req.params.slug, true);
  if (!problem) return res.status(404).json({ error: "Problem not found" });

  const tests = problem.testCases.map((t) => ({ input: t.input, expected: t.expected }));
  const result = await judge({ language, code, timeLimitMs: problem.timeLimitMs, tests });
  const results = result.results || [];

  // Hidden test details stay hidden; only samples show their data.
  const shown = results.map((r, i) => {
    const t = problem.testCases[i];
    const base = { verdict: r.verdict, timeMs: r.timeMs, memoryKb: r.memoryKb, isSample: t.isSample };
    return t.isSample ? { ...base, input: t.input, expected: t.expected, stdout: r.stdout, stderr: r.stderr } : base;
  });

  const submission = await prisma.submission.create({
    data: {
      userId: req.user.id,
      problemId: problem.id,
      language,
      code,
      verdict: result.verdict,
      passed: results.filter((r) => r.verdict === "Accepted").length,
      total: tests.length,
      runtimeMs: results.length ? Math.max(...results.map((r) => r.timeMs)) : null,
      memoryKb: results.length ? Math.max(...results.map((r) => r.memoryKb)) : null,
      results: shown,
      compileOutput: result.compileOutput || result.error || null,
    },
  });

  let pointsEarned = 0;
  if (result.verdict === "Accepted") {
    const created = await prisma.solve.createMany({
      data: [{ userId: req.user.id, problemId: problem.id, points: POINTS[problem.difficulty] }],
      skipDuplicates: true,
    });
    if (created.count) pointsEarned = POINTS[problem.difficulty];
  }

  res.json({ submission, pointsEarned });
});

export default router;
