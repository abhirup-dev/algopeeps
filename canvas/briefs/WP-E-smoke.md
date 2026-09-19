# WP-E — end-to-end smoke test (`canvas/test/smoke.ts`)

Read `canvas/CONTRACT.md` and `canvas/NOTES.md` first. `shared/` and `app/` are done; `server/` is being built right now by another worker (WP-B) and may not exist or run yet. Do not touch `server/`, `shared/`, or `app/`.

**Scope:** `canvas/test/**`, root `package.json` script `smoke`, and one short section in `NOTES.md`.

## What to write

`canvas/test/smoke.ts` (run with `tsx`), a black-box test of the running server at `http://127.0.0.1:3100/mcp` using `@modelcontextprotocol/client` + `StreamableHTTPClientTransport` (see `/tmp/ext-apps-audit/examples/basic-host/src/implementation.ts` for the client shape; note ext-apps hosts advertise `extensions: {"io.modelcontextprotocol/ui": {...}}` in initialize, copy the `getUiCapability`/`EXTENSION_ID` usage from `/tmp/ext-apps-audit/src/server/index.ts`). Behaviour:

1. If `:3100/mcp` does not answer `initialize` within 3 s, print `server not running — start with bun run --cwd canvas/server dev` and exit 2.
2. `tools/list`: assert every model-visible tool from CONTRACT §3 exists and that app-only tools (`canvas_pull`, `canvas_save`, `canvas_screenshot_result`) carry `_meta.ui.visibility` containing `"app"`. Assert `canvas_open` has `_meta.ui.resourceUri === "ui://algopeeps/canvas.html"` and `resources/read` on it returns mimeType `text/html;profile=mcp-app` with non-empty HTML.
3. Session `smoke-<timestamp>`: `canvas_open` → `canvas_asset {kind:"array", name:"nums", values:[2,7,11,15], pointers:[{label:"i",index:0},{label:"j",index:1}], x:100, y:100}` → `canvas_read` → assert all returned elements have `owner:"agent"`, and `canvas_describe` text contains `[agent]`.
4. Simulate the app: `canvas_pull {since:0}` → take the full scene; add a human rectangle (full Excalidraw-shaped element with `seed`, `version:1`, `versionNonce`, no `customData.owner`), move one agent element by +50 x, and `canvas_save` the whole set → assert `rejected` contains the agent id and the human rectangle is present in a following `canvas_read {owner:"human"}`; `canvas_changes` reports it as added.
5. `canvas_camera {fitAll:true}` → `canvas_pull {since: <rev before>}` carries `camera`; the next pull with the new rev does not.
6. `canvas_annotate {kind:"circle", ref:<human rect id>}` → new agent ellipse with `ref` set. `canvas_annotate {kind:"counterexample", ref, text:"[3,3], target 6"}` → text element containing `✗`.
7. `canvas_snapshot {name:"end"}` → then assert `~/.local/share/algopeeps/canvas/<session>/events.jsonl` exists with ≥ 8 lines and a `keyframe` line.
8. Print a one-line PASS/FAIL per step and exit non-zero on any failure. Keep it under 250 lines, plain `assert`.

Also `canvas/test/README.md` (10 lines): how to run, what it needs running.

## Done means

`bun run --cwd canvas smoke` exits 2 with the clear message while the server is absent; once WP-B reports done (watch `canvas/NOTES.md` for `## WP-B server`, poll every few minutes, do not ask the other worker), start the server with `bun run --cwd canvas/server dev` in the background, run the smoke, and fix **the test** (not the server) for any mismatch that is the test's fault; for server-side contract violations, write them as a numbered list under `## WP-E smoke findings` in `NOTES.md` with the exact tool, input, expected vs actual. Reply in the terminal with `WP-E DONE` on its own line.
