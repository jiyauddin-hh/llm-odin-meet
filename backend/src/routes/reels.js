// Public reels feed. Reels are free for everyone; liking and saving need an account.
import { Router } from "express";
import { prisma } from "../lib/db.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { optionalAuth, requireAuth } from "../lib/auth.js";
import { reelDownloadPolicy } from "../lib/settings.js";
import { UPLOAD_DIR } from "./manageReels.js";

const router = Router();

const topicPath = { select: { id: true, name: true, chapter: { select: { name: true, subject: { select: { id: true, name: true, icon: true } } } } } };

/**
 * Can this viewer download this reel right now?
 * "ready" | "login" (must log in first) | "preparing" (video being made) | "off"
 */
function downloadState(reel, policy, user) {
  if (policy === "nobody" || !reel.allowDownload) return "off";
  if (reel.kind === "VIDEO") {
    if (!reel.videoUrl?.startsWith("/uploads/")) return "off"; // YouTube and other sites: not ours to hand out
  } else if (reel.renderStatus !== "READY") {
    return "preparing";
  }
  return policy === "users" && !user ? "login" : "ready";
}

async function present(reels, user) {
  const policy = await reelDownloadPolicy();
  const ids = reels.map((r) => r.id);
  const [likeCounts, mine, saved] = await Promise.all([
    prisma.reelLike.groupBy({ by: ["reelId"], where: { reelId: { in: ids } }, _count: true }),
    user ? prisma.reelLike.findMany({ where: { userId: user.id, reelId: { in: ids } }, select: { reelId: true } }) : [],
    user ? prisma.reelSave.findMany({ where: { userId: user.id, reelId: { in: ids } }, select: { reelId: true } }) : [],
  ]);
  const counts = new Map(likeCounts.map((l) => [l.reelId, l._count]));
  const liked = new Set(mine.map((l) => l.reelId));
  const savedSet = new Set(saved.map((s) => s.reelId));
  return reels.map(({ allowDownload, renderStatus, renderUrl, ...r }) => ({
    ...r,
    likes: counts.get(r.id) || 0,
    liked: liked.has(r.id),
    saved: savedSet.has(r.id),
    download: downloadState({ ...r, allowDownload, renderStatus }, policy, user),
  }));
}

const publicSelect = {
  id: true, slug: true, title: true, description: true, kind: true, animation: true, videoUrl: true,
  practiceSlug: true, views: true, publishedAt: true, topic: topicPath,
  allowDownload: true, renderStatus: true, renderUrl: true, narration: true,
};

// ?subject=ID  ?topics=1,2,3  ?saved=1  ?limit=N
router.get("/", optionalAuth, async (req, res) => {
  const { subject, topics, saved } = req.query;
  if (saved && !req.user) return res.status(401).json({ error: "Log in to see saved reels" });
  const topicIds = topics ? String(topics).split(",").map(Number).filter(Boolean) : null;
  const reels = await prisma.reel.findMany({
    where: {
      status: "PUBLISHED",
      ...(subject && { topic: { chapter: { subjectId: Number(subject) } } }),
      ...(topicIds && { topicId: { in: topicIds } }),
      ...(saved && { saves: { some: { userId: req.user.id } } }),
    },
    select: publicSelect,
    orderBy: [{ topic: { chapter: { subject: { order: "asc" } } } }, { topic: { chapter: { order: "asc" } } }, { topic: { order: "asc" } }, { id: "asc" }],
    take: Math.min(Number(req.query.limit) || 200, 200),
  });
  const subjects = await prisma.subject.findMany({
    where: { chapters: { some: { topics: { some: { reels: { some: { status: "PUBLISHED" } } } } } } },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, name: true, icon: true },
  });
  res.json({ reels: await present(reels, req.user), subjects });
});

router.get("/:slug", optionalAuth, async (req, res) => {
  const reel = await prisma.reel.findFirst({ where: { slug: req.params.slug, status: "PUBLISHED" }, select: publicSelect });
  if (!reel) return res.status(404).json({ error: "Reel not found" });
  res.json({ reel: (await present([reel], req.user))[0] });
});

async function published(id) {
  return prisma.reel.findFirst({ where: { id: Number(id) || 0, status: "PUBLISHED" }, select: { id: true } });
}

// The MP4 file, as an attachment. Logged-in only unless the admin allows everyone.
router.get("/:id/download", optionalAuth, async (req, res) => {
  const reel = await prisma.reel.findFirst({ where: { id: Number(req.params.id) || 0, status: "PUBLISHED" } });
  if (!reel) return res.status(404).json({ error: "Reel not found" });
  const state = downloadState(reel, await reelDownloadPolicy(), req.user);
  if (state === "login") return res.status(401).json({ error: "Log in to download reels" });
  if (state === "preparing") return res.status(409).json({ error: "The video is still being prepared. Try again in a minute." });
  if (state !== "ready") return res.status(403).json({ error: "Downloading isn't available for this reel" });

  const url = reel.kind === "VIDEO" ? reel.videoUrl : reel.renderUrl;
  const file = join(UPLOAD_DIR, url.replace(/^\/uploads\//, ""));
  if (!existsSync(file)) return res.status(404).json({ error: "The video file is missing" });
  await prisma.reel.update({ where: { id: reel.id }, data: { downloads: { increment: 1 } } });
  res.download(file, `${reel.slug}${file.slice(file.lastIndexOf("."))}`);
});

router.post("/:id/view", async (req, res) => {
  const reel = await published(req.params.id);
  if (!reel) return res.status(404).json({ error: "Reel not found" });
  await prisma.reel.update({ where: { id: reel.id }, data: { views: { increment: 1 } } });
  res.json({ ok: true });
});

for (const [path, model] of [["like", "reelLike"], ["save", "reelSave"]]) {
  router.post(`/:id/${path}`, requireAuth, async (req, res) => {
    const reel = await published(req.params.id);
    if (!reel) return res.status(404).json({ error: "Reel not found" });
    await prisma[model].createMany({ data: [{ userId: req.user.id, reelId: reel.id }], skipDuplicates: true });
    res.json({ ok: true });
  });
  router.delete(`/:id/${path}`, requireAuth, async (req, res) => {
    await prisma[model].deleteMany({ where: { userId: req.user.id, reelId: Number(req.params.id) || 0 } });
    res.json({ ok: true });
  });
}

export default router;
