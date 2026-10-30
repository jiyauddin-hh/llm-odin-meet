// Reel Studio: editors and admins make reels. Editors work inside their
// subjects and need an admin's approval; admins can publish directly.
import { Router } from "express";
import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireEditor } from "../lib/auth.js";
import { allowedSubjectIds, canUseTopic } from "../lib/questions.js";
import { reelSchema } from "../lib/reels.js";
import { requestRender } from "../lib/reelRender.js";
import { REEL_DOWNLOADS, reelDownloadPolicy, setSetting } from "../lib/settings.js";

export const UPLOAD_DIR = fileURLToPath(new URL("../../uploads", import.meta.url));

const router = Router();
router.use(requireEditor);

const isAdmin = (req) => req.user.role === "ADMIN";
const deny = (res, msg = "You don't have permission for this subject") => res.status(403).json({ error: msg });

const topicPath = { select: { id: true, name: true, chapter: { select: { name: true, subject: { select: { id: true, name: true } } } } } };

// Who may download reels (admins only).
router.get("/settings", async (req, res) => {
  res.json({ reelDownloads: await reelDownloadPolicy() });
});

router.put("/settings", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can change this");
  const { reelDownloads } = z.object({ reelDownloads: z.enum(REEL_DOWNLOADS) }).parse(req.body);
  await setSetting("reelDownloads", reelDownloads);
  res.json({ reelDownloads });
});

router.get("/", async (req, res) => {
  const allowed = await allowedSubjectIds(req.user);
  const { status, subject, q } = req.query;
  const reels = await prisma.reel.findMany({
    where: {
      AND: [
        allowed ? { topic: { chapter: { subjectId: { in: allowed } } } } : {},
        ["DRAFT", "IN_REVIEW", "PUBLISHED", "REJECTED"].includes(status) ? { status } : {},
        subject ? { topic: { chapter: { subjectId: Number(subject) } } } : {},
        q ? { title: { contains: String(q), mode: "insensitive" } } : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, slug: true, title: true, kind: true, status: true, reviewComment: true, views: true, updatedAt: true,
      downloads: true, renderStatus: true,
      topic: topicPath, createdBy: { select: { username: true } }, _count: { select: { likes: true, saves: true } },
    },
  });
  res.json({ reels });
});

async function loadEditable(req, res) {
  const reel = await prisma.reel.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!reel) return res.status(404).json({ error: "Reel not found" }), null;
  if (!isAdmin(req) && !(reel.topicId && (await canUseTopic(req.user, reel.topicId)))) return deny(res, "This reel is outside your subjects"), null;
  return reel;
}

async function parseReel(req, res, exceptId) {
  const data = reelSchema.parse(req.body);
  if (!isAdmin(req) && !data.topicId) return res.status(400).json({ error: "Pick a topic for the reel" }), null;
  if (data.topicId && !(await canUseTopic(req.user, data.topicId))) return deny(res, "You can't add reels to that topic"), null;
  if (await prisma.reel.findFirst({ where: { slug: data.slug, NOT: { id: exceptId ?? -1 } } })) {
    return res.status(409).json({ error: "Another reel already uses that URL slug" }), null;
  }
  if (data.practiceSlug && !(await prisma.problem.findUnique({ where: { slug: data.practiceSlug } }))) {
    return res.status(400).json({ error: `No question with slug "${data.practiceSlug}"` }), null;
  }
  if (data.videoUrl && !/^(\/uploads\/|https:\/\/)/.test(data.videoUrl)) {
    return res.status(400).json({ error: "Video link must start with https:// (or be an uploaded file)" }), null;
  }
  return { ...data, animation: data.kind === "ANIMATION" ? data.animation : undefined, videoUrl: data.kind === "VIDEO" ? data.videoUrl : null };
}

router.get("/:id", async (req, res) => {
  const reel = await loadEditable(req, res);
  if (reel) res.json({ reel });
});

router.post("/", async (req, res) => {
  const data = await parseReel(req, res);
  if (!data) return;
  const reel = await prisma.reel.create({ data: { ...data, status: "DRAFT", createdById: req.user.id } });
  res.status(201).json({ id: reel.id });
});

// Editing a live reel as an editor takes it offline until it's approved again.
router.put("/:id", async (req, res) => {
  const reel = await loadEditable(req, res);
  if (!reel) return;
  if (reel.status === "IN_REVIEW" && !isAdmin(req)) return res.status(400).json({ error: "This reel is waiting for review" });
  const data = await parseReel(req, res, reel.id);
  if (!data) return;
  const status = isAdmin(req) ? reel.status : reel.status === "REJECTED" ? "REJECTED" : "DRAFT";
  await prisma.reel.update({ where: { id: reel.id }, data: { ...data, status } });
  if (status === "PUBLISHED") await requestRender(reel.id); // an admin edited a live reel
  res.json({ ok: true, status });
});

router.post("/:id/submit", async (req, res) => {
  const reel = await loadEditable(req, res);
  if (!reel) return;
  if (reel.status === "PUBLISHED") return res.status(400).json({ error: "Already live" });
  await prisma.reel.update({ where: { id: reel.id }, data: { status: "IN_REVIEW", reviewComment: null } });
  res.json({ ok: true });
});

router.post("/:id/publish", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can publish");
  const reel = await loadEditable(req, res);
  if (!reel) return;
  await prisma.reel.update({ where: { id: reel.id }, data: { status: "PUBLISHED", reviewComment: null, publishedAt: reel.publishedAt ?? new Date() } });
  await requestRender(reel.id);
  res.json({ ok: true });
});

// Make the MP4 again, e.g. if it looks wrong.
router.post("/:id/render", async (req, res) => {
  const reel = await loadEditable(req, res);
  if (!reel) return;
  if (reel.kind !== "ANIMATION" || reel.status !== "PUBLISHED") {
    return res.status(400).json({ error: "Only live animated reels are turned into videos" });
  }
  await requestRender(reel.id, { force: true });
  res.json({ ok: true });
});

router.post("/:id/reject", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can reject");
  const reel = await loadEditable(req, res);
  if (!reel) return;
  const { comment } = z.object({ comment: z.string().trim().min(1, "Say what needs fixing").max(1000) }).parse(req.body);
  await prisma.reel.update({ where: { id: reel.id }, data: { status: "REJECTED", reviewComment: comment } });
  res.json({ ok: true });
});

router.post("/:id/unpublish", async (req, res) => {
  const reel = await loadEditable(req, res);
  if (!reel) return;
  await prisma.reel.update({ where: { id: reel.id }, data: { status: "DRAFT" } });
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  if (!isAdmin(req)) return deny(res, "Only admins can delete reels. You can unpublish it instead");
  await prisma.reel.delete({ where: { id: Number(req.params.id) || 0 } });
  res.json({ ok: true });
});

// Video upload: send the file as the raw request body with its Content-Type.
const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
router.post("/upload", express.raw({ type: Object.keys(VIDEO_TYPES), limit: "100mb" }), async (req, res) => {
  const ext = VIDEO_TYPES[req.headers["content-type"]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: "Upload an MP4, WebM or MOV video (max 100 MB)" });
  }
  await mkdir(`${UPLOAD_DIR}/reels`, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(`${UPLOAD_DIR}/reels/${name}`, req.body);
  res.status(201).json({ url: `/uploads/reels/${name}` });
});

export default router;
