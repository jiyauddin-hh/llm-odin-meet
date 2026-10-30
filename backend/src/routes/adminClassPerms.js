// Admin: who may use voice, video, screen share, chat, the code editor and
// Run in live classrooms. Role defaults plus per-user overrides; changes
// apply to classes that are running right now.
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";
import { FEATURES, PERM_ROLES, getRoleDefaults, permsFor, pick, setRoleDefaults } from "../lib/classPerms.js";
import { refreshPermissions } from "../lib/classroom.js";

const router = Router();
router.use(requireAdmin);

const flags = z.object(Object.fromEntries(FEATURES.map((f) => [f, z.boolean()]))).partial();

router.get("/", async (_req, res) => {
  res.json({ features: FEATURES, roles: PERM_ROLES, defaults: await getRoleDefaults() });
});

router.put("/defaults", async (req, res) => {
  const { defaults } = z.object({ defaults: z.object(Object.fromEntries(PERM_ROLES.map((r) => [r, flags]))).partial() }).parse(req.body);
  // Merge feature by feature: saving one switch must not reset the role's other switches.
  const current = await getRoleDefaults();
  const merged = Object.fromEntries(PERM_ROLES.map((r) => [r, { ...current[r], ...defaults[r] }]));
  const saved = await setRoleDefaults(merged);
  await refreshPermissions();
  res.json({ defaults: saved });
});

router.get("/users", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const onlyCustom = req.query.custom === "1";
  const [users, defaults] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...(q && { OR: [{ username: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }),
        ...(onlyCustom && { classPerms: { not: Prisma.DbNull } }),
      },
      orderBy: { id: "asc" },
      take: 100,
      select: { id: true, username: true, name: true, email: true, avatarUrl: true, role: true, classPerms: true },
    }),
    getRoleDefaults(),
  ]);
  res.json({
    users: users
      .map((u) => ({ ...u, overrides: pick(u.classPerms), effective: permsFor(u, defaults), classPerms: undefined }))
      .filter((u) => !onlyCustom || Object.keys(u.overrides).length),
  });
});

// Saves for one person run one after another, so two quick changes can't
// both read the old settings and the second overwrite the first.
const queues = new Map();
function serial(key, fn) {
  const run = (queues.get(key) || Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => queues.get(key) === tail && queues.delete(key));
  return run;
}

// overrides: { cam: false, mic: true, screen: null } — null clears that override.
router.put("/users/:id", async (req, res) => {
  const id = Number(req.params.id) || 0;
  const { overrides } = z
    .object({ overrides: z.object(Object.fromEntries(FEATURES.map((f) => [f, z.boolean().nullable()]))).partial() })
    .parse(req.body);
  const saved = await serial(id, async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    const next = { ...pick(user.classPerms) };
    for (const [f, v] of Object.entries(overrides)) {
      if (v === null) delete next[f];
      else next[f] = v;
    }
    return prisma.user.update({
      where: { id },
      data: { classPerms: Object.keys(next).length ? next : Prisma.DbNull },
      select: { id: true, username: true, name: true, email: true, avatarUrl: true, role: true, classPerms: true },
    });
  });
  await refreshPermissions([id]);
  res.json({ user: { ...saved, overrides: pick(saved.classPerms), effective: permsFor(saved, await getRoleDefaults()), classPerms: undefined } });
});

export default router;
