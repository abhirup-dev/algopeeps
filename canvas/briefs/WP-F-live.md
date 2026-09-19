# WP-F — live integration: server + reference host + app, end to end in a real browser

Read `canvas/CONTRACT.md` (v1.1) and all of `canvas/NOTES.md` first. `shared/`, `app/`, `server/` are done and unit-tested in isolation; nothing has yet been exercised together in a browser. Another worker (WP-E) owns `canvas/test/smoke.ts` — do not touch `canvas/test/`. You **may** fix bugs in `app/` and `server/` that this integration exposes; keep each fix minimal and log it.

## Steps

1. Start everything: `bun run --cwd canvas/app build` (fresh `dist/canvas.html`), then `canvas/scripts/dev-all.sh` in the background (server :3100 + reference host :8080/:8081). Confirm `curl -s http://127.0.0.1:8080/` is 200 and the MCP `initialize` on :3100 succeeds.
2. Drive the host with Playwright (`/tmp/ext-apps-audit` already has it installed; or `npx playwright` from `app/`): open `http://127.0.0.1:8080/`, pick the `canvas` server and the `canvas_open` tool, set `session` to `live-<timestamp>`, call it. Assert the app iframe mounts (Excalidraw canvas element present inside the sandboxed frame; use `frameLocator` twice for the double iframe) with no console errors from the app. Screenshot to `canvas/.artifacts/live-open.png` (gitignored dir; add it to `canvas/.gitignore`).
3. With a second MCP client (tsx script, `@modelcontextprotocol/client`), call `canvas_asset array` and `canvas_camera fitAll` on that session. Assert within 3 s the iframe shows the cells (the app's 700 ms pull), and the `canvas_save` round-trip converted the agent elements (server `canvas_read` now returns elements with `seed`). Screenshot `live-asset.png`.
4. Simulate a human edit in the browser: drag one of the agent cells with the mouse. Assert the app's `canvas_save` was rejected for that id (server `canvas_read` shows the original x) and the cell snaps back after the re-pull. Then draw a rectangle with the toolbar (press `r`, drag) and assert `canvas_changes` on the MCP client reports one added human element. Screenshot `live-human.png`.
5. `canvas_annotate circle` on that human rectangle → assert a purple ellipse appears in the frame. `canvas_screenshot` from the MCP client → assert an `image` content block comes back (this path has never run). Save the PNG as `live-screenshot.png`.
6. Check the host's "Model Context" debug panel shows the human-edit diff text after step 4 (`updateModelContext` path).

## Reporting

For every failure: root-cause in the app or server, fix minimally, note `file: what/why` under `## WP-F live` in `NOTES.md`. Also record: time from tool call to pixels on screen, bundle load time, and any console warnings. Leave the server + host running when you finish (the human will use them next). Reply in the terminal with `WP-F DONE` on its own line.
