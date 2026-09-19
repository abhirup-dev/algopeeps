# WP-K — prebuilt DS assets in the Excalidraw Library panel (human side)

Read `canvas/CONTRACT.md` §6 and `canvas/NOTES.md` (§WP-A, §WP-C, §WP-F). The six asset generators in `shared/src/assets/` are only reachable through the agent tool `canvas_asset`. The human should be able to drop the same templates from the editor's **Library** panel (the button already in the top-right of the app).

**Scope:** `canvas/app/src/**` (a new `library.ts` + wiring in `CanvasApp.tsx`), `canvas/shared/src/assets/**` only if a generator needs a parameterless default. WP-J is editing `server/` and `shared/src/owner.ts` right now; do not touch `server/` and do not touch `owner.ts`. Workspace is Bun now: `bun run --cwd canvas check`.

## Build

1. `app/src/library.ts`: build `LibraryItem[]` for Excalidraw's `excalidrawAPI.updateLibrary({ libraryItems, openLibraryMenu: false })`. One item per asset kind with sensible defaults: `array` (values 1..5, showIndex), `linked_list` (3 nodes), `binary_tree` (7 nodes), `stack_frames` (3 frames), `state_table` (3×3), `hash_map` (4 buckets, 3 entries). Generate with `owner:"human"` at `(0,0)` and convert to real elements with `convertToExcalidrawElements(...,{regenerateIds:true})` **before** putting them in the library; the library needs full elements, and Excalidraw regenerates ids on insert anyway. Each item gets `name`, `status:"published"`, `id`.
2. Call `updateLibrary` once after the API is ready (in the existing effect that receives `excalidrawAPI`). Wrap in try/catch and log a console warning if the API shape differs.
3. Inserted library elements are human-drawn by definition (black stroke). Make sure the existing onChange → `canvas_save` path persists them (it should: they are ordinary new elements).
4. Do not put items in the human's undo stack when populating the library (updateLibrary does not, verify).
5. Dev harness: add a second Playwright test that opens the Library panel and asserts the six item names are present (`dev.html` path). Keep `bun run --cwd canvas check` green and the bundle under 5 MB.

## Done means

Check green, both app tests pass, a 6-line summary under `## WP-K library` in NOTES.md including exactly how the items look in the panel (name list) and one caveat if the panel needs a click to refresh. Rebuild `app/dist/canvas.html` so the running server serves it (the server reads the file per request; no restart needed). If in doubt, message the orchestrator with SendMessage to=`mcp-shared-canvas-plan`. Print `WP-K DONE`.
