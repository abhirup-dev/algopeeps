# WP-C — build the canvas MCP App (`canvas/app/`)

You are one of several workers. Read `canvas/CONTRACT.md` first; it is the interface. Do not modify it — log questions under `## Contract questions` in `canvas/NOTES.md` and take the conservative reading.

**Scope (only these paths):** `canvas/app/**`. Another worker is scaffolding the pnpm workspace root and `shared/` right now; a third will build `server/`. Until `@algopeeps/canvas-shared` exists, define the few types you need locally in `app/src/contract.ts` mirroring CONTRACT §1–§7, and leave a `// TODO(integration): import from @algopeeps/canvas-shared` comment. If `canvas/package.json` does not exist yet when you start, create `app/package.json` standalone-installable (`bun install` inside `app/`) and it will be folded into the workspace later.

## What to build

A single-file MCP App (`app/dist/canvas.html`) rendering `@excalidraw/excalidraw` **0.18.1** with React 19, using `@modelcontextprotocol/ext-apps` **2.0.0** (`App` class or the `/react` hooks `useApp`, `useHostStyles`). Build with Vite + `vite-plugin-singlefile`; everything inlined (fonts too: set `window.EXCALIDRAW_ASSET_PATH` appropriately or inline the Excalidraw assets). Reference implementations to read first, copy patterns not code:

- `/tmp/ext-apps-audit/examples/basic-server-react/` — minimal ext-apps React app + vite config (2.0 API)
- `/tmp/ext-apps-audit/docs/` and `specification/draft/apps.mdx` — `ui/*` messages, `containerDimensions`, display modes
- `/tmp/excalidraw-mcp-audit/src/mcp-app.tsx` and `src/edit-context.ts` — Excalidraw inside an MCP App (old 0.4 API, so adapt), the `cameraUpdate` animation, the human-edit text diff
- `/tmp/mcp_excalidraw-audit/frontend/src/App.tsx` and `utils/scene.ts` — applying server elements with `updateScene({captureUpdate: CaptureUpdateAction.NEVER})`, `convertToExcalidrawElements`, a suppress counter so programmatic updates don't trigger the onChange sync

## Behaviour (per CONTRACT)

1. On `ontoolinput` read `session` from the `canvas_open` arguments. Store `since = 0`.
2. Poll loop every 700 ms: `app.callServerTool({name:"canvas_pull", arguments:{session, since}})`. Apply `upserts` (convert agent-format elements with `convertToExcalidrawElements(...,{regenerateIds:false})`, preserving `id` and `customData`), apply `deletes`, set `since = rev`. Apply `camera` once per camera rev (`scrollToContent` for `fitIds`/`fitAll`; scroll+zoom for a rect). On `screenshot` request, `exportToBlob` (png, with background) → base64 → `canvas_screenshot_result`.
3. After applying converted agent elements, call `canvas_save` with the full non-deleted scene so the server stores real elements.
4. Human edits: `onChange` → debounce 1500 ms → `canvas_save` with full non-deleted scene; if `rejected` is non-empty, re-pull from `since - 1`… simplest: set `since = 0` and re-apply. Also send `app.updateModelContext({content:[{type:"text", text: diff}]})` with the compact "Added/Removed/Moved" diff (edit-context pattern). Wrap in try/catch; hosts may not support it.
5. Fullscreen toggle button via `requestDisplayMode`; respect `hostContext.containerDimensions` (fixed height → fill 100vh; inline default 4:3).
6. Never touch `locked` or colours of agent elements on the human side; the server rejects such saves anyway.

## Dev harness

`app/dev.html` + `bun run dev` that mounts the same component with a fake `callServerTool` (in-memory scene) so the editor can be worked on without the server. Include one Playwright smoke (`app/test/app.spec.ts`) that loads `dev.html`, injects a fake `canvas_pull` upsert, and asserts the element appears (`getSceneElements()` via `window.__excalidrawAPI` exposed only in dev).

## Done means

`bun run --cwd canvas/app build` produces `dist/canvas.html` under 5 MB; `bun run --cwd canvas/app test` passes; a 10-line summary plus any contract questions under `## WP-C app` in `canvas/NOTES.md`. Do not commit. Reply in the terminal with `WP-C DONE` on its own line when finished.
