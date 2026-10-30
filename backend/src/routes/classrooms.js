// Live classrooms: create/list/end rooms. The live part (editor, terminal,
// presence, hand-offs) runs over Socket.IO in ../lib/classroom.js.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { canTeach, requireAuth, requireTeacher } from "../lib/auth.js";
import { LANGUAGES } from "../lib/judge.js";
import { endRoom, freshCode, roomSummary } from "../lib/classroom.js";

const router = Router();

const teacherSelect = { id: true, username: true, name: true, avatarUrl: true };

function shape(room) {
  return {
    id: room.id,
    code: room.code,
    title: room.title,
    language: room.language,
    status: room.status,
    createdAt: room.createdAt,
    endedAt: room.endedAt,
    teacher: room.teacher,
    live: roomSummary(room.code),
  };
}

const DEFAULT_CODE = {
  python: 'print("Hello, class!")\n',
  javascript: 'console.log("Hello, class!");\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    cout << "Hello, class!" << endl;\n    return 0;\n}\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, class!");\n    }\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, class!")\n}\n',
};

// Rooms I teach, live first.
router.get("/mine", requireTeacher, async (req, res) => {
  const rooms = await prisma.classroom.findMany({
    where: { teacherId: req.user.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: { teacher: { select: teacherSelect } },
  });
  res.json({ classrooms: rooms.map(shape) });
});

router.post("/", requireTeacher, async (req, res) => {
  const { title, language } = z
    .object({ title: z.string().trim().min(1).max(80), language: z.enum(LANGUAGES).default("python") })
    .parse(req.body);
  const room = await prisma.classroom.create({
    data: { code: await freshCode(), title, language, content: DEFAULT_CODE[language], teacherId: req.user.id },
    include: { teacher: { select: teacherSelect } },
  });
  res.status(201).json({ classroom: shape(room) });
});

// Anyone logged in can look a room up by code (that is how students join).
router.get("/:code", requireAuth, async (req, res) => {
  const room = await prisma.classroom.findUnique({
    where: { code: String(req.params.code).toUpperCase() },
    include: { teacher: { select: teacherSelect } },
  });
  if (!room) return res.status(404).json({ error: "No class with that code" });
  res.json({ classroom: shape(room) });
});

async function ownedRoom(req, res) {
  const room = await prisma.classroom.findUnique({ where: { code: String(req.params.code).toUpperCase() } });
  if (!room) {
    res.status(404).json({ error: "No class with that code" });
    return null;
  }
  if (room.teacherId !== req.user.id && req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Only the teacher can do that" });
    return null;
  }
  return room;
}

router.post("/:code/end", requireAuth, async (req, res) => {
  if (!canTeach(req.user)) return res.status(403).json({ error: "Teachers only" });
  const room = await ownedRoom(req, res);
  if (!room) return;
  await endRoom(room.code);
  res.json({ ok: true });
});

router.delete("/:code", requireAuth, async (req, res) => {
  if (!canTeach(req.user)) return res.status(403).json({ error: "Teachers only" });
  const room = await ownedRoom(req, res);
  if (!room) return;
  await endRoom(room.code);
  await prisma.classroom.delete({ where: { id: room.id } });
  res.json({ ok: true });
});

export default router;
