// Creates the admin account and a starter set of problems. Safe to re-run.
import "../src/lib/env.js";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db.js";
import { COURSES } from "./courses.js";
import { PLACEMENT, STRUCTURE } from "./structure.js";
import { PYTHON_CH1, PYTHON_CH2, next530pmIST } from "./liveTests.js";

const STARTER = {
  python: "import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # Write your code here\n\nmain()\n",
  javascript:
    "const data = require('fs').readFileSync(0, 'utf8').trim().split(/\\s+/);\n// Write your code here\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your code here\n    return 0;\n}\n",
  java: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        // Write your code here\n    }\n}\n",
};

const t = (input, expected, isSample = false, explanation = null) => ({ input, expected, isSample, explanation });

const PROBLEMS = [
  {
    slug: "sum-of-two-numbers",
    title: "Sum of Two Numbers",
    difficulty: "EASY",
    tags: ["Math", "Basics"],
    description: "Read two integers **a** and **b** and print their sum.",
    inputFormat: "A single line with two integers `a` and `b`.",
    outputFormat: "Print `a + b`.",
    constraints: "-10^9 ≤ a, b ≤ 10^9",
    tests: [t("2 3", "5", true, "2 + 3 = 5"), t("-7 10", "3", true), t("1000000000 1000000000", "2000000000"), t("0 0", "0"), t("-5 -6", "-11")],
  },
  {
    slug: "reverse-a-string",
    title: "Reverse a String",
    difficulty: "EASY",
    tags: ["Strings"],
    description: "Given a string **s**, print it reversed.",
    inputFormat: "A single line containing the string `s` (no spaces).",
    outputFormat: "Print the reversed string.",
    constraints: "1 ≤ |s| ≤ 10^5",
    tests: [t("hello", "olleh", true), t("quantum", "mutnauq", true), t("a", "a"), t("racecar", "racecar"), t("ab12CD", "DC21ba")],
  },
  {
    slug: "fizzbuzz",
    title: "FizzBuzz",
    difficulty: "EASY",
    tags: ["Basics", "Loops"],
    description:
      "Print the numbers from 1 to **n**, one per line. For multiples of 3 print `Fizz` instead, for multiples of 5 print `Buzz`, and for multiples of both print `FizzBuzz`.",
    inputFormat: "A single integer `n`.",
    outputFormat: "`n` lines as described.",
    constraints: "1 ≤ n ≤ 10^4",
    tests: [
      t("5", "1\n2\nFizz\n4\nBuzz", true),
      t("15", "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz", true),
      t("1", "1"),
      t("3", "1\n2\nFizz"),
    ],
  },
  {
    slug: "array-maximum",
    title: "Maximum in Array",
    difficulty: "EASY",
    tags: ["Arrays"],
    description: "Given an array of **n** integers, print the largest one.",
    inputFormat: "First line: `n`. Second line: `n` space-separated integers.",
    outputFormat: "The maximum value.",
    constraints: "1 ≤ n ≤ 10^5, -10^9 ≤ a[i] ≤ 10^9",
    tests: [t("5\n3 9 2 7 4", "9", true), t("3\n-5 -2 -8", "-2", true), t("1\n42", "42"), t("4\n1000000000 -1000000000 0 5", "1000000000")],
  },
  {
    slug: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "MEDIUM",
    tags: ["Stack", "Strings"],
    description:
      "Given a string containing only the characters `()[]{}`, decide whether it is **valid**: every opening bracket is closed by the same type of bracket, in the correct order.",
    inputFormat: "A single line containing the bracket string.",
    outputFormat: "Print `YES` if valid, otherwise `NO`.",
    constraints: "1 ≤ |s| ≤ 10^5",
    tests: [t("()[]{}", "YES", true), t("([)]", "NO", true, "The brackets close in the wrong order."), t("{[]}", "YES"), t("((", "NO"), t("]", "NO"), t("{{[[(())]]}}", "YES")],
  },
  {
    slug: "two-sum-indices",
    title: "Two Sum",
    difficulty: "MEDIUM",
    tags: ["Arrays", "Hashing"],
    description:
      "Given an array of **n** integers and a target **k**, find two different indices `i < j` (0-based) such that `a[i] + a[j] = k`. Exactly one answer exists.",
    inputFormat: "First line: `n k`. Second line: `n` integers.",
    outputFormat: "Print `i j`.",
    constraints: "2 ≤ n ≤ 10^5",
    tests: [t("4 9\n2 7 11 15", "0 1", true, "2 + 7 = 9"), t("3 6\n3 2 4", "1 2", true), t("2 6\n3 3", "0 1"), t("5 0\n-3 1 8 3 10", "0 3")],
  },
  {
    slug: "longest-increasing-subsequence",
    title: "Longest Increasing Subsequence",
    difficulty: "HARD",
    tags: ["Dynamic Programming", "Binary Search"],
    description:
      "Given an array of **n** integers, print the length of its longest **strictly increasing** subsequence. An O(n log n) solution is needed for the largest tests.",
    inputFormat: "First line: `n`. Second line: `n` integers.",
    outputFormat: "The length of the LIS.",
    constraints: "1 ≤ n ≤ 2·10^5",
    tests: [
      t("8\n10 9 2 5 3 7 101 18", "4", true, "One LIS is 2 3 7 101."),
      t("6\n0 1 0 3 2 3", "4", true),
      t("7\n7 7 7 7 7 7 7", "1"),
      t("1\n5", "1"),
      t("200000\n" + Array.from({ length: 200000 }, (_, i) => i).join(" "), "200000"),
    ],
  },
  {
    slug: "shortest-path-grid",
    title: "Shortest Path in a Grid",
    difficulty: "HARD",
    tags: ["Graphs", "BFS"],
    description:
      "You are given an **r × c** grid of `.` (open) and `#` (wall). Moving up, down, left or right, find the fewest steps from the top-left cell to the bottom-right cell. Print `-1` if it can't be reached.",
    inputFormat: "First line: `r c`. Then `r` lines of `c` characters.",
    outputFormat: "The minimum number of steps, or `-1`.",
    constraints: "1 ≤ r, c ≤ 1000. The start and end cells are open.",
    tests: [
      t("3 3\n...\n.#.\n...", "4", true),
      t("2 2\n.#\n#.", "-1", true, "The end is walled off."),
      t("1 1\n.", "0"),
      t("3 4\n..#.\n#...\n.#..", "5"),
    ],
  },
];

async function main() {
  const email = "admin@quantumcode.dev";
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      username: "admin",
      name: "Admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash("admin123", 10),
    },
  });

  for (const { tests, ...p } of PROBLEMS) {
    const exists = await prisma.problem.findUnique({ where: { slug: p.slug } });
    if (exists) continue;
    await prisma.problem.create({
      data: {
        ...p,
        starterCode: STARTER,
        testCases: { create: tests.map((x, order) => ({ ...x, order })) },
      },
    });
  }
  // Subjects → chapters → topics, created once; starter questions are filed into them.
  if ((await prisma.subject.count()) === 0) {
    const topicIds = new Map();
    for (const [si, s] of STRUCTURE.entries()) {
      const subject = await prisma.subject.create({ data: { name: s.name, icon: s.icon, order: si } });
      for (const [ci, c] of s.chapters.entries()) {
        const chapter = await prisma.chapter.create({ data: { subjectId: subject.id, name: c.name, order: ci } });
        for (const [ti, t] of c.topics.entries()) {
          const topic = await prisma.topic.create({ data: { chapterId: chapter.id, name: t, order: ti } });
          topicIds.set([s.name, c.name, t].join("/"), topic.id);
        }
      }
    }
    for (const [slug, info] of Object.entries(PLACEMENT)) {
      await prisma.problem.updateMany({
        where: { slug, topicId: null },
        data: {
          topicId: topicIds.get(info.path.join("/")),
          hints: info.hints,
          editorial: info.editorial,
          companies: info.companies || [],
          solutionLanguage: "python",
          solutionCode: info.solution,
        },
      });
    }
  }
  // Questions that were live before the review workflow count as approved.
  await prisma.problem.updateMany({ where: { published: true, approvedAt: null, workflow: null }, data: { approvedAt: new Date() } });

  const problemIds = new Map((await prisma.problem.findMany({ select: { id: true, slug: true } })).map((p) => [p.slug, p.id]));
  for (const [order, { modules, ...c }] of COURSES.entries()) {
    if (await prisma.course.findUnique({ where: { slug: c.slug } })) continue;
    await prisma.course.create({
      data: {
        ...c,
        order,
        modules: {
          create: modules.map((m, mi) => ({
            title: m.title,
            order: mi,
            unlockMode: mi === 0 ? "FREE" : "PERMISSION", // chapter 1 is a free preview
            lessons: {
              create: m.lessons.map(({ problems, ...l }, li) => ({
                ...l,
                order: li,
                problemIds: problems.map((s) => problemIds.get(s)).filter(Boolean),
              })),
            },
          })),
        },
      },
    });
  }

  // The daily live tests, each at the next free 5:30 PM IST.
  for (const test of [PYTHON_CH1, PYTHON_CH2]) {
    if (await prisma.liveTest.findFirst({ where: { title: test.title } })) continue;
    const last = await prisma.liveTest.findFirst({ orderBy: { startsAt: "desc" } });
    const startsAt = next530pmIST(last && last.startsAt > new Date() ? last.startsAt : new Date());
    await prisma.liveTest.create({ data: { ...test, startsAt } });
  }

  console.log(`Seeded admin (${email} / admin123) ${PROBLEMS.length} problems and ${COURSES.length} courses.`);
}

main().finally(() => prisma.$disconnect());
