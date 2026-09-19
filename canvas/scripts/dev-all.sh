#!/usr/bin/env bash
# Runs the canvas server (WP-B) and the ext-apps host (host.sh) together.
# Ctrl-C tears both down. The reference host lives outside the repo for now;
# WP-E may vendor it — see host.sh.
set -euo pipefail

CANVAS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
pids=()

cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

if [ -f "$CANVAS_DIR/server/package.json" ] && grep -q '"dev"' "$CANVAS_DIR/server/package.json"; then
  bun run --cwd "$CANVAS_DIR/server" dev &
  pids+=($!)
else
  echo "dev-all.sh: canvas/server has no dev script yet (WP-B not landed) — starting host only."
fi

bash "$CANVAS_DIR/scripts/host.sh" &
pids+=($!)

wait
