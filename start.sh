#!/usr/bin/env bash
# Starts Quantum Code in the background (without God Father). Stop with ./stop.sh
cd "$(dirname "$0")"
mkdir -p logs
setsid nohup ./serve.sh > logs/server.log 2>&1 < /dev/null & echo $! > logs/server.pid
echo "Starting... open http://localhost:${PORT:-7319}  (log: logs/server.log)"
