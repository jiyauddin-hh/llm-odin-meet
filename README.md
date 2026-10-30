# Quantum Code

A coding practice platform: solve problems, get your code judged instantly, climb the leaderboard.

## Start / stop

Quantum Code runs on **one port: 7319**. The website is at http://localhost:7319 and the API at
http://localhost:7319/api. The database (PostgreSQL in Docker) is internal, on 127.0.0.1:5917.

It's registered in **God Father** as `quantum-code`, with the command `./serve.sh`. Start, stop and read
its logs there. It auto-restarts after a crash and starts whenever God Father starts.

Without God Father:

```bash
./serve.sh        # run in the foreground (Ctrl+C to stop)
./start.sh        # or in the background...
./stop.sh         # ...and stop it
./stop.sh --all   # also stops the database
```

`serve.sh` starts the database, builds the sandbox image and website only when needed, then runs
the server.

Admin login: `admin` / `admin123`. **Change this password before going live.**

To let someone teach, open Admin → Users and set their role to **TEACHER** (admins can teach too).

Needs Node.js 20+ and Docker.

## Features

- **Accounts**: sign up, log in (JWT).
- **Problems**: search and filter by difficulty, topic and solved status. Markdown statements, examples, constraints.
- **Editor**: Monaco (the VS Code editor) with Python 3, JavaScript, C++17, Java 21 and Go 1.22. Drafts are saved in the browser.
- **Run**: tests sample cases or your own input. **Submit**: tests every case, including hidden ones.
- **Verdicts**: Accepted, Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Runtime Error, Compilation Error.
- **Leaderboard**: weekly, monthly and all-time. Easy 10, Medium 20, Hard 40 points; first accept only.
- **Profile**: rank, score, solved by difficulty, streak, badges, activity heatmap, recent submissions.
- **Courses**: Python, C++, DSA, Machine Learning, System Design, FastAPI, Go & Gin and Docker, split into modules and lessons (Markdown + code,
  optional YouTube video, linked practice problems), "Mark as complete" and progress bars.
- **Chapter locks**: each chapter has an unlock rule: *Admin permission* (default), *Free preview*
  (chapter 1 of every course), or *Auto* (opens once the previous chapter is finished). Admins can give
  single chapters or the whole course, and users can request either one.
- **Machine Learning course**: 18 chapters / 84 lessons from "What is ML" to deployment, every lesson
  with Mermaid flowcharts, interactive diagrams, a quiz and coding practice (`content/ml/`). Load or
  refresh it with `cd backend && node scripts/ml-import.js` (the app must be running); check a part
  with `node scripts/ml-check.js ../content/ml/part1.json`.
- **System Design course**: 13 chapters / 58 lessons from fundamentals (estimation, latency, availability,
  networking, APIs) through load balancing, caching, databases, sharding, replication, CAP, consensus, queues,
  microservices, rate limiting, security and observability to 9 case studies (URL shortener, WhatsApp, Twitter
  feed, notifications, YouTube, Uber, web crawler, typeahead, key-value store). Every lesson has several Mermaid
  charts (flowcharts, sequence diagrams, mind maps, pie/xy/quadrant charts, timelines, ER diagrams), interactive
  simulations, a quiz, and judged coding practice (`content/system-design/`).
- **FastAPI course**: 14 chapters / 55 lessons from first API through routing, Pydantic, dependency injection,
  SQLAlchemy, OAuth2/JWT security, async and background tasks, middleware, WebSockets, testing and deployment to three
  capstone projects (`content/fastapi/`). Most practice problems are real FastAPI apps: the learner writes the app and a
  harness at the bottom of the file sends the test requests through Starlette's TestClient and prints the responses.
- **Go & Gin course**: 14 chapters / 56 lessons from Go basics (types, slices, maps, structs, interfaces, errors,
  generics, goroutines, channels, context) through net/http, Gin routing, binding and validation, middleware, GORM,
  bcrypt/JWT/RBAC, project structure, graceful shutdown, WebSockets, testing with httptest and Docker deployment to
  three capstone projects (`content/golang/`, interactive Go widgets in `frontend/components/diagrams/widgetsG.jsx`).
  Gin practice problems are real Gin apps: the learner writes `setupRouter()` and a harness at the bottom of the file
  sends the test requests through `httptest` and prints `STATUS BODY` lines.
- **Docker course**: 14 chapters / 53 lessons from why containers exist, containers vs VMs and Docker's architecture
  through the CLI and container lifecycle, images and layers, Dockerfiles, layer caching, multi-stage builds and BuildKit,
  volumes and bind mounts, networking and port publishing, Docker Compose, containerizing FastAPI / Node.js / Go apps,
  config, secrets and logging, healthchecks, resource limits, signals and PID 1, security hardening, registries,
  GitHub Actions CI and deployment to three capstone projects (`content/docker/`, interactive Docker widgets in
  `frontend/components/diagrams/widgetsH.jsx` and `widgetsI.jsx`). The judge can't run Docker, so practice problems are
  Python programs that build the logic Docker itself runs (image reference parsing, layer cache hits, `.dockerignore`
  matching, compose startup order, restart policies...).
- **Course content folders** (`content/system-design/`, `content/fastapi/`, `content/golang/`, `content/docker/`): `course.json` (title, icon, question
  subject, slug prefix), `syllabus.json` (chapters → topics) and `part*.json` (lessons with quizzes, and questions).
  Load or refresh one with `cd backend && node scripts/course-import.js fastapi` (the app must be running; creates the
  course on first run, keeps lesson ids so learners keep progress); check a part with
  `node scripts/course-check.js ../content/fastapi/part1.json`.
- **Diagrams in lessons** (any Markdown: lessons, questions): a ```` ```mermaid ```` block draws a
  flowchart / sequence / mind map, and a ```` ```diagram ```` block shows an interactive animated widget,
  e.g. `kmeans {"k": 4}`. Widgets: gradient-descent, linear-regression, sigmoid, activation-functions,
  normal-distribution, overfitting, bias-variance, kfold, kmeans, knn, decision-tree, neural-network,
  confusion-matrix, svm-margin, pca, roc-curve, and for system design latency-numbers, availability, estimation,
  scaling, load-balancer, cache, consistent-hashing, sharding, replication, cap-theorem, rate-limiter, message-queue,
  circuit-breaker, bloom-filter, and for FastAPI request-lifecycle, event-loop, pydantic-validator, dependency-graph,
  jwt-auth, http-playground, cors, and for Docker docker-architecture, container-lifecycle, docker-terminal, image-layers,
  multi-stage-build, port-mapping, docker-network, volume-mounts, compose-startup, resource-limits (`frontend/components/diagrams/`). The admin lesson
  editor has buttons for 🖼 image upload, 🔀 flowchart, ✨ interactive diagram and 👁 preview.
- **Lesson quizzes**: multiple-choice questions at the end of a lesson, checked on the server, with
  explanations and the learner's best score. Edited per lesson in Admin → Courses.
- **Course access**: users only open courses an admin has unlocked for them. Others show 🔒 and a
  **Request access** button. Access can be permanent or have an end date, and the server enforces it.
- **Question Manager** (admins and editors): questions organised as Subject → Chapter → Topic, with
  hints, a solution explanation (unlocks after solving), company tags, starter code and test cases.
  Every question needs a reference solution that passes all its tests before it can go live.
  Editors work only in subjects the admin assigns. Their drafts go to a **review queue**, and an admin
  approves or requests changes. Includes preview, edit history with restore, duplicate, hide, and bulk
  JSON upload (template at `/question-template.json`).
- **Reels** (`/reels`): a swipe feed of 15–60 second animated concept explainers with like, save,
  share, "Practice this" and optional read-aloud captions. Built in **Question Manager → Reels** from
  templates (code walkthrough, array/bars, stack/queue/call stack, dictionary, slides, and for ML:
  plot — points/lines/curves/centroids — and graph — decision trees, neural networks) with a live
  preview, or from an uploaded video / YouTube Shorts link. Same Draft → Review → Live workflow.
  Lessons and questions show "▶ Watch the reel" for their topic. Uploaded videos are stored in
  `backend/uploads/`. Starter reels are in `content/reels.json`.
- **Reel downloads**: a ⬇ Download button gives a 1080×1920 MP4 with a watermark and end card.
  Animated reels are turned into video automatically when published (headless Chrome records the
  `/reels/render/<slug>` page and ffmpeg encodes it; needs `google-chrome` and `ffmpeg`, or set
  `CHROME_PATH` / `FFMPEG_PATH`). Uploaded videos download as-is; YouTube links can't be downloaded.
  Admins choose who can download (logged-in users by default) in Question Manager → Reels.
- **Instagram-ready reels**: downloads are 1080×1920, 30 fps, H.264 High + AAC 48 kHz stereo at about
  −14 LUFS, with all text inside Instagram's safe zones (toggle "📱 Insta safe zones" in the Studio
  preview). Each reel opens with a big hook, has word-by-word captions and a "Follow for more" outro.
- **Voice-over**: a natural offline neural voice (Piper, `tools/tts`, set up with
  `tools/tts/setup.sh`) speaks each step. It's mixed into the MP4 and played in the feed with
  🔊 Voice on. Editors can write the spoken text per step; otherwise the caption is read with code
  symbols turned into words.
- **Live classroom** (`/classroom`, "Classroom" in the navbar for logged-in users): teacher and admin actions are
  enforced by role on the server. A teacher starts a class and shares a 6-character code. Everyone who
  joins sees the teacher's editor and terminal keystroke by keystroke (Socket.IO, `backend/src/lib/classroom.js`).
  Exactly one person holds the *pen* at a time: the teacher by default, or one student the teacher gives it to.
  While a student has the pen the teacher (and the class) watch them type live, with their caret shown; the
  teacher can take the pen back at any moment, students can raise a hand, and "Run" executes the shared code in
  the same Docker sandbox as Practice, with the output shown to the whole room. Code and input are saved to the
  database as they change, so a late joiner, a refresh, or a server restart keeps the latest text.
- **Video call in class** (Meet-style): the room has a bottom bar with microphone, camera, present-screen, raise
  hand, layout toggle and leave/end buttons, a people list with per-student mute and "mute all", and a class chat.
  Two layouts: **Code** (editor in front, a filmstrip of videos above it) and **Meet** (video grid in front; a shared
  screen or a pinned person takes the main stage). Media goes peer to peer over WebRTC (`frontend/lib/useCall.js`);
  the server only relays signaling, so no media server is needed. That mesh suits classes of up to about 25 people;
  beyond that an SFU such as LiveKit would be the next step.
  - **HTTPS is required for camera and microphone** from any machine other than localhost (a browser rule). Run
    `tools/https-cert.sh`, set `HTTPS_KEY`/`HTTPS_CERT` in `backend/.env`, restart, and open
    `https://<server-ip>:<port>` (accept the one-time self-signed warning). Screen share and chat work either way.
  - Everyone on one network connects directly. For students on other networks set `TURN_URL`, `TURN_USERNAME`
    and `TURN_CREDENTIAL` (e.g. a coturn server); otherwise connections behind strict NATs may fail.
- **Live quiz** (`/quiz`, "Quiz" in the navbar): a KBC-style quiz game. Admins write a quiz (questions,
  options, seconds per question) and launch it; students join with a 6-character code. Every screen gets the same
  question at the same moment; a correct answer scores 500–1000 points by speed, plus a streak bonus. After each
  question the answer, an answer chart and a leaderboard appear; at the end a WWE-style winner show (spotlights,
  drumroll, 3rd → 2nd → 1st on a podium with photos, confetti and a fanfare) plays in sync on every screen. The server
  keeps the clock, answers and scores (`backend/src/lib/quiz.js`, Socket.IO namespace `/quiz`); sounds are made in the
  browser (`frontend/components/quiz/sound.js`). Final rankings are saved and shown as "Recent champions".
  The quiz editor has **Generate questions with AI**: describe the topic (and/or pick a course lesson), choose how many
  (up to 30) and the difficulty, and Claude (via the Claude CLI, `backend/src/lib/claude.js`) writes multiple-choice
  questions with explanations. They're validated, de-duplicated and their options shuffled
  (`backend/src/lib/quizGen.js`), then added to the editor for review before saving.
- **Daily AI class** (Admin → AI class; students see it on `/classroom`): an AI teacher with a realistic talking face teaches
  the next Python lesson every day at a set time, in a normal classroom room students join without a code. It speaks,
  types code into the shared editor keystroke by keystroke, runs it, asks the class questions and reacts to the answers
  in the chat by name, answers questions typed in the chat and raised hands, and posts homework at the end
  (`backend/src/lib/aiTeacher/`). Admins can also start a class now on any lesson, or stop one.
  - *Brain*: Claude through the Claude Code CLI (`claude -p`, found automatically or set `CLAUDE_BIN`; model via
    `AI_TEACHER_MODEL`, default `sonnet`). It writes each class script from the lesson and the previous class's summary.
    For many students, log the CLI in with an `ANTHROPIC_API_KEY` rather than a personal subscription.
  - *Voice*: the Piper voice (`tools/tts`). *Face*: open-source MuseTalk 1.5 on the NVIDIA GPU (`tools/avatar`, install
    with `tools/avatar/setup.sh`, about 6 GB) lip-syncs the face in `tools/avatar/faces/teacher.jpg` (an AI-generated
    person; replace it with a front-facing photo or short video, or set `AI_TEACHER_FACE`). Without the GPU model the
    teacher appears as its photo with voice.
  - The room opens `prepMinutes` early while the script, voice and video are made; teaching starts once half the
    lesson's video is ready (the face renders at about half real time on an RTX 3060). Clips are plain files under
    `/uploads/ai-class/`, played in sync by every browser, so no media server is needed.
  - The renderer needs about 3.6 GB of GPU memory: it unloads Ollama's models while a class runs (Ollama reloads them
    beside it, partly on the CPU) and once more after the class so they get the whole GPU back.
- **Classroom permissions** (Admin → Classroom): choose who may use voice, video, screen share, chat, the code editor
  (being given the pen) and Run in live classes. Each role has defaults, and a single person can be set to *always
  allow* or *block* per feature. Changes apply at once to running classes. The server ignores media a person isn't
  allowed to send, and other browsers don't play it. A class's host and admins can always use everything.
- **Admin**: assign the Editor role and editors' subjects; courses and lessons; give/remove course access (per course, many
  users at once, or per user); approve/reject access requests; manage users and roles.

## How code is judged

Each submission runs in a fresh Docker container (`runner/`) that has:
no network, 512 MB memory, 1 CPU, at most 128 processes, a read-only filesystem
(except a small `/tmp`), no Linux capabilities, and an unprivileged user.
The container is deleted afterwards. Python has NumPy, pandas, SciPy and scikit-learn for ML
questions and FastAPI (with Pydantic, TestClient, SQLAlchemy + SQLite and PyJWT) for FastAPI questions. Go has Gin, golang-jwt, bcrypt, GORM with pure-Go SQLite,
gorilla/websocket and uuid, pinned in `runner/gomod/go.mod`; the jobs have no network, so the modules and a warm
read-only build cache are baked into the image and a Gin program compiles in about a second. Bump `LABEL qc.runner` in `runner/Dockerfile` after changing it; `serve.sh` then rebuilds.

Judge0 was the first plan, but it doesn't run on this machine (it needs cgroup v1;
this Linux only has cgroup v2). All judging goes through `backend/src/lib/judge.js`,
so Judge0 can be swapped in later on a server that supports it.

## Project layout

```
backend/    Express API + Prisma (PostgreSQL)
  prisma/schema.prisma   database tables
  prisma/seed.js         admin user + 8 starter problems
  prisma/courses.js      the 4 starter courses
  src/routes/            auth, problems, submissions, leaderboard, users, courses, admin, adminCourses, classrooms
  src/lib/judge.js       runs code in the sandbox
frontend/   Next.js 14 + Tailwind website
  scripts/ml-*.js        check and import the Machine Learning course
  scripts/course-*.js    check and import a course from content/<name>/ (System Design, FastAPI)
runner/     Sandbox Docker image (Python + ML libraries, Node, g++, Java, Go + Gin) + judge.py
content/    course content (python/, ml/, system-design/, fastapi/, golang/) and starter reels
```

## Next steps (phase 2)

Contests, discussions per problem, more badges, dark/light toggle, email verification, password reset.
