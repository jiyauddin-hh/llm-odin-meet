// One AI-taught class from start to finish:
//   plan (Claude writes the script) -> voice (Piper) -> face (MuseTalk, in the
//   background, ahead of playback) -> teach -> homework and goodbye.
//
// Teaching is a timeline the server drives. For each line it tells every
// browser "play this clip at this moment" (ai:say); the clips are plain files
// under /uploads, so any number of students can watch without a media server.
// While a line plays the teacher may type into the shared editor; after it,
// run the code or ask the class a question. Between lines it answers raised
// hands and questions from the chat.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { durationMs, speakLines, wavToMp3 } from "../narration.js";
import { answerQuestions, planClass, reactToAnswers } from "./brain.js";
import { AVATAR_DIR, FaceRenderer, faceAvailable, freeGpu } from "./face.js";
import {
  attachBot, botChat, botEdit, botEmit, botLowerHand, botReplace, botRun, botState, botStdin, detachBot, endRoom,
} from "../classroom.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LEAD_MS = 700; // a line starts this long after it is announced, so every browser starts together
const FACE_WAIT_MS = 25_000; // longest we hold a line for its video before playing it voice-only
const GOODBYE_MS = 90_000; // the room stays open this long after the last line
const MAX_QUESTIONS_PER_PAUSE = 6;

// Short lines rendered up front so the teacher can react instantly.
const STOCK = {
  hand: "I see a hand up. Please type your question in the chat, and I'll answer it in a moment.",
  thinking: "Good question! Give me a second.",
  answers: "Okay, let's see what you wrote.",
};

const looksLikeQuestion = (t) =>
  /\?/.test(t) || /^(how|what|why|when|where|which|who|can|could|is|are|does|do|should|will|explain|please|sir|ma'?am|teacher)\b/i.test(t) || t.length > 40;

/** Clean text for the voice: no markdown or emoji. */
const voiceText = (t) =>
  String(t || "")
    .replace(/[`*_#>|~]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export class AiSession {
  constructor({ row, room, teacher, settings, uploadDir }) {
    this.id = row.id;
    this.row = row;
    this.code = room.code;
    this.teacher = teacher;
    this.name = teacher.name;
    this.settings = settings;
    this.dir = join(uploadDir, "ai-class", String(row.id));
    this.url = `/uploads/ai-class/${row.id}`;
    this.face = null;
    this.faceOk = false;
    this.lines = [];
    this.stock = {};
    this.stage = "planning"; // planning | voice | face | ready | live | ended | failed
    this.progress = { done: 0, total: 0 };
    this.current = null;
    this.ask = null;
    this.idleUrl = null;
    this.inbox = [];
    this.handsSeen = new Set();
    this.handsWaiting = new Map();
    this.welcome = [];
    this.questions = [];
    this.lastSaid = "";
    this.seq = 0;
    this.stopped = false;
    this.done = null;
  }

  // ---- what browsers see ----

  snapshot() {
    return {
      classId: this.id,
      name: this.name,
      title: this.row.title,
      stage: this.stage,
      progress: this.progress,
      startsAt: this.row.startsAt,
      idleUrl: this.idleUrl,
      photoUrl: this.teacher.avatarUrl,
      current: this.current,
      ask: this.ask && { question: this.ask.question, until: this.ask.until },
      now: Date.now(),
    };
  }

  setStage(stage, progress) {
    this.stage = stage;
    if (progress) this.progress = progress;
    botEmit(this.code, "ai:status", this.snapshot());
  }

  async setStatus(status, extra = {}) {
    await prisma.aiClass.update({ where: { id: this.id }, data: { status, ...extra } }).catch(() => {});
  }

  // ---- lifecycle ----

  /** Runs the whole class. Resolves when it is over (or stopped). */
  start() {
    this.done ??= this.run();
    return this.done;
  }

  async run() {
    await attachBot(this.code, {
      user: this.teacher,
      snapshot: () => this.snapshot(),
      onChat: (m) => this.onChat(m),
      onHand: (u, raised) => this.onHand(u, raised),
      onJoin: (u) => this.onJoin(u),
      onEnded: () => this.stop(),
    });
    try {
      await this.prepare();
      if (this.stopped) return;
      await this.setStatus("READY");
      this.setStage("ready");
      const wait = new Date(this.row.startsAt).getTime() - Date.now();
      if (wait > 0) await this.sleep(wait);
      if (this.stopped) return;
      await this.setStatus("LIVE");
      this.setStage("live");
      await this.teach();
      if (this.stopped) return;
      await this.finish();
    } catch (e) {
      if (this.stopped) return;
      console.error(`AI class ${this.id}:`, e);
      await this.setStatus("FAILED", { error: String(e.message).slice(0, 500), endedAt: new Date() });
      this.setStage("failed");
      await botChat(this.code, "Sorry, I ran into a technical problem and can't continue today's class. See you next time!").catch(() => {});
      await this.sleep(20_000);
      await endRoom(this.code).catch(() => {});
    } finally {
      if (this.face) {
        this.face.stop();
        // Ollama reloaded beside the renderer with part of its model on the CPU; unload it once
        // more so its next load gets the whole GPU back.
        setTimeout(() => freeGpu(), 10_000).unref();
      }
      detachBot(this.code);
    }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.face?.stop();
    for (const w of this.sleepers || []) w();
    prisma.aiClass
      .updateMany({ where: { id: this.id, status: { in: ["PREPARING", "READY", "LIVE"] } }, data: { status: "ENDED", endedAt: new Date() } })
      .catch(() => {});
  }

  /** A sleep that stop() cuts short. */
  sleep(ms) {
    this.sleepers ??= new Set();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        this.sleepers.delete(done);
        resolve();
      };
      const t = setTimeout(done, ms);
      this.sleepers.add(done);
    });
  }

  // ---- preparation ----

  async prepare() {
    await mkdir(this.dir, { recursive: true });
    this.setStage("planning");

    // The face loads on the GPU while Claude writes the script.
    let faceReady = Promise.resolve();
    if (faceAvailable()) {
      faceReady = (async () => {
        const unloaded = await freeGpu();
        if (unloaded.length) console.log(`AI class ${this.id}: unloaded ${unloaded.join(", ")} from Ollama to free the GPU`);
        this.face = new FaceRenderer();
        await this.face.prepare(join(AVATAR_DIR, "cache"));
        await this.face.idle(join(this.dir, "idle.mp4"), 10);
        this.idleUrl = `${this.url}/idle.mp4`;
        this.faceOk = true;
        botEmit(this.code, "ai:status", this.snapshot());
      })().catch((e) => {
        console.error(`AI class ${this.id}: face unavailable, teaching with voice only:`, e.message);
        this.face?.stop();
        this.faceOk = false;
      });
    }

    const plan = this.row.plan || (await this.writePlan());
    if (this.stopped) return;

    this.setStage("voice", { done: 0, total: plan.segments.length });
    const all = [
      ...plan.segments.map((s, i) => ({ ...s, key: `l${String(i).padStart(3, "0")}`, say: voiceText(s.say) })),
      ...Object.entries(STOCK).map(([k, say]) => ({ key: `stock-${k}`, say, action: "talk", stock: k })),
    ];
    await speakLines(all.map((l) => ({ text: l.say, out: join(this.dir, `${l.key}.wav`) })));
    for (const l of all) {
      const wav = join(this.dir, `${l.key}.wav`);
      await wavToMp3(wav, join(this.dir, `${l.key}.mp3`));
      Object.assign(l, { wav, audio: `${this.url}/${l.key}.mp3`, ms: await durationMs(wav), video: null, rendered: false });
    }
    this.lines = all.filter((l) => !l.stock);
    for (const l of all.filter((x) => x.stock)) this.stock[l.stock] = l;

    await faceReady;
    if (!this.faceOk || this.stopped) return;
    // Stock lines first (short), then the lesson in order, while the class is already running.
    this.setStage("face", { done: 0, total: this.lines.length });
    this.rendering = (async () => {
      for (const l of [...Object.values(this.stock), ...this.lines]) {
        if (this.stopped || !this.faceOk) break;
        await this.renderLine(l);
        if (!l.stock) {
          this.progress = { done: this.progress.done + 1, total: this.lines.length };
          if (this.stage === "face") botEmit(this.code, "ai:status", this.snapshot());
        }
      }
    })();
    // The face renders at about half real time on a shared GPU, so start once
    // half the lesson is ready: the rest then finishes before it is needed.
    const total = this.lines.reduce((n, l) => n + l.ms, 0);
    const ready = () => this.lines.filter((l) => l.rendered).reduce((n, l) => n + l.ms, 0);
    while (!this.stopped && this.faceOk && ready() < total * 0.5) await this.sleep(1000);
  }

  async writePlan() {
    const lesson = this.row.lessonId
      ? await prisma.lesson.findUnique({ where: { id: this.row.lessonId }, include: { module: { include: { course: { select: { id: true } } } } } })
      : null;
    if (!lesson) throw new Error("This class has no lesson to teach");
    const ordered = await prisma.lesson.findMany({
      where: { module: { courseId: lesson.module.course.id } },
      orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
      select: { id: true },
    });
    const previous = await prisma.aiClass.findFirst({
      where: { id: { not: this.id }, status: "ENDED", plan: { not: null } },
      orderBy: { startsAt: "desc" },
    });
    const plan = await planClass({
      name: this.name,
      lesson,
      chapter: lesson.module.title,
      minutes: this.settings.minutes,
      position: { index: ordered.findIndex((l) => l.id === lesson.id), total: ordered.length },
      previous: previous && { title: previous.title, summary: previous.plan?.summary, questions: previous.questions || [] },
    });
    this.row.plan = plan;
    await prisma.aiClass.update({ where: { id: this.id }, data: { plan } });
    return plan;
  }

  async renderLine(line, urgent = false) {
    if (!this.faceOk || !this.face) return;
    try {
      await this.face.render(line.wav, join(this.dir, `${line.key}.mp4`), { urgent });
      line.video = `${this.url}/${line.key}.mp4`;
    } catch (e) {
      if (this.stopped) return;
      // One retry: the renderer restarts and prepares the face again by itself.
      if (!line.retried) {
        line.retried = true;
        console.error(`AI class ${this.id}: face render failed, retrying:`, e.message);
        return this.renderLine(line, urgent);
      }
      console.error(`AI class ${this.id}: face render failed again, continuing with voice only:`, e.message);
      this.faceOk = false;
      this.face?.stop();
    }
    line.rendered = true;
  }

  // ---- teaching ----

  async teach() {
    await botChat(this.code, `Hi everyone! I'm ${this.name}, your AI teacher for today's class: ${this.row.title}. Ask me anything here in the chat, any time.`);
    for (const line of this.lines) {
      if (this.stopped) return;
      await this.interruptions();
      if (this.stopped) return;
      await this.say(line, line.action === "type" && line.code ? () => this.typeCode(line.code, line.ms) : null);
      if (line.action === "run") await this.runCode(line.stdin);
      if (line.action === "ask") await this.askClass(line);
    }
    await this.interruptions();
  }

  async finish() {
    const homework = this.row.plan?.homework;
    if (homework) await botChat(this.code, `📚 Homework\n\n${homework}`).catch(() => {});
    await this.setStatus("ENDED", { endedAt: new Date(), questions: this.questions });
    this.setStage("ended");
    await this.sleep(GOODBYE_MS);
    if (!this.stopped) await endRoom(this.code).catch(() => {});
  }

  /** Plays one line in every browser and resolves when it has been spoken (and typed). */
  async say(line, during) {
    if (this.faceOk && !line.rendered) {
      const until = Date.now() + FACE_WAIT_MS;
      while (!line.rendered && this.faceOk && Date.now() < until && !this.stopped) await this.sleep(250);
    }
    if (this.stopped) return;
    const startAt = Date.now() + LEAD_MS;
    this.current = { id: ++this.seq, text: line.say, audio: line.audio, video: line.rendered ? line.video : null, startAt, ms: line.ms };
    botEmit(this.code, "ai:say", { ...this.current, now: Date.now() });
    const typing = during ? this.sleep(LEAD_MS).then(during).catch((e) => console.error("AI typing:", e.message)) : null;
    await this.sleep(LEAD_MS + line.ms + 300);
    await typing;
    this.lastSaid = line.say;
    this.current = null;
    botEmit(this.code, "ai:quiet", { id: this.seq });
  }

  /** Speaks something made up on the spot (a reaction or an answer). */
  async sayNow(text) {
    const key = `d${String(++this.seq).padStart(4, "0")}`;
    const wav = join(this.dir, `${key}.wav`);
    const line = { key, say: voiceText(text), wav, audio: `${this.url}/${key}.mp3`, video: null, rendered: false };
    await speakLines([{ text: line.say, out: wav }]);
    await wavToMp3(wav, join(this.dir, `${key}.mp3`));
    line.ms = await durationMs(wav);
    if (this.faceOk) await this.renderLine(line, true);
    else line.rendered = true;
    return line;
  }

  /** Types the editor from what it holds now to `target`, at a human pace that fits the spoken line. */
  async typeCode(target, budgetMs) {
    const state = await botState(this.code);
    let cur = state.content;
    if (state.writerId != null || state.content === target) {
      if (state.content !== target) await botReplace(this.code, target);
      return;
    }
    let p = 0;
    while (p < cur.length && p < target.length && cur[p] === target[p]) p++;
    // Starting a new program: clear it instead of deleting key by key.
    if (p < cur.length) {
      if (p < 8) p = 0;
      await botEdit(this.code, [{ rangeOffset: p, rangeLength: cur.length - p, text: "" }], posAt(target, p));
      cur = cur.slice(0, p);
      await this.sleep(250);
    }
    const text = target.slice(p);
    if (!text) return;
    const perChar = Math.min(110, Math.max(28, (budgetMs * 0.8) / text.length));
    let offset = p;
    for (let i = 0; i < text.length && !this.stopped; ) {
      // Indentation and runs of spaces arrive in one go, like auto-indent.
      let j = i + 1;
      if (text[i] === "\n") while (j < text.length && text[j] === " ") j++;
      else if (text[i] === " ") while (j < text.length && text[j] === " ") j++;
      const chunk = text.slice(i, j);
      const ok = await botEdit(this.code, [{ rangeOffset: offset, rangeLength: 0, text: chunk }], posAt(target, offset + chunk.length));
      if (!ok) return;
      offset += chunk.length;
      i = j;
      await this.sleep(chunk.startsWith("\n") ? perChar * 4 : perChar * (0.6 + Math.random() * 0.8));
    }
  }

  async runCode(stdin) {
    try {
      await botStdin(this.code, stdin || "");
      await this.sleep(400);
      const entry = await botRun(this.code);
      this.lastOutput = entry;
      await this.sleep(1200); // let students read the output
    } catch (e) {
      console.error(`AI class ${this.id}: run failed:`, e.message);
    }
  }

  async askClass(line) {
    const wait = Math.min(60, Math.max(15, line.wait || 30)) * 1000;
    this.ask = { question: line.say, expected: line.answer, until: Date.now() + wait, answers: [] };
    botEmit(this.code, "ai:ask", { question: line.say, until: this.ask.until, now: Date.now() });
    await this.sleep(wait);
    const { answers, question, expected } = this.ask;
    this.ask = null;
    botEmit(this.code, "ai:ask-closed", {});
    if (this.stopped) return;
    const filler = this.say(this.stock.answers);
    const reaction = reactToAnswers({ name: this.name, topic: this.row.title, question, expected, answers })
      .then((r) => this.sayNow(r.say))
      .catch(() => (expected ? this.sayNow(`The answer is: ${expected}`) : null));
    await filler;
    const said = await reaction;
    if (said) await this.say(said);
  }

  /** Raised hands and chat questions, answered between lines. */
  async interruptions() {
    if (this.handsWaiting.size && this.stock.hand) {
      const ids = [...this.handsWaiting.keys()];
      this.handsWaiting.clear();
      await this.say(this.stock.hand);
      for (const id of ids) await botLowerHand(this.code, id).catch(() => {});
    }
    if (!this.inbox.length) return;
    const messages = this.inbox.splice(0, MAX_QUESTIONS_PER_PAUSE);
    this.inbox = [];
    const filler = this.say(this.stock.thinking);
    const state = await botState(this.code).catch(() => ({ content: "" }));
    const answer = answerQuestions({ name: this.name, topic: this.row.title, code: state.content, lastSaid: this.lastSaid, messages }).catch((e) => {
      console.error(`AI class ${this.id}: answer failed:`, e.message);
      return null;
    });
    await filler;
    const a = await answer;
    if (!a?.respond || this.stopped) return;
    if (a.chat) await botChat(this.code, a.chat).catch(() => {});
    for (const m of messages) this.questions.push({ at: m.at, by: m.name, text: m.text, answer: a.chat || a.say });
    if (a.say) {
      const lessonCode = state.content;
      const line = await this.sayNow(a.say);
      await this.say(line, a.code ? () => this.typeCode(a.code, line.ms) : null);
      if (a.code) {
        await this.runCode("");
        await this.sleep(1500);
        await botReplace(this.code, lessonCode).catch(() => {});
      }
    }
  }

  // ---- what students do ----

  onChat(msg) {
    if (msg.by?.id === this.teacher.id || this.stage === "ended") return;
    const name = msg.by?.name || msg.by?.username || "someone";
    if (this.ask) {
      this.ask.answers.push({ name, text: msg.text });
      return;
    }
    if (this.stage === "live" && looksLikeQuestion(msg.text)) this.inbox.push({ at: msg.at, name, text: msg.text });
  }

  onHand(user, raised) {
    if (!raised || this.stage !== "live" || this.handsSeen.has(user.id)) return;
    this.handsSeen.add(user.id);
    setTimeout(() => this.handsSeen.delete(user.id), 60_000).unref();
    this.handsWaiting.set(user.id, user);
  }

  /** Welcomes people who join, a few at a time, in the chat. */
  onJoin(user) {
    if (user.id === this.teacher.id || this.stage === "ended" || this.stage === "failed") return;
    // Once per person per class: a refresh or reconnect isn't a new arrival.
    this.welcomed ??= new Set();
    if (this.welcomed.has(user.id)) return;
    this.welcomed.add(user.id);
    this.welcome.push(user.name || user.username);
    if (this.welcomeTimer) return;
    this.welcomeTimer = setTimeout(() => {
      this.welcomeTimer = null;
      const names = this.welcome.splice(0).map((n) => n.split(" ")[0]);
      if (!names.length || this.stopped) return;
      const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
      const text =
        this.stage === "live"
          ? `Welcome, ${who}! 👋 We're learning ${this.row.title}. Ask in the chat if anything is unclear.`
          : `Welcome, ${who}! 👋 Class starts at ${new Date(this.row.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. I'm getting ready.`;
      botChat(this.code, text).catch(() => {});
    }, 8000);
    this.welcomeTimer.unref();
  }
}

/** Monaco position (1-based line/column) of an offset in `text`. */
function posAt(text, offset) {
  const before = text.slice(0, offset);
  const lineNumber = before.split("\n").length;
  return { lineNumber, column: offset - before.lastIndexOf("\n") };
}
