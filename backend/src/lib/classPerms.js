// What each person may do in a live classroom. Every role (except admins,
// who can always do everything) has defaults the admin sets; on top of that
// a single user can be explicitly allowed or blocked per feature. The host
// of a class always has every feature in their own class.
import { prisma } from "./db.js";
import { getSetting, setSetting } from "./settings.js";

export const FEATURES = ["mic", "cam", "screen", "chat", "pen", "run"];
export const PERM_ROLES = ["USER", "EDITOR", "TEACHER"];

const ALL = Object.fromEntries(FEATURES.map((f) => [f, true]));
const SETTING_KEY = "classPerms";

let cache = null;

/** Role defaults: { USER: { mic: true, ... }, EDITOR: {...}, TEACHER: {...} }. Missing values count as allowed. */
export async function getRoleDefaults() {
  if (cache) return cache;
  let saved = {};
  try {
    saved = JSON.parse(await getSetting(SETTING_KEY, "{}")) || {};
  } catch {}
  cache = Object.fromEntries(PERM_ROLES.map((r) => [r, { ...ALL, ...pick(saved[r]) }]));
  return cache;
}

export async function setRoleDefaults(defaults) {
  const clean = Object.fromEntries(PERM_ROLES.map((r) => [r, { ...ALL, ...pick(defaults[r]) }]));
  await setSetting(SETTING_KEY, JSON.stringify(clean));
  cache = clean;
  return clean;
}

/** Only known features with boolean values (null/undefined = follow the role default). */
export function pick(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const f of FEATURES) if (typeof obj[f] === "boolean") out[f] = obj[f];
  return out;
}

/** Effective permissions for a user, given the role defaults. */
export function permsFor(user, defaults) {
  if (!user || user.role === "ADMIN") return { ...ALL };
  return { ...ALL, ...(defaults[user.role] || {}), ...pick(user.classPerms) };
}

export const allPerms = () => ({ ...ALL });

/** Fresh permissions straight from the database (used when someone joins a class). */
export async function loadPerms(userId) {
  const [user, defaults] = await Promise.all([prisma.user.findUnique({ where: { id: userId } }), getRoleDefaults()]);
  return permsFor(user, defaults);
}
