// Checks one part of the Machine Learning course (content/ml/partN.json):
// lessons, quizzes, Mermaid flowcharts and diagram widgets, and runs every
// question's reference solution through the real sandbox judge.
//   node scripts/ml-check.js ../content/ml/part1.json
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const { questionSchema, verify } = await import("../src/lib/questions.js");
const { quizSchema } = await import("../src/lib/courses.js");

const SYLLABUS = JSON.parse(readFileSync(new URL("../../content/ml/syllabus.json", import.meta.url), "utf8"));
const valid = new Map(SYLLABUS.map(([c, ts]) => [c, new Set(ts)]));
const WIDGETS = ["gradient-descent", "linear-regression", "sigmoid", "activation-functions", "normal-distribution", "overfitting", "bias-variance", "kfold",
  "kmeans", "knn", "decision-tree", "neural-network", "confusion-matrix", "svm-margin", "pca", "roc-curve"];

const file = process.argv[2];
const data = JSON.parse(readFileSync(file, "utf8"));
let problems = 0;
const fail = (msg) => { problems++; console.log("FAIL", msg); };
const blocks = (md, lang) => [...md.matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);

// 1. Lessons
const charts = [];
for (const l of data.lessons || []) {
  const where = `lesson "${l.topic}"`;
  if (!valid.get(l.chapter)?.has(l.topic)) fail(`${where}: unknown chapter/topic "${l.chapter}" / "${l.topic}"`);
  if (!l.content || l.content.length < 1500) fail(`${where}: content too short (${l.content?.length || 0} chars, need 1500+)`);
  const mermaid = blocks(l.content || "", "mermaid");
  if (!mermaid.length) fail(`${where}: needs at least one \`\`\`mermaid flowchart/diagram`);
  mermaid.forEach((code) => charts.push({ where, code }));
  for (const d of blocks(l.content || "", "diagram")) {
    const name = d.trim().split(/\s/)[0];
    const rest = d.trim().slice(name.length).trim();
    if (!WIDGETS.includes(name)) fail(`${where}: unknown diagram widget "${name}"`);
    if (rest) try { JSON.parse(rest); } catch { fail(`${where}: diagram "${name}" settings are not valid JSON`); }
  }
  const quiz = quizSchema.safeParse(l.quiz);
  if (!quiz.success) fail(`${where}: quiz ${quiz.error.issues[0].path.join(".")}: ${quiz.error.issues[0].message}`);
  else if (quiz.data.length < 3) fail(`${where}: quiz needs at least 3 questions`);
  else if (quiz.data.some((q) => !q.explanation)) fail(`${where}: every quiz question needs an explanation`);
}

// 2. Flowcharts: parse each one with the real Mermaid library in Chrome.
if (charts.length) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome" });
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ path: fileURLToPath(new URL("../../frontend/node_modules/mermaid/dist/mermaid.min.js", import.meta.url)) });
  const errors = await page.evaluate(async (list) => {
    window.mermaid.initialize({ startOnLoad: false });
    const out = [];
    for (const [i, c] of list.entries()) {
      try { await window.mermaid.parse(c.code.trim()); }
      catch (e) { out.push(`${c.where}: mermaid chart #${i} is invalid: ${String(e.message || e).split("\n").slice(0, 3).join(" ")}`); }
    }
    return out;
  }, charts);
  await browser.close();
  errors.forEach(fail);
}

// 3. Practice questions
const slugs = new Set();
const bulk = questionSchema.omit({ topicId: true });
const results = await Promise.all((data.questions || []).map(async (q) => {
  const label = q.slug || q.title;
  if (!valid.get(q.chapter)?.has(q.topic)) return `unknown chapter/topic "${q.chapter}" / "${q.topic}" in ${label}`;
  if (q.subject !== "Machine Learning") return `${label}: subject must be "Machine Learning"`;
  if (!/^ml-[a-z0-9-]+$/.test(q.slug || "")) return `${label}: slug must look like ml-something`;
  if (slugs.has(q.slug)) return `${label}: duplicate slug`;
  slugs.add(q.slug);
  const parsed = bulk.safeParse(q);
  if (!parsed.success) return `${label}: ${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`;
  if (q.testCases.length < 4) return `${label}: needs at least 4 test cases`;
  if (!q.testCases.some((t) => t.isSample)) return `${label}: needs a sample test`;
  if (!q.editorial?.trim()) return `${label}: needs an editorial (the answer explanation)`;
  const r = await verify(parsed.data);
  if (!r.ok) {
    const bad = r.results?.find((x) => x.verdict !== "Accepted");
    return `${label}: solution ${r.verdict}${r.compileOutput ? " " + r.compileOutput.slice(0, 200) : ""}${bad ? ` | input=${JSON.stringify(bad.input).slice(0, 80)} got=${JSON.stringify(bad.stdout).slice(0, 80)} expected=${JSON.stringify(bad.expected).slice(0, 80)} stderr=${(bad.stderr || "").slice(-300)}` : ""}`;
  }
  return null;
}));
results.filter(Boolean).forEach(fail);

const asked = new Set((data.questions || []).map((q) => q.topic));
console.log(`\n${data.lessons?.length || 0} lessons, ${charts.length} flowcharts, ${data.questions?.length || 0} questions checked. ${problems ? problems + " problem(s)" : "ALL OK"}`);
for (const l of data.lessons || []) if (!asked.has(l.topic)) console.log("note: no practice question for topic", l.topic);
process.exit(problems ? 1 : 0);
