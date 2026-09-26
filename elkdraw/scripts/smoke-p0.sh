#!/bin/sh
# `bun run --cwd elkdraw smoke:p0`: the Phase 0 exit smoke (eval/src/smoke-p0.ts).
# Bun reads NODE_EXTRA_CA_CERTS only at startup, so set portless's CA here.
set -eu
cd "$(dirname "$0")/.."
if ! command -v portless >/dev/null 2>&1; then
  echo "smoke: FAIL portless is not on PATH; install it (npm i -g portless) and retry" >&2
  exit 1
fi
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-$HOME/.portless/ca.pem}"
exec bun eval/src/smoke-p0.ts "$@"
