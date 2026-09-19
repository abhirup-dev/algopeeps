# canvas — working notes

## Day 0 spike (2026-09-19)

Goal: prove pi → pi-mcp-adapter → MCP Apps server → ext-apps basic-host → app iframe with zero
code of ours, using the official `excalidraw/excalidraw-mcp` (v0.3.2) as the server.

Status: in progress.

## WP-A shared

- Workspace scaffolded: pnpm workspace (`shared`,`server`,`app`), TS 5.9 strict ESM, `tsx`+`node:test`, root `typecheck`/`test` recurse; only `shared` exists from this WP.
- `@algopeeps/canvas-shared`: `types` (Element/OwnerData/AgentElement/CompactElement/Camera/CanvasEvent/isSessionId), `ids.newId` (12-char base62), `owner` (ownerOf/stampAgent/AGENT_COLOR), `normalize` (vendored: prepareElement, text→label, startElementId→start.id, fontFamily map), `describe` (vendored + `[agent]`/`[human]` + kind/ref, reads both binding forms), `compact.toCompact` (byId resolves containerId labels), `geometry` (bboxOf/padBox/boxesIntersect/bboxOfAll), `assets` (all six §6 kinds, `generate(kind, params&{x,y,owner?})`).
- Validation: `pnpm install`/`pnpm typecheck` pass; `pnpm -C shared test` 16/16. Root `pnpm test` currently fails only on WP-C's in-flight `app` Playwright suite (needs its dev server) — not shared's.
- Deviations/choices: dropped upstream `prepareElementUpdate` and the path sanitiser (no such tools in the contract); upstream `geometry.ts` was canvas-HTTP-coupled so only pure bbox/intersect math kept; asset bbox defined as exact top-left = `(x,y)` — for `stack_frames` this means last frame on top at `(x+90,y)` with the "call stack" label left of it; `hash_map` places entry *j* in bucket `j % buckets` (index-mod, not a hash); array cells use bg `#a5d8ff`, headers/buckets `#e9ecef` (contract only fixed the header colour).
- Contract questions: none blocking; if WP-B wants `stack_frames` to grow upward *from* `(x,y)` as bottom-left instead, say so and I'll flip the y math.

## WP-C app

- `app/` standalone-installable (workspace-compatible, no workspace deps yet): React 19 + Excalidraw 0.18.1 + ext-apps 2.0 `useApp`, Vite + singlefile → `dist/canvas.html` at **4.66 MB** (< 5 MB). `pnpm typecheck` clean, `pnpm test` green.
- Types mirrored locally in `app/src/contract.ts` — TODO(integration): mechanical switch to `@algopeeps/canvas-shared` now that it exists.
- All behaviour in `app/src/CanvasApp.tsx`: `ontoolinput(canvas_open)` → session, `since=0`; 700 ms `canvas_pull` loop; upserts converted via `convertToExcalidrawElements({regenerateIds:false})` + suppress-counter so programmatic `updateScene({captureUpdate:NEVER})` never triggers the save loop; converted elements saved back with `canvas_save`; human edits debounced 1500 ms → `canvas_save` + `updateModelContext` compact Added/Removed/Moved diff; non-empty `rejected` → `since=0` re-pull; camera applied once per rev (fitIds/fitAll → `scrollToContent`, rect → scroll+zoom); screenshot `exportToBlob` → base64 → `canvas_screenshot_result`; fullscreen via `requestDisplayMode`; fixed `containerDimensions.height` fills, inline default 4:3.
- Mermaid import stubbed (`app/src/stub-mermaid-to-excalidraw.ts` + vite alias): its tree (mermaid/cytoscape/katex, ~6.5 MB raw) alone busts the budget; out of scope for v1.
- Fonts NOT inlined (13 MB total): `EXCALIDRAW_ASSET_PATH` pinned to unpkg `…/excalidraw@0.18.1/dist/prod/` — note 0.18 renamed the asset dir from `excalidraw-assets/` to `dist/prod/`.
- Dev harness: `dev.html` + fake in-memory server (`__devServer.injectAgent`); `window.__excalidrawAPI` exposed in dev only; one Playwright smoke asserting upsert → renders → bound label converts → seed-bearing elements saved back. Vite dev server pinned to `127.0.0.1:5173` (Vite 6 binds IPv6 `localhost` only, which starves Playwright's readiness probe).

Contract questions:
1. `canvas_pull.upserts` may mix full elements and agent-format skeletons; I discriminate on presence of `seed` (§4 agent format never sets it, real elements always do). If the server can ever store a seed-less full element, give me an explicit discriminator.
2. Camera-rect math assumes scene origin top-left, y down, viewport = scroll/zoom (standard Excalidraw). If `canvas_camera` means anything else, flag it.

## WP-B server

- `server/`: stateless Streamable HTTP per request (`main.ts`, ext-apps basic-server pattern) on 127.0.0.1:3100/mcp, one process-global `Store`; `@modelcontextprotocol/{server,client,node,express}` 2.0.0 + `ext-apps` 2.0.0 + zod 4. All 14 §3 tools registered; `canvas_open` carries `_meta.ui.resourceUri`; app-only trio carries `_meta.ui.visibility:["app"]`. CORS allowlist 127.0.0.1/localhost origins; foreign origins also blocked by `createMcpExpressApp({host:"localhost"})` host validation.
- App resource `ui://algopeeps/canvas.html` reads `../app/dist/canvas.html` per request (no restart on rebuild), CSP `resourceDomains:["https://unpkg.com"]`, `connectDomains:[]` — tool calls go through the host bridge, the app never fetches the server directly.
- Store (`src/store.ts`): per-session `elements/revOf/bornOf/deleted` maps + rev + pendingCamera + screenshot slot + one read cursor; events.jsonl at `~/.local/share/algopeeps/canvas/<session>/`, keyframe every 50 events and on snapshot, lazy rebuild from last keyframe. Ownership enforced exactly per §2 incl. the §64 seed-based conversion accept in `canvas_save` (answers WP-C Q1: server relies on `seed` presence exactly as proposed).
- `guide.md` served by `canvas_guide` — adapted from excalidraw-mcp's `read_me` to our agent format (`text`, `startElementId`), forced-purple rule, `canvas_camera`, plus the two worked examples (array+pointers, circle+counterexample).
- Validation: `pnpm -C canvas typecheck` clean (all 3 pkgs); `pnpm -C canvas/server test` 6/6 (ephemeral-port MCP client, scenarios 1–5 of the brief); workspace `pnpm test` green; :3100 smoke — initialize 200 + ACAO on local origin, 403 foreign origin, tools/list correct, resource read returns the 4.4 MB app HTML.

Contract questions:
1. §1 says rev is "server-wide"; implemented per-session monotonic (persistence/replay is per-session and every consumer — read/pull/changes/camera — is session-scoped). Cross-session monotonicity would need a global counter that disk replay can't reconstruct; flag if you want it.
2. §8 event lines carry extra replay data beyond the documented shape: mutating events embed `elements` (changed upserts) and `detail.deleted`; replay = last keyframe + those. `canvas_snapshot` writes one `keyframe` event with `detail.name` (no separate `snapshot` event line).
3. `canvas_pull` delivers a screenshot request once (slot cleared after inclusion); `pendingCamera` persists but is rev-gated (`camera.rev > since`), so the next pull after the delivering one omits it — matches brief test 4. Screenshot flow is implemented (10 s timeout → `no view connected`) but not covered by the suite (needs a live view).
4. `canvas_changes` added/changed split uses a creation-rev side table (`bornOf`); after a keyframe-only replay all elements count as born at that keyframe — advisory field, no consumer depends on the split yet.


## Contract answers

1. (WP-C q1, answered by WP-D) The `seed` discriminator is the rule: agent-format elements (§4) never set `seed`, and every full Excalidraw element the server stores does. The server will never store a seed-less full element, so no separate discriminator is needed — `upserts` mixing the two shapes is the intended wire format.

## WP-D-prep

- `app` folded into the workspace: `app/src/contract.ts` now re-exports from `@algopeeps/canvas-shared` (added as `workspace:*` dep); app-only shapes (`PullResult`/`SaveResult`/`HostContext`, tool-level `Camera` union) stay local.
- Integration fallout fixed: app tsconfig gained `"node"` types (shared/src/ids.ts imports node:crypto); `toSkeletons`/`convertSafe` widened to `AgentElement | SceneElement` (shared types are siblings, not subtypes). Behaviour unchanged.
- `scripts/host.sh` runs the ext-apps reference host from /tmp/ext-apps-audit with `SERVERS=["http://127.0.0.1:3100/mcp"]`, ports 8080/8081, prints the URL; `scripts/dev-all.sh` runs server (guarded: WP-B not landed yet → message) + host, tears both down on Ctrl-C. Both smoke-tested.
- `.mcp.json`: `canvas` → 127.0.0.1:3100/mcp (directTools, auto protocol, eager lifecycle); `excalidraw-official` kept but `disabled: true`. `.pi/settings.json` untouched.
- `AGENTS.md` tutor rules (<60 lines): five moves only (circle / counterexample / invariant / asset on request / camera), describe-or-changes before commenting, `canvas_guide` once per session, ≤2 annotations per turn, never touch human elements, never state the solution.
- `README.md` (≤40 lines) + this section. Validation: `pnpm -C canvas install`/`typecheck` green, `pnpm -C canvas/app test` 1/1. Not committed, per brief.




## Day 0 spike results

- **Tools visible** (via pi-mcp-adapter → excalidraw-official): `read_me`, `create_view`, plus resource `read_ui_excalidraw_mcp_app_html` (ui://excalidraw/mcp-app.html). 3 total.
- **Visibility observation**: app-only tools `save_checkpoint` / `read_checkpoint` are NOT exposed to the agent; checkpointing is implicit — every `create_view` response carries a `checkpointId`, and continuation is done via a `restoreCheckpoint` pseudo-element inside the next `create_view` call. (The create_view result text also references a `read_widget_context` tool for checking manual user edits, which is likewise not in the visible tool list.)
- **create_view succeeded**: yes — array of 5 cells labelled 2, 7, 11, 15, 1 with pointer arrows `i` under cell 0 and `j` under cell 1, framed by a leading `cameraUpdate` (800x600).
- **checkpointId**: `622b92a3992f429884`
- **Next-step instruction from tool result text**: before editing this diagram again, first read the widget context to check whether the user made manual edits, then either redraw from scratch or start the next `create_view` with `[{"type":"restoreCheckpoint","id":"622b92a3992f429884"}, ...new elements...]` to build on the current state (deletions via `{"type":"delete","ids":"..."}`).

## WP-E smoke findings

Server-side contract violations found by `test/smoke.ts` (6/8 steps pass; these two fail):

1. **[RETRACTED — test bug, contract v1.1]** **`canvas_snapshot` writes no `snapshot` event.** Tool `canvas_snapshot {session, name:"end"}` — expected: §8's `snapshot` event type is written by this tool (in addition to the keyframe), giving ≥8 events for the smoke flow. Actual: only one `keyframe` event with `detail {name:"end"}`; 7 events total for the flow. v1.1 clarified: one keyframe line, no separate `snapshot` event — the test was wrong, fixed in WP-E2.
2. **[FIXED — WP-E2, `server/src/store.ts`]** **`canvas_save` applies changes to agent-owned elements.** Tool `canvas_save {elements: <full pulled scene with one agent element moved +50 x, version bumped 1→2, new versionNonce, plus one new human element>}` — expected per §2 rule 3: agent-owned change dropped and its id reported in `rejected`, element unchanged on read-back. Actual: `rejected: []` and the moved agent element's `x` is +50 in the following `canvas_read` (change applied). Note: the *deletion* path is correct — omitting an agent id from the payload returns `rejected: ["<id>"]` and the element survives.

## WP-E smoke

- `test/smoke.ts` (165 lines, plain assert, one PASS/FAIL line per step): server-absent → exit 2 with start hint; any failed step → exit 1. Run: `pnpm -C canvas smoke`. Client mirrors ext-apps basic-host (`StreamableHTTPClientTransport`, advertises `io.modelcontextprotocol/ui` in initialize).
- Current result vs the live server: 6/8 PASS; steps 4 (save/ownership) and 7 (events) fail on findings 1–2 above — the test encodes the contract, fix the server, not the test.

## WP-E2

- Smoke step 7 fixed for contract v1.1 (§8: `canvas_snapshot` = one keyframe event with `detail.name`, no separate `snapshot` line) — finding 1 above was a test bug, retracted.
- Finding 2 fixed in `server/src/store.ts`: `canvas_save` conversion-accept now requires the stored copy to be a seed-less skeleton AND the incoming element to carry a `seed` AND (for non-arrow/non-text) x/y within 0.5 px of the stored copy; anything else on an agent-owned id is rejected with the stored copy kept. Server tests 7/7 (new: "moved unconverted agent element is rejected").
- `pnpm -C canvas smoke` after the fix:

```
1 PASS server reachable at http://127.0.0.1:3100/mcp (initialize ok, io.modelcontextprotocol/ui advertised)
2 PASS tools/list + resources/read match §3
3 PASS open + asset + read + describe
4 PASS app simulation: save with moved agent + new human element
5 PASS camera is pulled exactly once
6 PASS annotate: circle + counterexample
7 PASS snapshot + events.jsonl
8 PASS smoke complete
```

## WP-I lint

Decision: **ESLint 9 flat + typescript-eslint + Prettier**, not Biome (2.5.14).
Biome wins on speed and single-file config, but the brief's deciding criterion is
type-aware rules, and Biome's inference engine (per its own blog) resolves only
~75% of floating-promise cases and its type-aware linter is still incomplete.
Deciding rules: (1) `no-floating-promises` + `no-misused-promises` — the dropped
`await` is the #1 agent bug and Biome cannot guarantee it; (2) `switch-exhaustiveness-check`
over the Excalidraw `Element` unions imported from `@types` — needs the real type
checker; (3) `react-hooks/exhaustive-deps` in `app/` — eslint-plugin-react-hooks 7.x
is the reference implementation. Cost accepted: 3 devDeps + Prettier as a separate
formatter, both work identically under pnpm and Bun (plain binaries in scripts).
Everything is error-level, never warning: agents ignore warnings. Inline disables
require a `-- reason` suffix; never edit the config to make an error pass.

Implementation: `eslint.config.js` + `.prettierrc.json` + `.prettierignore` at
canvas root; `canvas/tsconfig.json` (include: test/) exists only so projectService
covers `test/smoke.ts`. Root scripts `lint`/`lint:fix`/`format`/`format:fix`,
`check` = typecheck + lint + format + test; every package mirrors them (`pnpm -r lint` /
`-r format` work; package `format` scripts `cd .. && prettier … <pkg>` because prettier
resolves `.prettierignore` from cwd, not up-tree). Vendored `shared/src/{normalize,describe,geometry}.ts`
are handled by file overrides, never edited; `canvas/test/` and app's Excalidraw/ext-apps
boundary (`Host`/`ExAPI`) are relaxed in config for the same reason — every deliberate
`any` in `app/src` carries an inline disable with a reason. Test files: `no-explicit-any`/
`no-unsafe-*` off (wire JSON), everything else on — the 18 floating `test()` registrations
were fixed with top-level `await` (node:test default concurrency is 1, so execution order
is unchanged). Hand fixes beyond the fixer: `useState<ExAPI|null>` → `useState<ExAPI>`,
`onClick={() => void toggleFullscreen()}`, `lastToolInput` added to the host-wiring effect
deps, `AssetKind | (string & {})` in `assets/index.ts`.

Enforcement: 5-line "Before you say done" block in `canvas/AGENTS.md`;
`.config/wt.toml` `[[pre-commit]] canvas-check` (**the human must approve once:
`wt config approvals add`**); `.githooks/pre-commit` (enable per clone with
`git config core.hooksPath .githooks`, documented in `canvas/README.md` — not run
by me); `.github/workflows/canvas-check.yml` on push/PR touching `canvas/**`
(not pushed). `pnpm -C canvas check` green (shared 16, server 7, app 1).

Caveats: (1) TODO after WP-F: `app/src/CanvasApp.tsx:273` currently fails lint with
`no-empty` (empty block, from WP-F's in-flight edits — app/ was frozen for WP-I at the
orchestrator's request; my own last full pass over app/ was green). After WP-F finishes:
fix that one error, re-run `pnpm -C canvas check`.
(2) `pnpm exec eslint` crashes intermittently on this box (exit 254, "linter process
terminated") while `node_modules/.bin/eslint` and `pnpm run lint` are stable — package
scripts use the .bin shim, but avoid `pnpm exec` for big lint runs until diagnosed.

## WP-G beads

- Closed algopeeps-cv6 (substrate decision) and algopeeps-wks (contract, verified by smoke 8/8) with recorded reasons. Created 11 P2 tickets, each parented to algopeeps-rr0 (parent-child); replay UI (algopeeps-yvu) notes algopeeps-9zs as its replay epic. No bd export, no commit — export happens from the master worktree.

```
◐ algopeeps-rr0 P1 [epic] Shared canvas: Excalidraw-style whiteboard both human and agent see and edit
├── ○ algopeeps-1yh P2 Canvas: unstub mermaid to Excalidraw import in app
├── ○ algopeeps-28b P2 Canvas: inline Excalidraw fonts (drop unpkg dependency)
├── ○ algopeeps-338 P2 Canvas: agent annotation layer with colour ownership
├── ○ algopeeps-7qa P2 Canvas: tiered describe plus viewport-relative coords
├── ○ algopeeps-9zs P2 Canvas snapshots as replayable session events
├── ○ algopeeps-az7 P2 Canvas: agent presence cursor via collaborators
├── ○ algopeeps-bh9 P2 Canvas gates the PLAN -> CODE transition
├── ○ algopeeps-dya P2 Canvas: vision probe - zai glm-5.3 image_url support, else glm-5.3-flash routing
├── ○ algopeeps-i5x P2 Canvas: guard human unlocking of agent elements
├── ○ algopeeps-ist P2 Canvas: human selection (selectedIds) surfaced in canvas_changes
├── ○ algopeeps-lue P2 Canvas: server to view push instead of 700ms pull
├── ○ algopeeps-pak P2 Canvas: vendor ext-apps basic-host into canvas/host, one view per session
├── ◐ algopeeps-rr0.3 P2 WP-F: live integration server+host+app in browser
├── ○ algopeeps-tip P2 Canvas: app-provided tools via app.registerTool
└── ○ algopeeps-yvu P2 Canvas: replay UI over events.jsonl

--------------------------------------------------------------------------------
Total: 16 issues (14 open, 2 in progress)

Status: ○ open  ◐ in_progress  ● blocked  ✓ closed  ❄ deferred
Priority: P0–P4 (label only; not a status icon)
```

## WP-F live

Run: 2026-09-19, headless + headed Chromium via basic-host :8080, server :3100. All brief steps 2–6 pass end-to-end in one run; screenshots in `canvas/.artifacts/` (live-open/asset/human/screenshot.png, dir gitignored). Console: **0 errors**, 27 warnings (see findings). `pnpm -C server test` 7/7 after fixes below.

**Fixes made (each root-caused in-browser):**
1. `server/src/server.ts` — CSP `resourceDomains` now `["https://unpkg.com", "https://esm.sh"]`. Excalidraw 0.18 resolves font URLs in a blob worker where `window.EXCALIDRAW_ASSET_PATH` (the unpkg pin) is invisible, so it always falls back to its hardcoded esm.sh CDN; with only unpkg allowed, all 230 FontFace loads were CSP-blocked (fetch-unpkg works, font-src-unpkg works — the worker just never asks).
2. `app/src/main.tsx` + `CanvasApp.tsx` — toolinput race + shape. The basic-host sends `sendToolInput({arguments})` **without a tool name** at handshake time, before CanvasApp mounts, so the app never learned the session (never pulled). Fix: Root captures `app.ontoolinput` pre-connect in `onAppCreated` into a `lastToolInput` ref (library's own guidance — the ext-apps warning told us), replays it on mount; CanvasApp accepts unnamed toolinput whose `arguments.session` is a string (canvas_open is our only UI tool).
3. `app/src/CanvasApp.tsx` + `canvas-app.css` (new) — `import "@excalidraw/excalidraw/index.css"` was missing entirely (dev worked because dev.html/style chain differed): the live app rendered Excalidraw's unstyled DOM (confirmed by orchestrator vision). Also `.canvas-host > .excalidraw { height: 100% }` + wrapper `overflow: hidden`: without it the canvas ResizeObserver fed on itself (canvas → wrapper → .excalidraw) until the canvas hit the 2^25 px cap (33,554,432 px tall) and Chromium refused the backing store — a permanently blank canvas. Bundle 4.66 → 4.91 MB, still < 5 MB.
4. `server/src/server.ts` + `store.ts` — `canvas_camera` now stores/forwards the **directive verbatim** (`{fitAll:true}`/`{fitIds}`/rect), not a server-resolved rect. Contract §7 says the app resolves fits via `scrollToContent`; the resolved-rect form made the app use its rect math, which zoomed a small array to 6.07× and Excalidraw's static canvas **stops painting above ~6× zoom** (blank view; verified: zoom 2 ✓, 4 ✓, 6.07 ✗ pixels). App rect camera clamps zoom at 2 (`canvas_camera` rect = "show this area", not "fill screen").
5. `server/src/server.ts` + `store.ts` — screenshot lifecycle: `canvas_pull` cleared the request slot on delivery, so `canvas_screenshot_result` matched nothing and `canvas_screenshot` always timed out ("no view connected"). Now delivered once (`delivered` flag) but pending until answered/cancelled. First-ever live screenshot round-trip works (18 KB PNG).

**Findings (logged, not fixed per orchestrator):**
- Fonts render as serif fallback: only 3 of 230 FontFaces ever reach `loaded` in the sandbox even with esm.sh allowed (esm.sh serves them, but the FontFace src list still starts with the unpkg candidate; in-worker resolution unclear). Ticketed P2 "inline fonts" upstream of this.
- The app's `convertSafe` drops standalone agent `text` skeletons at conversion ("dropped unconvertible agent element … text" ×3): pointer labels `i`/`j` and index labels exist in `canvas_read` but never render. App conversion layer, not the asset generator.
- Conversion round-trip mints extra elements: `convertToExcalidrawElements` materialises bound labels as separate container-bound text elements; the app's full-scene save then persists them as NEW (human-born) ids — duplicate value texts appear in `canvas_read`. Needs a save-side reconciliation rule (P2).
- Warnings: `[MCP Apps] ontoolinput handler replaced` (benign — Root capture → CanvasApp re-register); `willReadFrequently` (driver probes); `handler replaced` pattern is the library's legit re-register path.
- Locked agent cells cannot be dragged at all (Excalidraw enforces `locked`) — the §2 rule-3 rejection path is therefore unreachable by direct manipulation; exercised at protocol level instead (server unit tests + WP-E2).

**Timings (headless, cold):** canvas_open click → iframe mounted (4.66 MB bundle + React + Excalidraw): **~460–520 ms**; canvas_asset tool-return → purple pixels on screen: **~640 ms** (700 ms poll loop + convert; 3 s SLA met); annotate → pixels **~630 ms**; canvas_screenshot (round-trip incl. exportToBlob) < 1 s. Camera fitAll applied within one poll.

Stack left running: server :3100 + host :8080/:8081 (`scripts/dev-all.sh`, log `/tmp/wpf/dev-all.log`).

**WP-F close-out addenda (post first-pass):**
6. `app/src/CanvasApp.tsx` — `toSkeletons` deleted `text` from ALL skeletons; it must only convert text→bound-label on shapes. Text-type skeletons reached `convertToExcalidrawElements` text-less and threw (`Cannot read properties of undefined (reading 'replace')` in Excalidraw's text path) — pointer labels `i`/`j`, index digits and any standalone text never rendered. Fixed: `delete s.text` only in the shape branch. Result: 12/12 asset elements convert + round-trip with `seed` (was 6/12), zero drop warnings; labels confirmed on screen by orchestrator vision.
7. `app/src/CanvasApp.tsx` — `convertSafe` now reports `{ok, dropped}` instead of silently swallowing drops, and `pull()` re-feeds dropped skeletons into the next poll's conversion (bounded 5 tries) so a transient converter failure can't lose elements forever. (An earlier diagnostic edit of mine referenced an unbound `e` in a catch and broke pulls — fixed; lesson: never reference a catch binding that the linter removed.)
8. During diagnosis I briefly exposed `__excalidrawAPI` in prod builds and dropped `[wpf]` console logging — both reverted; the only permanent debug surface remains `devApi`-gated.

**Gates (2026-09-19, after all fixes):** `pnpm -C canvas check` → typecheck ✓, eslint ✓, prettier ✓, tests: shared 16/16, server 7/7, app playwright 1/1. `pnpm -C canvas smoke` → 8/8 PASS (WP-E suite, incl. camera-delivered-once against the new directive passthrough).

**Layout nits (shared/assets/array.ts, logged for WP-A — not fixed):** pointer arrow ticks land between the index digits rather than under cell centres, and the index row is offset ~10 px right of the cell column. Font first-paint: serif fallback only on the very first paint after a cold mount; hand-drawn fonts render once loaded (timing, not CSP, at this point).

## WP-H bun

- Workspace moved to Bun: `workspaces` in root `package.json` (`packageManager` dropped), `bun.lock` in; `pnpm-workspace.yaml`, root and `app/` lockfiles removed. Scripts use `bun run --filter '*'` (recursive) and `bun run --cwd <pkg> <script>`; hooks (`.config/wt.toml`, `.githooks/pre-commit`) and CI (`oven-sh/setup-bun@v2`) updated to `cd canvas && bun run check`. Toolchain pinned in `canvas/.mise.toml` (bun latest, node 24).
- `smoke.ts` gained `CANVAS_URL` env (default unchanged :3100); start hint says bun.
- Runtime trials (all against the Bun-installed tree):

| what | command | result |
|---|---|---|
| shared tests | `bun test` | 16/16 — node:test suite runs clean under Bun's runner |
| server tests | `bun test` | 7/7 |
| server runtime | `bun src/main.ts` (PORT=3101) | works — MCP SDK 2.x Streamable HTTP + express under Bun; `dev` script switched to it |
| smoke (script runtime) | `bun test/smoke.ts` | 8/8 — client SDK also fine under Bun; smoke script switched to it |
| app build | `bunx vite build` | 4.69 MiB `dist/canvas.html` (was 4.66; dep drift via bun.lock, still < 5 MB) |
| app tests | `bun run test` (Playwright) | 1/1 |

- Node 24 remains the runtime for the toolchain binaries (tsc/eslint/prettier/vite/Playwright run with node shebangs when spawned by `bun run`) — nothing needed changing there.
- Validation: `bun run check` green end-to-end (typecheck ×3, lint [1 pre-existing unused-disable warning in CanvasApp.tsx:73 — not from this WP], format, shared 16 + server 7 + app 1); smoke 8/8 via `bun run --cwd server dev` on :3101. The live demo on :3100/:8080 was not touched.

## WP-J unlock

Made the code match CONTRACT v1.2 §2 (ownership is provenance, not a lock), plus a
mid-flight scope update from the human: rule 2 enforcement dropped as well (demo is
fully open in both directions) and a new annotate kind `reply`.

- `shared/src/owner.ts` — `stampAgent` sets `locked:false` instead of `true`.
  `shared/assets/common.ts` no longer locks agent asset members.
- `shared/src/types.ts` (+ `compact.ts`) — `AgentKind` + `"reply"`;
  `OwnerData.editedBy` / `CompactElement.editedBy` (`"human" | "agent"`). Slightly
  outside the brief's file list, but the mandated guide sentence ("check `editedBy`
  in `canvas_read`") is false without the compact field — smallest fix, flagged here.
- `server/src/store.ts` —
  - `draw()` no longer refuses human ids (v1.2 rule 2, dropped per human): a human-owned
    id is updated in place, owner kept, `customData.editedBy:"agent"` stamped, draw/annotate/asset
    event carries `detail.humanOwned:true`. The "don't edit the learner's elements unless
    asked" rule is now only tutor guidance (`canvas/AGENTS.md`).
  - `save()` accepts human changes and deletions of agent-owned elements: change → keep
    `owner:"agent"`, stamp `editedBy:"human"`, one `human_edit` event with
    `detail.agentOwned:true`; deletion → gone, `detail.deleted` lists it. Omitted agent
    ids are deletions, not rejections. `rejected` now only lists malformed elements
    (missing id/type); `canvas_save` zod loosened (`looseObject({})`) so they reach the
    store. Seed-based conversion-accept unchanged and still does NOT stamp `editedBy`.
  - `changes()` reports human edits of agent elements (editedBy) under `human.changed`,
    and all deletions under `human.deleted` (every deletion comes from `canvas_save`).
- `server/src/server.ts` —
  - `canvas_pull` rewrites legacy v1.1 `locked:true` agent elements to `locked:false`
    and persists the rewrite (one-off migration) so the app's next full-scene save diff
    doesn't misread the unlock as a human edit.
  - `canvas_annotate` gains `kind:"reply"`: plain text (no prefix) 24 px below the ref's
    bbox, left-aligned to it, width `max(ref width, 240)`, fontSize 20.
- `CONTRACT.md` §2 rule 2 rewritten (v1.2, authorized by the human). Note: the §3
  `canvas_annotate` table row was NOT authorized and still lists only the three old kinds.
- `guide.md` — lock sentence replaced with "the human may move or edit your annotations;
  check `editedBy` in `canvas_read` before referring to them"; human-element paragraph now
  says "edit them only when asked — ownership is provenance, not a lock". Reply documented.
- `AGENTS.md` — five moves → six (reply to a note); "never edit human elements, server
  will refuse" → "do not edit the learner's elements unless they ask (the server no
  longer refuses … so this rule is on you)" + the editedBy line.
- Tests: server 7 → 10 ("moved agent element" cases flipped to accepted+tagged+logged;
  new: reply geometry, agent-edits-human-id accepted with `editedBy:"agent"` +
  `detail.humanOwned`, omitted agent id = deletion). `shared/test/assets.test.ts` lock
  assertion flipped. Smoke step 4 now asserts accepted + `editedBy:"human"` +
  `changes.changed` membership.

Gates: `bun run check` green (typecheck ×3, eslint 0 errors — the 1 CanvasApp.tsx:73
warning is WP-I's pre-existing one, format, shared 16/16, server 10/10, app 1/1).
`bun run smoke` 8/8 vs the restarted server. Live server :3100 restarted under bun
(`kill` old node/tsx PID, `bun run --cwd server dev`, log `/tmp/wpj/server.log`);
host :8080 untouched. Not committed, per brief.

Bead: algopeeps-usk. Related open ticket algopeeps-i5x ("guard human unlocking of agent
elements") is superseded in spirit by this WP (editedBy tagging + human_edit events are
the guard) — left open for the orchestrator to decide.

## WP-M threads app

- `app/src/threads/ThreadsLayer.tsx` (+ `threads.css`): §11 overlay — `position:absolute; inset:0; pointer-events:none` div inside `.canvas-host`; pills/cards opt into `pointer-events:auto`. Placement per thread = anchor element top-right (`x+width, y`), fallback `thread.anchor {x,y}`; `viewport = (scene + scroll) * zoom` read fresh from `api.getAppState()` inside a rAF-coalesced `reposition()` fired from Excalidraw `onChange` + `onScrollChange` (no polling). CanvasApp wiring is 6 small edits (threadsRef, syncPull in pull(), reposition pings, `renderTopRightUI` 💬 Comment button, `<ThreadsLayer/>`); `parseToolJson`/`ExAPI` exported for reuse.
- Collapsed pill `💬 N` with purple ring when the last message is agent+unread (per-thread `readCount` in a ref, marked read while a card is open — memory only); expanded 280 px card: author-tagged messages (agent `#9c36b5`), textarea (Enter=send, Shift+Enter=nl), Send, Resolve, collapse chevron. Collapse/expand and Resolve go optimistic-local + `canvas_thread_set` (shared fold, §11); replies optimistic + `canvas_thread_post {threadId, text}`. Resolved → grey pill, hidden 10 s after the open→resolved transition (timer per id; un-resolving unhides). Pull merge: `threads`/`threadDeletes` merged by id, incoming wins when `rev >=` local.
- Compose: 💬 Comment arms the overlay (`pointer-events:auto` + crosshair); if exactly one element is selected at arm time the draft anchors to it (`anchorId`), else the next canvas click converts viewport→scene and opens a draft card there; first Send calls `canvas_thread_post {anchorId} | {x, y}` + `text`, then an optimistic thread renders immediately (real one replaces it on the next pull). Escape cancels armed state and draft.
- Dev fake (`dev.tsx`, `?fake=1`): in-memory `canvas_thread_post`/`canvas_thread_set` + pull `threads`/`threadDeletes`, seeded with one open collapsed thread (agent message) on a seeded purple rectangle; point-anchored posts create the §11 28×28 comment ellipse with `customData.kind:"comment"` + `threadId`. Without `?fake=1` dev.html behaves exactly as before (old smoke test untouched).
- Wire check vs WP-L's in-flight server (read-only): `shared/src/types.ts` Thread matches my local contract type (`anchorId` required there, optional here); pull emits `threads` rev-gated + `threadDeletes: []`; `canvas_thread_post` returns `{rev, threadId, anchorId}` — shapes line up, integration smoke once WP-L publishes its section.
- Validation (2026-09-19): `bun run --cwd canvas check` fully green — typecheck 3/3 pkgs, eslint 0 problems, prettier clean, tests: shared 16/16, server 15/15, app Playwright **2/2** (`app.spec.ts` + new `threads.spec.ts`). Dist rebuilt: `app/dist/canvas.html` **4.92 MB** (< 5.2 MB). Console errors during probe: 0.
- Extra manual probe (not committed, scratch): pill placement exact (expected 368.0 = actual 368 px), unread ring on/off, compose → server thread + 28×28 anchor element + card, resolve → grey pill → gone after 10 s.

```
 scene (agent rect 160,120 200×80)      overlay (DOM, pointer-events:auto on pill/card)
 ┌──────────────┐   pill   ┌──────────────────────┐ ← 280px card, agent text #9c36b5
 │ two-sum      │──[💬 1]→ │ thread            ⌃ │     (⌃ collapse → pill; 💬N unread
 │              │  ring    │ agent does nums…    │      ring if last msg agent+unread)
 └──────────────┘          │ human yes—sort it…  │
   anchor = (x+w, y)       │ [textarea……] Send ✓ │
   viewport=(x+scroll)*zoom└──────────────────────┘
```

- Excalidraw API notes/workarounds: `onScrollChange(scrollX, scrollY, zoom)` exists in 0.18.1 and fires on pan/zoom (onChange does NOT fire on scroll) — both wired to reposition. `renderTopRightUI` island sits top-right next to the (z-20) fullscreen button without overlap. The overlay is z-15 sibling of `.excalidraw`, so pills/cards stack above the canvas but below the fullscreen button; the arming click cannot self-trigger the overlay (`click` resolves to the common ancestor `.canvas-host`, not the sibling overlay — no grace period needed). React 19 ref-as-prop + `useImperativeHandle` for the handle. Session switch clears thread state in a child effect (runs before the parent's pull effect, so the fresh since=0 pull refills cleanly).
- Bead: algopeeps-i2i.

## WP-L threads server

CONTRACT §11 (v1.3) server side. Built on WP-J's v1.2 code. Bead: algopeeps-icp.

- `shared/src/types.ts`: `Thread` / `ThreadMessage`, `AgentKind + "comment"`, event type
  `"comment"`, `CanvasEvent.threads?: Thread[]` (mutating thread events embed the whole
  changed thread — same replay trick as `elements`; keyframes embed all threads).
- `server/src/store.ts`: `SessionState.threads` + `threadAct` (human-activity revs only —
  `canvas_changes.threads` is human-scoped per §11). New `openThread` / `replyThread` /
  `setThread` (canvas_resolve and canvas_thread_set share it); ids `t_`+6 chars, messages
  `m<index>` (stable on replay because events carry the whole thread). Thread rev lives on the
  Thread itself; pull/threads filter `rev > since`. `save()`: a deleted anchor resolves its
  thread (embedded in the same `human_edit` event) — threads are never dropped, so
  `threadDeletes` is structurally always `[]` (kept in the pull shape for the app). Replay:
  keyframe replaces the thread map and synthesizes activity revs at the keyframe rev
  (advisory, same caveat as `bornOf`); comment events upsert + rebuild activity from
  `detail.author === "human"` and `messages.length === 1` = open.
- `server/src/server.ts`: `canvas_threads` (status filter default open, optional since; each
  thread carries `anchor:{x,y}` = anchor element top-left and `near` = nearest ≤8 compact
  elements with bbox within 160 px L∞ of the anchor *centre*, excluding all `kind:"comment"`
  anchors; anchor deleted → fields omitted), `canvas_comment`, `canvas_reply`,
  `canvas_resolve` (`resolved ?? true`, false reopens), `canvas_thread_post`,
  `canvas_thread_set` (both app-only). `canvas_pull` gains `threads`/`threadDeletes`;
  `canvas_changes` gains `threads:{opened,replied}`. anchorId+x/y both given → anchorId wins.
- Side finding (orchestrator, folded in): demo log showed every annotate followed by a
  `human_edit`. Diagnosis correction: the seed-match does NOT fail for text — the rev-11 saves
  in `demo/events.jsonl` have identical x/y, drifted width only, no `editedBy` stamped; the one
  `agentOwned:true` event (rev 15) is a genuine human drag. The real defect was that
  conversion-only saves were *logged* as bare `human_edit` events (empty detail), looking like
  human edits. Fix: `save()` tags conversion-accepts as `detail.converted:[ids]` (never
  `agentOwned`), so event consumers can tell bookkeeping from edits. Test 13 pins: converted
  text stored, no `editedBy`, event tagged. A dedicated event type would be cleaner but §8's
  type list is closed — orchestrator's call.
- `guide.md`: one section on threads (when to use vs `annotate reply`).
- Validation: `bun run --cwd canvas check` green (typecheck ×3, eslint, prettier; shared 16,
  server 15 — five new thread tests + conversion test, app 2). Smoke 9/9 against a restarted
  server on :3100 (old process killed first; host :8080 untouched; log `/tmp/wpl/server.log`):

```
1 PASS server reachable … 8 PASS threads: human open → agent reply → pull round trip …
9 PASS smoke complete
```

- Exact `canvas_pull` thread JSON for the app worker (fresh session, since = rev before the
  reply):

```json
{
  "rev": 3,
  "threads": [
    {
      "id": "t_jUrrqo",
      "anchorId": "6ULgipiQbU1A",
      "status": "open",
      "collapsed": false,
      "rev": 3,
      "messages": [
        { "id": "m1", "author": "human", "text": "is nums sorted?", "ts": "2026-09-19T09:52:41.356Z" },
        { "id": "m2", "author": "agent", "text": "yes — binary search applies", "ts": "2026-09-19T09:52:41.361Z" }
      ]
    }
  ],
  "threadDeletes": []
}
```

  The anchor element itself arrives as a normal upsert (28×28 ellipse, `#fff3bf`,
  `customData {kind:"comment", threadId}`; agent authors add owner+purple via the normal
  stamping, human authors get neither). `canvas_threads` adds `anchor {x,y}` and `near`
  (CompactElement[]) per thread — see plan file `canvas/briefs/WP-L-plan.md`.

## WP-N sidebar

- Added the Excalidraw `Sidebar` shell named `threads`: built-in header dock/close controls, Open/All filters, collapsible typed placeholder rows, fixed selection-comment footer, and localStorage-backed docking at `canvas.threads.docked`. `CanvasApp` derives `selectionCount` from `appState.selectedElementIds`; production passes no items yet and logs the placeholder focus/comment callbacks.
- Added 20 px numbered DOM badges using the WP-M scene-to-viewport transform, rAF-coalesced repositioning on scene changes and pan/zoom. `?sidebar=1` opens a docked demo with `SAMPLE_ITEMS` (three rows) and two fake targets.
- Excalidraw 0.18.1 needed the literal `<Sidebar>` as the direct CanvasApp child in this integration; the orchestrator approved keeping the stateful list body in `ThreadsSidebar.tsx` after the wrapper form did not remain registered. Playwright uses a 1400×900 viewport so the docked sidebar clears Excalidraw's 1229 px fit breakpoint.
- Validation: `bun run --cwd canvas check` green — typecheck ×3, eslint 0 problems, prettier clean; shared 16/16, server 15/15, app Playwright 3/3. Rebuilt `app/dist/canvas.html`: 4,931,319 bytes (4.93 MB), under 5.2 MB.

```
canvas + badges                 docked Threads sidebar
┌────────────────────┐         ┌────────────────────────┐
│ target A         ① │         │ Threads       [dock][×]│
│       target B ②   │         │ [Open] [All]           │
│                    │         │ ① nums[1]       open   │
└────────────────────┘         │ ② pointer j     open   │
                               ├────────────────────────┤
                               │ [Comment on selection] │
                               └────────────────────────┘
```

## WP-O comments sidebar

- Server threads now target one or more existing element ids (`targetIds`, with `anchorId = targetIds[0]` for compatibility). Opening a thread adds its id to every target's `customData.threads`; no anchor ellipse is created. Missing/deleted ids return `isError` with `unknown target ids`. Deleting every target leaves the thread open and reports `detached:true`; `canvas_thread_set.anchor` preserves its last union-bbox top-right. Legacy `anchorId`-only event-log threads normalize to `targetIds:[anchorId]` during replay.
- The sidebar now owns the live thread merge, selection compose row, replies, resolve/shared collapse, local unread markers, and focus/select/animated camera behavior. A newly arriving agent reply opens a closed sidebar once per thread. WP-M's `ThreadsLayer` remains on disk but is unmounted; its obsolete Playwright spec is skipped with the required reason.
- Validation: `bun run --cwd canvas check` green — shared 16/16, server 15/15, app Playwright 3 passed + 1 legacy overlay spec skipped. Smoke 9/9 passed against the restarted Bun server on `127.0.0.1:3100`. Rebuilt `app/dist/canvas.html`: 4,927,757 bytes (4.93 MB), under 5.2 MB.
- Contract deviations: **none**.

Final `canvas_pull {since:0}` thread JSON from smoke session `smoke-mu8atcvf`:

```json
{
  "rev": 8,
  "threads": [
    {
      "id": "t_Y6VN6H",
      "targetIds": ["h-smoke-1"],
      "anchorId": "h-smoke-1",
      "status": "open",
      "collapsed": true,
      "rev": 8,
      "messages": [
        {
          "id": "m1",
          "author": "human",
          "text": "why is j at index 1?",
          "ts": "2026-09-19T11:22:55.577Z"
        },
        {
          "id": "m2",
          "author": "agent",
          "text": "j scans right of i",
          "ts": "2026-09-19T11:22:55.582Z"
        }
      ],
      "anchor": { "x": 520, "y": 100 },
      "detached": false
    }
  ]
}
```

## WP-Q polish

- Root cause of the "empty white circle" badges: Excalidraw scopes its CSS variables to `.excalidraw`; our badge overlay is a sibling, so `var(--color-primary)` resolved to nothing. Fixed by a token block on `.canvas-host` (Excalidraw names mirrored, light + `data-theme="dark"` values, plus `--agent #9c36b5`). Second latent bug: `Badges` cancelled its pending rAF on cleanup without resetting the handle, so every later `reposition()` early-returned (this is why the selection pill never appeared at first).
- Comment affordances: selection pill (`💬 Comment` · `🧵 N`) 8 px above the selection bbox, hidden while `cursorButton==="down"`/resizing/rotating/drawing/editing text; comment tool = `setActiveTool({type:"custom", customType:"comment", locked:true})` (`locked` is required — Excalidraw resets an unlocked tool to selection on pointer-up, so the toast click would have disarmed it); hit-test via `onPointerDown` `pointerDownState.origin` (already scene coords), top-most bbox, bound text → container; `C` toggles, `Esc` exits, crosshair via `.canvas-host.is-commenting canvas.interactive`. Compose open is deferred one tick: Excalidraw's own pointer-down handler runs after the subscriber and closes an undocked sidebar.
- Palette (`app/src/palette/`): island at the left edge, 7 × 44 px SVG tiles, collapsible (`canvas.palette.open`), slides to `left:232px` while a selection shows Excalidraw's properties panel. Drag uses `application/x-canvas-asset`; the drop is caught on `.canvas-host` in the capture phase so Excalidraw never sees it; `updateScene` with `CaptureUpdateAction.IMMEDIATELY` (undo works, verified: undo button lit after drop) and the new group selected. Click = stamp at viewport centre. Six assets also registered via `updateLibrary({merge:true})` — verified names `Array, Linked list, Binary tree, Stack frames, State table, Hash map`.
- Sidebar: title = bound/own text ≤ 40 chars else `type · id4`; relative times with ISO in `title`; `You`/`Tutor` with 6 px dots; auto-growing 1–5 row textarea (Enter sends); purple `Reply`/`Send`; `✓` ghost resolve, `Reopen` on resolved rows; Open/All segmented control lives in `Sidebar.Header` (no more clipping) and is mirrored in the Excalidraw `<Footer>`; empty state per brief. Badge: 22 px `#9c36b5`, white ring, pulse when unread, grey when resolved.
- Blocker resolved mid-package: `shared/src/ids.ts` used `node:crypto`, which Vite externalises → the app failed to mount as soon as it imported `generate`. Orchestrator applied the `globalThis.crypto.getRandomValues` fix (briefs/WP-Q-inbox.md Q1). This is almost certainly why WP-K never landed a `library.ts`.
- Deviations / could not do: (1) `renderTopRightUI` has three buttons, not two — the host fullscreen toggle moved in there as an icon button because its old absolutely-positioned `<button>` overlapped the sidebar header. (2) Dark mode is CSS-only: tokens exist under `.canvas-host[data-theme="dark"]` but `CanvasApp` still hardcodes `theme="light"` and the dev page has no `?theme=dark`, so it is unverified visually. (3) `locked:true` on the comment tool lights Excalidraw's tool-lock indicator while commenting; cosmetic. (4) Dev harness now reports `containerDimensions.height = innerHeight` (fake only) so the 4:3 host no longer pushes the footer below a 900 px viewport.
- Validation (2026-09-19): `bun run --cwd canvas check` green — typecheck ×3, eslint 0, prettier clean, shared 16/16, server 15/15, app Playwright 4 passed + 1 legacy skipped (`polish.spec.ts` new: bubble on select, `C` arms tool, Array drag adds ≥ 5 selected elements, `You`/`Tutor` + relative time, badge text `1` with `rgb(156,54,181)`). Dist rebuilt: `app/dist/canvas.html` 4,953,340 bytes (4.72 MiB) < 5.3 MB. Screenshots `.artifacts/wp-q-0-before.png` … `wp-q-5.png`, all looked at.

```
┌──┬───────────────────────────────────────────────────┬──────────────────────────┐
│≡ │        [ Excalidraw toolbar ]        [💬][Threads 1][⤢][Library]│ Threads (Open 1|All 1) ⊡ × │
│  │                                                   ├──────────────────────────┤
│▤ │      (💬 Comment · 🧵 1)  ← pill 8px above bbox   │ ① two-sum        open ✓  │
│⟶ │      ┌──────────┐①  ← 22px purple badge          │   ● You   just now       │
│⋔ │      │ two-sum  │                                 │   Why is this here?      │
│▥ │      └──────────┘                                 │   ● Tutor just now       │
│▦ │                                                   │   It anchors…            │
│⊞ │   [1][2][3][4][5]  ← dropped Array (undoable)     │   [Reply…       ][Reply] │
│💬│    0  1  2  3  4                                  │                          │
│◂ │ palette island                                    │                          │
│  │ [−100%+] [↶↷] (Open 1|All 1) ← footer filter      │                          │
└──┴───────────────────────────────────────────────────┴──────────────────────────┘
```

## WP-Q findings

- `Badges.tsx` rAF-handle bug above was pre-existing (WP-N) and also affected badge repositioning after any prop change; fixed in place since the file is in scope.
- `CanvasApp` hardcodes `theme="light"`; wiring `hostCtx.theme` → Excalidraw `theme` + `data-theme` is a 3-line follow-up once the host exposes it.
- `threads/ThreadsLayer.tsx` is still on disk but unmounted (WP-O). Untouched per scope; candidate for deletion.
