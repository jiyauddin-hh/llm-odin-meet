import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { publicUser, requireAuth, signToken } from "../lib/auth.js";
import { sendMail } from "../lib/mail.js";

const router = Router();

const registerSchema = z.object({
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and _ only"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(100),
  name: z.string().trim().max(60).optional(),
});

router.post("/register", async (req, res) => {
  const data = registerSchema.parse(req.body);
  const taken = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { username: { equals: data.username, mode: "insensitive" } }] },
  });
  if (taken) return res.status(409).json({ error: "Username or email is already taken" });

  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      name: data.name || data.username,
      passwordHash: await bcrypt.hash(data.password, 10),
    },
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { login, password } = z.object({ login: z.string().trim(), password: z.string() }).parse(req.body);
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: login.toLowerCase() }, { username: { equals: login, mode: "insensitive" } }] },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Wrong username/email or password" });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// Password reset. The token is signed with the user's current password hash,
// so it stops working as soon as the password changes (one use only).
const resetSecret = (user) => process.env.JWT_SECRET + user.passwordHash;

router.post("/forgot-password", async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = jwt.sign({ id: user.id }, resetSecret(user), { expiresIn: "30m" });
    const origin = process.env.APP_URL || req.headers.origin || `${req.protocol}://${req.get("host")}`;
    const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
    sendMail({
      to: user.email,
      subject: "Reset your Quantum Code password",
      text: `Hi ${user.name || user.username},\n\nOpen this link to set a new password (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.`,
    }).catch((err) => console.error("[mail] failed:", err.message));
  }
  // Same reply either way, so this can't be used to find out who has an account.
  res.json({ ok: true });
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = z.object({ token: z.string(), password: z.string().min(6).max(100) }).parse(req.body);
  const invalid = () => res.status(400).json({ error: "This reset link is invalid or has expired" });
  const { id } = jwt.decode(token) || {};
  const user = id && (await prisma.user.findUnique({ where: { id } }));
  if (!user) return invalid();
  try {
    jwt.verify(token, resetSecret(user));
  } catch {
    return invalid();
  }
  const updated = await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  res.json({ token: signToken(updated), user: publicUser(updated) });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
