// Live classroom engine (Socket.IO namespace /classroom).
//
// One room per classroom code. The model is deliberately single-writer:
// at any moment exactly one person holds the pen (the teacher by default,
// or one student the teacher granted it to). Everyone else gets a read-only,
// keystroke-by-keystroke mirror of the editor plus the shared terminal, so
// there is no need for operational transforms or CRDTs.
//
// Edits travel as Monaco change deltas (offset/length/text) with a version
// counter; a client that notices a gap asks for a full resync. The server
// keeps the authoritative text and saves it to the database on a short
// debounce, so a restart or late joiner always gets the latest code.
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { Server } from "socket.io";
import { prisma } from "./db.js";
import { canTeach } from "./auth.js";
import { judge, LANGUAGES } from "./judge.js";
import { allPerms, loadPerms } from "./classPerms.js";

const SECRET = process.env.JWT_SECRET;
const MAX_CODE = 64 * 1024;
const MAX_STDIN = 16 * 1024;
const RUN_TIME_LIMIT_MS = 5000;
const TERMINAL_HISTORY = 40;
const CHAT_HISTORY = 200;
const SAVE_DEBOUNCE_MS = 1500;

// ICE servers for the in-class video call. STUN is enough on one network;
// set TURN_URL (comma separated), TURN_USERNAME and TURN_CREDENTIAL in .env
// so people behind strict NATs or on other networks can connect too.
function iceServers() {
  const servers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  if (process.env.TURN_URL) {
    servers.push({
      urls: process.env.TURN_URL.split(",").map((u) => u.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || "",
      credential: process.env.TURN_CREDENTIAL || "",
    });
  }
  return servers;
}

// Join codes avoid look-alike characters (0/O, 1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export async function freshCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!(await prisma.classroom.findUnique({ where: { code } }))) return code;
  }
  throw new Error("Could not allocate a classroom code");
}

/** @type {Map<string, Room>} */
const rooms = new Map();
let io = null;
let nsp = null; // the /classroom namespace

// A bot that hosts a class itself (the AI teacher, lib/aiTeacher). It holds the
// pen as the room's teacher without a socket, hears chat, hands and joins, and
// adds its own state to the room snapshot.
/** @type {Map<string, { user, snapshot(): object, onChat?, onHand?, onJoin?, onEnded? }>} */
const bots = new Map();

function userView(u) {
  return { id: u.id, username: u.username, name: u.name, avatarUrl: u.avatarUrl, role: u.role };
}

class Room {
  constructor(row) {
    this.code = row.code;
    this.id = row.id;
    this.title = row.title;
    this.teacherId = row.teacherId;
    this.language = row.language;
    this.content = row.content;
    this.stdin = row.stdin;
    this.status = row.status;
    this.startedAt = row.createdAt;
    this.version = 0;
    this.writerId = null; // student holding the pen; null means the teacher
    this.hands = new Set(); // userIds with a raised hand
    this.members = new Map(); // userId -> { user, sockets: Set<socketId>, perms }
    this.cursor = null; // last cursor of whoever holds the pen
    this.terminal = [];
    this.chat = [];
    this.call = new Map(); // socketId -> { userId, mic, cam, screen } for everyone in the video call
    this.running = null; // { by, startedAt } while a run is in flight
    this.saveTimer = null;
    this.dirty = false;
  }

  get channel() {
    return `room:${this.code}`;
  }

  controllerId() {
    return this.writerId ?? this.teacherId;
  }

  holdsPen(userId) {
    return userId === this.controllerId();
  }

  /** What this person may do here. The host always has everything in their own class. */
  permsOf(userId) {
    if (userId === this.teacherId) return allPerms();
    return this.members.get(userId)?.perms || allPerms();
  }

  /** Media state with anything this person isn't allowed to use forced off. */
  allowedMedia(userId, p = {}) {
    const perms = this.permsOf(userId);
    return { mic: !!p.mic && perms.mic, cam: !!p.cam && perms.cam, screen: !!p.screen && perms.screen };
  }

  get bot() {
    return bots.get(this.code) || null;
  }

  presence() {
    const bot = this.bot;
    const members = [...this.members.values()]
      .filter((m) => !bot || m.user.id !== bot.user.id)
      .map((m) => ({
        ...userView(m.user),
        isTeacher: m.user.id === this.teacherId,
        hand: this.hands.has(m.user.id),
        online: m.sockets.size > 0,
        perms: this.permsOf(m.user.id),
      }));
    if (bot) members.unshift({ ...userView(bot.user), isTeacher: true, isBot: true, hand: false, online: true, perms: allPerms() });
    return {
      members,
      writerId: this.writerId,
      teacherOnline: !!bot || (this.members.get(this.teacherId)?.sockets.size || 0) > 0,
    };
  }

  callPeers() {
    return [...this.call.entries()].map(([sid, p]) => ({ sid, ...p }));
  }

  snapshot(forUserId) {
    return {
      code: this.code,
      title: this.title,
      teacherId: this.teacherId,
      language: this.language,
      content: this.content,
      version: this.version,
      stdin: this.stdin,
      status: this.status,
      startedAt: this.startedAt,
      cursor: this.cursor,
      terminal: this.terminal,
      chat: this.chat,
      call: this.callPeers(),
      ice: iceServers(),
      running: this.running,
      you: { id: forUserId, holdsPen: this.holdsPen(forUserId), isTeacher: forUserId === this.teacherId },
      ai: this.bot?.snapshot() ?? null,
      serverNow: Date.now(),
      ...this.presence(),
    };
  }

  broadcastPresence() {
    nsp?.to(this.channel).emit("presence", this.presence());
  }

  applyChanges(changes) {
    // Monaco reports offsets against the text before any of the changes;
    // applying from the end keeps earlier offsets valid.
    const sorted = [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
    let next = this.content;
    for (const c of sorted) {
      const off = Math.max(0, Math.min(next.length, c.rangeOffset | 0));
      const len = Math.max(0, Math.min(next.length - off, c.rangeLength | 0));
      next = next.slice(0, off) + String(c.text ?? "") + next.slice(off + len);
    }
    if (next.length > MAX_CODE) return false;
    this.content = next;
    this.version++;
    this.scheduleSave();
    return true;
  }

  scheduleSave() {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush().catch((e) => console.error("Classroom save:", e.message)), SAVE_DEBOUNCE_MS);
  }

  async flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.dirty) return;
    this.dirty = false;
    await prisma.classroom.update({
      where: { id: this.id },
      data: { content: this.content, stdin: this.stdin, language: this.language },
    });
  }

  pushTerminal(entry) {
    this.terminal.push(entry);
    if (this.terminal.length > TERMINAL_HISTORY) this.terminal.shift();
  }

  pushChat(by, text) {
    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), by, text };
    this.chat.push(msg);
    if (this.chat.length > CHAT_HISTORY) this.chat.shift();
    nsp?.to(this.channel).emit("chat", msg);
    return msg;
  }

  /** Runs the shared code in the sandbox for the whole class; resolves with the terminal entry. */
  async run(by) {
    this.running = { by, startedAt: new Date().toISOString() };
    nsp?.to(this.channel).emit("run:start", this.running);
    let result;
    try {
      result = await judge({
        language: this.language,
        code: this.content,
        timeLimitMs: RUN_TIME_LIMIT_MS,
        tests: [{ input: this.stdin, expected: null }],
      });
    } catch (e) {
      result = { verdict: "Internal Error", error: e.message, results: [] };
    }
    const r = result.results?.[0];
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      by,
      language: this.language,
      verdict: result.verdict,
      compileOutput: result.compileOutput || "",
      error: result.error || "",
      stdout: r?.stdout || "",
      stderr: r?.stderr || "",
      timeMs: r?.timeMs ?? null,
      stdin: this.stdin,
    };
    this.running = null;
    this.pushTerminal(entry);
    nsp?.to(this.channel).emit("run:result", entry);
    return entry;
  }
}

async function loadRoom(code) {
  const key = String(code || "").toUpperCase();
  if (rooms.has(key)) return rooms.get(key);
  const row = await prisma.classroom.findUnique({ where: { code: key } });
  if (!row) return null;
  const room = new Room(row);
  rooms.set(key, room);
  return room;
}

/** What the REST layer shows next to a classroom: who is in it right now. */
export function roomSummary(code) {
  const room = rooms.get(String(code).toUpperCase());
  if (!room) return { online: 0, writerId: null };
  const online = [...room.members.values()].filter((m) => m.sockets.size > 0).length;
  return { online, writerId: room.writerId };
}

/**
 * Re-reads classroom permissions for people in live classes (all of them, or
 * just userIds) after an admin changed them, and applies the change at once:
 * media that is no longer allowed is switched off for everyone, a pen that is
 * no longer allowed goes back to the host, and every client gets the new list.
 */
export async function refreshPermissions(userIds = null) {
  const only = userIds && new Set(userIds.map(Number));
  for (const room of rooms.values()) {
    let touched = false;
    for (const member of room.members.values()) {
      if (only && !only.has(member.user.id)) continue;
      member.perms = await loadPerms(member.user.id);
      touched = true;
    }
    if (!touched) continue;
    for (const [sid, state] of room.call) {
      if (only && !only.has(state.userId)) continue;
      const next = room.allowedMedia(state.userId, state);
      if (next.mic !== state.mic || next.cam !== state.cam || next.screen !== state.screen) {
        Object.assign(state, next);
        nsp?.to(room.channel).emit("call:state", { sid, ...next });
      }
    }
    if (room.writerId != null && !room.permsOf(room.writerId).pen) {
      room.writerId = null;
      room.cursor = null;
      nsp?.to(room.channel).emit("control", { writerId: null, by: null });
    }
    room.broadcastPresence();
  }
}

// ---- Bot hosts (the AI teacher) ----

/** Lets a bot host the class with this code. The room must exist and be live. */
export async function attachBot(code, bot) {
  const room = await loadRoom(code);
  if (!room || room.status !== "LIVE") throw new Error("That class isn't live");
  bots.set(room.code, bot);
  room.broadcastPresence();
  return room;
}

export function detachBot(code) {
  const key = String(code).toUpperCase();
  if (!bots.delete(key)) return;
  rooms.get(key)?.broadcastPresence();
}

/** Sends a bot-only event (what the AI teacher is saying, asking, preparing) to the class. */
export function botEmit(code, event, payload) {
  nsp?.to(`room:${String(code).toUpperCase()}`).emit(event, payload);
}

async function botRoom(code) {
  const room = await loadRoom(code);
  if (!room || room.status !== "LIVE" || !room.bot) throw new Error("The class has ended");
  return room;
}

/** The bot types: Monaco-style changes, mirrored keystroke by keystroke like a human host. */
export async function botEdit(code, changes, cursor) {
  const room = await botRoom(code);
  if (room.writerId != null) return false; // a student has the pen; don't type over them
  if (!room.applyChanges(changes)) return false;
  nsp.to(room.channel).emit("edit", { changes, version: room.version, length: room.content.length, by: room.teacherId });
  if (cursor) {
    room.cursor = { userId: room.teacherId, lineNumber: cursor.lineNumber, column: cursor.column, selection: null };
    nsp.to(room.channel).volatile.emit("cursor", room.cursor);
  }
  return true;
}

export async function botReplace(code, content) {
  const room = await botRoom(code);
  if (room.writerId != null) {
    room.writerId = null;
    room.cursor = null;
    nsp.to(room.channel).emit("control", { writerId: null, by: userView(room.bot.user) });
    room.broadcastPresence();
  }
  room.content = content;
  room.version++;
  room.scheduleSave();
  nsp.to(room.channel).emit("replace", { content, version: room.version, by: room.teacherId });
}

export async function botState(code) {
  const room = await botRoom(code);
  return { content: room.content, writerId: room.writerId, running: !!room.running };
}

export async function botStdin(code, stdin) {
  const room = await botRoom(code);
  room.stdin = String(stdin).slice(0, MAX_STDIN);
  room.scheduleSave();
  nsp.to(room.channel).emit("stdin", { stdin: room.stdin });
}

export async function botRun(code) {
  const room = await botRoom(code);
  if (room.running) throw new Error("A run is already in progress");
  return room.run(userView(room.bot.user));
}

export async function botChat(code, text) {
  const room = await botRoom(code);
  return room.pushChat(userView(room.bot.user), String(text).slice(0, 4000));
}

/** Lowers a student's hand (the AI teacher has seen it). */
export async function botLowerHand(code, userId) {
  const room = await botRoom(code);
  if (room.hands.delete(userId)) room.broadcastPresence();
}

/** Ends a class: persists, tells everyone, and drops the in-memory room. */
export async function endRoom(code) {
  const key = String(code).toUpperCase();
  const bot = bots.get(key);
  bots.delete(key);
  bot?.onEnded?.();
  const room = rooms.get(key);
  if (room) {
    room.status = "ENDED";
    await room.flush();
  }
  await prisma.classroom.updateMany({ where: { code: key, status: "LIVE" }, data: { status: "ENDED", endedAt: new Date() } });
  if (nsp) {
    nsp.to(`room:${key}`).emit("ended");
    nsp.in(`room:${key}`).disconnectSockets(true);
  }
  rooms.delete(key);
}

async function authenticate(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    const { id } = jwt.verify(token, SECRET);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return next(new Error("Please log in"));
    socket.data.user = user;
    next();
  } catch {
    next(new Error("Please log in"));
  }
}

const ack = (cb, payload) => typeof cb === "function" && cb(payload);
const fail = (cb, error) => ack(cb, { error });

export function attachClassrooms(httpServer) {
  io = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    maxHttpBufferSize: 256 * 1024,
    cors: { origin: false },
  });
  nsp = io.of("/classroom");
  nsp.use(authenticate);

  nsp.on("connection", (socket) => {
    const user = socket.data.user;
    /** @type {Room | null} */
    let room = null;

    const requirePen = (cb) => {
      if (!room) return fail(cb, "Join a class first"), false;
      if (!room.holdsPen(user.id)) return fail(cb, "You don't have the pen right now"), false;
      return true;
    };
    const requireTeacher = (cb) => {
      if (!room) return fail(cb, "Join a class first"), false;
      if (user.id !== room.teacherId && user.role !== "ADMIN") return fail(cb, "Only the teacher can do that"), false;
      return true;
    };

    socket.on("join", async ({ code } = {}, cb) => {
      try {
        const next = await loadRoom(code);
        if (!next) return fail(cb, "No class with that code");
        if (next.status !== "LIVE") return fail(cb, "This class has ended");
        if (room && room !== next) leave();
        const perms = await loadPerms(user.id);
        room = next;
        socket.join(room.channel);
        let member = room.members.get(user.id);
        if (!member) {
          member = { user: userView(user), sockets: new Set() };
          room.members.set(user.id, member);
        }
        member.perms = perms;
        const firstSocket = member.sockets.size === 0;
        member.sockets.add(socket.id);
        ack(cb, { ok: true, state: room.snapshot(user.id), sid: socket.id });
        room.broadcastPresence();
        if (firstSocket) room.bot?.onJoin?.(userView(user));
      } catch (e) {
        console.error("Classroom join:", e);
        fail(cb, "Could not join the class");
      }
    });

    // Full text on demand (after a reconnect or a detected gap).
    socket.on("sync", (_p, cb) => {
      if (!room) return fail(cb, "Join a class first");
      ack(cb, { ok: true, state: room.snapshot(user.id), sid: socket.id });
    });

    socket.on("edit", ({ changes, version, length } = {}, cb) => {
      if (!requirePen(cb)) return;
      if (!Array.isArray(changes) || !changes.length) return fail(cb, "Nothing to apply");
      if (!room.applyChanges(changes)) return fail(cb, "That file is too big for a class");
      if (typeof length === "number" && length !== room.content.length) {
        // The writer and the server disagree: trust the writer, resync everyone.
        console.warn(`Classroom ${room.code}: content drift, resyncing`);
        ack(cb, { ok: true, version: room.version, resync: true });
        return;
      }
      socket.to(room.channel).emit("edit", { changes, version: room.version, length: room.content.length, by: user.id });
      ack(cb, { ok: true, version: room.version });
    });

    // Whoever holds the pen may replace the whole document (paste, reset, resync-after-drift).
    socket.on("replace", ({ content } = {}, cb) => {
      if (!requirePen(cb)) return;
      if (typeof content !== "string" || content.length > MAX_CODE) return fail(cb, "Invalid content");
      room.content = content;
      room.version++;
      room.scheduleSave();
      socket.to(room.channel).emit("replace", { content, version: room.version, by: user.id });
      ack(cb, { ok: true, version: room.version });
    });

    socket.on("cursor", (cursor) => {
      if (!room || !room.holdsPen(user.id)) return;
      if (!cursor || typeof cursor !== "object") return;
      const clean = {
        userId: user.id,
        lineNumber: cursor.lineNumber | 0,
        column: cursor.column | 0,
        selection: cursor.selection
          ? {
              startLineNumber: cursor.selection.startLineNumber | 0,
              startColumn: cursor.selection.startColumn | 0,
              endLineNumber: cursor.selection.endLineNumber | 0,
              endColumn: cursor.selection.endColumn | 0,
            }
          : null,
      };
      room.cursor = clean;
      socket.to(room.channel).volatile.emit("cursor", clean);
    });

    socket.on("language", ({ language } = {}, cb) => {
      if (!requireTeacher(cb)) return;
      if (!LANGUAGES.includes(language)) return fail(cb, "Unsupported language");
      room.language = language;
      room.scheduleSave();
      nsp.to(room.channel).emit("language", { language });
      ack(cb, { ok: true });
    });

    socket.on("stdin", ({ stdin } = {}, cb) => {
      if (!requirePen(cb)) return;
      if (typeof stdin !== "string" || stdin.length > MAX_STDIN) return fail(cb, "Input is too long");
      room.stdin = stdin;
      room.scheduleSave();
      socket.to(room.channel).emit("stdin", { stdin });
      ack(cb, { ok: true });
    });

    socket.on("run", async (_payload, cb) => {
      if (!requirePen(cb)) return;
      if (!room.permsOf(user.id).run) return fail(cb, "Running code is turned off for you by the admin");
      if (room.running) return fail(cb, "A run is already in progress");
      if (!room.content.trim()) return fail(cb, "Nothing to run");
      const target = room;
      ack(cb, { ok: true });
      const entry = await target.run(userView(user));
      target.bot?.onRun?.(entry, userView(user));
    });

    socket.on("terminal:clear", (_p, cb) => {
      if (!requireTeacher(cb)) return;
      room.terminal = [];
      nsp.to(room.channel).emit("terminal:clear");
      ack(cb, { ok: true });
    });

    socket.on("hand", ({ raised } = {}) => {
      if (!room || user.id === room.teacherId) return;
      if (raised) room.hands.add(user.id);
      else room.hands.delete(user.id);
      room.broadcastPresence();
      room.bot?.onHand?.(userView(user), !!raised);
    });

    // Teacher hands the pen to one student (or takes it back with userId null).
    socket.on("control", ({ userId } = {}, cb) => {
      // The student holding the pen may hand it back; everything else is the teacher's call.
      const handingBack = userId == null && room && room.writerId === user.id;
      if (!handingBack && !requireTeacher(cb)) return;
      if (userId != null) {
        const member = room.members.get(Number(userId));
        if (!member || member.sockets.size === 0) return fail(cb, "That student is not in the class");
        if (member.user.id === room.teacherId) return fail(cb, "You already hold the pen");
        if (!room.permsOf(member.user.id).pen) return fail(cb, "The admin hasn't allowed this person to use the code editor");
        room.writerId = member.user.id;
        room.hands.delete(member.user.id);
      } else {
        room.writerId = null;
      }
      room.cursor = null;
      nsp.to(room.channel).emit("control", { writerId: room.writerId, by: userView(user) });
      room.broadcastPresence();
      ack(cb, { ok: true });
    });

    // ---- Video call (WebRTC mesh; the server only relays signaling) ----

    // Anything the admin hasn't allowed is reported as off, so other browsers never play it.
    const mediaState = (p = {}) => room.allowedMedia(user.id, p);

    socket.on("call:join", (payload, cb) => {
      if (!room) return fail(cb, "Join a class first");
      const state = { userId: user.id, ...mediaState(payload) };
      room.call.set(socket.id, state);
      ack(cb, { ok: true, peers: room.callPeers().filter((p) => p.sid !== socket.id) });
      socket.to(room.channel).emit("call:peer", { sid: socket.id, ...state, user: userView(user) });
    });

    socket.on("call:state", (payload) => {
      if (!room) return;
      const cur = room.call.get(socket.id);
      if (!cur) return;
      Object.assign(cur, mediaState(payload));
      socket.to(room.channel).emit("call:state", { sid: socket.id, ...mediaState(cur) });
    });

    socket.on("rtc:signal", ({ to, description, candidate } = {}) => {
      if (!room || typeof to !== "string") return;
      if (!room.call.has(socket.id) || !room.call.has(to)) return;
      if (description && (typeof description !== "object" || typeof description.sdp !== "string")) return;
      nsp.to(to).emit("rtc:signal", {
        from: socket.id,
        fromUser: userView(user),
        ...(description && { description: { type: description.type, sdp: description.sdp } }),
        ...(candidate !== undefined && { candidate }),
      });
    });

    // Teacher mutes one student's microphone, or everyone's (userId null).
    socket.on("call:mute", ({ userId } = {}, cb) => {
      if (!requireTeacher(cb)) return;
      const targets = userId == null ? [...room.members.values()].filter((m) => m.user.id !== room.teacherId) : [room.members.get(Number(userId))].filter(Boolean);
      for (const m of targets) for (const sid of m.sockets) nsp.sockets.get(sid)?.emit("call:force-mute", { by: userView(user) });
      ack(cb, { ok: true });
    });

    function leaveCall() {
      if (!room || !room.call.has(socket.id)) return;
      room.call.delete(socket.id);
      socket.to(room.channel).emit("call:peer-left", { sid: socket.id });
    }
    socket.on("call:leave", () => leaveCall());

    // ---- Chat ----

    socket.on("chat", ({ text } = {}, cb) => {
      if (!room) return fail(cb, "Join a class first");
      if (!room.permsOf(user.id).chat) return fail(cb, "Chat is turned off for you by the admin");
      const clean = String(text ?? "").trim().slice(0, 2000);
      if (!clean) return fail(cb, "Nothing to send");
      const msg = room.pushChat(userView(user), clean);
      ack(cb, { ok: true, id: msg.id });
      room.bot?.onChat?.(msg);
    });

    socket.on("kick", ({ userId } = {}, cb) => {
      if (!requireTeacher(cb)) return;
      const member = room.members.get(Number(userId));
      if (!member || member.user.id === room.teacherId) return fail(cb, "Can't remove that person");
      if (room.writerId === member.user.id) {
        room.writerId = null;
        nsp.to(room.channel).emit("control", { writerId: null, by: userView(user) });
      }
      for (const sid of member.sockets) {
        const s = nsp.sockets.get(sid);
        s?.emit("kicked");
        s?.disconnect(true);
      }
      room.members.delete(member.user.id);
      room.hands.delete(member.user.id);
      room.broadcastPresence();
      ack(cb, { ok: true });
    });

    socket.on("end", async (_p, cb) => {
      if (!requireTeacher(cb)) return;
      const code = room.code;
      room = null;
      // Acknowledge first: endRoom disconnects this socket too.
      ack(cb, { ok: true });
      await endRoom(code);
    });

    function leave() {
      if (!room) return;
      leaveCall();
      const member = room.members.get(user.id);
      member?.sockets.delete(socket.id);
      socket.leave(room.channel);
      if (member && member.sockets.size === 0) {
        room.members.delete(user.id);
        room.hands.delete(user.id);
        // A student who leaves while holding the pen hands it back automatically.
        if (room.writerId === user.id) {
          room.writerId = null;
          room.cursor = null;
          nsp.to(room.channel).emit("control", { writerId: null, by: null });
        }
      }
      room.broadcastPresence();
      // Nobody left: keep the room in the DB but free the memory after a while.
      if (room.members.size === 0) {
        const r = room;
        setTimeout(() => {
          if (r.members.size === 0 && !r.bot && rooms.get(r.code) === r) {
            r.flush().catch(() => {});
            rooms.delete(r.code);
          }
        }, 10 * 60 * 1000).unref();
      }
      room = null;
    }

    socket.on("leave", () => leave());
    socket.on("disconnect", () => leave());
  });

  return io;
}

