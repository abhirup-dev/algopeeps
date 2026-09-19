# WP-B — build the canvas MCP server (`canvas/server/`)

Read `canvas/CONTRACT.md` first; it is the interface. Do not modify it — log questions under `## Contract questions` in `canvas/NOTES.md` and take the conservative reading. Read `canvas/NOTES.md` §WP-A and §WP-C: `shared/` and `app/` already exist; you consume them.

**Scope (only these paths):** `canvas/server/**`, plus adding `server` to root scripts if missing. Do not edit `shared/` or `app/`; if you need a change there, write it as a request in `NOTES.md` and work around it locally.

## Stack (use the SDKs, hand-roll only the scene store)

- `@modelcontextprotocol/server` 2.x `McpServer` + `@modelcontextprotocol/express` (or the SDK's express helper) with **stateless Streamable HTTP** at `http://127.0.0.1:3100/mcp`, CORS open for `127.0.0.1`/`localhost` origins only (the basic-host on :8080 must be able to connect).
- `@modelcontextprotocol/ext-apps/server` 2.0.0: `registerAppTool`, `registerAppResource`, `RESOURCE_MIME_TYPE`. Reference: `/tmp/ext-apps-audit/examples/basic-server-react/server.ts` and `main.ts`; `/tmp/excalidraw-mcp-audit/src/main.ts` for the stateless transport-per-request pattern.
- `zod` 4 for input schemas. `@algopeeps/canvas-shared` (workspace) for types, `normalize`, `describe`, `toCompact`, `assets.generate`, `stampAgent`, `newId`.
- Serve the app: `registerAppResource` for `ui://algopeeps/canvas.html` reading `../app/dist/canvas.html` at request time (so a rebuilt app is picked up without restart). CSP: `resourceDomains: ["https://unpkg.com"]` (fonts are loaded from unpkg per WP-C), `connectDomains: []`.

## Scene store (`server/src/store.ts`)

Per session: `elements: Map<id, Element>`, `revOf: Map<id, number>`, `deleted: Map<id, rev>`, `rev`, `pendingCamera?: Camera & {rev}`, `screenshotRequest?: {requestId, resolve}`, `cursor` (last read rev for `canvas_changes` default). Persist to `~/.local/share/algopeeps/canvas/<session>/events.jsonl` per CONTRACT §8, keyframe every 50 events and on snapshot; on startup rebuild each session from its last keyframe + following events (lazy, on first touch).

Ownership enforcement exactly per CONTRACT §2. `canvas_save` diff rule: for each incoming element with an existing id, accept if human-owned and (`version`,`versionNonce`) differ or fields differ; reject if agent-owned and differs from the stored copy **unless** the stored copy is still in agent format (no `seed`) — in that case accept it as the converted element, keeping `customData` (owner/kind/ref/asset) and `locked`/`strokeColor` from the stored copy. Human ids absent from the payload → deleted. Agent ids absent → rejected (not deleted). Return `{rev, rejected}`.

## Tools

Implement every tool in CONTRACT §3 with the exact names, inputs, and results. `canvas_annotate` geometry per §3 using `geometry.bboxOf`. `canvas_asset` delegates to `shared.assets.generate` then stamps owner. `canvas_screenshot` awaits `canvas_screenshot_result` with a 10 s timeout. `canvas_guide` returns `server/src/guide.md` — write it by adapting the `read_me` text in `/tmp/excalidraw-mcp-audit/src/server.ts` (lines 22–395) to our agent format (§4), our colour rule, `canvas_camera` instead of `cameraUpdate`, and two short worked examples (an array with two pointers; a circle+counterexample annotation).

## Tests (`server/test/*.test.ts`, `node --test` via tsx)

Use `@modelcontextprotocol/client` with `StreamableHTTPClientTransport` against an in-process server on an ephemeral port:
1. `canvas_open` → `canvas_asset array` → `canvas_read` shows owner `agent`, colour stamped, locked.
2. `canvas_save` with a moved human box + an attempted move of an agent id → `rejected` contains the agent id, human move accepted, `canvas_changes` reports it.
3. `canvas_pull since:0` returns everything; after a save, `since:rev` returns only the delta.
4. `canvas_camera fitAll` → next `canvas_pull` carries `camera`, the one after does not.
5. events.jsonl has ≥ 5 lines after the above; restart the store from disk and get the same `canvas_read`.

## Done means

`bun run --cwd canvas typecheck` and `bun run --cwd canvas/server test` pass; `bun run --cwd canvas/server dev` serves `/mcp` on :3100 and the resource read returns the app HTML. Write a 10-line summary + contract questions under `## WP-B server` in `canvas/NOTES.md`. Do not commit. Reply in the terminal with `WP-B DONE` on its own line.
