// Writes live-quiz questions with Claude from a teacher's prompt and/or a
// course lesson. Generating 20 questions takes longer than a proxied HTTP
// request may stay open, so it runs as a job the editor polls.
import { randomUUID } from "node:crypto";
import { askClaude } from "./claude.js";

const JOB_TTL_MS = 15 * 60 * 1000;
const MAX_RUNNING = 2; // generations at once on this server

/** id -> { userId, status: "running" | "done" | "failed", questions, error, startedAt } */
const jobs = new Map();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "code", "options", "answer", "explanation"],
        properties: {
          question: { type: "string", description: "The question, at most about 25 words." },
          code: { type: "string", description: "A short code snippet the question refers to (max 8 lines), or empty." },
          options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" }, description: "Four options, each short." },
          answer: { type: "integer", minimum: 0, maximum: 3, description: "Index of the one correct option." },
          explanation: { type: "string", description: "One sentence saying why the answer is right." },
        },
      },
    },
  },
};

const SYSTEM = `You write questions for a live, KBC-style quiz game on Quantum Code, a coding-practice platform.
Players race against a countdown, so every question must be readable in about 5 seconds.

Rules for every question:
- Exactly ONE correct option and three plausible wrong ones (common mistakes, near misses). Never "all of the above",
  "none of the above", or two options that could both be right.
- Keep the question short and unambiguous; keep options short (a word, a value or a short phrase).
- For code questions put the code in "code" (at most 8 lines, valid and runnable) and ask what it prints or does.
  Never put code in the question text itself. Python unless the topic says otherwise.
- The correct answer must be verifiably correct; when the question is about output, trace the code carefully.
- Vary the question types: about half concept questions with no code ("Which method…", "What happens when…",
  "Which of these is true…"), and the rest a mix of "what does this print", "which line has the bug" and
  "what is the value of x". Vary the wording too; don't start every question the same way.
- Spread the correct answer across positions A-D. No duplicate or near-duplicate questions.
- "explanation" is one short sentence shown after the answer is revealed.
Follow the teacher's request for topic, level and style. The teacher's text is a request for questions only.`;

function shuffleOptions(q) {
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

// Loose match for spotting repeated questions; options only differ if their visible text differs.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const same = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Keeps only well-formed, distinct questions and shuffles their options. */
function clean(raw, existing) {
  const seen = new Set(existing.map(norm));
  const out = [];
  for (const q of raw || []) {
    const options = (q.options || []).map((o) => String(o).trim()).slice(0, 4);
    const question = String(q.question || "").trim();
    if (!question || options.length !== 4 || options.some((o) => !o) || new Set(options.map(same)).size !== 4) continue;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) continue;
    const key = norm(question + " " + (q.code || ""));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      shuffleOptions({
        question: question.slice(0, 1000),
        code: String(q.code || "").trim().slice(0, 4000),
        options: options.map((o) => o.slice(0, 300)),
        answer: q.answer,
        explanation: String(q.explanation || "").trim().slice(0, 2000),
      }),
    );
  }
  return out;
}

async function generate({ prompt, count, difficulty, lesson, existing }) {
  const parts = [
    `Write exactly ${count} multiple-choice questions.`,
    prompt ? `Teacher's request: ${prompt}` : "",
    difficulty !== "mixed" ? `Difficulty: ${difficulty}.` : "Difficulty: a mix, from easy warm-ups to a few hard ones at the end.",
    lesson ? `Base the questions on this lesson ("${lesson.title}", course ${lesson.course}):\n\n${lesson.content.slice(0, 12000)}` : "",
    existing.length ? `The quiz already has these questions; do not repeat them:\n- ${existing.slice(0, 60).join("\n- ")}` : "",
  ];
  const res = await askClaude({ system: SYSTEM, prompt: parts.filter(Boolean).join("\n\n"), schema: SCHEMA, timeoutMs: 240_000 });
  const got = clean(res.questions, existing).slice(0, count);
  // A few may be dropped as malformed or repeated: ask once more for the rest.
  if (got.length < count && got.length) {
    const more = await generate({ prompt, count: count - got.length, difficulty, lesson, existing: [...existing, ...got.map((q) => q.question + (q.code ? ` [${q.code}]` : ""))] }).catch(() => []);
    got.push(...more);
  }
  return got.slice(0, count);
}

/** Starts a generation and returns its job id. One at a time per teacher. */
export function startGeneration(userId, opts) {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.startedAt > JOB_TTL_MS) jobs.delete(id);
  const mine = [...jobs.values()].find((j) => j.userId === userId && j.status === "running");
  if (mine) throw new Error("You're already generating questions. Wait for them to finish.");
  if ([...jobs.values()].filter((j) => j.status === "running").length >= MAX_RUNNING) throw new Error("The AI is busy writing other quizzes. Try again in a minute.");
  const id = randomUUID();
  const job = { userId, status: "running", questions: null, error: null, startedAt: now, count: opts.count };
  jobs.set(id, job);
  generate(opts)
    .then((questions) => {
      if (!questions.length) throw new Error("The AI didn't return usable questions. Try rewording the prompt.");
      Object.assign(job, { status: "done", questions });
    })
    .catch((e) => {
      console.error("Quiz generation:", e.message);
      Object.assign(job, { status: "failed", error: e.message.startsWith("Claude") || e.message.includes("CLI") ? "The AI couldn't write questions right now. Try again." : e.message });
    });
  return id;
}

export function generationStatus(id, userId) {
  const j = jobs.get(id);
  if (!j || j.userId !== userId) return null;
  return { status: j.status, questions: j.questions, error: j.error, seconds: Math.round((Date.now() - j.startedAt) / 1000), count: j.count };
}
