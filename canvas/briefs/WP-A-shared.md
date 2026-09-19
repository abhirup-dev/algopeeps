# WP-A — scaffold the `canvas/` workspace and build `shared/`

You are one of several workers building the algopeeps shared canvas. Read `canvas/CONTRACT.md` first; it is the interface everyone codes against. Do not modify it — if it is wrong or ambiguous, add a bullet under `## Contract questions` in `canvas/NOTES.md` and pick the most conservative reading.

**Scope (only these paths):** `canvas/package.json`, `canvas/pnpm-workspace.yaml`, `canvas/tsconfig.base.json`, `canvas/.gitignore`, `canvas/shared/**`. Do not create `server/` or `app/`; other workers own them and start in parallel.

## 1. Scaffold

- pnpm workspace at `canvas/` with packages `shared`, `server`, `app` listed (only `shared` exists yet). Node 24 (already active via mise), TypeScript 5.9, ESM everywhere (`"type": "module"`), `tsx` for running TS directly, `node:test` for tests. No build step for `shared` beyond `tsc` type-check; consumers import TS source through the workspace (`"exports": {".": "./src/index.ts"}`).
- Root scripts: `typecheck` (runs `tsc -b` or per-package `tsc --noEmit`), `test` (recurses).
- `.gitignore`: `node_modules`, `dist`, `*.tsbuildinfo`.

## 2. `shared/` package `@algopeeps/canvas-shared`

Files under `shared/src/`:

- `types.ts` — `Element` (loose Excalidraw element: `id, type, x, y, width, height, isDeleted?, version?, versionNonce?, groupIds?, boundElements?, startBinding?, endBinding?, containerId?, customData?` plus `[k: string]: unknown`), `OwnerData` (§2 of the contract), `AgentElement` (§4), `CompactElement` (§5), `Camera` (§7), `CanvasEvent` (§8), `SessionId` guard `isSessionId()`.
- `normalize.ts`, `geometry.ts`, `describe.ts` — **vendor** from `/tmp/mcp_excalidraw-audit/src/core/{normalize.ts,geometry.ts,describe.ts}` (MIT; keep a header comment `// Vendored from yctimlin/mcp_excalidraw (MIT), adapted.`). Drop the file-path sanitiser and any Express/logger imports. Extend `describe` so each element line ends with ` [agent]` or ` [human]` from `customData.owner`, and add `kind`/`ref` when present.
- `owner.ts` — `ownerOf(el)`, `stampAgent(el, kind, ref?)` (sets owner, `strokeColor:"#9c36b5"`, `locked:true`), `AGENT_COLOR`.
- `compact.ts` — `toCompact(el, rev): CompactElement` exactly per §5 (rounded ints, `from/to` from bindings, `text` from own text or bound label lookup — accept a `byId` map argument).
- `ids.ts` — `newId()` 12-char base62.
- `assets/index.ts` + one file per kind (`array.ts`, `linkedList.ts`, `binaryTree.ts`, `stackFrames.ts`, `stateTable.ts`, `hashMap.ts`) implementing §6 exactly. Signature: `generate(kind, params & {x, y, owner?}): {elements: AgentElement[], groupId: string}`. Every element gets `groupIds:[groupId]` and `customData.asset={kind,name}`. Arrows use `startElementId`/`endElementId`. Validate params and throw `Error` with a one-line message on bad input.
- `index.ts` re-exports.

## 3. Tests (`shared/test/*.test.ts`, `node --test` via tsx)

- each asset kind: element count, group membership, bbox starts at `(x,y)`, no NaN
- `toCompact` on a shape with bound label and on a bound arrow
- `describe` tags owners
- `normalize` converts `text`→label and `startElementId`→`start.id`

## 4. Done means

`bun install`, `bun run typecheck`, `bun run test` all pass from `canvas/`. Write a 10-line summary of what exists and any contract questions to `canvas/NOTES.md` under `## WP-A shared`. Do not commit. Reply in the terminal with `WP-A DONE` on its own line when finished.
