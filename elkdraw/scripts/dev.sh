#!/bin/sh
# `bun run --cwd elkdraw dev`: build the app if stale, then serve it through
# portless at https://<branch>.elkdraw.localhost:<proxy port> (the branch prefix
# only appears in a linked worktree). Args pass through to the server
# (e.g. --no-open). Without portless on PATH: plain http on $PORT (3940).
set -eu
cd "$(dirname "$0")/.."

dist=app/dist/index.html
if [ ! -f "$dist" ] || [ -n "$(find app/src app/index.html app/vite.config.js core/src -newer "$dist" | head -n 1)" ]; then
  bun run --cwd app build
fi

server="bun adapters/server/src/main.ts"
if command -v portless >/dev/null 2>&1; then
  # --name keeps the base name stable; portless prepends the worktree's branch.
  exec portless run --name elkdraw $server "$@"
fi
echo "elkdraw dev: portless not found, serving plain http" >&2
exec $server "$@"
