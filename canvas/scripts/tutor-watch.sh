#!/usr/bin/env bash
# Poke the pi tutor when the human opens or replies to a comment thread
# (CONTRACT §12) or writes a text note on the canvas.
# Usage: scripts/tutor-watch.sh [session=demo] [herdr agent name=tutor]
# Threads only by default (triggered initiative); TUTOR_WATCH_TEXT=1 also
# fires on human text notes, which is noisy while assets are being edited.
# ponytail: tails events.jsonl instead of an MCP client; replace with a
# canvas_changes poller if the log format moves.
set -u
session="${1:-demo}"
agent="${2:-tutor}"
log="$HOME/.local/share/algopeeps/canvas/$session/events.jsonl"

tail -n 0 -F "$log" \
  | jq --unbuffered -r --arg text "${TUTOR_WATCH_TEXT:-0}" '
      if .type=="comment" and (.detail.author=="human") then
        "thread \(.detail.threadId): \((.threads[0].messages | last).text // "")"
      elif $text=="1" and .actor=="human" and .type=="human_edit" then
        [ .elements[]?
          | select(.type=="text" and ((.customData.owner // "human")=="human") and (.isDeleted!=true))
          | .text ] | select(length>0) | "text: \(join(" | "))"
      else empty end' \
  | while IFS= read -r line; do
      echo "human: $line"
      case "$line" in
        thread*)
          msg="The learner posted in a comment thread on session $session: \"$line\". Call canvas_threads (status open) and answer the newest human message in that thread with canvas_reply (under 40 words, never the final solution, use the near elements for context). Then canvas_camera fitIds on the thread's targetIds." ;;
        *)
          msg="The learner wrote on the board in session $session: \"$line\". Call canvas_changes; if that text is a question or a note to you, prefer opening a thread on it with canvas_comment {targetIds:[thatId], text} rather than drawing; if it is not addressed to you, do nothing and say so in one line." ;;
      esac
      timeout 15 herdr agent prompt "$agent" "$msg" >/dev/null 2>&1
      sleep 8
    done
