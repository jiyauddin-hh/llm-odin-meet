import { prisma } from "./db.js";

export const REEL_DOWNLOADS = ["everyone", "users", "nobody"];

export async function getSetting(key, fallback) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

/** Who may download reels: "everyone" | "users" (logged in, the default) | "nobody". */
export const reelDownloadPolicy = () => getSetting("reelDownloads", "users");
