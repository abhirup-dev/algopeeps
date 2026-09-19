# WP-L — comment threads, server side (CONTRACT §11)

Read `canvas/CONTRACT.md` §2, §3, §8, §11 and `canvas/NOTES.md` (§WP-B, §WP-J). WP-J (unlock) landed in `server/` just before you; build on its code. Workspace is Bun: `bun run --cwd canvas check`.

**Scope:** `canvas/shared/src/types.ts` (add `Thread`, `ThreadMessage`), `canvas/server/src/**`, `canvas/server/test/**`, `canvas/server/src/guide.md` (one paragraph on threads), `canvas/test/smoke.ts` (add step 9). Do not touch `app/`.

## Build

1. `store.ts`: per-session `threads: Map<id, Thread>`; `revOf` extended so `canvas_pull`/`canvas_threads` can answer `since`. Ids `t_` + 6 chars. Persist in events.jsonl like elements (`comment` events carry the whole thread; keyframes embed `threads`); replay restores them.
2. Tools exactly as the §11 table: `canvas_threads`, `canvas_comment`, `canvas_reply`, `canvas_resolve` (model), `canvas_thread_post`, `canvas_thread_set` (app-only, `_meta.ui.visibility:["app"]`). Anchor element = agent-format `{type:"ellipse", x, y, width:28, height:28, backgroundColor:"#fff3bf", fillStyle:"solid", customData:{kind:"comment", threadId}}` run through the normal stamping for whichever author creates it (human anchors get no owner, black stroke; agent anchors purple). `near` = compact elements within 160 px of anchor centre, max 8, excluding anchors.
3. `canvas_pull` returns `threads` and `threadDeletes`; `canvas_save` omitting an anchor id → that thread becomes `resolved` (not deleted). Agent deleting an anchor → same.
4. `canvas_changes` gains `threads: {opened, replied}` for human-authored activity since the cursor.
5. Tests: open thread by human → agent sees it in `canvas_threads` with `near`; reply → pull returns thread with 2 messages; anchor omitted from save → resolved; replay from events.jsonl restores threads. Smoke step 9 does the human-open → agent-reply → pull round trip.

## Done means

`bun run --cwd canvas check` green, smoke 9/9 against a restarted server on :3100 (restart it yourself; the host on :8080 stays up). Summary under `## WP-L threads server` in NOTES.md with the exact JSON one `canvas_pull` returns for a thread, so the app worker can copy it. If in doubt message the orchestrator with SendMessage to=`mcp-shared-canvas-plan`. Print `WP-L DONE`.
