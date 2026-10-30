#!/usr/bin/env bash
# Runs Quantum Code in the foreground on ONE port (default 7319).
# This is the command God Father runs. Everything is at http://localhost:7319
set -e
cd "$(dirname "$0")"

docker compose up -d db
# Rebuild the sandbox when runner/Dockerfile's qc.runner label changes.
want=$(sed -n 's/^LABEL qc.runner="\(.*\)"/\1/p' runner/Dockerfile)
have=$(docker image inspect -f '{{index .Config.Labels "qc.runner"}}' quantumcode-runner 2>/dev/null || true)
[ "$have" = "$want" ] || docker build -t quantumcode-runner ./runner
[ -d backend/node_modules ] || (cd backend && npm install)
[ -d frontend/node_modules ] || (cd frontend && npm install)
# Offline voice for reel voice-overs (about 110 MB, first run only).
[ -x tools/tts/.venv/bin/python ] || ./tools/tts/setup.sh || echo "Voice setup failed: reels will be made without a voice-over"

echo "Waiting for database..."
until docker exec quantumcode-db pg_isready -U quantum >/dev/null 2>&1; do sleep 1; done
(cd backend && npx prisma db push --skip-generate >/dev/null && npx prisma generate >/dev/null && node prisma/seed.js)

# Rebuild the website only when its source changed since the last build.
if [ ! -f frontend/.next/BUILD_ID ] || [ -n "$(find frontend/app frontend/components frontend/lib frontend/*.js frontend/*.mjs frontend/.env.local -newer frontend/.next/BUILD_ID -print -quit)" ]; then
  echo "Building website..."
  (cd frontend && NEXT_TELEMETRY_DISABLED=1 npx next build)
fi

cd backend
exec node src/index.js
