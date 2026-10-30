// Question Manager: editors and admins organise and write practice questions.
// Editors work only inside subjects assigned to them, and their work goes live
// only after an admin approves it. Admins can publish directly.
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { requireEditor } from "../lib/auth.js";
import {
  allowedSubjectIds,
  canEditProblem,
  canUseTopic,
  liveSnapshot,
  publish,
  questionSchema,
  recordRevision,
  slugTaken,
  verify,
  workingCopy,
} from "../lib/questions.js";

const router = Router();
router.use(requireEditor);

const isAdmin = (req) => req.user.role === "ADMIN";
const deny = (res, msg = "You don't have permission for this subject") => res.status(403).json({ error: msg });

// ---- Structure: subjects → chapters → topics ----

router.get("/tree", async (req, res) => {
  const allowed = await allowedSubjectIds(req.user);
  const subjects = await prisma.subject.findMany({
    where: allowed ? { id: { in: allowed } } : {},
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: {
      chapters: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        include: { topics: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { _count: { select: { problems: true } } } } },
      },
    },
  });
  const [unassigned, inReview] = await Promise.all([
    isAdmin(req) ? prisma.problem.count({ where: { topicId: null } }) : 0,
    isAdmin(req) ? prisma.problem.count({ where: { workflow: "IN_REVIEW" } }) : 0,
  ]);
  res.json({
    subjects: subjects.map((s) => ({
      ...s,
      chapters: s.chapters.map((c) => ({
        ...c,
        topics: c.topics.map(({ _count, ...t }) => ({ ...t, count: _count.problems })),
      })),
    })),
    unassigned,
    inReview,
    canManageSubjects: isAdmin(req),
  });
});

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });

router.post("/subjects", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can add subjects");
  const { name, icon } = nameSchema.extend({ icon: z.string().trim().max(8).optional() }).parse(req.body);
  const count = await prisma.subject.count();
  res.status(201).json({ subject: await prisma.subject.create({ data: { name, icon: icon || "📚", order: count } }) });
});

router.put("/subjects/:id", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can rename subjects");
  const { name, icon } = nameSchema.extend({ icon: z.string().trim().max(8).optional() }).parse(req.body);
  res.json({
    subject: await prisma.subject.update({ where: { id: Number(req.params.id) || 0 }, data: { name, ...(icon && { icon }) } }),
  });
});

router.delete("/subjects/:id", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can delete subjects");
  const id = Number(req.params.id) || 0;
  if (await prisma.problem.count({ where: { topic: { chapter: { subjectId: id } } } })) {
    return res.status(400).json({ error: "Move or delete this subject's questions first" });
  }
  await prisma.subject.delete({ where: { id } });
  res.json({ ok: true });
});

async function canUseSubject(req, subjectId) {
  const allowed = await allowedSubjectIds(req.user);
  return !allowed || allowed.includes(subjectId);
}

router.post("/chapters", async (req, res) => {
  const { name, subjectId } = nameSchema.extend({ subjectId: z.number().int() }).parse(req.body);
  if (!(await canUseSubject(req, subjectId))) return deny(res);
  const count = await prisma.chapter.count({ where: { subjectId } });
  res.status(201).json({ chapter: await prisma.chapter.create({ data: { name, subjectId, order: count } }) });
});

router.put("/chapters/:id", async (req, res) => {
  const { name } = nameSchema.parse(req.body);
  const chapter = await prisma.chapter.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });
  if (!(await canUseSubject(req, chapter.subjectId))) return deny(res);
  res.json({ chapter: await prisma.chapter.update({ where: { id: chapter.id }, data: { name } }) });
});

router.delete("/chapters/:id", async (req, res) => {
  const chapter = await prisma.chapter.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });
  if (!(await canUseSubject(req, chapter.subjectId))) return deny(res);
  if (await prisma.problem.count({ where: { topic: { chapterId: chapter.id } } })) {
    return res.status(400).json({ error: "Move or delete this chapter's questions first" });
  }
  await prisma.chapter.delete({ where: { id: chapter.id } });
  res.json({ ok: true });
});

router.post("/topics", async (req, res) => {
  const { name, chapterId } = nameSchema.extend({ chapterId: z.number().int() }).parse(req.body);
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) return res.status(404).json({ error: "Chapter not found" });
  if (!(await canUseSubject(req, chapter.subjectId))) return deny(res);
  const count = await prisma.topic.count({ where: { chapterId } });
  res.status(201).json({ topic: await prisma.topic.create({ data: { name, chapterId, order: count } }) });
});

router.put("/topics/:id", async (req, res) => {
  const { name } = nameSchema.parse(req.body);
  const topic = await prisma.topic.findUnique({ where: { id: Number(req.params.id) || 0 }, include: { chapter: true } });
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  if (!(await canUseSubject(req, topic.chapter.subjectId))) return deny(res);
  res.json({ topic: await prisma.topic.update({ where: { id: topic.id }, data: { name } }) });
});

router.delete("/topics/:id", async (req, res) => {
  const topic = await prisma.topic.findUnique({ where: { id: Number(req.params.id) || 0 }, include: { chapter: true } });
  if (!topic) return res.status(404).json({ error: "Topic not found" });
  if (!(await canUseSubject(req, topic.chapter.subjectId))) return deny(res);
  if (await prisma.problem.count({ where: { topicId: topic.id } })) {
    return res.status(400).json({ error: "Move or delete this topic's questions first" });
  }
  await prisma.topic.delete({ where: { id: topic.id } });
  res.json({ ok: true });
});

// Sets the order of sibling items: { type: "subject"|"chapter"|"topic", ids: [...] }.
router.put("/reorder", async (req, res) => {
  const { type, ids } = z.object({ type: z.enum(["subject", "chapter", "topic"]), ids: z.array(z.number().int()) }).parse(req.body);
  if (type === "subject" && !isAdmin(req)) return deny(res, "Only admins can reorder subjects");
  const model = { subject: prisma.subject, chapter: prisma.chapter, topic: prisma.topic }[type];
  if (type !== "subject") {
    for (const id of ids) {
      const subjectId =
        type === "chapter"
          ? (await prisma.chapter.findUnique({ where: { id } }))?.subjectId
          : (await prisma.topic.findUnique({ where: { id }, include: { chapter: true } }))?.chapter.subjectId;
      if (!subjectId || !(await canUseSubject(req, subjectId))) return deny(res);
    }
  }
  await prisma.$transaction(ids.map((id, order) => model.update({ where: { id }, data: { order } })));
  res.json({ ok: true });
});

// ---- Questions ----

const listSelect = {
  id: true,
  slug: true,
  title: true,
  difficulty: true,
  published: true,
  approvedAt: true,
  workflow: true,
  reviewComment: true,
  updatedAt: true,
  draft: true,
  topic: { select: { id: true, name: true, chapter: { select: { id: true, name: true, subject: { select: { id: true, name: true } } } } } },
  _count: { select: { testCases: true, submissions: true } },
};

function listItem({ draft, ...p }) {
  return { ...p, draftTitle: draft?.title && draft.title !== p.title ? draft.title : null };
}

router.get("/problems", async (req, res) => {
  const allowed = await allowedSubjectIds(req.user);
  const { subject, chapter, topic, q, status, difficulty } = req.query;
  const where = {
    AND: [
      allowed ? { topic: { chapter: { subjectId: { in: allowed } } } } : {},
      subject ? { topic: { chapter: { subjectId: Number(subject) } } } : {},
      chapter ? { topic: { chapterId: Number(chapter) } } : {},
      topic === "none" ? { topicId: null } : topic ? { topicId: Number(topic) } : {},
      q ? { OR: [{ title: { contains: String(q), mode: "insensitive" } }, { slug: { contains: String(q), mode: "insensitive" } }] } : {},
      difficulty ? { difficulty: String(difficulty).toUpperCase() } : {},
      status === "live" ? { published: true } : {},
      status === "hidden" ? { published: false } : {},
      ["DRAFT", "IN_REVIEW", "REJECTED"].includes(status) ? { workflow: status } : {},
    ],
  };
  const problems = await prisma.problem.findMany({ where, select: listSelect, orderBy: { updatedAt: "desc" }, take: 500 });
  res.json({ problems: problems.map(listItem) });
});

async function loadEditable(req, res) {
  const problem = await prisma.problem.findUnique({
    where: { id: Number(req.params.id) || 0 },
    include: { testCases: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
  });
  if (!problem) return res.status(404).json({ error: "Question not found" }), null;
  if (!(await canEditProblem(req.user, problem))) return deny(res, "This question is outside your subjects"), null;
  return problem;
}

function meta(problem) {
  return {
    id: problem.id,
    published: problem.published,
    approvedAt: problem.approvedAt,
    workflow: problem.workflow,
    reviewComment: problem.reviewComment,
    hasPendingChanges: !!problem.draft && !!problem.approvedAt,
    liveSlug: problem.slug,
    updatedAt: problem.updatedAt,
  };
}

router.get("/problems/:id", async (req, res) => {
  const problem = await loadEditable(req, res);
  if (!problem) return;
  res.json({ question: workingCopy(problem), meta: meta(problem) });
});

/** Validates a question body and checks the editor may use its topic and slug. */
async function parseQuestion(req, res, exceptId) {
  const data = questionSchema.parse(req.body);
  if (!(await canUseTopic(req.user, data.topicId))) return deny(res, "You can't add questions to that topic"), null;
  if (await slugTaken(data.slug, exceptId)) return res.status(409).json({ error: "Another question already uses that URL slug" }), null;
  return data;
}

router.post("/problems", async (req, res) => {
  const data = await parseQuestion(req, res);
  if (!data) return;
  const { testCases, ...fields } = data;
  const problem = await prisma.problem.create({
    data: {
      ...fields,
      published: false,
      workflow: "DRAFT",
      draft: data,
      testCases: { create: testCases.map((t, order) => ({ ...t, order })) },
    },
  });
  await recordRevision(problem.id, req.user, "created", data);
  res.status(201).json({ id: problem.id });
});

// Saves the working copy. Live questions keep showing the approved version.
router.put("/problems/:id", async (req, res) => {
  const problem = await loadEditable(req, res);
  if (!problem) return;
  if (problem.workflow === "IN_REVIEW" && !isAdmin(req)) {
    return res.status(400).json({ error: "This question is waiting for review. Ask an admin to reject it if you need changes." });
  }
  const data = await parseQuestion(req, res, problem.id);
  if (!data) return;
  await prisma.problem.update({
    where: { id: problem.id },
    data: { draft: data, workflow: "DRAFT", ...(problem.workflow === "REJECTED" ? {} : { reviewComment: null }) },
  });
  await recordRevision(problem.id, req.user, "saved", data);
  res.json({ ok: true });
});

router.post("/problems/:id/verify", async (req, res) => {
  const problem = await loadEditable(req, res);
  if (!problem) return;
  res.json(await verify(workingCopy(problem)));
});

router.post("/problems/:id/submit", async (req, res) => {
  const problem = await loadEditable(req, res);
  if (!problem) return;
  if (!problem.draft) return res.status(400).json({ error: "There are no changes to send" });
  const check = await verify(problem.draft);
  if (!check.ok) return res.status(400).json({ error: check.message, check });
  await prisma.problem.update({ where: { id: problem.id }, data: { workflow: "IN_REVIEW", reviewComment: null } });
  await recordRevision(problem.id, req.user, "sent for review", problem.draft);
  res.json({ ok: true, check });
});

router.post("/problems/:id/publish", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can publish");
  const problem = await loadEditable(req, res);
  if (!problem) return;
  const { comment } = z.object({ comment: z.string().max(1000).optional() }).parse(req.body || {});
  const check = await verify(workingCopy(problem));
  if (!check.ok) return res.status(400).json({ error: check.message, check });
  await publish(problem, req.user, comment || null);
  res.json({ ok: true, check });
});

router.post("/problems/:id/reject", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can reject");
  const problem = await loadEditable(req, res);
  if (!problem) return;
  const { comment } = z.object({ comment: z.string().trim().min(1, "Say what needs fixing").max(1000) }).parse(req.body);
  await prisma.problem.update({ where: { id: problem.id }, data: { workflow: "REJECTED", reviewComment: comment } });
  await recordRevision(problem.id, req.user, "rejected", workingCopy(problem), comment);
  res.json({ ok: true });
});

// Throws away unpublished changes to a live question.
router.post("/problems/:id/discard", async (req, res) => {
  const problem = await loadEditable(req, res);
  if (!problem) return;
  if (!problem.approvedAt) return res.status(400).json({ error: "This question has never been published, so there is nothing to go back to" });
  await prisma.problem.update({ where: { id: problem.id }, data: { draft: Prisma.DbNull, workflow: null, reviewComment: null } });
  await recordRevision(problem.id, req.user, "discarded changes", liveSnapshot(problem));
  res.json({ ok: true });
});

// Editors can hide a question; only admins can show it again.
router.post("/problems/:id/visibility", async (req, res) => {
  const { published } = z.object({ published: z.boolean() }).parse(req.body);
  const problem = await loadEditable(req, res);
  if (!problem) return;
  if (published && !isAdmin(req)) return deny(res, "Only admins can make a question visible again");
  if (published && !problem.approvedAt) return res.status(400).json({ error: "Publish it first. It has never been approved" });
  await prisma.problem.update({ where: { id: problem.id }, data: { published } });
  await recordRevision(problem.id, req.user, published ? "made visible" : "hidden", liveSnapshot(problem));
  res.json({ ok: true });
});

router.post("/problems/:id/duplicate", async (req, res) => {
  const problem = await loadEditable(req, res);
  if (!problem) return;
  const source = workingCopy(problem);
  let slug = `${source.slug}-copy`;
  for (let n = 2; await slugTaken(slug); n++) slug = `${source.slug}-copy-${n}`;
  const data = { ...source, slug, title: `${source.title} (copy)` };
  const { testCases, ...fields } = data;
  const copy = await prisma.problem.create({
    data: {
      ...fields,
      published: false,
      workflow: "DRAFT",
      draft: data,
      testCases: { create: testCases.map((t, order) => ({ ...t, order })) },
    },
  });
  await recordRevision(copy.id, req.user, `duplicated from #${problem.id}`, data);
  res.status(201).json({ id: copy.id });
});

router.delete("/problems/:id", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can delete questions. You can hide it instead");
  await prisma.problem.delete({ where: { id: Number(req.params.id) || 0 } });
  res.json({ ok: true });
});

// ---- History ----

router.get("/problems/:id/history", async (req, res) => {
  const problem = await loadEditable(req, res);
  if (!problem) return;
  const revisions = await prisma.problemRevision.findMany({
    where: { problemId: problem.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { username: true } } },
  });
  res.json({ title: workingCopy(problem).title, revisions });
});

router.post("/problems/:id/restore/:revisionId", async (req, res) => {
  const problem = await loadEditable(req, res);
  if (!problem) return;
  const revision = await prisma.problemRevision.findFirst({
    where: { id: Number(req.params.revisionId) || 0, problemId: problem.id },
  });
  if (!revision) return res.status(404).json({ error: "Version not found" });
  const data = questionSchema.parse(revision.snapshot);
  if (!(await canUseTopic(req.user, data.topicId))) return deny(res, "That version is in a topic outside your subjects");
  if (await slugTaken(data.slug, problem.id)) return res.status(409).json({ error: "Another question now uses that version's URL slug" });
  await prisma.problem.update({ where: { id: problem.id }, data: { draft: data, workflow: "DRAFT" } });
  await recordRevision(problem.id, req.user, `restored version from ${revision.createdAt.toISOString().slice(0, 16).replace("T", " ")}`, data);
  res.json({ ok: true });
});

// ---- Review queue (admins) ----

router.get("/review", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Admins only");
  const problems = await prisma.problem.findMany({ where: { workflow: "IN_REVIEW" }, select: listSelect, orderBy: { updatedAt: "asc" } });
  const lastSubmit = await prisma.problemRevision.findMany({
    where: { problemId: { in: problems.map((p) => p.id) }, action: "sent for review" },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { username: true } } },
  });
  const by = new Map();
  for (const r of lastSubmit) if (!by.has(r.problemId)) by.set(r.problemId, { user: r.user?.username, at: r.createdAt });
  res.json({ problems: problems.map((p) => ({ ...listItem(p), submitted: by.get(p.id) || null })) });
});

// ---- Bulk upload ----

const bulkItem = questionSchema.omit({ topicId: true }).extend({
  subject: z.string().trim().min(1),
  chapter: z.string().trim().min(1),
  topic: z.string().trim().min(1),
});

/** Creates drafts from a JSON list. Missing chapters/topics are created inside allowed subjects. */
router.post("/bulk", async (req, res) => {
  const { questions } = z.object({ questions: z.array(z.unknown()).min(1).max(200) }).parse(req.body);
  const allowed = await allowedSubjectIds(req.user);
  const report = [];

  for (const [i, raw] of questions.entries()) {
    const row = { index: i + 1, title: raw?.title || `#${i + 1}` };
    const parsed = bulkItem.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      report.push({ ...row, ok: false, error: `${issue.path.join(".")}: ${issue.message}` });
      continue;
    }
    const { subject: subjectName, chapter: chapterName, topic: topicName, ...data } = parsed.data;
    const subject = await prisma.subject.findFirst({ where: { name: { equals: subjectName, mode: "insensitive" } } });
    if (!subject) {
      report.push({ ...row, ok: false, error: `Subject "${subjectName}" doesn't exist. An admin must create it first` });
      continue;
    }
    if (allowed && !allowed.includes(subject.id)) {
      report.push({ ...row, ok: false, error: `You don't have permission for "${subject.name}"` });
      continue;
    }
    if (await slugTaken(data.slug)) {
      report.push({ ...row, ok: false, error: `Slug "${data.slug}" is already used` });
      continue;
    }
    let chapter = await prisma.chapter.findFirst({ where: { subjectId: subject.id, name: { equals: chapterName, mode: "insensitive" } } });
    chapter ||= await prisma.chapter.create({
      data: { subjectId: subject.id, name: chapterName, order: await prisma.chapter.count({ where: { subjectId: subject.id } }) },
    });
    let topic = await prisma.topic.findFirst({ where: { chapterId: chapter.id, name: { equals: topicName, mode: "insensitive" } } });
    topic ||= await prisma.topic.create({
      data: { chapterId: chapter.id, name: topicName, order: await prisma.topic.count({ where: { chapterId: chapter.id } }) },
    });

    const question = { ...data, topicId: topic.id };
    const { testCases, ...fields } = question;
    const problem = await prisma.problem.create({
      data: {
        ...fields,
        published: false,
        workflow: "DRAFT",
        draft: question,
        testCases: { create: testCases.map((t, order) => ({ ...t, order })) },
      },
    });
    await recordRevision(problem.id, req.user, "bulk upload", question);
    report.push({ ...row, ok: true, id: problem.id });
  }
  res.json({ created: report.filter((r) => r.ok).length, failed: report.filter((r) => !r.ok).length, report });
});

export default router;
