// Turns animated reels into Instagram-ready MP4s (1080×1920, 30 fps, H.264 +
// AAC voice-over at -14 LUFS) that people can download.
// A hidden Chrome plays the reel's render page (/reels/render/<slug>) at
// 1080×1920; every painted frame is captured with its timestamp, and ffmpeg
// joins the frames into an H.264 MP4. One reel renders at a time.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "./db.js";
import { narrate, narrationHash, ttsAvailable, wavPath } from "./narration.js";

const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_SECONDS = 90;

let uploadDir = null;
const queue = [];
let busy = false;

/** What the video depends on; a change means the file must be made again. */
export function renderHash(reel) {
  return createHash("sha1")
    .update(JSON.stringify({ v: 5, title: reel.title, animation: reel.animation, practiceSlug: reel.practiceSlug, voice: ttsAvailable() && narrationHash(reel) }))
    .digest("hex")
    .slice(0, 16);
}

/** Queues a published animated reel for rendering unless its video is current. */
export async function requestRender(reelId, { force = false } = {}) {
  const reel = await prisma.reel.findUnique({ where: { id: reelId } });
  if (!reel || reel.kind !== "ANIMATION" || reel.status !== "PUBLISHED") return;
  const hash = renderHash(reel);
  const fileOk = reel.renderUrl && existsSync(join(uploadDir, reel.renderUrl.replace(/^\/uploads\//, "")));
  if (!force && reel.renderStatus === "READY" && reel.renderHash === hash && fileOk) return;
  if (queue.includes(reelId)) return;
  await prisma.reel.update({ where: { id: reelId }, data: { renderStatus: "QUEUED", renderError: null } });
  queue.push(reelId);
  pump();
}

async function pump() {
  if (busy || !queue.length) return;
  busy = true;
  const id = queue.shift();
  try {
    await renderOne(id);
  } catch (e) {
    console.error(`Reel ${id} render failed:`, e.message);
    await prisma.reel.update({ where: { id }, data: { renderStatus: "FAILED", renderError: e.message.slice(0, 500) } }).catch(() => {});
  } finally {
    busy = false;
    pump();
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`))));
  });
}

async function renderOne(id) {
  const reel = await prisma.reel.findUnique({ where: { id } });
  if (!reel || reel.kind !== "ANIMATION" || reel.status !== "PUBLISHED") return;
  const hash = renderHash(reel);
  await prisma.reel.update({ where: { id }, data: { renderStatus: "RENDERING" } });

  // 1. Voice-over (the render page times each step to its clip).
  let narration = null;
  if (ttsAvailable()) {
    narration = await narrate(reel, uploadDir);
    await prisma.reel.update({ where: { id }, data: { narration } });
  }

  const { chromium } = await import("playwright-core");
  const work = await mkdtemp(join(tmpdir(), "qc-reel-"));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--disable-gpu", "--hide-scrollbars", "--mute-audio"],
    // Playwright's own signal handlers would stop Node from exiting on SIGTERM,
    // which breaks restarts (God Father, ./stop.sh). Chrome dies with our process group.
    handleSIGTERM: false,
    handleSIGINT: false,
    handleSIGHUP: false,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
    const port = Number(process.env.PORT || 7319);
    await page.goto(`http://127.0.0.1:${port}/reels/render/${encodeURIComponent(reel.slug)}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__reelReady === true, null, { timeout: 30_000 });

    const cdp = await page.context().newCDPSession(page);
    const frames = [];
    cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
      frames.push({ data, t: metadata.timestamp });
      await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__start());
    await page.waitForFunction(() => window.__reelDone === true, null, { timeout: MAX_SECONDS * 1000, polling: 50 });
    // Frames only arrive when the picture changes, so the video ends at the
    // moment the page said it was done (screencast timestamps are wall-clock seconds).
    const doneAt = Date.now() / 1000;
    await cdp.send("Page.stopScreencast");
    const marks = await page.evaluate(() => window.__marks || []);
    if (frames.length < 2) throw new Error("No frames were captured");

    // Each frame lasts until the next one; the concat list carries those durations.
    const end = Math.max(doneAt, frames[frames.length - 1].t + 0.1);
    let list = "";
    for (const [i, f] of frames.entries()) {
      const file = `f${String(i).padStart(5, "0")}.jpg`;
      await writeFile(join(work, file), Buffer.from(f.data, "base64"));
      const duration = ((frames[i + 1]?.t ?? end) - f.t).toFixed(4);
      list += `file '${file}'\nduration ${duration}\n`;
    }
    list += `file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`; // concat demuxer needs the last file twice
    await writeFile(join(work, "list.txt"), list);

    await mkdir(join(uploadDir, "reels", "rendered"), { recursive: true });
    const name = `${reel.slug}-${hash}.mp4`;

    // 2. Voice clips start exactly when the page showed their part.
    const clipFor = (key) =>
      !narration ? null : key === "intro" ? narration.intro : key === "outro" ? narration.outro : narration.steps[Number(key.slice(1))];
    const audio = marks
      .map((m) => ({ clip: clipFor(m.key), delay: Math.max(0, Math.round(m.t - frames[0].t * 1000)) }))
      .filter((a) => a.clip);
    const inputs = audio.flatMap((a) => ["-i", wavPath(uploadDir, a.clip.url)]);
    const filters = ["[0:v]scale=1080:1920:flags=lanczos,format=yuv420p[v]"];
    if (audio.length) {
      audio.forEach((a, i) => filters.push(`[${i + 1}:a]aresample=48000,adelay=${a.delay}:all=1[a${i}]`));
      filters.push(
        `${audio.map((_, i) => `[a${i}]`).join("")}amix=inputs=${audio.length}:normalize=0:dropout_transition=0,` +
          "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,apad[a]",
      );
    } else {
      // Instagram prefers a sound track, so add silence.
      filters.push("anullsrc=channel_layout=stereo:sample_rate=48000[a]");
    }
    await run(FFMPEG, [
      "-y", "-f", "concat", "-safe", "0", "-i", join(work, "list.txt"), ...inputs,
      "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", "-r", "30",
      "-c:v", "libx264", "-profile:v", "high", "-level", "4.1", "-preset", "medium", "-crf", "20",
      "-maxrate", "10M", "-bufsize", "20M", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
      join(uploadDir, "reels", "rendered", name),
    ]);

    // Only mark ready if nobody edited the reel while it rendered.
    const latest = await prisma.reel.findUnique({ where: { id } });
    const current = latest && renderHash(latest) === hash;
    await prisma.reel.update({
      where: { id },
      data: current
        ? { renderStatus: "READY", renderHash: hash, renderUrl: `/uploads/reels/rendered/${name}`, renderError: null, renderedAt: new Date() }
        : { renderStatus: "NONE" },
    });
    if (!current) await requestRender(id);
    // The previous version's file is no longer needed.
    const newUrl = `/uploads/reels/rendered/${name}`;
    if (current && reel.renderUrl && reel.renderUrl !== newUrl) {
      await unlink(join(uploadDir, reel.renderUrl.replace(/^\/uploads\//, ""))).catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
    await rm(work, { recursive: true, force: true });
  }
}

/** Called once at startup: remembers where files live and catches up on missing videos. */
export async function startRenderer(dir) {
  uploadDir = dir;
  // Anything interrupted by a restart goes back in the queue.
  const reels = await prisma.reel.findMany({ where: { status: "PUBLISHED", kind: "ANIMATION" }, select: { id: true } });
  for (const r of reels) await requestRender(r.id).catch((e) => console.error("render queue:", e.message));
}
