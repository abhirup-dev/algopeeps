#!/usr/bin/env bash
# Emit a line when a worker's inbox file changes, its herdr status changes,
# or its NOTES.md section appears (then exit).
# Usage: scripts/wp-watch.sh <agent-name> <WP-id e.g. WP-N>
set -u
agent="$1"; wp="$2"
root=/Users/abhirupdas/Codes/Personal/algopeeps.abhirup-canvas/canvas
inbox="$root/briefs/$wp-inbox.md"
last=$(md5 -q "$inbox" 2>/dev/null); prev=working
while true; do
  cur=$(md5 -q "$inbox" 2>/dev/null)
  if [ "$cur" != "$last" ]; then
    echo "inbox: $(tail -3 "$inbox" | tr '\n' ' ' | cut -c1-300)"; last=$cur
  fi
  if grep -q "^## $wp" "$root/NOTES.md"; then echo "NOTES has $wp section"; break; fi
  s=$(timeout 10 herdr agent get "$agent" 2>/dev/null | jq -r '.result.agent.agent_status // "gone"')
  [ "$s" != "$prev" ] && echo "$agent $s"; prev=$s
  sleep 45
done
