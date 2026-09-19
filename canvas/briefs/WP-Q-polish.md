# WP-Q — comment tool, asset palette, and sidebar polish (app only)

Dogfood verdict on WP-N/WP-O from the human: "the UI is absolutely horrendous", the badge is an empty white circle, thread titles are raw element ids, timestamps are ISO strings, and the `Comment on selection` button is buried at the bottom of the sidebar. Also: the human wants to **drag assets (including a comment) onto the canvas** from a palette. Fix all of it inside `app/`. No server or contract changes.

Read first: `canvas/briefs/README.md`, `canvas/CONTRACT.md` §6 and §12, `canvas/NOTES.md` §WP-M, §WP-N, §WP-O (Excalidraw API notes), `canvas/docs/collab-canvas-invariants.md` §4 (what Excalidraw can and cannot do: no custom element types, no toolbar extension; `renderTopRightUI`, `<Footer>`, `<Sidebar>`, `setActiveTool({type:"custom", customType})`, `onPointerDown`, `onPointerUpdate`, Library, `updateLibrary`, `convertToExcalidrawElements` are open). Assets already exist as generators in `shared/src/assets/` (`generate(kind, params & {x, y, owner})`).

**Scope (files you may change):** `canvas/app/src/sidebar/**`, `canvas/app/src/palette/**` (new), `canvas/app/src/CanvasApp.tsx` (wiring only), `canvas/app/src/canvas-app.css`, `canvas/app/src/dev.tsx` (fake only), `canvas/app/test/**`. Nothing else.

**Scope discipline:** implement what is listed and only that. Delete, rename or refactor nothing outside the files above; `threads/` stays untouched. Do not change lint/format config, `package.json`, `CONTRACT.md`, `server/`, `shared/`. Findings about adjacent code go under `## WP-Q findings` in NOTES.md. If a step seems to need something outside the list, write the question to `canvas/briefs/WP-Q-inbox.md` and stop.

## 1. Comment affordances (replace the buried button)

a. **Selection bubble.** When ≥ 1 element is selected, render a small floating pill in the overlay 8 px above the selection's bounding box, centred: `💬 Comment` (and `🧵 N` if the selection already has threads → clicking opens the sidebar on that thread). Click → compose row focused in the sidebar (open the sidebar if closed). Hide the pill while dragging/resizing (`appState.isResizing || isRotating || draggingElement`), reposition with the same rAF path as badges.
b. **Comment tool.** In `renderTopRightUI` keep only two buttons, `💬` (toggle comment tool, shows as active) and `Threads`. Comment tool = `excalidrawAPI.setActiveTool({type:"custom", customType:"comment"})`; while active the cursor is crosshair and the next `onPointerDown` on an element (hit-test via `getSceneElements` + bbox, top-most first) starts a thread on that element; a click on empty canvas shows a 2 s toast "Click an element to comment" (no point-anchored threads, CONTRACT §12). Keyboard `C` toggles the tool when focus is on the canvas. Escape returns to selection tool.
c. Remove the footer button; the footer becomes the filter row.

## 2. Asset palette (drag-in)

`palette/AssetPalette.tsx`: a compact vertical **island** docked at the left edge (our DOM, same visual language as Excalidraw's islands: `--island-bg-color`, radius 8, shadow), collapsible to a single `▸` tab, remembered in `localStorage["canvas.palette.open"]`. Items: Array, Linked list, Binary tree, Stack frames, State table, Hash map, Comment. Each item is a 44×44 icon tile (inline SVG glyphs, no icon dependency) with a tooltip.

- **Drag** (HTML5 `draggable`, `dataTransfer.setData("application/x-canvas-asset", kind)`): drop anywhere on the canvas → convert `clientX/Y` → scene coords → for asset kinds call the shared `generate(kind, defaults, {x, y, owner:"human"})` (defaults: array `[1,2,3,4,5]` with indices; linked list 3 nodes; tree 7 nodes; stack 3 frames; table 3×3; hash map 4 buckets) → `convertToExcalidrawElements(...,{regenerateIds:true})` → `updateScene` **with capture** (human action, must be undoable) and select the new group. The existing onChange→`canvas_save` path persists it. For `Comment`: drop onto an element → same as the comment tool on that element; drop on empty canvas → toast.
- **Click** on a tile = stamp at the viewport centre (assets) or activate the comment tool (comment).
- Also register the six assets as Library items via `updateLibrary` once (`palette/library.ts`; see WP-K brief for defaults) so Excalidraw's own Library panel drag-in works too. Wrap in try/catch.

## 3. Sidebar polish

- Row title = the target's bound text or own text, truncated to 40 chars; else `type` + ` · ` + 4-char id. Prefix with the badge number in the same purple circle as the canvas badge.
- Timestamps relative (`just now`, `2 min ago`, `14:12` after an hour), full ISO in `title`.
- Authors: `You` / `Tutor` with a 6 px colour dot (black / `#9c36b5`), not `HUMAN`/`AGENT` caps.
- Compose and reply: single auto-growing textarea (1–5 rows), `Enter` sends, `Shift+Enter` newline, primary purple `Reply` button, `Resolve` as a small ghost button with `✓` in the row header, `Reopen` for resolved rows.
- Fix the tab row clipping at the top (currently cut off under the header): tabs must be fully visible inside `Sidebar.Header`/`Sidebar.Tabs`.
- Empty state: "No threads yet. Select something and press C, or drag 💬 from the palette."
- Canvas badge: 22 px filled `#9c36b5` circle, white bold number, 2 px white ring, subtle shadow; unread = pulsing ring; resolved = grey. Never render an empty circle.
- Dark mode: everything via Excalidraw CSS variables; check `?theme=dark` if the dev page supports it, otherwise note.

## 4. Verify like a user, not like a test

You have vision: after each of the three sections, run the dev page (`?fake=1&sidebar=1` and a new `?palette=1`) in Playwright, take a 1400×900 screenshot to `canvas/.artifacts/wp-q-<n>.png`, open it and look. Fix what looks wrong before moving on. Add one Playwright spec `polish.spec.ts` covering: selection bubble appears on select; `C` activates the comment tool; drag an Array tile onto the canvas creates ≥ 5 new elements; sidebar shows `You`/`Tutor` and a relative time; badge has visible number text.

## Done means

`bun run --cwd canvas check` green, all app specs pass, dist rebuilt (< 5.3 MB), screenshots in `.artifacts/`, `## WP-Q polish` in NOTES.md with a 10-line sketch of the final layout and the list of anything you could not do and why. Write `WP-Q DONE` to `canvas/briefs/WP-Q-inbox.md`. Do not commit or push. Do not restart the server (no server changes); the running server serves the rebuilt dist on the next reload.
