// The daily live test. Everyone takes the same MCQs in the same window; the
// server keeps the clock, the answer key and the scores, so nothing can be
// gamed from the browser. Ranking: score, then time taken (faster first).
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { optionalAuth, requireAdmin, requireAuth } from "../lib/auth.js";

const router = Router();

// Submissions that left the browser just before the bell still count.
const GRACE_MS = 15_000;

const endsAt = (t) => new Date(t.startsAt.getTime() + t.durationMin * 60_000);

function status(t, now = new Date()) {
  if (now < t.startsAt) return "UPCOMING";
  if (now < endsAt(t)) return "LIVE";
  return "ENDED";
}

const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

const userBrief = { select: { id: true, username: true, name: true, avatarUrl: true } };

function scoreOf(test, answers) {
  return test.questions.reduce((n, q, i) => n + (answers?.[i] === q.answer ? 1 : 0), 0);
}

/** Scores students who joined but never submitted (closed the tab, lost connection). */
async function finalize(test) {
  const open = await prisma.liveTestEntry.findMany({
    where: { testId: test.id, startedAt: { not: null }, submittedAt: null },
  });
  const end = endsAt(test);
  for (const e of open) {
    await prisma.liveTestEntry.update({
      where: { testId_userId: { testId: test.id, userId: e.userId } },
      data: { submittedAt: end, score: scoreOf(test, e.answers), timeMs: end - e.startedAt },
    });
  }
}

async function ranking(testId, take) {
  const rows = await prisma.liveTestEntry.findMany({
    where: { testId, submittedAt: { not: null } },
    orderBy: [{ score: "desc" }, { timeMs: "asc" }, { submittedAt: "asc" }],
    include: { user: userBrief },
    take,
  });
  return rows.map((r, i) => ({ rank: i + 1, user: r.user, score: r.score, timeMs: r.timeMs }));
}

async function publicTest(t, user) {
  const [ready, playing, me] = await Promise.all([
    prisma.liveTestEntry.count({ where: { testId: t.id } }),
    prisma.liveTestEntry.count({ where: { testId: t.id, startedAt: { not: null } } }),
    user ? prisma.liveTestEntry.findUnique({ where: { testId_userId: { testId: t.id, userId: user.id } } }) : null,
  ]);
  return {
    id: t.id,
    title: t.title,
    topic: t.topic,
    startsAt: t.startsAt,
    endsAt: endsAt(t),
    durationMin: t.durationMin,
    questionCount: t.questions.length,
    status: status(t),
    ready,
    playing,
    me: me && { ready: true, started: !!me.startedAt, submitted: !!me.submittedAt },
  };
}

// Home page: the live or next test, and the latest Performers of the Day.
router.get("/home", optionalAuth, async (req, res) => {
  const now = new Date();
  const candidates = await prisma.liveTest.findMany({
    where: { startsAt: { gte: new Date(now - 24 * 3600_000) } },
    orderBy: { startsAt: "asc" },
  });
  const current = candidates.find((t) => endsAt(t) > now);

  const past = await prisma.liveTest.findMany({ where: { startsAt: { lte: now } }, orderBy: { startsAt: "desc" }, take: 5 });
  let performers = null;
  for (const t of past.filter((t) => endsAt(t) <= now)) {
    await finalize(t);
    const top = await ranking(t.id, 3);
    if (top.length) {
      performers = { test: { id: t.id, title: t.title, topic: t.topic, startsAt: t.startsAt, questionCount: t.questions.length }, top };
      break;
    }
  }
  res.json({ now, test: current ? await publicTest(current, req.user) : null, performers });
});

router.get("/:id", optionalAuth, async (req, res) => {
  const t = await prisma.liveTest.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json({ now: new Date(), test: await publicTest(t, req.user) });
});

const findTest = async (req, res) => {
  const t = await prisma.liveTest.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!t) res.status(404).json({ error: "Not found" });
  return t;
};

// "I'm in": counts the student among those waiting for the start.
router.post("/:id/ready", requireAuth, async (req, res) => {
  const t = await findTest(req, res);
  if (!t) return;
  if (status(t) === "ENDED") return res.status(409).json({ error: "This test has ended" });
  await prisma.liveTestEntry.upsert({
    where: { testId_userId: { testId: t.id, userId: req.user.id } },
    create: { testId: t.id, userId: req.user.id },
    update: {},
  });
  res.json({ test: await publicTest(t, req.user) });
});

/** The questions in this student's order, without the answer key. */
function paper(t, entry) {
  const answers = entry.answers || {};
  return entry.order.map(({ q, o }) => {
    const src = t.questions[q];
    const picked = answers[q];
    return {
      question: src.question,
      code: src.code || "",
      options: o.map((k) => src.options[k]),
      chosen: picked === undefined ? null : o.indexOf(picked),
    };
  });
}

// Start (or come back to, after a refresh) this student's one attempt.
router.post("/:id/join", requireAuth, async (req, res) => {
  const t = await findTest(req, res);
  if (!t) return;
  const st = status(t);
  if (st === "UPCOMING") return res.status(409).json({ error: "The test hasn't started yet" });
  if (st === "ENDED") return res.status(409).json({ error: "This test has ended" });
  const key = { testId_userId: { testId: t.id, userId: req.user.id } };
  let entry = await prisma.liveTestEntry.findUnique({ where: key });
  if (entry?.submittedAt) return res.status(409).json({ error: "You have already submitted this test" });
  if (!entry?.startedAt) {
    const order = shuffle(t.questions.map((_, q) => q)).map((q) => ({
      q,
      o: shuffle(t.questions[q].options.map((_, k) => k)),
    }));
    entry = await prisma.liveTestEntry.upsert({
      where: key,
      create: { testId: t.id, userId: req.user.id, startedAt: new Date(), order, answers: {} },
      update: { startedAt: new Date(), order, answers: {} },
    });
  }
  res.json({
    now: new Date(),
    test: { id: t.id, title: t.title, topic: t.topic, endsAt: endsAt(t) },
    startedAt: entry.startedAt,
    questions: paper(t, entry),
  });
});

async function openEntry(req, res, t) {
  const entry = await prisma.liveTestEntry.findUnique({ where: { testId_userId: { testId: t.id, userId: req.user.id } } });
  let error = null;
  if (!entry?.startedAt) error = "Join the test first";
  else if (entry.submittedAt) error = "You have already submitted this test";
  else if (Date.now() > endsAt(t).getTime() + GRACE_MS) error = "Time is up";
  if (!error) return entry;
  res.status(409).json({ error });
  return null;
}

const pick = (entry, position, choice) => {
  const slot = entry.order[position];
  if (!slot) return null;
  return { q: slot.q, option: choice === null ? undefined : slot.o[choice] };
};

// Saves each answer as it's picked, so nothing is lost if the tab closes.
const answerSchema = z.object({ position: z.number().int().min(0), choice: z.number().int().min(0).nullable() });

router.put("/:id/answer", requireAuth, async (req, res) => {
  const { position, choice } = answerSchema.parse(req.body);
  const t = await findTest(req, res);
  if (!t) return;
  const entry = await openEntry(req, res, t);
  if (!entry) return;
  const p = pick(entry, position, choice);
  if (!p) return res.status(400).json({ error: "No such question" });
  const answers = { ...(entry.answers || {}) };
  if (p.option === undefined) delete answers[p.q];
  else answers[p.q] = p.option;
  await prisma.liveTestEntry.update({ where: { testId_userId: { testId: t.id, userId: req.user.id } }, data: { answers } });
  res.json({ ok: true });
});

const submitSchema = z.object({ answers: z.array(z.number().int().min(0).nullable()).max(100).default([]) });

router.post("/:id/submit", requireAuth, async (req, res) => {
  const { answers: chosen } = submitSchema.parse(req.body || {});
  const t = await findTest(req, res);
  if (!t) return;
  const entry = await openEntry(req, res, t);
  if (!entry) return;
  const answers = { ...(entry.answers || {}) };
  chosen.forEach((c, position) => {
    const p = pick(entry, position, c);
    if (p && p.option !== undefined) answers[p.q] = p.option;
  });
  const now = new Date();
  const end = endsAt(t);
  const done = now < end ? now : end;
  await prisma.liveTestEntry.update({
    where: { testId_userId: { testId: t.id, userId: req.user.id } },
    data: { answers, submittedAt: done, score: scoreOf(t, answers), timeMs: done - entry.startedAt },
  });
  res.json({ ok: true, endsAt: end });
});

// Leaderboard and (for a student who took it) their answers, once the test ends.
router.get("/:id/results", optionalAuth, async (req, res) => {
  const t = await findTest(req, res);
  if (!t) return;
  if (status(t) !== "ENDED" && req.user?.role !== "ADMIN") {
    return res.status(409).json({ error: "Results come out when the test ends", endsAt: endsAt(t) });
  }
  if (status(t) === "ENDED") await finalize(t);
  const board = await ranking(t.id);
  let mine = null;
  if (req.user) {
    const e = await prisma.liveTestEntry.findUnique({ where: { testId_userId: { testId: t.id, userId: req.user.id } } });
    if (e?.submittedAt) {
      mine = {
        rank: board.find((r) => r.user.id === req.user.id)?.rank ?? null,
        score: e.score,
        timeMs: e.timeMs,
        review: t.questions.map((q, i) => ({
          question: q.question,
          code: q.code || "",
          options: q.options,
          answer: q.answer,
          chosen: e.answers?.[i] ?? null,
          explanation: q.explanation || "",
        })),
      };
    }
  }
  res.json({
    test: { id: t.id, title: t.title, topic: t.topic, startsAt: t.startsAt, endsAt: endsAt(t), questionCount: t.questions.length, status: status(t) },
    leaderboard: board,
    mine,
  });
});

// ---- Admin ----

const questionSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    code: z.string().max(2000).default(""),
    options: z.array(z.string().trim().min(1).max(400)).min(2).max(6),
    answer: z.number().int().min(0),
    explanation: z.string().trim().max(2000).default(""),
  })
  .refine((q) => q.answer < q.options.length, { message: "The answer must be one of the options", path: ["answer"] });

const testSchema = z.object({
  title: z.string().trim().min(1).max(200),
  topic: z.string().trim().max(200).default(""),
  startsAt: z.coerce.date(),
  durationMin: z.number().int().min(1).max(180).default(10),
  questions: z.array(questionSchema).min(1).max(100),
});

router.get("/admin/all", requireAdmin, async (_req, res) => {
  const tests = await prisma.liveTest.findMany({
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { entries: true } } },
  });
  res.json({
    tests: tests.map((t) => ({
      id: t.id, title: t.title, topic: t.topic, startsAt: t.startsAt, endsAt: endsAt(t), durationMin: t.durationMin,
      questionCount: t.questions.length, status: status(t), entries: t._count.entries,
    })),
  });
});

router.get("/admin/:id", requireAdmin, async (req, res) => {
  const t = await findTest(req, res);
  if (t) res.json({ test: t });
});

router.post("/admin", requireAdmin, async (req, res) => {
  const test = await prisma.liveTest.create({ data: testSchema.parse(req.body) });
  res.json({ test });
});

router.put("/admin/:id", requireAdmin, async (req, res) => {
  const t = await findTest(req, res);
  if (!t) return;
  const data = testSchema.parse(req.body);
  // Once anyone has joined, changing the questions would break their answers.
  const started = await prisma.liveTestEntry.count({ where: { testId: t.id, startedAt: { not: null } } });
  if (started && JSON.stringify(data.questions) !== JSON.stringify(t.questions)) {
    return res.status(409).json({ error: "Students have already taken this test, so its questions can't change" });
  }
  res.json({ test: await prisma.liveTest.update({ where: { id: t.id }, data }) });
});

router.delete("/admin/:id", requireAdmin, async (req, res) => {
  await prisma.liveTest.delete({ where: { id: Number(req.params.id) || 0 } });
  res.json({ ok: true });
});

export default router;
