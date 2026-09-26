#!/bin/sh
# 1.14 head-to-head, one task: sh run.sh <task> <portA> <portB>
# A = yctimlin mcp-excalidraw-server via excalidraw-skill, B = elkdraw via the
# elkdraw skill. Same harness as 1.12 (eval/phase-1/phase-1.md "Setup"), same
# prompt (prompts/<task>.md) plus one line naming the skill and URL. Both
# testers run at the same time. Finals and transcripts land in <task>/{a,b}/.
# Every server, tab and browser this starts is stopped on exit.
set -eu
task=$1 pa=$2 pb=$3
HERE=$(cd "$(dirname "$0")" && pwd)
ELK=$(cd "$HERE/../.." && pwd)
REPO=$(dirname "$ELK")
YCT="npx -y mcp-excalidraw-server"
ua="http://127.0.0.1:$pa" ub="http://127.0.0.1:$pb"
OUT="$HERE/$task"
mkdir -p "$OUT/a" "$OUT/b"

scratch() {
  s=$(realpath "$(mktemp -d "/tmp/audit-p1-$task-$1.XXXX")")
  mkdir -p "$s/canvas/briefs" "$s/canvas/docs" "$s/tmp" "$s/.claude/skills"
  cp "$REPO/canvas/briefs/DOGFOOD-diagram.md" "$s/canvas/briefs/"
  echo "$s"
}
A=$(scratch a) B=$(scratch b)
cp -RL "$HOME/.claude/skills/excalidraw-skill" "$A/.claude/skills/"
mkdir -p "$B/.claude/skills/elkdraw"
cp "$ELK/skill/SKILL.md" "$B/.claude/skills/elkdraw/"
cp -R "$ELK/skill/references" "$B/.claude/skills/elkdraw/"
ln -s "$ELK" "$B/elkdraw"
{
  cat "$HERE/prompts/$task.md"
  printf '\nTool under test: yctimlin mcp-excalidraw-server, through the excalidraw-skill skill; your canvas server is already running at %s (pass --url %s), with a browser tab open on it.\n' "$ua" "$ua"
} >"$A.prompt.md"
{
  cat "$HERE/prompts/$task.md"
  printf '\nTool under test: ELK draw (elkdraw), through the elkdraw skill; your canvas server is already running at %s (pass --url %s).\n' "$ub" "$ub"
} >"$B.prompt.md"

# A's env: its own server URL (never the 3000 default), pidfile dir and the
# CLI's screenshot tmpdir inside the cwd the tester may Read.
envA="EXPRESS_SERVER_URL=$ua XDG_STATE_HOME=$A.state TMPDIR=$A/tmp"
tab=""
cleanup() {
  [ -n "$tab" ] && kill "$tab" 2>/dev/null || true
  env $envA $YCT --url "$ua" stop >/dev/null 2>&1 || true
  bun "$ELK/adapters/cli/src/main.ts" --url "$ub" stop >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

env $envA $YCT --url "$ua" start >"$A.start.json"
TMPDIR="$B/tmp" ELKDRAW_DATA_DIR="$B.data" bun "$ELK/adapters/cli/src/main.ts" --url "$ub" start --no-open >"$B.start.json"
bun "$HERE/tab.js" "$ua" >"$A.tab.log" 2>&1 &
tab=$!
sleep 5
env $envA $YCT --url "$ua" status >"$A.status.json"
cat "$A.status.json"
# A harness without a tab would fail every screenshot (exit 4): stop here.
grep -q '"browserClients": [1-9]' "$A.status.json" || { echo "no browser tab on $ua" >&2; exit 1; }
env $envA $YCT --version >"$OUT/a/version.txt"

EVAL="$ELK/eval/src/cli.ts"
env $envA bun "$EVAL" --live --task "$task" --prompt-file "$A.prompt.md" --cwd "$A" \
  --allowed-tools "Bash($YCT:*)" --allowed-tools "Skill(excalidraw-skill)" \
  --allowed-tools Read --allowed-tools Write --allowed-tools Edit \
  >"$A.row.txt" 2>"$A.stderr" &
ja=$!
bun "$EVAL" --live --task "$task" --prompt-file "$B.prompt.md" --cwd "$B" \
  >"$B.row.txt" 2>"$B.stderr" &
jb=$!
wait $ja || echo "A exited $?"
wait $jb || echo "B exited $?"
# A stray auto-started yctimlin server (a --url elsewhere) is not ours to
# guess at: list them for a human.
pgrep -fl mcp-excalidraw-server || true

# Finals: each side's own view, then its scene file for render.js.
env $envA $YCT --url "$ua" export --out "$OUT/a/scene.excalidraw" || true
env $envA $YCT --url "$ua" screenshot --out "$OUT/a/final-own.png" || true
env $envA $YCT --url "$ua" describe >"$OUT/a/describe.txt" || true
cli="bun $ELK/adapters/cli/src/main.ts --url $ub"
$cli screenshot --max-px 2400 --out "$OUT/b/final-own.png" >/dev/null || true
$cli lint >"$OUT/b/lint-own.json" || true
$cli describe >"$OUT/b/describe.txt" || true
cleanup
bun "$HERE/wire.js" "$B.data/default" >"$OUT/b/scene.excalidraw"

for side in a b; do
  s=$A
  [ $side = b ] && s=$B
  cp "$s.prompt.md" "$OUT/$side/prompt.md"
  cp "$s.result.json" "$OUT/$side/result.json"
  cp "$s.row.txt" "$OUT/$side/row.txt"
  cp -R "$s/canvas/docs/." "$OUT/$side/" 2>/dev/null || true
  bun "$HERE/trim.js" "$s" >"$OUT/$side/transcript.jsonl"
done
echo "A=$A B=$B"
