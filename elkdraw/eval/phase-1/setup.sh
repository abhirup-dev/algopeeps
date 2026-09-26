#!/bin/sh
# Phase 1 eval, one run's setup: sh setup.sh <task> <port>
# Prints the scratch dir. Makes a fresh scratch dir with the skill as a project
# skill, an `elkdraw` link so SKILL.md's relative CLI path runs, the task
# prompt plus one line naming the skill and URL, and starts an isolated
# elkdraw server on <port> (data dir next to the scratch dir, not inside it;
# its tmpdir inside it, where look/screenshot write PNGs).
# Stop it with: bun $ELK/adapters/cli/src/main.ts --url http://127.0.0.1:<port> stop
set -eu
task=$1 port=$2
ELK=$(cd "$(dirname "$0")/../.." && pwd)
REPO=$(dirname "$ELK")
S=$(realpath "$(mktemp -d "/tmp/elkdraw-eval-$task.XXXX")")
mkdir -p "$S/.claude/skills/elkdraw" "$S/canvas/briefs" "$S/canvas/docs"
cp "$ELK/skill/SKILL.md" "$S/.claude/skills/elkdraw/"
cp -R "$ELK/skill/references" "$S/.claude/skills/elkdraw/"
cp "$REPO/canvas/briefs/DOGFOOD-diagram.md" "$S/canvas/briefs/"
ln -s "$ELK" "$S/elkdraw"
url="http://127.0.0.1:$port"
{
  cat "$ELK/eval/prompts/$task.md"
  printf '\nUse the elkdraw skill; your canvas server is already running at %s (pass --url %s).\n' "$url" "$url"
} >"$S.prompt.md"
# look/screenshot PNGs go to the server's tmpdir: keep them inside the cwd
# the tester may Read.
mkdir -p "$S/tmp"
TMPDIR="$S/tmp" ELKDRAW_DATA_DIR="$S.data" bun "$ELK/adapters/cli/src/main.ts" --url "$url" start --no-open >"$S.start.json"
echo "$S"
