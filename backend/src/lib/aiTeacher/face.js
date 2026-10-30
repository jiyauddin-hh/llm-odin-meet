// The AI teacher's talking face: the MuseTalk renderer in tools/avatar
// (server.py) on the GPU. It is started for a class and stopped afterwards, so
// the GPU is only busy while an AI class prepares or runs. Ollama's models are
// unloaded first (they reload on their next use): both don't fit on the card.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const AVATAR_DIR = fileURLToPath(new URL("../../../../tools/avatar", import.meta.url));
const PYTHON = join(AVATAR_DIR, ".venv", "bin", "python");
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
export const FACE_FILE = process.env.AI_TEACHER_FACE || join(AVATAR_DIR, "faces", "teacher.jpg");

export function faceAvailable() {
  return existsSync(PYTHON) && existsSync(join(AVATAR_DIR, "MuseTalk", "models", "musetalkV15", "unet.pth")) && existsSync(FACE_FILE);
}

/** Asks Ollama to unload whatever it holds on the GPU. Returns the model names it unloaded. */
export async function freeGpu() {
  try {
    const res = await fetch(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return [];
    const { models = [] } = await res.json();
    for (const m of models) {
      await fetch(`${OLLAMA}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m.name, keep_alive: 0 }),
        signal: AbortSignal.timeout(20000),
      }).catch(() => {});
    }
    return models.map((m) => m.name);
  } catch {
    return []; // Ollama isn't running
  }
}

/**
 * One renderer process. Jobs run one at a time (the GPU does one anyway);
 * urgent jobs (a live answer to a student) jump ahead of the lesson's backlog.
 */
export class FaceRenderer {
  constructor() {
    this.proc = null;
    this.ready = null;
    this.pending = new Map();
    this.jobs = [];
    this.busy = false;
    this.nextId = 1;
    this.face = null; // the last prepare command, replayed if the process has to restart
    this.prepared = false;
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const p = spawn(PYTHON, [join(AVATAR_DIR, "server.py")], { stdio: ["pipe", "pipe", "pipe"] });
      this.proc = p;
      let tail = "";
      p.stderr.on("data", (d) => (tail = (tail + d).slice(-4000)));
      createInterface({ input: p.stdout }).on("line", (line) => {
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.ready) return resolve();
        const job = this.pending.get(msg.id);
        if (!job) return;
        this.pending.delete(msg.id);
        if (msg.ok) job.resolve(msg);
        else job.reject(new Error(msg.error || "Render failed"));
      });
      p.on("error", reject);
      p.on("exit", (code) => {
        const last = tail.trim().split("\n").filter(Boolean).pop() || "";
        const err = new Error(`The face renderer stopped (${code ?? "killed"}) ${last}`.trim());
        reject(err);
        for (const job of this.pending.values()) job.reject(err);
        this.pending.clear();
        this.proc = null;
        this.ready = null;
        this.prepared = false;
      });
    });
    return this.ready;
  }

  /** Queues a command for server.py and resolves with its answer. */
  send(cmd, { urgent = false } = {}) {
    return new Promise((resolve, reject) => {
      const job = { cmd, resolve, reject };
      if (urgent) this.jobs.unshift(job);
      else this.jobs.push(job);
      this.pump();
    });
  }

  async pump() {
    if (this.busy) return;
    const job = this.jobs.shift();
    if (!job) return;
    this.busy = true;
    try {
      await this.start();
      // A restarted renderer has forgotten the face: prepare it again first.
      if (job.cmd.cmd !== "prepare" && this.face && !this.prepared) await this.call(this.face);
      const res = await this.call(job.cmd);
      if (job.cmd.cmd === "prepare") {
        this.face = job.cmd;
        this.prepared = true;
      }
      job.resolve(res);
    } catch (e) {
      job.reject(e);
    } finally {
      this.busy = false;
      this.pump();
    }
  }

  call(cmd) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify({ id, ...cmd })}\n`);
    });
  }

  prepare(cacheDir) {
    return this.send({ cmd: "prepare", face: FACE_FILE, dir: cacheDir });
  }

  render(wav, out, opts) {
    return this.send({ cmd: "render", wav, out }, opts);
  }

  idle(out, seconds = 10) {
    return this.send({ cmd: "idle", out, seconds });
  }

  /** Stops the renderer and frees the GPU. Queued jobs are dropped. */
  stop() {
    const err = new Error("The face renderer was stopped");
    for (const job of this.jobs.splice(0)) job.reject(err);
    const p = this.proc;
    if (!p) return;
    p.stdin.end();
    setTimeout(() => p.exitCode === null && p.kill("SIGKILL"), 5000).unref();
  }
}
