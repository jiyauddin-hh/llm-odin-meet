// Shared logic for the Question Manager: the question shape, who may edit what,
// verifying the reference solution, and publishing a draft.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { judge, LANGUAGES } from "./judge.js";

export const questionSchema = z.object({
  title: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and - only"),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  topicId: z.number().int({ message: "Pick a topic" }),
  tags: z.array(z.string().trim().min(1)).default([]),
  companies: z.array(z.string().trim().min(1)).default([]),
  timeLimitMs: z.number().int().min(100).max(10_000).default(2000),
  description: z.string().min(1, "Write a description"),
  inputFormat: z.string().default(""),
  outputFormat: z.string().default(""),
  constraints: z.string().default(""),
  hints: z.array(z.string().trim().min(1)).default([]),
  editorial: z.string().default(""),
  solutionLanguage: z.enum(LANGUAGES).default("python"),
  solutionCode: z.string().default(""),
  starterCode: z.record(z.string()).default({}),
  testCases: z
    .array(
      z.object({
        input: z.string(),
        expected: z.string(),
        isSample: z.boolean().default(false),
        explanation: z.string().nullish().transform((v) => v || null),
      }),
    )
    .min(1, "Add at least one test case"),
});

/** The live (published) version of a problem in editor-form shape. */
export function liveSnapshot(problem) {
  return {
    title: problem.title,
    slug: problem.slug,
    difficulty: problem.difficulty,
    topicId: problem.topicId,
    tags: problem.tags,
    companies: problem.companies,
    timeLimitMs: problem.timeLimitMs,
    description: problem.description,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraints: problem.constraints,
    hints: problem.hints,
    editorial: problem.editorial,
    solutionLanguage: problem.solutionLanguage,
    solutionCode: problem.solutionCode,
    starterCode: problem.starterCode || {},
    testCases: (problem.testCases || []).map(({ input, expected, isSample, explanation }) => ({
      input,
      expected,
      isSample,
      explanation,
    })),
  };
}

/** What an editor is working on: the pending draft, or else the live version. */
export function workingCopy(problem) {
  return problem.draft || liveSnapshot(problem);
}

// ---- Permissions ----

export async function allowedSubjectIds(user) {
  if (user.role === "ADMIN") return null; // null = every subject
  const rows = await prisma.editorSubject.findMany({ where: { userId: user.id }, select: { subjectId: true } });
  return rows.map((r) => r.subjectId);
}

export async function subjectOfTopic(topicId) {
  if (!topicId) return null;
  const topic = await prisma.topic.findUnique({ where: { id: topicId }, include: { chapter: true } });
  return topic?.chapter.subjectId ?? null;
}

export async function canUseTopic(user, topicId) {
  if (user.role === "ADMIN") return true;
  const subjectId = await subjectOfTopic(topicId);
  if (subjectId === null) return false;
  return (await allowedSubjectIds(user)).includes(subjectId);
}

/** Editors may touch a question only if both its live and draft topics are theirs. */
export async function canEditProblem(user, problem) {
  if (user.role === "ADMIN") return true;
  const topics = new Set([problem.topicId, problem.draft?.topicId].filter(Boolean));
  if (!topics.size) return false;
  for (const t of topics) if (!(await canUseTopic(user, t))) return false;
  return true;
}

// ---- Verification and publishing ----

/** Runs the reference solution against every test case. */
export async function verify(data) {
  if (!data.solutionCode.trim()) {
    return { ok: false, verdict: "No solution", message: "Add a correct reference solution first. It proves the test cases are right." };
  }
  const result = await judge({
    language: data.solutionLanguage,
    code: data.solutionCode,
    timeLimitMs: data.timeLimitMs,
    tests: data.testCases.map((t) => ({ input: t.input, expected: t.expected })),
  });
  const results = (result.results || []).map((r, i) => ({
    verdict: r.verdict,
    timeMs: r.timeMs,
    stdout: r.stdout,
    stderr: r.stderr,
    expected: data.testCases[i].expected,
    input: data.testCases[i].input,
  }));
  const ok = result.verdict === "Accepted";
  return {
    ok,
    verdict: result.verdict,
    compileOutput: result.compileOutput || result.error || null,
    results,
    message: ok
      ? `Reference solution passed all ${results.length} tests.`
      : "The reference solution failed. Fix the solution or the expected outputs.",
  };
}

export async function slugTaken(slug, exceptId) {
  const other = await prisma.problem.findFirst({ where: { slug, NOT: { id: exceptId ?? -1 } }, select: { id: true } });
  return !!other;
}

export async function recordRevision(problemId, user, action, snapshot, comment = null) {
  await prisma.problemRevision.create({
    data: { problemId, userId: user?.id ?? null, action, snapshot, comment },
  });
}

/** Copies a verified working copy into the live fields and makes it public. */
export async function publish(problem, user, comment = null) {
  const data = workingCopy(problem);
  const { testCases, ...fields } = data;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.testCase.deleteMany({ where: { problemId: problem.id } });
    return tx.problem.update({
      where: { id: problem.id },
      data: {
        ...fields,
        published: true,
        approvedAt: new Date(),
        workflow: null,
        draft: Prisma.DbNull,
        reviewComment: null,
        testCases: { create: testCases.map((t, order) => ({ ...t, order })) },
      },
    });
  });
  await recordRevision(problem.id, user, "published", data, comment);
  return updated;
}
