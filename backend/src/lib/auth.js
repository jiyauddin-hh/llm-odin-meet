import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

const SECRET = process.env.JWT_SECRET;

export function signToken(user) {
  return jwt.sign({ id: user.id }, SECRET, { expiresIn: "7d" });
}

export function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

async function loadUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const { id } = jwt.verify(header.slice(7), SECRET);
    return await prisma.user.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

// Attaches req.user when a valid token is present, but never rejects.
export async function optionalAuth(req, _res, next) {
  req.user = await loadUser(req);
  next();
}

export async function requireAuth(req, res, next) {
  req.user = await loadUser(req);
  if (!req.user) return res.status(401).json({ error: "Please log in" });
  next();
}

export async function requireAdmin(req, res, next) {
  req.user = await loadUser(req);
  if (!req.user) return res.status(401).json({ error: "Please log in" });
  if (req.user.role !== "ADMIN") return res.status(403).json({ error: "Admins only" });
  next();
}

// Admins and editors (the Question Manager).
export async function requireEditor(req, res, next) {
  req.user = await loadUser(req);
  if (!req.user) return res.status(401).json({ error: "Please log in" });
  if (!["ADMIN", "EDITOR"].includes(req.user.role)) return res.status(403).json({ error: "Editors only" });
  next();
}

// Teachers and admins (classrooms).
export const canTeach = (user) => ["TEACHER", "ADMIN"].includes(user?.role);

export async function requireTeacher(req, res, next) {
  req.user = await loadUser(req);
  if (!req.user) return res.status(401).json({ error: "Please log in" });
  if (!canTeach(req.user)) return res.status(403).json({ error: "Teachers only" });
  next();
}
