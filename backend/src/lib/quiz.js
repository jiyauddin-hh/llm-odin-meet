// Live quiz engine (Socket.IO namespace /quiz), KBC style.
//
// The host runs the game: lobby -> question -> reveal -> leaderboard -> next
// question ... -> finale. Every screen shows the same question at the same
// moment; the server keeps the clock, the correct answers and the scores, so
// nothing can be gamed from the browser. A correct answer scores 500 to 1000
// points depending on speed, plus a streak bonus.
//
// Games live in memory (one per join code). The final ranking is written to
// the Quiz row when the finale starts.
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { prisma } from "./db.js";

const SECRET = process.env.JWT_SECRET;
const INTRO_MS = 3000; // "Question 3 of 10" before the question appears
const GRACE_MS = 600; // answers that left the browser just before the bell still count
const FINALE_LEAD_MS = 1500; // every screen starts the winner show together
const LEADERBOARD_SIZE = 5;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** @type {Map<string, Game>} */
const games = new Map();
let nsp = null;

const userView = (u) => ({ id: u.id, username: u.username, name: u.name || u.username, avatarUrl: u.avatarUrl });

function points(ms, limitMs, streak) {
  const speed = Math.max(0, 1 - ms / limitMs);
  return Math.round(500 + 500 * speed) + Math.min(250, 50 * Math.max(0, streak - 1));
}

class Game {
  constructor(quiz, code) {
    this.code = code;
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.hostId = quiz.hostId;
    this.questions = quiz.questions;
    this.limitMs = quiz.timeSec * 1000;
    this.phase = "lobby"; // lobby | question | reveal | leaderboard | finale
    this.index = -1;
    this.players = new Map(); // userId -> { user, score, correct, streak, totalMs, joinedAt, last, prevRank }
    this.answers = new Map(); // userId -> { choice, ms } for the current question
    this.startAt = null;
    this.deadline = null;
    this.finaleAt = null;
    this.timer = null;
    this.ranking = null;
  }

  get channel() {
    return `quiz:${this.code}`;
  }

  get question() {
    return this.questions[this.index];
  }

  /** Players in rank order: score, then total answer time, then who joined first. */
  ranked() {
    return [...this.players.values()].sort((a, b) => b.score - a.score || a.totalMs - b.totalMs || a.joinedAt - b.joinedAt);
  }

  rankOf(userId) {
    return this.ranked().findIndex((p) => p.user.id === userId) + 1;
  }

  board(n) {
    return this.ranked()
      .slice(0, n)
      .map((p, i) => ({ ...p.user, score: p.score, correct: p.correct, rank: i + 1, prevRank: p.prevRank || null, gained: p.last?.points || 0 }));
  }

  /** What every screen sees. Never contains the answer before the reveal. */
  view() {
    const q = this.question;
    const showQ = (this.phase === "question" || this.phase === "reveal") && q;
    const v = {
      code: this.code,
      title: this.title,
      phase: this.phase,
      index: this.index,
      total: this.questions.length,
      limitMs: this.limitMs,
      startAt: this.startAt,
      deadline: this.deadline,
      players: this.players.size,
      answered: this.answers.size,
      now: Date.now(),
    };
    if (this.phase === "lobby") v.lobby = [...this.players.values()].slice(-60).map((p) => p.user);
    if (showQ) v.question = { text: q.question, code: q.code || "", options: q.options };
    if (this.phase === "reveal") {
      v.answer = q.answer;
      v.explanation = q.explanation || "";
      v.counts = q.options.map((_, i) => [...this.answers.values()].filter((a) => a.choice === i).length);
    }
    if (this.phase === "leaderboard" || this.phase === "reveal") v.leaderboard = this.board(LEADERBOARD_SIZE);
    if (this.phase === "finale") {
      v.finaleAt = this.finaleAt;
      v.podium = this.ranking.slice(0, 3);
      v.top = this.ranking.slice(0, 10);
    }
    return v;
  }

  /** What one player sees about themselves. */
  you(userId) {
    const p = this.players.get(userId);
    if (!p) return null;
    const a = this.answers.get(userId);
    return {
      score: p.score,
      correct: p.correct,
      streak: p.streak,
      rank: this.phase === "finale" ? this.ranking.find((r) => r.userId === userId)?.rank : this.rankOf(userId),
      players: this.players.size,
      choice: a ? a.choice : null,
      last: this.phase === "reveal" || this.phase === "leaderboard" ? p.last : null,
    };
  }

  broadcast() {
    if (!nsp) return;
    nsp.to(this.channel).emit("state", this.view());
    nsp
      .in(this.channel)
      .fetchSockets()
      .then((sockets) => {
        for (const s of sockets) {
          const uid = s.data.user.id;
          if (uid === this.hostId) s.emit("you", { host: true });
          else s.emit("you", this.you(uid));
        }
      })
      .catch(() => {});
  }

  join(user) {
    if (user.id === this.hostId) return;
    if (!this.players.has(user.id)) {
      this.players.set(user.id, { user: userView(user), score: 0, correct: 0, streak: 0, totalMs: 0, joinedAt: Date.now(), last: null, prevRank: null });
    }
  }

  // ---- the host's controls ----

  start() {
    if (this.phase !== "lobby") throw new Error("The quiz has already started");
    if (!this.questions.length) throw new Error("This quiz has no questions");
    prisma.quiz.update({ where: { id: this.quizId }, data: { startedAt: new Date() } }).catch(() => {});
    this.nextQuestion();
  }

  next() {
    if (this.phase === "lobby") return this.start();
    if (this.phase === "question") return this.reveal();
    if (this.phase === "reveal") return this.index + 1 >= this.questions.length ? this.finale() : this.showBoard();
    if (this.phase === "leaderboard") return this.nextQuestion();
    throw new Error("The quiz is over");
  }

  nextQuestion() {
    this.index++;
    if (this.index >= this.questions.length) return this.finale();
    this.phase = "question";
    this.answers.clear();
    for (const p of this.players.values()) p.last = null;
    this.startAt = Date.now() + INTRO_MS;
    this.deadline = this.startAt + this.limitMs;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.phase === "question" && this.reveal(), this.deadline - Date.now() + GRACE_MS);
    this.broadcast();
  }

  answer(userId, index, choice) {
    if (this.phase !== "question" || index !== this.index) throw new Error("Too late for that question");
    const now = Date.now();
    if (now < this.startAt) throw new Error("Wait for the question");
    if (now > this.deadline + GRACE_MS) throw new Error("Time's up");
    if (this.answers.has(userId)) throw new Error("Your answer is already locked");
    if (!Number.isInteger(choice) || choice < 0 || choice >= this.question.options.length) throw new Error("Pick one of the options");
    this.answers.set(userId, { choice, ms: Math.min(this.limitMs, now - this.startAt) });
    nsp?.to(this.channel).emit("answered", { answered: this.answers.size, players: this.players.size });
    // Everyone has answered: no need to wait for the clock.
    if (this.answers.size >= this.players.size) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.phase === "question" && this.reveal(), 800);
    }
  }

  reveal() {
    clearTimeout(this.timer);
    const right = this.question.answer;
    const before = this.ranked();
    before.forEach((p, i) => (p.prevRank = i + 1));
    for (const [uid, p] of this.players) {
      const a = this.answers.get(uid);
      if (a && a.choice === right) {
        p.streak++;
        const pts = points(a.ms, this.limitMs, p.streak);
        p.score += pts;
        p.correct++;
        p.totalMs += a.ms;
        p.last = { correct: true, points: pts, ms: a.ms, choice: a.choice };
      } else {
        p.streak = 0;
        p.totalMs += this.limitMs;
        p.last = { correct: false, points: 0, ms: a?.ms ?? null, choice: a ? a.choice : null };
      }
    }
    this.phase = "reveal";
    this.broadcast();
  }

  showBoard() {
    this.phase = "leaderboard";
    this.broadcast();
  }

  finale() {
    if (this.phase === "finale") throw new Error("The winners are already being revealed");
    clearTimeout(this.timer);
    this.phase = "finale";
    this.finaleAt = Date.now() + FINALE_LEAD_MS;
    this.ranking = this.ranked().map((p, i) => ({
      rank: i + 1,
      userId: p.user.id,
      username: p.user.username,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      score: p.score,
      correct: p.correct,
    }));
    prisma.quiz
      .update({ where: { id: this.quizId }, data: { status: "ENDED", results: this.ranking, endedAt: new Date() } })
      .catch((e) => console.error("Quiz results:", e.message));
    this.broadcast();
  }

  close() {
    clearTimeout(this.timer);
    nsp?.to(this.channel).emit("closed");
    nsp?.in(this.channel).disconnectSockets(true);
    games.delete(this.code);
  }
}

async function freshCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!games.has(code) && !(await prisma.quiz.findUnique({ where: { code } }))) return code;
  }
  throw new Error("Could not allocate a quiz code");
}

/** Opens a quiz for players: a new game with a fresh join code. Any earlier game of it closes. */
export async function launchQuiz(quiz) {
  for (const g of games.values()) if (g.quizId === quiz.id) g.close();
  const questions = Array.isArray(quiz.questions) ? quiz.questions.filter((q) => q?.question && q.options?.length >= 2) : [];
  if (!questions.length) throw new Error("Add at least one question first");
  const code = await freshCode();
  await prisma.quiz.update({ where: { id: quiz.id }, data: { code, status: "LIVE", results: null, startedAt: null, endedAt: null } });
  games.set(code, new Game({ ...quiz, questions }, code));
  return code;
}

export function gameInfo(code) {
  const g = games.get(String(code || "").toUpperCase());
  return g ? { code: g.code, title: g.title, phase: g.phase, players: g.players.size, total: g.questions.length, quizId: g.quizId } : null;
}

export function closeQuiz(quizId) {
  for (const g of games.values()) if (g.quizId === quizId) g.close();
}

async function authenticate(socket, next) {
  try {
    const { id } = jwt.verify(socket.handshake.auth?.token, SECRET);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return next(new Error("Please log in"));
    socket.data.user = user;
    next();
  } catch {
    next(new Error("Please log in"));
  }
}

const ack = (cb, payload) => typeof cb === "function" && cb(payload);

export async function attachQuizzes(io) {
  // Games don't survive a restart: reopen their quizzes as drafts.
  await prisma.quiz.updateMany({ where: { status: "LIVE" }, data: { status: "DRAFT", code: null } }).catch(() => {});

  nsp = io.of("/quiz");
  nsp.use(authenticate);
  nsp.on("connection", (socket) => {
    const user = socket.data.user;
    let game = null;

    const guard = (cb, fn) => {
      try {
        if (!game || !games.has(game.code)) throw new Error("This quiz has ended");
        fn();
        ack(cb, { ok: true });
      } catch (e) {
        ack(cb, { error: e.message });
      }
    };
    const hostOnly = (cb, fn) =>
      guard(cb, () => {
        if (user.id !== game.hostId && user.role !== "ADMIN") throw new Error("Only the host can do that");
        fn();
      });

    socket.on("join", ({ code } = {}, cb) => {
      const g = games.get(String(code || "").toUpperCase());
      if (!g) return ack(cb, { error: "No live quiz with that code" });
      game = g;
      socket.join(g.channel);
      g.join(user);
      const host = user.id === g.hostId;
      ack(cb, { ok: true, state: g.view(), you: host ? { host: true } : g.you(user.id) });
      if (!host && g.phase === "lobby") g.broadcast();
    });

    socket.on("answer", ({ index, choice } = {}, cb) => guard(cb, () => game.answer(user.id, index, choice)));
    socket.on("start", (_p, cb) => hostOnly(cb, () => game.start()));
    socket.on("next", (_p, cb) => hostOnly(cb, () => game.next()));
    socket.on("finish", (_p, cb) => hostOnly(cb, () => game.finale()));
    socket.on("close", (_p, cb) => hostOnly(cb, () => game.close()));
  });
}
