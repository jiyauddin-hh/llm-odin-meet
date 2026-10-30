import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { publicUser, requireAdmin } from "../lib/auth.js";
import { refreshPermissions } from "../lib/classroom.js";

const router = Router();
router.use(requireAdmin);

router.get("/stats", async (_req, res) => {
  const [users, problems, submissions, accepted, courses, pendingRequests] = await Promise.all([
    prisma.user.count(),
    prisma.problem.count(),
    prisma.submission.count(),
    prisma.submission.count({ where: { verdict: "Accepted" } }),
    prisma.course.count(),
    prisma.accessRequest.count({ where: { status: "PENDING" } }),
  ]);
  const pendingChapters = await prisma.chapterRequest.count({ where: { status: "PENDING" } });
  res.json({ users, problems, submissions, accepted, courses, pendingRequests: pendingRequests + pendingChapters });
});

// ---- Problems ----

router.get("/problems", async (_req, res) => {
  const problems = await prisma.problem.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true, slug: true, title: true, difficulty: true, published: true, tags: true, workflow: true, approvedAt: true,
      _count: { select: { testCases: true, submissions: true } },
    },
  });
  res.json({ problems });
});

router.delete("/problems/:id", async (req, res) => {
  await prisma.problem.delete({ where: { id: Number(req.params.id) || 0 } });
  res.json({ ok: true });
});

// ---- Users ----

router.get("/users", async (req, res) => {
  const q = String(req.query.q || "");
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : {},
    orderBy: { id: "asc" },
    take: 200,
    include: { _count: { select: { submissions: true, solves: true } } },
  });
  res.json({ users: users.map(publicUser) });
});

router.patch("/users/:id", async (req, res) => {
  const id = Number(req.params.id) || 0;
  const { role } = z.object({ role: z.enum(["USER", "EDITOR", "TEACHER", "ADMIN"]) }).parse(req.body);
  if (id === req.user.id) return res.status(400).json({ error: "You can't change your own role" });
  const user = await prisma.user.update({ where: { id }, data: { role } });
  await refreshPermissions([id]); // classroom permissions follow the role
  res.json({ user: publicUser(user) });
});

// An admin sets a new password for a locked-out user. Any open reset link stops working too.
router.put("/users/:id/password", async (req, res) => {
  const id = Number(req.params.id) || 0;
  const { password } = z.object({ password: z.string().min(6).max(100) }).parse(req.body);
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  res.json({ ok: true });
});

router.delete("/users/:id", async (req, res) => {
  const id = Number(req.params.id) || 0;
  if (id === req.user.id) return res.status(400).json({ error: "You can't delete yourself" });
  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;

// ---- Editor subjects ----

router.get("/users/:id/subjects", async (req, res) => {
  const userId = Number(req.params.id) || 0;
  const [subjects, assigned] = await Promise.all([
    prisma.subject.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, name: true, icon: true } }),
    prisma.editorSubject.findMany({ where: { userId } }),
  ]);
  const set = new Set(assigned.map((a) => a.subjectId));
  res.json({ subjects: subjects.map((s) => ({ ...s, assigned: set.has(s.id) })) });
});

router.put("/users/:id/subjects", async (req, res) => {
  const userId = Number(req.params.id) || 0;
  const { subjectIds } = z.object({ subjectIds: z.array(z.number().int()) }).parse(req.body);
  await prisma.$transaction([
    prisma.editorSubject.deleteMany({ where: { userId } }),
    prisma.editorSubject.createMany({ data: subjectIds.map((subjectId) => ({ userId, subjectId })) }),
  ]);
  res.json({ ok: true });
});
