#!/usr/bin/env bash
# Runs the ext-apps reference host (basic-host) pointed at the canvas MCP server.
# The reference host lives OUTSIDE this repo (/tmp/ext-apps-audit/examples/basic-host)
# for now — WP-E may vendor it into canvas/ if it becomes part of the product.
set -euo pipefail

HOST_DIR="${EXT_APPS_HOST:-/tmp/ext-apps-audit/examples/basic-host}"
export SERVERS='["http://127.0.0.1:3100/mcp"]'
export HOST_PORT="${HOST_PORT:-8080}"
export SANDBOX_PORT="${SANDBOX_PORT:-8081}"

if [ ! -d "$HOST_DIR/node_modules" ]; then
  echo "host.sh: $HOST_DIR not installed — run: npm -C '$HOST_DIR' install" >&2
  exit 1
fi

cd "$HOST_DIR"
[ -f dist/index.html ] || npm run build # rebuild only if no build output yet

echo
echo "  host UI:  http://127.0.0.1:${HOST_PORT}   (sandbox :${SANDBOX_PORT})"
echo "  servers:  ${SERVERS}"
echo "  Ctrl-C to stop"
echo
exec npm run serve
