# WP-O — comments in the sidebar, id-anchored (CONTRACT §12, app + server)

Builds on your WP-N shell. Goal: the human selects elements, presses `Comment on selection`, types, and the thread appears in the sidebar with a numbered badge on the target; the agent's `canvas_reply` shows up in the same row. No anchor element is ever created. Read `canvas/CONTRACT.md` §11–§12, `canvas/NOTES.md` §WP-L, §WP-M, §WP-N.

**Scope (files you may change):** `canvas/server/src/{store,server}.ts`, `canvas/shared/src/types.ts`, `canvas/server/test/**`, `canvas/server/src/guide.md` (threads paragraph only), `canvas/app/src/sidebar/**`, `canvas/app/src/CanvasApp.tsx` (wiring lines only), `canvas/app/src/dev.tsx` (fake only), `canvas/app/test/**` (add; edit existing specs only as step 6 says), `canvas/test/smoke.ts` step 8. Nothing else.

**Scope discipline:** implement what is listed, and only that. Do not delete, rename, move or "clean up" files, functions, tests, config, scripts or docs that are not named above, even if they look dead. Do not refactor existing code you pass through; if something adjacent is wrong, write it under `## WP-O findings` in NOTES.md instead of fixing it. Do not change lint/format config, package.json, or the contract. If completing a step seems to require touching something outside this list, stop and ask the orchestrator first.

## Server (do first, restart :3100 when green)

1. `Thread` gains `targetIds: string[]` and optional `anchor: {x,y}`; keep `anchorId = targetIds[0]`. `canvas_thread_post` and `canvas_comment` take `targetIds` (≥ 1, must exist and not be deleted; else `isError` "unknown target ids"). Remove `x`/`y` point-anchoring and the anchor-ellipse creation. On open, append the thread id to `customData.threads` on each target element (bump their rev; event `comment`). `canvas_threads` returns `targetIds`, `detached` (all targets deleted), `near` computed from the union bbox of live targets.
2. `canvas_save` deleting all targets of a thread marks it `detached` (not resolved); the app supplies the last bbox via `canvas_thread_set {threadId, anchor:{x,y}}` (extend the schema) so detached threads still get a badge position.
3. Tests: open with two targets → `customData.threads` on both; reply round trip; delete targets → detached; unknown id → error. Smoke step 8 updated to the new input shape. Legacy `t_` threads with only `anchorId` load fine (map to `targetIds:[anchorId]`).

## App

4. Replace the WP-N placeholder: build `SidebarItem[]` from the pull `threads` (merge by id as WP-M did in `ThreadsLayer`), `targets` from the current scene for each `targetIds` (union bbox), `detached` when none found → use `thread.anchor`. `onComment` → open a compose row at the top of the list (textarea + Send) → `canvas_thread_post {targetIds: selectedIds, text}`. Reply box per expanded row → `canvas_thread_post {threadId, text}`. Resolve button → `canvas_thread_set {resolved:true}`. Row collapse ↔ `canvas_thread_set {collapsed}` (shared). `onFocus(id)` → `excalidrawAPI.scrollToContent(targetElements, {fitToContent:true, animate:true})` and select them (`updateScene({appState:{selectedElementIds}})`), and open the sidebar if closed.
5. Unread: purple dot on rows whose last line is agent-authored and newer than the local `readAt` (memory only); open the sidebar automatically **only** when an agent reply arrives and the sidebar is closed, once per thread.
6. **Unmount, do not delete.** Remove the `<ThreadsLayer>` JSX and the 💬 Comment top-right button from `CanvasApp.tsx` so the badges from WP-N are the only on-canvas marker. Leave `threads/ThreadsLayer.tsx`, `threads.css` and `threads.spec.ts` in place (mark the spec `test.skip` with a one-line reason if it can no longer pass); a separate cleanup package removes them. Add `comments.spec.ts` against the dev fake (`?fake=1` extended with `targetIds`): select fake rect → Comment on selection → Send → row + badge → fake agent reply arrives → unread dot → click row → camera moved (assert `scrollX` changed).
7. Rebuild dist; `bun run --cwd canvas check` green; smoke 9/9 against the restarted server.

## Done means

Check green, smoke green, dist rebuilt, `## WP-O comments sidebar` in NOTES.md with the final pull JSON for one thread and any contract deviations you had to make (list them explicitly). Message the orchestrator with SendMessage to=`mcp-shared-canvas-plan`: `WP-O DONE` plus that deviation list. Ask on the same channel before deviating from §12.
