#!/usr/bin/env bash
# Stops a server started by ./start.sh. Add --all to also stop the database.
cd "$(dirname "$0")"
[ -f logs/server.pid ] && kill -- "-$(cat logs/server.pid)" 2>/dev/null
rm -f logs/server.pid logs/api.pid logs/web.pid
[ "$1" = "--all" ] && docker compose stop db
echo "Stopped."
