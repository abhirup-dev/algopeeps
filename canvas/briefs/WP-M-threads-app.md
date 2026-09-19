# WP-M — comment threads, app side (CONTRACT §11)

Read `canvas/CONTRACT.md` §11 and `canvas/NOTES.md` (§WP-C, §WP-F). The server half (WP-L) is being built in parallel by another worker; code against §11 and a local fake until `## WP-L threads server` appears in NOTES.md, then switch to the real server. Workspace is Bun: `bun run --cwd canvas check`.

**Scope:** `canvas/app/src/**` only (new `threads/` folder + wiring in `CanvasApp.tsx`; keep `CanvasApp.tsx` edits small, new logic in new files). Do not touch `server/` or `shared/`.

## Build (React 19, plain CSS, no new dependencies)

1. **Overlay layer.** A `position:absolute; inset:0; pointer-events:none` div over the Excalidraw canvas. For each thread, find its anchor element in the current scene, convert scene → viewport with `appState.scrollX/scrollY/zoom.value` (`viewportX = (x + scrollX) * zoom`), and place a `pointer-events:auto` card just right of the anchor. Re-run placement on Excalidraw `onChange` and `onScrollChange`; coalesce with `requestAnimationFrame`, no polling.
2. **Collapsed** = small pill: `💬 N` (N = message count; purple ring if the last message is from the agent and unread). **Expanded** = card 280 px wide: messages (author tag + text, agent in `#9c36b5`), a textarea, Send, Resolve, collapse chevron. Click pill ↔ card. Collapsed state goes to `canvas_thread_set` so both views agree; keep a local `readCount` in memory only.
3. **Compose.** `renderTopRightUI` gets a `💬 Comment` button. Click → cursor crosshair; the next click on the canvas (overlay takes `pointer-events:auto` while armed; convert viewport → scene) opens an empty card there; first Send calls `canvas_thread_post {x, y, text}`. Escape cancels. If an element is selected when the button is clicked, anchor to it (`anchorId` = selected id, anchor at its top-right).
4. **Sync.** Threads arrive in the existing `canvas_pull` loop as `threads`/`threadDeletes`; merge by id into React state. Resolved threads render as a grey pill; hide 10 s after resolution.
5. **Fake for development.** `dev.tsx`: an in-memory implementation of `canvas_thread_post`/`canvas_thread_set`/pull `threads` behind the same call signature, seeded with one open thread, enabled by `?fake=1`, so you can build before WP-L lands.
6. Playwright test: dev page with fake → pill visible → click → card shows the seeded message → type reply → Send → two messages. Rebuild `app/dist/canvas.html` (< 5.2 MB).

## Done means

`bun run --cwd canvas check` green, both app tests pass, dist rebuilt, summary under `## WP-M threads app` in NOTES.md including a 6-line ASCII sketch of pill/card and any Excalidraw API you had to work around. Message the orchestrator with SendMessage to=`mcp-shared-canvas-plan` when the dist is rebuilt or when in doubt. Print `WP-M DONE`.
