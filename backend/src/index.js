// One server, one port: the API lives under /api and every other path is
// handed to the Next.js website in ../frontend.
import "./lib/env.js";
import express from "express";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import authRoutes from "./routes/auth.js";
import problemRoutes from "./routes/problems.js";
import submissionRoutes from "./routes/submissions.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import userRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js";
import courseRoutes from "./routes/courses.js";
import adminCourseRoutes from "./routes/adminCourses.js";
import manageRoutes from "./routes/manage.js";
import reelRoutes from "./routes/reels.js";
import liveTestRoutes from "./routes/liveTests.js";
import classroomRoutes from "./routes/classrooms.js";
import adminClassPermRoutes from "./routes/adminClassPerms.js";
import { adminRouter as adminAiClassRoutes, publicRouter as aiClassRoutes } from "./routes/aiClass.js";
import { attachClassrooms } from "./lib/classroom.js";
import { attachQuizzes } from "./lib/quiz.js";
import quizRoutes from "./routes/quizzes.js";
import manageReelRoutes, { UPLOAD_DIR } from "./routes/manageReels.js";
import { startRenderer } from "./lib/reelRender.js";
import { startAiTeacher } from "./lib/aiTeacher/index.js";

const api = express.Router();
api.use(express.json({ limit: "5mb" }));
api.get("/health", (_req, res) => res.json({ ok: true }));
api.use("/auth", authRoutes);
api.use("/problems", problemRoutes);
api.use("/submissions", submissionRoutes);
api.use("/leaderboard", leaderboardRoutes);
api.use("/users", userRoutes);
api.use("/courses", courseRoutes);
api.use("/reels", reelRoutes);
api.use("/live-tests", liveTestRoutes);
api.use("/classrooms", classroomRoutes);
api.use("/quizzes", quizRoutes);
api.use("/ai-class", aiClassRoutes);
api.use("/manage/reels", manageReelRoutes);
api.use("/manage", manageRoutes);
api.use("/admin/class-permissions", adminClassPermRoutes);
api.use("/admin/ai-class", adminAiClassRoutes);
api.use("/admin", adminCourseRoutes);
api.use("/admin", adminRoutes);
api.use((_req, res) => res.status(404).json({ error: "Not found" }));
api.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: `${first.path.join(".") || "input"}: ${first.message}` });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: "That value is already taken" });
    if (err.code === "P2025") return res.status(404).json({ error: "Not found" });
  }
  if (err.type === "entity.too.large") return res.status(413).json({ error: "That file is too big" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const app = express();
app.use("/api", api);
// Uploaded reel videos.
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d", fallthrough: false }));
// Resume Studio (Yuva Intern admin tool) runs separately on :8079 and is served
// at /yuvaintern. Passed through untouched and before Next.js, whose
// trailing-slash redirect would otherwise loop with Resume Studio's.
app.use("/yuvaintern", (req, res) => {
  const upstream = httpRequest(
    { host: "127.0.0.1", port: 8079, path: req.originalUrl, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.status(502).send("Resume Studio is not running");
  });
  req.pipe(upstream);
});

// The website. Set WEB_DEV=1 for hot reload while editing the frontend.
const frontendDir = fileURLToPath(new URL("../../frontend", import.meta.url));
const next = createRequire(`${frontendDir}/package.json`)("next");
const web = next({ dev: process.env.WEB_DEV === "1", dir: frontendDir });
await web.prepare();
const handle = web.getRequestHandler();
app.use((req, res) => handle(req, res));

const port = Number(process.env.PORT || 7319);
// One server for the API, the website and Socket.IO (live classrooms).
// Browsers only allow camera/microphone on https or localhost, so classes
// joined from other machines need HTTPS: set HTTPS_KEY and HTTPS_CERT in
// .env (tools/https-cert.sh makes a self-signed pair).
const { HTTPS_KEY, HTTPS_CERT } = process.env;
const tls = HTTPS_KEY && HTTPS_CERT && existsSync(HTTPS_KEY) && existsSync(HTTPS_CERT);
const server = tls ? createTlsServer({ key: readFileSync(HTTPS_KEY), cert: readFileSync(HTTPS_CERT) }, app) : createServer(app);
const io = attachClassrooms(server);
// Live quizzes share the same Socket.IO server (namespace /quiz).
await attachQuizzes(io);
server.listen(port, () => {
  console.log(`Quantum Code on ${tls ? "https" : "http"}://localhost:${port}`);
  // Make download videos for live reels that don't have a current one.
  startRenderer(UPLOAD_DIR).catch((e) => console.error("Reel renderer:", e.message));
  // The daily AI-taught class (opens on schedule; admins can also start one).
  startAiTeacher(UPLOAD_DIR).catch((e) => console.error("AI teacher:", e.message));
});
