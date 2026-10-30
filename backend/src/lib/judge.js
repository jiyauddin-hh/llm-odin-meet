// Runs user code in a throwaway Docker container (see runner/).
// Each job gets no network, capped memory/CPU/processes, a read-only
// filesystem except a small /tmp, and runs as an unprivileged user.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const IMAGE = process.env.RUNNER_IMAGE || "quantumcode-runner";
const MAX_PARALLEL = Number(process.env.MAX_PARALLEL_JOBS || 4);

export const LANGUAGES = ["python", "javascript", "cpp", "java", "go"];

let running = 0;
const waiting = [];

async function withSlot(fn) {
  if (running >= MAX_PARALLEL) await new Promise((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function runContainer(job) {
  const name = `qc-job-${randomUUID()}`;
  const args = [
    "run", "--rm", "-i", "--name", name,
    "--network", "none",
    "--memory", "512m", "--memory-swap", "512m",
    "--cpus", "1", "--pids-limit", "128",
    "--read-only", "--tmpfs", "/tmp:rw,exec,size=128m,mode=1777",
    "--user", "65534:65534",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    IMAGE, "python3", "/judge/judge.py",
  ];
  // Hard ceiling for the whole container: compile time plus every test.
  const deadlineMs = 30_000 + job.tests.length * (job.timeLimitMs + 2_000);

  return new Promise((resolve) => {
    const child = spawn("docker", args);
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      spawn("docker", ["kill", name]);
      resolve({ verdict: "Time Limit Exceeded", results: [] });
    }, deadlineMs);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ verdict: "Internal Error", error: e.message, results: [] });
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out));
      } catch {
        console.error("Judge failed:", err || out);
        resolve({ verdict: "Internal Error", error: "Judge failed to run", results: [] });
      }
    });
    child.stdin.end(JSON.stringify(job));
  });
}

/**
 * @param {{language: string, code: string, timeLimitMs: number,
 *          tests: {input: string, expected: string|null}[]}} job
 */
export function judge(job) {
  return withSlot(() => runContainer(job));
}
