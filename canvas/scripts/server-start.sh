#!/usr/bin/env bash
# (Re)start the canvas MCP server on :3100 detached from the calling shell,
# so closing a terminal pane never takes it down. Log: /tmp/canvas-server.log
set -u
cd "$(dirname "$0")/.." || exit 1
old=$(lsof -nP -iTCP:3100 -sTCP:LISTEN -t 2>/dev/null)
[ -n "$old" ] && kill $old && sleep 1
nohup bun server/src/main.ts > /tmp/canvas-server.log 2>&1 < /dev/null &
disown
for _ in $(seq 1 20); do
  lsof -nP -iTCP:3100 -sTCP:LISTEN -t >/dev/null 2>&1 && { echo "canvas server up on :3100 (pid $(lsof -nP -iTCP:3100 -sTCP:LISTEN -t))"; exit 0; }
  sleep 0.5
done
echo "server did not come up; see /tmp/canvas-server.log" >&2; exit 1
