# elkdraw notes

Facts a later agent needs: structure, pinned versions, gotchas, timings. The
reference sections come first; `## Log` at the end has one entry per phase or
task, newest last. Agents append their own log entry (see `AGENTS.md`).

## Package graph

```
core  <- backends/excalidraw, backends/fake, sidecar, adapters/mcp, app (types only)
sidecar <- backends/excalidraw (Playwright stays in sidecar's own package)
adapters/server <- core, backend-excalidraw, backend-fake, mcp
adapters/cli    <- core, mcp (spawns server/src/main.ts by path; no import)
test/parity, eval <- anything
```

Enforced three ways: each package's `package.json` (Bun's isolated linker only
links declared deps, so undeclared imports do not resolve), `tsconfig.json`
project references (`tsc -b` fails on cycles and on files outside a project),
and `no-restricted-imports` in `eslint.config.js` (`allowedDeps`). Change all
three together. `adapters/mcp` stays core-only for good: server depends on it.

Core has two entries (`core/package.json` `exports`): `@elkdraw/core` =
contracts + `json.ts` (zod only), `@elkdraw/core/engine` = `src/engine/`
(mermaid adapter, elkjs layout, lint engine, later libavoid, and skeleton,
apply, diff, place, merge, lift, print, router, families). The deep-import
lint rule exempts exactly `@elkdraw/core/engine`; `app`, `adapters/mcp` and
`adapters/cli` are banned from it, so Vite never bundles an engine into the
app (mermaid touches `window` at import; libavoid is LGPL WASM, design §15.3).

## TypeScript

- TypeScript is pinned `~6.0.3`: typescript-eslint 8.70 requires
  `typescript <6.1.0`, so 7.x is out until typescript-eslint supports it.
- Every package is `composite` with `emitDeclarationOnly` into `dist/`
  (gitignored). Packages export `./src/index.ts`; Bun and Vite run source,
  `tsc -b` maps imports to the referenced project's `.d.ts`.
- `@total-typescript/ts-reset` is loaded once, via `types` in
  `tsconfig.base.json`, so it applies to every package (a `.d.ts` import in core
  would only reach core's own program).

## Dependencies

New dependencies go through the orchestrator; do not run `bun add` on a task
branch (`AGENTS.md`, Dependencies). Every dependency is listed here.

| Package                                               | Where                                              | Version  | Why                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| zod                                                   | core, adapters/mcp, server, cli; test/parity (dev) | ^4.6.5   | Schemas for IR, payloads and tool inputs; v4 has `z.toJSONSchema` (verified).                    |
| elkjs                                                 | core                                               | ^0.12.0  | ELK layout engine; ships `.d.ts` (`lib/main.d.ts`) for the IR types.                             |
| safe-stable-stringify                                 | core                                               | ^2.5.0   | Deterministic JSON for the event log.                                                            |
| @modelcontextprotocol/server                          | adapters/mcp, adapters/server                      | 2.0.0    | MCP server SDK, same as canvas; peer `zod ^4.2.0`.                                               |
| @modelcontextprotocol/client (dev)                    | adapters/mcp, server, eval                         | 2.0.0    | MCP client for tests and the eval harness.                                                       |
| commander                                             | adapters/cli                                       | ^15.0.0  | CLI parsing.                                                                                     |
| @commander-js/extra-typings                           | adapters/cli                                       | ^15.0.0  | Inferred option/argument types for commander.                                                    |
| mermaid (dev)                                         | test/parity                                        | 11.17.2  | Parses the Mermaid fixtures in the parity suite; pinned to the `getData()` version (design §16). |
| happy-dom (dev)                                       | test/parity                                        | ^20.14.5 | DOM `Window` so Mermaid's parser runs under `bun test`.                                          |
| react, react-dom                                      | app                                                | ^19.3.0  | Browser canvas UI.                                                                               |
| @excalidraw/excalidraw                                | app, backends/excalidraw                           | 0.18.1   | Canvas component (app) and scene/element types (backend); same as canvas/app.                    |
| vite (dev)                                            | app                                                | ^8.3.1   | App dev server and build; Vite 8 + Excalidraw 0.18.1 build verified.                             |
| @vitejs/plugin-react (dev)                            | app                                                | ^6.1.1   | React transform for Vite 8 (its extra peers are optional).                                       |
| @types/react, @types/react-dom (dev)                  | app                                                | ^19.3.0  | React types.                                                                                     |
| playwright (dev)                                      | sidecar, eval                                      | 1.63.0   | Headless browser; matches the cached chromium-1243, so no browser download.                      |
| typescript (dev)                                      | root                                               | ~6.0.3   | `tsc -b`; capped by typescript-eslint's peer range.                                              |
| eslint, @eslint/js (dev)                              | root                                               | ^10.11.0 | Linter and its recommended JS rules.                                                             |
| typescript-eslint (dev)                               | root                                               | ^8.70.1  | strictTypeChecked + stylisticTypeChecked.                                                        |
| eslint-config-prettier (dev)                          | root                                               | ^10.1.8  | Turns off style rules that fight Prettier.                                                       |
| eslint-plugin-react-hooks (dev)                       | root                                               | ^7.1.1   | Hooks and React Compiler rules for app/.                                                         |
| @eslint-community/eslint-plugin-eslint-comments (dev) | root                                               | ^4.8.1   | Inline disables must carry a description; no blanket disables.                                   |
| globals (dev)                                         | root                                               | ^17.12.0 | Browser/node globals for ESLint.                                                                 |
| prettier (dev)                                        | root                                               | ^3.9.9   | The only formatter.                                                                              |
| @types/bun (dev)                                      | root                                               | ^1.4.2   | Bun runtime and `bun:test` types.                                                                |
| @total-typescript/ts-reset (dev)                      | root                                               | ^0.6.1   | `JSON.parse`/`Response.json()` return `unknown`; `.filter(Boolean)` narrows.                     |

## MCP HTTP transport

`@modelcontextprotocol/server@2.0.0` ships a web-standard Streamable HTTP
transport: `WebStandardStreamableHTTPServerTransport`, exported from the package
root, with `handleRequest(req: Request, options?): Promise<Response>`. It plugs
straight into `Bun.serve({ fetch })`, so no express. The same root export also
has `createMcpHandler` (per-request handler factory) and
`validateHostHeader` / `localhostAllowedHostnames` for DNS-rebinding checks.

## Sidecar and elkjs

`@elkdraw/sidecar` (`sidecar/src/index.ts`): `new Sidecar(dist = app/dist)`,
`start()` (idempotent; `Bun.serve` on a random 127.0.0.1 port serves the bundle,
headless Chromium loads it and waits for `.excalidraw`), `measure(elements) ->
Record<Id, Box>` (core `Box`), `measureText(MeasureRequest[]) -> Size[]` (cached),
`snap(bbox, scale = 1, ids?) -> Uint8Array` (PNG), `close()`. Real since 1.3 (see
its Log entry); zod validates inputs before the page and outputs after it.

- Since 1.3 the sidecar loads the app with `?headless=1` (app/src/headless.ts), which
  skips the sync client. (P0.7 note, superseded:) The sidecar serves no `/ws`; without the flag the sync
  client retries every second in the background. A
  `?headless=1` flag in `app/` would silence it if that ever matters.
- Timings (M-series Mac, Bun 1.4.2, chromium-1243): cold `start()` ~0.25 s
  (bundle already built); warm `measure`/`snap` 0.3-3 ms. The e2e asserts < 2 s.
- Run: `bun run --cwd elkdraw/sidecar test:e2e` (builds the app, then
  `bun test ./src/sidecar.e2e.ts`). Not part of `check`: it needs `app/dist`.

elkjs under Bun (probe B1, `sidecar/src/elk.test.ts`, runs in `check`): the
bundled build throws (`new _Worker` undefined). This works:

```ts
import ELK from "elkjs/lib/elk-api.js";
const elk = new ELK({
  workerUrl: Bun.resolveSync("elkjs/lib/elk-worker.min.js", import.meta.dir),
});
await elk.layout(graph); // elk-api's default factory: new Worker(url), Bun's Web Worker
elk.terminateWorker();
```

3-node layered layout: ~90 ms including worker start.

## Log

### Phase 0: scaffolding (2026-09-26)

Run as one branch per task, `wt switch --create elkdraw/p0.N-<slug> --base
abhirup/canvas --no-cd`, each merged `--no-ff` into `abhirup/canvas` by the
orchestrator. Every later-phase dependency was installed up front in P0.1, so
later tasks should not need `bun add`.

- P0.1 workspace: ten packages, composite projects, strict tsconfig
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`), the lint baseline, `parseJson` / `safeParseJson`.
- P0.11 CI: `.github/workflows/elkdraw-check.yml`; `.githooks/pre-commit` runs
  a check only for the tree whose files are staged. Hooks stay opt-in.
- P0.4 app: Excalidraw shell as a static Vite bundle; syncs over same-origin
  `/ws` (override `?ws=` or `VITE_ELKDRAW_WS`); remote deltas apply with
  `captureUpdate NEVER`; fonts ship under `/fonts`.
- P0.2 contracts: zod schemas and types in `core/src/contracts/`, JSON Schema
  in `core/schemas/` (stale files fail a test). See `CONTRACTS.md`.
- P0.7 sidecar: Chromium skeleton and the elkjs-under-Bun probe (above).
- P0.10 fake backend: in-memory `BackendAdapter` (NeutralScene scene, deep
  zones, no bindings, fixed char-width measure); `test/parity` snapshots.
  A changed snapshot always fails; a missing one fails only when `CI=true`.
- P0.5 server: one Bun process serves `app/dist`, `/ws`, REST (`/api/status`,
  `/api/shutdown`, `/api/tools/:name`) and MCP at `/mcp` behind Host/Origin
  checks; per-session `events.jsonl` with keyframes, replayed on start.
- P0.8 fixtures: dogfood scenes with defect manifests, task and Mermaid
  samples.
- P0.3 surface: 14 MCP tools with zod schemas and `NOT_IMPLEMENTED` stubs,
  the `elkdraw` CLI (flags derived from the same schemas), `SURFACE.md`.
- P0.6 portless: `bun run --cwd elkdraw dev` serves each worktree at
  `https://<branch-tail>.elkdraw.localhost:1355` (README).
- P0.5b wiring: the server uses `@elkdraw/mcp`; REST maps `ToolError` to
  400/404/501 (else 500 `INTERNAL`); stdio forwards to the running server and
  replies `UNREACHABLE` when it is down; cli no longer depends on server.
- P0.12 agent rules: `AGENTS.md`. Checked: `dev` in a linked worktree prints
  the branch URL and `/api/status` there reports the branch; `curl` needs
  `--cacert ~/.portless/ca.pem`, Bun/Node need `NODE_EXTRA_CA_CERTS`.
- Pending at the time of writing: P0.9 eval harness, P0.13 registration docs
  and skill, P0.14 exit smoke.
- P0.14 exit smoke: `bun run --cwd elkdraw smoke:p0` (`scripts/smoke-p0.sh`
  sets `NODE_EXTRA_CA_CERTS`, then runs `eval/src/smoke-p0.ts`). It creates
  `elkdraw/smoke-p0-b` off the current branch (`wt switch --create --no-hooks`),
  runs `CI=true check` in both worktrees (one after the other), starts `dev` in
  both, and per URL checks `/api/status`, MCP `listTools` + `status` (branch)
  - `lint` (`NOT_IMPLEMENTED`), CLI `status`, and the app pill
    `<branch> · open`; screenshots land in `eval/test-results/`. Teardown (also
    on SIGINT/SIGTERM) stops both servers, the browser, and `wt remove -D -f
--foreground` drops the worktree and branch. Passed 2026-09-26 in ~45 s
    (checks ~20 s each, both app builds included). Playwright's Chromium does
    not trust portless's CA, so the page opens with `ignoreHTTPSErrors`; the
    URLs print at the end for opening by hand while a `dev` runs.

### Phase 0 review fixes B3, B4 (2026-09-26)

- B3: edge `backends/excalidraw -> sidecar` added in `package.json`, tsconfig
  references and `allowedDeps`. The sidecar's local `BBox`/`Box` schemas are
  gone: it uses core `Box`, and `measure` returns `Record<Id, Box>` (was an
  array of boxes with `id`). Bead 1.3's Owns should read `elkdraw/sidecar/**`.
- B4: `@elkdraw/core/engine` entry added (empty barrel, `core/src/engine/`).
  Lint verified with scratch files: app, mcp and cli importing it error;
  server and backends/excalidraw pass. `app/dist` after `vite build` has no
  elkjs (grep for `elkjs`, `elk-worker`, `org.eclipse.elk`: 0 files).

### 1.0 Contracts for Phase 1 (2026-09-26)

- Landed §19.1 B1 + B2; see the `CONTRACTS.md` changelog. Consumers fixed:
  fake backend `read` (`Promise.resolve`), parity `sceneOf` (async), eval
  `score.test.ts` hit helper (bbox, severity).
- Gotcha: `ir.ts` imports `Allow` from `lint.ts`, so `lint.ts` importing `Box`
  from `ir.ts` is a cycle (runtime "Cannot access 'Box' before
  initialization"). `Point`/`Box` now live in `geometry.ts`, re-exported by
  `ir.ts`.
- The server's event-log `DeltaLine` extends `FeedLine` and overrides `op`
  with `"delta"`; it inherits the optional `detail`, unused.

### 1.4 Neutral scene read (2026-09-26)

- `readScene(scene, measure?)` in `backends/excalidraw/src/read/read.ts`,
  async (ready for 1.0's `read?(): Promise<NeutralScene>`). Stored data only:
  boxes from x/y/width/height, lines from absolute points with `from`/`to`
  from bindings, bound text (node and arrow labels) folded into its container
  as `text`, frames as zones, `customData` as raw `meta`, deleted skipped.
  Output is validated with core `NeutralScene`.
- Sidecar seam: optional `measure` (same shape as `Sidecar.measure`) replaces
  stored text boxes by text id. Not wired: that is the adapter's job after 1.3.
- Snapshots: `bun run --cwd elkdraw/backends/excalidraw update-snapshots`.
- Choices: `shape` = `customData.shape` else the Excalidraw type; dashed →
  `"8 8"`, dotted → `"1.5 6"` (emit must agree); `angle` and frame names ignored.
- The package does not declare `zod`, so input is typed (Excalidraw element
  types), not zod-parsed; output is. Owns says `read/**`; files live in
  `src/read/` because the package tsconfig includes only `src`.

### 1.1 Skeleton input schema (2026-09-26)

- `core/skeleton/schema.ts`: `SkeletonInput` (`{elements}`, the `add` input),
  `SkeletonElement`, `SkeletonId`, `validateSkeleton(input)` →
  `{ok, value} | {ok: false, errors: string[]}`, `skeletonErrors(zodError)`.
  Re-exported from `@elkdraw/core` (zod only, so the root entry, not
  `engine`: `adapters/mcp` needs it). Hand-written zod; core does not depend on
  `@excalidraw/excalidraw`. No transforms, so `z.toJSONSchema` works.
- Strict per type (`z.discriminatedUnion("type")` of `strictObject`s: a plain
  union loses per-field paths): rectangle, ellipse, diamond, text, arrow, line,
  frame. Image, freedraw, embeddable, iframe, magicframe left out. Text on
  shapes is `label`, bindings are `start`/`end: {id}` (no inline-created
  ends). Store-owned fields (seed, version, versionNonce, updated, index,
  isDeleted, boundElements, containerId, lastCommittedPoint) are rejected.
  `allow` uses the contract `Allow`, so 1.0's new lint codes flow in.
- Ids required, pattern `^[a-z0-9][a-z0-9._/#@:>-]*$` (rejects Excalidraw's
  mixed-case nanoids; a lowercase random id still passes). Duplicate ids are
  reported at `elements[i].id`, also when other errors exist (`when`).
  References (`start/end.id`, `children`) are not resolved here: they may
  name elements already on the canvas; that is apply's job (1.2).
- Errors: one `path: message` line each; `unrecognized_keys` split into one
  `path.key: unknown key` line per key.
- `core/tsconfig.json`: `rootDir` `src` → `.`, `include` += `skeleton`
  (the bead's Owns is `core/skeleton/**`, outside `src`).
- Negative fixture `core/skeleton/negative.jsonl` is JSONL so Prettier leaves
  it at 20 lines (JSON would be reformatted to ~60).
- Dogfood scenes are wire scenes, not skeleton input: raw, they fail. The test
  projects them (bound text → `label`, bindings → `start`/`end`, store fields
  dropped by name) and the projection validates. Keys Excalidraw ignores are
  dropped by name and counted: `fontSize` on non-text (yct 3, all 3
  disagreeing with the label's fontSize; batch 26, 9 disagreeing) and `elbowed` (yct 20, batch 21).

### 1.13 BST defect manifest (2026-09-26)

- `test/fixtures/dogfood/bst/`: `scene.excalidraw`, `final.png`,
  `defects.json` for dogfood round 3 (tester A, yctimlin server). No round-3
  export existed (`/tmp/xd_r3.excalidraw` predates both fix patches), but the
  tester's server on :3010 was still up with its browser tab, so the scene is a
  fresh `export` (read-only) whose geometry equals the tester's own final
  `query` dump (`/tmp/xd_r3_all.json`, 0 mismatches). Filtered to the 65 BST
  elements plus their 30 bound `-label` texts; the ride-hailing round-2 state
  on the same canvas is dropped (its defects are in no manifest). `final.png`
  is the tester's last screenshot `/tmp/xd_bst_v3.png` cropped to the tester's
  own 1000x720 window at x=2900.
- Final PNG is clean: both defects (t10, t12 `text-wrapped`) are
  `fixedInFinal: true`, so BST scoring only measures false positives
  (`flaggedFixed`, `cleanRegionHits`); `missed` is 0 by construction. The
  textAlign-ignored index labels are in `unmapped` (no v0 rule). Round 3 has
  no section in `dogfood-excalidraw-yctimlin.md`; `report` points at
  `dogfood-synthesis.md`, and sources cite transcript d24dbb60 line 408
  (1-based). `reported: true` here means "in the synthesis or in the
  tester's round-3 chat answer", which is the only round-3 report.
- Follow-up (orchestrator request): `test/fixtures/dogfood/bst-first/` from
  the byte-for-byte first-add export `/tmp/xd_r3.excalidraw` (same 95-element
  filter) and `/tmp/xd_bst_v1.png` (same crop). bst-01/bst-02 are open there,
  so this is the fixture that tests lint; the `tree` clean region leaves out
  t10, t12 and their labels. `test/fixtures/README.md` now lists both BST
  fixtures, their sources and counts.

### 1.11 Agent guide and skill (2026-09-26)

- `skill/SKILL.md` + `skill/references/cheatsheet.md` replace the Phase 0
  draft. They copy yctimlin's `excalidraw-skill` section order and wording
  (heading diff: only additions, Placement Helpers and The Loop) so the 1.14
  audit varies the tools only. The design guide ships in the cheatsheet; there
  is no guide tool.
- Written for the Phase 1 surface as designed, not as built: `apply
{elements, place, patches, prune, dryRun, ifRev}`, `validate`, `look.boxes`,
  placement/asset ops. `skill/MAINTAINERS.md` (unlinked, so agents never read
  it) maps each part to the task it waits on; update it when a task lands.
- Element format assumed native `ExcalidrawElementSkeleton` (`label.text`,
  `start.id`), with yctimlin's `text` / `startElementId` rejected. If 1.1
  decides otherwise, fix the Element Format section and the examples.
- Not run: the acceptance (fresh Opus completes ride-hailing from the skill);
  it needs 1.2, 1.5, 1.7, 1.9, 1.10.

### 1.9 Placement helpers: row, column, grid, assets (2026-09-26)

- `core/place/schema.ts`: `PlaceOp`, a strict `z.discriminatedUnion("op", …)`
  covering `row`/`column`/`grid`/`rightOf`/`leftOf`/`below`/`above` _and_ the
  asset ops (`array`/`linkedList`/`tree`/`stack`/`table`/`hashMap`) in one
  union, per the cheatsheet ("Placement and Asset Ops" puts them together).
  Every member is a `strictObject`, so a bad shape or unknown key fails with
  its path (same pattern as `core/skeleton/schema.ts`). `PlaceOp` is both the
  schema and the derived TS type (`z.infer`).
- `core/place/ops.ts`: `place(elements, ops, scene)` matches `ApplyDeps.place`
  in `core/apply/apply.ts` exactly. Layout ops read/write a working id→element
  map seeded from `elements`; `of`/row-column-grid `ids` may also name an
  element already on the canvas (`scene`, read-only reference — the wire
  `Element` shape, so its box comes from its raw `x`/`y`/`width`/`height`
  fields, defaulted). Asset ops call into `assets.ts` and append what they
  generate; an id in `elements` matching a generated id overrides the fields
  it gives, position excepted — like every op, the generator's x/y always
  wins (cheatsheet line 123). Repositioning an id apply didn't give us (found
  only in `scene`) works for the five element types with no other required
  field (`rectangle`/`ellipse`/`diamond`/`arrow`/`line`); `text` and `frame`
  need content this path doesn't have, so they're left alone.
- `core/place/assets.ts`: unchanged generators, ids exactly as the cheatsheet
  promises (`arr-0`, `arr-0-idx`, `ll-0-1`, `t-8`, `t-8-4`, `s-0`, `tb-r0c0`,
  `h-0`, `h-<key>`). Return type narrowed to `PositionedSkeletonElement`
  (`Extract<SkeletonElement, {x:number;y:number}>`) since no asset ever emits
  a frame — this is what lets the override-merge in `ops.ts` keep x/y typed
  as `number`, not `number | undefined`, under `exactOptionalPropertyTypes`.
  `tree` inserts `keys` as a BST (first write wins on a duplicate key) and
  lays out by in-order index (x) and depth (y) — reproduces the dogfood
  `bst-first` fixture's tree geometry exactly (44px nodes, 60px x-step, 90px
  level gap), verified against the fixture file in `bst-fixture.test.ts`.
  `hashMap` buckets by sum-of-char-codes mod `buckets`; non-alnum keys get a
  slugged id, original string kept as the label.
- Every asset's output is asserted against `validateSkeleton` in
  `assets.test.ts`. `bst-fixture.test.ts` drives `tree`, `array` and two
  `below` ops through one `place()` call (4 ops total, well under the 15-op
  acceptance bar) and checks structure/rough positions, not bytes.
- `core/tsconfig.json` include gained `place` (same pattern as `skeleton`);
  `core/src/index.ts` re-exports `place`/asset functions/`PlaceOp` additively.
- Wired into `core/apply/apply.ts` (small authorized edit): its local loose
  `PlaceOp` is gone, replaced by an import from `core/place`, re-exported from
  the same spot so `@elkdraw/core/engine` (`core/src/engine/index.ts`) needs
  no change beyond that one import line. Added
  `apply.test.ts`'s `"place (task 1.9): a tree + below pointer through apply"`
  (passes `place` as `deps.place`) and widened the existing
  `"place without placer"` case's input to a schema-valid `row` op — a bare
  `{op:"row"}` used to reach the "task 1.9" not-available error via the old
  loose schema; now it fails validation first, so the test needed real
  `ids`/`at`/`gap` to still exercise that path.

### 1.2 Apply for skeleton (2026-09-26)

- `core/apply/apply.ts`, exported from `@elkdraw/core/engine`: `apply(scene,
input, deps)` and `add(...)` (create only), pure and synchronous. Input
  `ApplyInput {elements, place, patches, prune, dryRun, ifRev}`; result
  `{reply, upserts, deletes, elements}` (delta for `Store.apply`, next scene)
  or `{errors}`. `reply.rev` assumes the store bumps by one; 1.10 should use
  the store's returned rev.
- Conversion is injected (`deps.convert`): `convertToExcalidrawElements`
  fails under Bun (`window is not defined`), and with happy-dom globals it
  still fails on `canvas.getContext("2d")`. Core does not declare
  `@excalidraw/excalidraw` anyway. 1.10 wires the real converter (sidecar or
  browser); it gets `scene` so arrows can bind to boxes outside the batch,
  which Excalidraw's batch-only binding does not do by itself.
- Seams: `deps.place` (1.9; absent = `place` is an error), `deps.lint` (1.5;
  absent = `lints: []`). `measured` comes from the converter.
- Agent elements get `customData.origin = "generated"`; prune only deletes
  those, and only when `elements`/`place` are sent. Bound label text gets id
  `<id>#label`. Unchanged = equal after masking version, versionNonce, seed,
  updated, index, with boundElements order-free. Updates keep the stored
  seed, index and bound entries the input does not own (human arrows).
- `set` label does not re-measure text size (ponytail note in code). Deleting
  an element leaves dangling `boundElements` on untouched elements; Excalidraw
  restore repairs them.
- "Clean apply under 300 bytes": tested for a 3-element create and the no-op
  re-apply; a large first apply grows with `created`.

### 1.3 Sidecar: measure and snap (2026-09-26)

- `?headless=1` (`app/src/headless.ts`, wired in `main.tsx`): renders Excalidraw
  with no sync client and exposes `window.elkdraw` (`api`, `measure`,
  `measureText`, `snap`). The sidecar loads `/?headless=1` and waits for it.
- `measure(elements) -> Record<Id, Box>`: loads fonts, then `restoreElements`
  with `repairBindings` + `refreshDimensions` (what the editor shows once text
  is touched), sets that as the page scene, and per element exports it alone
  (2x, integer-aligned origin via two invisible 1x1 corner rects) and takes the
  ink bbox (alpha >= 32). Bound text and container ride along at opacity 0 so
  arrow labels sit on their arrow and mask it; the label is grown by
  BOUND_TEXT_PADDING (5) because the editor masks the padded box and export the
  bare one.
- Refresh reproduces the dogfood defects: centred text with a too-wide stored
  width shrinks and keeps x (drawn left, yct `title`); "12" in a 44 px circle
  wraps. The app's `toScene` does not refresh, so the editor shows stored sizes
  until a text is edited. The fixture PNGs' wraps ("Redis geo-index" etc.) do
  not reproduce: Virgil 16 px measures 119 < 131 wrap width here.
- `measureText(MeasureRequest[]) -> Size[]`: Excalidraw's wrapText + metrics
  via two `restoreElements` passes; height = lines x fontSize x lineHeight.
  Font is an Excalidraw name (`Virgil`, `Excalifont`, ...) or numeric id.
  Cache (in-process, unbounded) keyed (backend, font, size, text, wrapWidth).
- `snap(bbox, scale, ids?)`: exports the last measured scene (or `ids` plus
  their bound text), crops `bbox` onto white.
- Gotchas: restore drops 0x0 elements; a text with height > 0 but no
  lineHeight gets lineHeight derived from height (use height 0). Type-aware
  lint cannot resolve `exportToCanvas`'s type; headless.ts re-types it.
- e2e (`sidecar.e2e.ts`, ~8 s): per element vs the live editor canvas (zoom 2,
  other elements opacity 0): all within 1 px except arrows, allowed 2 px (yct
  `a8`, a curved arrow, is 1.5 px: editor caches linear elements on a canvas,
  export draws directly). Timings: start ~0.35 s, measure 76 elements ~0.17 s
  warm, snap 1460x900 @2x ~70 ms, measureText ~5 ms.
- Stale for the orchestrator: the "Sidecar and elkjs" section above and
  CONTEXT.md "Stubs today (task 1.3)".

### 1.7 look --around ids (2026-09-26)

- `core/look.ts` (pure, no sidecar import): `targetBox(boxes, ids)` (union,
  throws on a missing id), `pad(box, r)`, `clampScale(box, maxPx?)` (default
  caps 512x384; the acceptance), `look(boxes, ids, {r, maxPx, marks})`
  composing all three plus `marks: Record<Id, Point>` (each id's box centre
  mapped to the crop's own pixel space: `(centre - bbox origin) * scale`; no
  contract fixes that space down, see Needs). Exported from
  `@elkdraw/core/engine`. `core/tsconfig.json` `include` gained `look.ts` and
  `look.test.ts` (single files, not a directory, per the bead's `Owns:`); 1.9
  will add `place` to the same array, a trivial merge conflict.
- `backends/excalidraw/src/render/render.ts` implements `BackendAdapter.render`
  for `ExcalidrawScene`: `measure`s the scene once, unions `target` (ids) or
  uses it as-is (already a `Box`, e.g. `pad`ded by a caller), `clampScale`s
  that box, `snap`s it with **no `ids` filter** (a crop must show what the
  target collides with, not just the target). `boxes` on the result holds the
  ids' own boxes in scene coordinates; empty when `target` was a `Box`. Takes
  `RenderDeps` (`measure`/`snap`, narrowed from `Sidecar`) so `render.test.ts`
  fakes them with no browser; a real `Sidecar` satisfies `RenderDeps`
  structurally (extra optional `ids` param on `snap`), used directly in
  `render.e2e.ts`. Files live in `src/render/` (package `tsconfig.json`
  `rootDir` is `src`), same reason 1.4 gave for `src/read/`.
- `render`'s own signature (frozen by 1.0) has no `r`/`maxPx`/`marks`: a
  caller wanting a margin computes `core/look`'s `pad`ded box itself before
  calling `render(scene, thatBox)`. The acceptance's "boxes in scene coords"
  needs the ids call too, so the full `look` flow is two `render` calls:
  `render(scene, ids)` for `boxes` (tight, unpadded), then `core.look`/`pad`
  for the crop box, then `render(scene, thatBox)` for the final PNG. Wiring
  that into the `look` MCP tool's single round trip is 1.10's job.
- `render.e2e.ts` (`bun run --cwd elkdraw/backends/excalidraw test:e2e`, ~1.2 s
  warm, needs `app/dist`): the dogfood `yct` fixture, ids `["a9", "surge"]`
  (defect `yct-13`, `arrow-through-node`, `fixedInFinal: false`, so it is
  still in `scene.excalidraw`; there is no lint engine yet, task 1.5, so this
  is the fixture's ground truth id pair, not a live lint hit). Asserts the
  final crop's real PNG dimensions (`IHDR` bytes 16-23, big-endian u32; no PNG
  decode dependency) are `<= 512x384` at `r=150`, and that `core.look`'s pure
  `bbox` matches what `render` actually used.
- `clampScale` shrinks the `maxW`/`maxH` ratio by `1 - 1e-9` before taking the
  min: the app's headless `snap` sizes its canvas with `Math.round(side *
scale)`, so an exact `scale = maxPx / side` can round a side 1px over.
- A `readonly string[] | Box` union does not narrow cleanly through
  `Array.isArray`: `Box` has no index signature ruling out "also an array", so
  the narrowed type keeps a `Box & unknown[]` arm. `render.ts` uses an
  explicit `target is readonly string[]` predicate instead.
- Needs from others: `adapters/mcp/src/tools.ts`'s `look` output is
  `{path, bbox, scale, marks}` (`marks: record(Id, Point)`); the skill's
  `skill/references/cheatsheet.md` documents `{path, bbox, scale, marks,
boxes}`. `tools.ts`'s `target` grammar also allows `viewport`, absent from
  the cheatsheet. 1.10 (CLI/MCP wiring) needs to add `boxes` to the tool's
  output schema (a contract change) to carry the ids' scene-coordinate boxes
  through, and settle `viewport` one way or the other. `marks`' pixel space
  (crop-local, not scene coords) is this task's assumption, not a contract
  fact; 1.10 should confirm or correct it. A `maxPx` below the default 512x384
  cap needs 1.10 to shrink the padded box before calling `render` (or a
  contract change to give `render` a scale/cap parameter): `render` itself
  cannot take one.

### 1.5 Rendered lint, 12 rules (2026-09-26)

- `lint(scene: NeutralScene): LintHit[]` in `core/lint/lint.ts`, exported
  from `@elkdraw/core/engine` (with `labelId`). Pure, sync, no sidecar: the
  caller composes `readScene(scene, measure)` then `lint`. Every hit is
  returned; an element's `meta.allow` (customData.allow) matching the code sets
  `suppressed: why`. `core/tsconfig.json` `include` += `lint`.
- Text boxes must be ink boxes (the sidecar's `measure`). `text-wrapped`
  counts rendered lines from ink height: fires when height >
  (written lines − 1) × 1.25 × fontSize + 1.5 × fontSize (1.25 = Excalidraw's
  line height, not in NeutralScene; fontSize from `style.fontSize`). Stored
  line boxes (no measure) misfire this rule on most labels: never lint
  unmeasured scenes.
- Containers vs leaves (CONTEXT.md): no fixture uses frames, zones are dashed
  rectangles. `outside-zone` fires for native zones (`zone` field, both ways)
  and for a leaf across a container's edge; `node-overlap` is leaf-leaf
  partial overlap (> 2 px both ways; abutting cells and nesting are fine).
- Bound text has no id in NeutralScene: labels are named `<owner>#label`
  (apply's derived id); fixtures use `<owner>-label`, so 1.6 maps
  `#label` → `-label` before scoring. Allows are looked up on the owner.
- Constants (tuned on the fixtures, top of lint.ts): TOL 2, BIND_GAP 15
  (Excalidraw leaves ~8 px at ellipses), HEAD min(25, last segment / 2),
  MASK 5 (arrow label mask; counts for `label-on-border` and the arrowhead).
  Outline distance is exact for rect/diamond, sampled for ellipses.
- Calibration (scratch, not committed): sidecar `measure(scene.elements)` →
  `readScene(scene, async () => boxes)` → lint on the three fixtures: 0 hits
  in clean regions, 0 hits outside defects; open defects matched yct 11/14,
  batch 3/8, bst-first 0/2. Misses: yct-15/16, batch-12, bst-01/02 do not
  wrap in measurement (Virgil 16 px; the tests that wrap use Excalifont 20);
  batch-10/11/14/15 arrowheads only touch with the stored (wider) label
  widths the tester's editor showed; yct-12 passes 6 px from the label's ink.
- `unbound` arrow ends never fire `dangling-endpoint` (legend and bst
  pointers are clean regions); the SKILL.md table says they do.
- Apply seam (1.10): `deps.lint?(elements: Element[]) => LintHit[]` is sync
  over wire elements, but rendered boxes need the async sidecar. Either make
  the seam async (`(els) => readScene({elements: els}, m).then(lint)`), or
  run apply without `lint` and fill `reply.lints` after
  `lint(await readScene(next, m))`. `m` must measure the whole scene
  (`sidecar.measure(scene.elements)`): readScene's `MeasureText` passes only
  `{id, type, text}`, which loses the container a label wraps in.

### 1.8 Change feed and diff with lint delta (2026-09-26)

- `core/diff/diff.ts`, exported from `@elkdraw/core/engine`: `diff(A, B)` →
  `{changes, lints: {added, fixed}, delta}`; `changes(A, B)` (FeedLine minus
  author/time); `lintDelta`, `deltaText`; `feed(since, log, sceneAt)` for
  `changes --since`. `MOVE_MIN = 2` px (lint's `TOL`): smaller shifts are
  jitter. Moves are grouped by shared (dx, dy), so a zone dragged with its
  children is one line.
- Lines with a bound end are never "moved" (their points follow the
  endpoints); unbound lines move by their first point. Resizes and dragged
  waypoints have no FeedLine op and are not reported.
- Lint hits match on `code + ids`, never bbox (a moved defect is the same
  defect), as a multiset. Suppressed hits stay in `lints` but not in `delta`.
  `delta` names codes as is: `+1 node-overlap, -1 crossing`.
- `feed` diffs each run of same-author deltas end to end, stamped with the
  run's last time: a drag's many deltas become one move. Agent runs are one
  `applied` line naming the ids touched.
- `Store.sceneAt(rev)` replays from the last keyframe at or before `rev`
  (skipping the delta that shares the keyframe's rev) without touching the
  head; `Store.log(since)` lists `{rev, author, time}` per delta. On-disk
  format unchanged. Both re-read `events.jsonl` per call.
- 1.10 wiring: `sceneAt = (r) => readScene({elements: store.sceneAt(r)}, m)`;
  `changes` = `feed(since, store.log(since), sceneAt)`; `diff --from --to` =
  `diff(await sceneAt(from), await sceneAt(to))`. readScene drops
  `isDeleted`, so browser deletes show as `removed`. R2 end to end is in
  `adapters/server/src/store.test.ts`.

### 1.6 Lint validated on the dogfood fixtures (2026-09-26)

- `test/parity/lint/lint.e2e.ts` (`bun run --cwd elkdraw/test/parity
test:e2e`, ~2 s after the app build): per fixture, sidecar `measure` →
  `readScene` → `lint`, `#label` mapped to `-label`. Asserts every open,
  non-`envOnly` defect is matched, no fixed one is, no hit is in a clean
  region, and every hit matches some defect. Matched: yct 11/11, batch 3/3,
  bst-first 0/0, bst 0/0. No lint change was needed.
- Package graph: `test/parity` now depends on `@elkdraw/sidecar` (workspace,
  tsconfig reference; approved by the orchestrator). Its tsconfig includes
  `src` and `lint` (rootDir `.`).
- The 10 misses of 1.5 are all `envOnly` (new optional manifest field,
  `{reason, evidence}`, documented in `test/fixtures/README.md`; composites
  under `test/fixtures/dogfood/<name>/evidence/`). Cause: the testers'
  `mcp-excalidraw-server` stores labels as `label: {text}` (no font; checked
  read-only on the tester's server at :3010, where `document.fonts` has
  Excalifont loaded and Virgil unloaded), so its frontend painted Excalifont
  20 px; the exported files record Virgil 16 (nodes) / 14 (arrow labels). Not
  a fallback font: the fixture glyphs are Excalifont and ~1.3-1.4x larger.
  Re-measuring with bound labels forced to fontFamily 5 / fontSize 20 makes
  lint flag 9 of the 10 (yct-12, 15, 16; batch-11, 12, 14, 15; bst-01, 02),
  with no other new hits except `text-overflow` on the unstretched bst
  circles; batch-10 keeps ~13 px of line before the head in both renders.
- bst-first now has no must-flag defect: it only guards false positives, like
  bst. If a Virgil-16 wrap fixture is wanted, it has to be built for our
  renderer.

### 1.6b As-painted fixture variants (2026-09-26)

- `test/fixtures/dogfood/{yct,batch,bst-first}-painted/`: the scenes as the
  tester's browser painted them, written by `test/parity/lint/paint.ts`
  (all text fontFamily 5, bound labels 20 px; bst-first `t12`, `t10` height
  44 → 80, measured from final.png's ink). Manifests = originals minus
  `envOnly`; batch-10 gets a new `notDrawn` field (label ink to arrowhead wing
  14 px in final.png, 13 px in our snap; tip 38 px from the label box).
- `lint.e2e.ts` now runs 7 fixtures: yct-painted 14/14, batch-painted 7/7,
  bst-first-painted 2/2 must-flag matched; 0 clean-region hits, 0 unlisted
  hits, no fixed defect matched. No lint change: every defect visible in the
  painted snaps is flagged.
- Painted label boxes match final.png: batch "1 request" inks 586-673 in
  final.png and 585.5-674 in our snap.
- `test/parity/src/defects.test.ts` (not owned here) still schema-checks only
  the 4 originals; adding the painted ones needs `notDrawn` in its schema.

### 1.10 CLI and MCP wiring for Phase 1 tools (2026-09-26)

- Real now: `apply`, `add`, `validate`, `lint`, `look`, `diff`, `changes`
  (besides `status`). Bodies in `adapters/server/src/tools.ts`
  (`phase1Handlers(ctx)`), merged into `mcpTools`. The rest stay
  `NOT_IMPLEMENTED`. `ToolContext` gained `sceneAt(rev)`, `log(since)` and
  `renderer()`: one `Sidecar` per server, started on first use, retried if the
  start fails, and closed by `stop()` (`/api/shutdown`, and SIGINT/SIGTERM in
  `main.ts`). `ServerOptions.renderer` injects a fake (`tools.test.ts`).
- The server reaches `Sidecar` via a re-export from `@elkdraw/backend-excalidraw`
  (the orchestrator chose that over a server→sidecar edge).
- Two-pass apply: core `apply` is sync and conversion needs the browser. Pass 1
  runs apply with a capturing `convert`. If it was called, the handler awaits
  `sidecar.convert(...)` and runs pass 2 on the same scene snapshot. It retries
  (3 attempts) when a human delta lands during the await. Pass 1 errors are
  final only when conversion was never reached. `deps.lint` only captures the
  next scene (dryRun included). `reply.lints = lint(readScene(next, measured))`
  runs after the store write, and `reply.rev` is the store's rev.
- All Phase 1 handlers run through one serial queue: the sidecar page holds one
  scene (measure then snap), and the apply passes need a quiet store.
- `sidecar.convert(skeletons, scene)` / headless `convert`:
  `convertToExcalidrawElements` with ids kept and fonts loaded first. Arrow ends
  naming a stored element outside the batch are fed in as anchors, and come back
  as the stored element plus the new `boundElements` entry. Excalidraw's convert
  binds arrows but never moves them: they stay at the skeleton's `x`/`y` (0,0),
  and lint flags them `dangling-endpoint`. So `route()` draws each bound
  two-point arrow straight between the outlines (rect, ellipse and diamond are
  exact) with a gap of 4 px. Arrows with waypoints are left as given.
- `look` measures once and snaps once through the sidecar. Two `render` calls
  would measure twice, and `render` cannot take `maxPx`. `boxes` holds the
  target ids' rendered boxes. `marks` holds crop-pixel centres; nothing is drawn
  on the PNG. Targets are `<id>[,<id>]`, `frame:<id>` or `x,y,w,h`; `viewport`
  is gone (skill). `out` defaults to `$TMPDIR/elkdraw/<session>-look-r<rev>-<ms>.png`.
- `lint {ids}` keeps hits naming an id (or its `#label`). `scope` is
  `frame:<id>` or `near:<id>,r=<px>`, which keeps hits whose bbox meets that
  (padded) rendered box.
- `changes`: cursor in memory (starts at 0; moved by each call). Stored,
  unmeasured boxes: feed only reports moves and relabels. `diff`: from/to are
  revs (ints). `from` defaults to the rev before the last agent delta. Both
  scenes are measured. The reply is `{changes, lints, delta}`, and `changes`
  have no author or time.
- `validate`: strict schema, then placement, then references (arrow ends, frame
  `children`, patch ids). References may name an element in the input or on the
  canvas. The reply is `{ok: true, ids}`; failures are `INVALID_INPUT`. Input
  errors from REST and the CLI are now `skeletonErrors` lines (`path: message`),
  not `z.prettifyError`.
- The apply input schema is repeated in `adapters/mcp/src/tools.ts` because
  core's `ApplyInput` is engine-only. The handler parses it again with core's.
- Tests: `tools.test.ts` (fake renderer, part of `check`): CLI apply == MCP apply,
  and the full tool loop over REST. `tools.e2e.ts` (`bun run --cwd
elkdraw/adapters/server test:e2e`, ~1 s warm) runs draft → apply → lint → look
  → fix plus a no-op re-apply over MCP and REST with the real sidecar.
- `smoke-p0.ts` stub check: now `export {format: mmd}`; `lint` is asserted
  real. Gotcha: the smoke's teardown SIGTERMs `sh scripts/dev.sh`, and the
  `bun …/main.ts` under portless survived it (orphaned, ppid 1) in this run. It
  was stopped by hand. A direct SIGTERM to the server now exits cleanly,
  Chromium included.

### 1.11b Skill reconcile (2026-09-26)

- Ran every CLI example in `skill/SKILL.md`/`cheatsheet.md` against a live dev
  server. Biggest gap: only `status`, `add`, `apply`, `validate`, `lint`,
  `look`, `diff`, `changes` are real (1.10); `get`, `describe`, `query`,
  `screenshot`, `export`, `snapshot`, `clear`, `wait` still reply
  `NOT_IMPLEMENTED` (each has a CLI command and MCP tool, so they show up in
  `help` and a host's tool list). The skill previously documented all of them
  as working. Rewrote the affected rows/sections to say "not available" with
  a fallback (`scene.json` as source of truth, `look`/`lint` for rendered
  views, `apply --patches` for deletes), keeping every heading and section
  order the same as `~/.claude/skills/excalidraw-skill` (only the tool
  descriptions changed, per the 1.14 audit constraint).
- Fixed against verified server behavior: `look --marks` returns each id's
  centre in crop pixels and draws nothing on the PNG (was: "draws the ids on
  the crop"); `validate` reads the canvas to resolve references and does not
  say "no canvas access"; `diff`'s `changes` carry no `author`/`time`, the
  reply adds `delta`, and `from` defaults to the rev before the last agent
  `apply` (not "your last turn"); `dangling-endpoint` fires only on a missing
  bound target or a bound end >15px off its shape, never on an unbound end
  (verified against `core/lint/lint.ts`, matches the 1.5 log). `apply`'s
  `{elements: [], prune: true}` alone fails validation (needs a non-empty
  `elements`/`place`/`patches`), so dropped that as a "clear" workaround.
- `SURFACE.md`: fixed the tool count (16, `validate` was missing), the `apply`
  input shape (Phase 0 `.mmd`/`AstPatch` text was stale), `look`'s `boxes`
  output, `diff`'s `delta` and `from` default, and which 8 tools are still
  `NOT_IMPLEMENTED`. Left the yctimlin mapping tables' stale rows in place
  with a dated Note pointing at the real shape, rather than rewriting rows
  outside this task's scope.
- `core/skeleton/schema.ts`: `skeletonErrors`' unrecognized-key errors now add
  a fix hint for `text`/`startElementId`/`endElementId` (yctimlin's
  `mcp-excalidraw-server` field names) — `elements[0].text: unknown key; use
label.text`. A 3-entry `KNOWN_KEY_FIXES` lookup, not a general typo-fixer.
  Unit test in `schema.test.ts`.
- `skill/MAINTAINERS.md` rewritten: every row that was "waits on 1.10" and is
  now built says so; the still-stub tools and their fallback strategy are
  spelled out, with a pointer for whoever implements one next (update this
  table, then the skill's "not available" spots, then `SURFACE.md`'s stub
  list — structure stays fixed, only cell contents move).
- Not touched (outside `Owns:`): a real bug surfaced while testing —
  `apply`/`add` with a `frame` whose `children` are pre-existing ids already
  on the canvas (not created in the same call) throws `INTERNAL: Element with
<id> wasn't mapped correctly` from the sidecar's `convertToExcalidrawElements`
  call. Frames created together with their children (the skill's own example)
  work fine. Reporting under "Needs from others"; did not touch
  `adapters/server/src/tools.ts`.

### 1.10b Frame children already on the canvas (2026-09-26)

- Fixed the 1.10b bug above, at the root: `convertToExcalidrawElements` only
  resolves an id within its own input batch (`oldToNewElementIdMap`), so a
  frame skeleton's `children` entry for a stored element not in this call's
  batch threw `Element with <id> wasn't mapped correctly` — same shape of
  problem the existing arrow-anchor code already solved for `start`/`end`.
  `app/src/headless.ts`'s page-side `convert()`: generalised the anchor set
  (renamed `anchors` -> `referenced`) to also collect a frame's pre-existing
  children, feeds them into `convertToExcalidrawElements`'s batch as bare
  elements (so the id resolves and it assigns `frameId`), then merges only
  `boundElements`/`frameId` back onto the original stored element — id,
  version, everything else stays exactly as stored (checked in the new test).
  `tools.ts` and `sidecar/src/index.ts` needed no change: the bug and the fix
  are both in the converter, one layer down.
- Regression test: `sidecar/src/sidecar.e2e.ts` ("convert: a frame's children
  already on the canvas keep their id and version") calls `Sidecar.convert`
  directly with a frame naming one pre-existing rectangle (not in the
  skeleton batch) and asserts it no longer throws, and that the rectangle's
  `version`/`versionNonce` are unchanged while its `frameId` now points at the
  frame. Unit-level (no sidecar) wasn't an option: the bug is inside
  `convertToExcalidrawElements`, which only runs in the page.
- Not handled (out of scope for this bug): a frame with _only_ pre-existing
  children and no explicit `x`/`y`/`width`/`height` in its skeleton — the
  comment in `schema.ts` says `convertToExcalidrawElements` auto-sizes a frame
  from its (batch) children, which no longer include the pre-existing ones.
  Untested; give frames an explicit box when their children are all
  pre-existing.

### 1.10c Read/admin tools: get, describe, query, screenshot, snapshot, clear (2026-09-26)

- All six real now, in `phase1Handlers` (`adapters/server/src/tools.ts`),
  wired through the same `serial` queue as the rest of Phase 1. `get`,
  `describe`, `query` read the stored (unmeasured) scene via `readScene`,
  same as `changes` — no sidecar, no browser tab. `screenshot` and `clear`
  are the only two of the six that touch the sidecar/store respectively.
- `describeText(scene: NeutralScene): string` (exported, pure, unit tested
  directly): one line per element, `id: kind "label" (x,y,w,h)` (box rounded);
  a bound line with both ends resolved reads `id: from -> to "label"`
  (matches the bead's own example). Grouped by zone: loose elements first,
  then each zone's own line followed by its members indented two spaces.
  yct fixture (76 raw Excalidraw elements, 50 after folding bound labels):
  1864 bytes, well under the 4 KB acceptance.
- `describe`'s `scope` and `lint`'s `scope` shared one regex and predicate
  (`scopeMatch`, pulled out of `lintTool`) — same grammar (`all`,
  `frame:<id>`, `near:<id>,r=<px>`), but resolved against different boxes:
  rendered (`renderer.measure`) for `lint`, stored (`elementBox`, the
  element's own `box`/points-bounds/`text.box`) for `describe`.
- `query`'s `type` matches the neutral kind (`box`/`zone`/`line`/`text`) or,
  for a `box`, its `shape` (so `--type rectangle` finds Excalidraw
  rectangles, not just neutral `box`es) — yctimlin's skill examples use the
  Excalidraw type name, not the neutral one. `bbox` keeps elements whose own
  box is fully inside it (containment, not intersection, per the schema's
  "inside this box").
- `screenshot`: unions every element's measured box (`targetBox` from
  `core/look.ts`, same helper `look` uses for its target union), then
  `clampScale`, then one `renderer.snap`. An empty canvas or `format: "svg"`
  both reject `INVALID_INPUT` — the sidecar only rasters; no SVG path exists
  yet. Verified in `tools.e2e.ts` against the real sidecar's PNG IHDR
  width/height (bytes 16/20, big-endian), which the fake renderer's 4-byte
  stub can't check.
- `snapshot`: names live in an in-memory `Map<name, {rev, time}>` inside
  `phase1Handlers`'s closure, not on disk — the store's `events.jsonl` format
  is untouched, per the bead. `restore` diffs the target rev's elements
  (`ctx.sceneAt`) against the live scene and writes the delta through
  `ctx.apply("agent", upserts, deletes)`: one normal write, so it bumps the
  rev and shows up in `changes`/`diff`, same as any other agent apply. The
  one trap: `Store.apply` only accepts an upsert whose `version` is strictly
  greater than the stored one, so a restored element's version is bumped to
  `max(current, snapshot) + 1`, not written back as-is (unit test round-trips
  through `describe`'s text form, which ignores `version`). Names do not
  survive a server restart; commit `scene.json` if that matters (skill).
- `clear`: deletes every id currently in the store's scene map (which never
  holds `isDeleted` elements — the store removes deleted ids outright), in
  one `ctx.apply`. `deleted` counts raw Excalidraw elements (e.g. a labeled
  rectangle is 2: the shape and its bound text), not neutral scene elements.
- Tests: `tools.test.ts` gained a describe-fixture-size test (plus a
  dangling-zone unit test for `describeText`), a REST test for all six, a
  snapshot-restore round-trip test, and one CLI-vs-MCP identity test per
  tool. `get`/`describe`/`query`/`clear` compare replies as-is; `screenshot`
  passes the same explicit `out` to both servers so the path matches too;
  `snapshot` masks only `time` (wall-clock, so the two saves can't agree).
  `tools.e2e.ts` gained a `screenshot` step. Every CLI example in this task's
  skill edits was run against a dev server started with an isolated
  `ELKDRAW_DATA_DIR` (a scratch `mktemp -d`), then stopped with
  `POST /api/shutdown` (not a `dev.sh` SIGTERM — 1.10's log has the orphan
  gotcha for that path).
- `SURFACE.md`, `skill/SKILL.md`, `skill/references/cheatsheet.md` and
  `skill/MAINTAINERS.md` updated: only `export` (Phase 2 Mermaid) and `wait`
  are still `NOT_IMPLEMENTED`. Headings/structure unchanged in both skill
  files (checked with `grep '^#'` before/after against
  `~/.claude/skills/excalidraw-skill`).
- Needs from others: none. Nothing found outside `Owns:`.

### 1.12 Phase 1 eval (2026-09-26)

- Report: `eval/phase-1/phase-1.md`. Both tasks fail the §17.4 bar. On
  ride-hailing, calls and tokens are flat against the dogfood (35 calls,
  59969 tokens). On BST they are 3.5x and 2.5x. Lint errors left: 0 on both.
  Missed defects: 1 on each. Recommendation: go for Phase 2, after four
  Phase 1 bugs are fixed first (place-only apply wipes the element; partial
  upsert resets it; bound arrows don't re-route on move; frames clip
  cross-zone arrows).
- Gotcha: managed settings on this machine set
  `allowManagedPermissionRulesOnly`, so `claude -p --allowedTools` rules are
  ignored and even `Bash(bun:*)` gets denied. The allowlist therefore lives
  in `eval/src/gate.ts`, a PreToolUse hook that `live()` installs through
  `--settings`. `live()` also passes `--setting-sources project,local` and
  `--strict-mcp-config`. `--allowed-tools RULE` (repeatable) replaces the
  default `ELKDRAW_TOOLS`. Denials: `transcript.ts` `denials`, and the
  markdown row gained a column.
- `live()` resolves cwd with realpath: `/tmp` is `/private/tmp`, and the
  transcript dir follows the real path. It saves `<cwd>.result.json`.
- Setup: `eval/phase-1/setup.sh <task> <port>`. The server's `TMPDIR` must
  sit inside the scratch cwd, or the tester cannot Read the look and
  screenshot PNGs. `export` is still `NOT_IMPLEMENTED`, so final scenes come
  from `query --limit 1000`.
- Whole-canvas `screenshot` crops the bottom of the scene (the legend's
  bottom edge on ride-hailing); `look` does not.
- 4c0.11: a fresh Opus given only the skill finished the ride-hailing draft
  and both edits. Skill findings:
  - The CLI path is relative to the repo root.
  - The `/tmp/scene.json` example sits outside a sandboxed cwd.
  - It claims arrows re-route on move, which they don't.
  - It says `clear` is both unimplemented and available.
  - Its 120 px gap advice still gets `label-on-own-arrowhead` at 140 px.

### 1.15 Apply patches, not replaces (2026-09-26)

- Root cause of p1rh-05 and p1rh-06: the converter fills every field a
  skeleton leaves out with Excalidraw defaults (100x100, `#1e1e1e`, solid,
  default points), and `run()` replaced the stored element with that output.
  A place op on a canvas-only id built a bare `{type,id,x,y}` skeleton; the
  "stored label whose container was re-sent without it is gone" rule then
  dropped `pricing#label`.
- Fix, one helper used at both entry points: `core/place/stored.ts`.
  `fromStored(el, scene)` rebuilds a skeleton from a stored wire element. It
  keeps each field only if the type's skeleton schema accepts it, so no
  wire-only field leaks into convert. It rebuilds `label` from the live
  `<id>#label` text, `start`/`end` from bindings to live ids, and a frame's
  `children` from live `frameId`s. `mergeStored(given, el, scene)` puts the
  given fields over that; `label` merges one level deep and `customData`
  is replaced whole when given. A type change still replaces the element.
  `apply.run` merges every skeleton with a live id _after_ `deps.place`, so
  an asset op's regenerated cells (new label, size) beat the stored copy.
  `place`'s `boxOf` falls back to the stored width/height when a given
  skeleton omits them, so a partial upsert is placed by its real size. `place`'s canvas-only
  fallback now uses `fromStored` plus the new x/y (text is movable now; it
  used to fail with "unknown id").
- Deliberate limits (`ponytail:` in code):
  - A bound arrow's stored points are not backfilled. The router redraws
    it between its ends, so waypoints on a bound arrow re-sent without
    `points` are lost.
  - Text `width`/`height` are backfilled only when `autoResize: false`.
  - `place` on a canvas-only frame is refused with a clear error. Moving a
    frame leaves its children behind, and the converter throws
    `Bound element with id <child>#label doesn't exist` when a frame's
    stored children carry labels (`app/src/headless.ts` anchor path from
    1.10b). A full frame re-send with labelled stored children hits the
    same bug on the base.
- Removing a label: send a delete patch on `<id>#label`. Re-sending the
  container without `label` now keeps it. A later partial upsert does not
  bring a deleted label back (tested). `place` ignores deleted elements as
  anchors now.
- Tests: `apply.test.ts` "p1rh-05 …" and "p1rh-06 …" replay the
  transcript's inputs (line 87 seed; lines 107, 120 and 151) through a fake
  converter that fills Excalidraw's defaults. Both failed before the fix.
  More tests cover an asset op re-run with a style override on a cell, a
  partial upsert combined with a place op, and deleting a label.
  They were also replayed through the CLI against the real sidecar on the
  dev server: size, stroke, dash, font and label all survived.
- Not in scope: `s4`/`s5` still lint `dangling-endpoint` after Pricing
  moves, because bound arrows do not re-route (1.16).

### 1.16 Bound arrows follow a moved box (2026-09-26)

- Fix in the page-side `convert()` (`app/src/headless.ts`) only; core apply
  and `adapters/server/src/tools.ts` needed no change. After converting the
  batch, `convert` compares each batch element's converted x/y/width/height/
  type with the stored copy. For every one that moved or resized, it returns
  each stored (non-deleted, not-in-batch) arrow or line bound to it,
  re-routed. Core apply already treats any produced element with a live id as
  an update (version +1, seed and z-order kept, unchanged ones dropped), so
  those arrows land in the store and count in the reply's `updated`. Apply
  (partial upsert) and place both reach `convert`, so both paths are covered.
- Routing: two-point arrows are redrawn straight outline to outline, as
  `route()` does for batch arrows (focus 0, gap 4; the unmoved end slides
  along its own outline). Arrows with waypoints keep every waypoint; only the
  end bound to the moved shape moves, onto its outline along the line from the
  neighbouring waypoint to the shape's centre. The end on a box that did not
  move stays exactly put.
- Origin is not checked: human-drawn bound arrows follow too (binding means
  "follow"). Arrows bound only to boxes that did not move are never touched,
  so a relabel or a no-op re-send does not straighten a human's arrow.
- `ponytail:` elbow arrows lose their right angles when an end moves.
- Test: `adapters/server/src/tools.e2e.ts` "bound arrows follow a box moved
  by apply or place" replays p1rh-07 (trip -> pricing -> matching, s4/s5)
  plus a waypoint arrow w1: move pricing by partial upsert, then by
  `rightOf`; each reply has `updated: 4`, no `dangling-endpoint` on s4/s5/w1,
  every bound end within 5 px outside pricing's new outline, w1's waypoint
  unchanged. It fails on the base (`updated` 1). `skill/SKILL.md:49` ("follow
  them when they move") is now true for apply and place; no wording change.

### 1.19 Lint gaps from the Phase 1 eval (2026-09-26)

- Fixtures: `test/fixtures/eval-p1/{rh-r1,rh-r2,rh-r4,rh-r8,rh-r9,bst-r1}`,
  the eval scenes at the revs each by-eye defect was drawn, rebuilt with
  `Store.sceneAt(rev)` from the runs' `events.jsonl` (provenance in its
  README). `lint.e2e.ts` runs them after the 7 dogfood fixtures: 13 green.
  New manifest field `wontFix: {reason}`, out of the must-flag set.
- Per gap:
  - Ellipse `text-wrapped` (p1rh-03): not ellipse-specific. `readScene` read
    Excalidraw's `text`, which is the wrapped copy; now it reads
    `originalText || text` (`backends/excalidraw/src/read/read.ts`, approved
    by the orchestrator). The existing rule then fires. `describe`/diff now
    see the written text too.
  - A line under another arrow's label (p1rh-04): the notif-apns line clears
    the "7 GEOSEARCH" ink by 12.5 px, so there is no overlap. `arrow-through-label`
    now grows arrow labels (not free text) by `NEAR` = 0.75 × fontSize.
    Calibration: 12.5 px (20 px font) and yct-12 at 6.1 px (14 px) flagged;
    the closest clean one is s9's label vs a-trip at 19.9 px (limit 15).
    Free texts stay on the ink box: the legend and pointer texts sit 15-20 px
    from their lines.
  - Reset to defaults (p1rh-05): the painted part is flagged. The legend
    box reset to 100x100 had its unbound swatch arrow start 50 px inside and
    cross the border. `arrow-through-node` now skips a shape only when an end
    is on its outline (gap in (-BIND_GAP, TOL)), not anywhere inside. The
    lost colours and dash are won't-fix: that is apply's partial-upsert bug.
  - Lost label (p1rh-06): new `unlabelled-node`. A leaf with no label and no
    free text inside it, with at least one arrow bound to it. Legend swatches
    have no arrows.
  - Arrowhead pile-up (p1rh-10): new `arrowhead-overlap`. Two lines with the
    same `to` whose last points are < HEAD (25 px) apart; ids
    `[a, b, target]`. It also fires on yct `e-trip`/`e-surge` into Kafka.
    That pile-up is drawn in yct final.png but missing from the manifest, so
    `lint.e2e.ts` adds it as `EXTRA` yct-17 until the manifest owner adds it.
  - textAlign drift (p1bst-01): won't-fix in lint. Apply's convert stores
    `{x: 84, width: 32, textAlign: "center"}` as width 9.3 centred on x 84.
    The stored scene matches the pixels, so the lost width cannot be seen.
    p1bst-02 (roughness doubles a line) is won't-fix too.
- Contract: `LintCode` += `unlabelled-node`, `arrowhead-overlap`; schemas
  regenerated; CONTRACTS.md changelog; SKILL.md table has 2 new rows and 2
  changed ones. Stale elsewhere (not owned): CONTEXT.md "twelve lint codes"
  and skill/MAINTAINERS.md "12 codes".

### 1.17 Frames: cross-zone arrows, frame re-send, place on a frame (2026-09-26)

- Root cause of p1rh-01: `convertToExcalidrawElements`'s frame step sets
  `frameId` on the child and on every entry of its `boundElements`: its label
  and every arrow bound to it, cross-zone ones included. Excalidraw clips
  frame children to the frame. Fix in page-side `convert()`
  (`app/src/headless.ts`, `framed()`): after conversion, a bound arrow/line is
  in a frame only when both ends are bound and share that frame (else
  `frameId: null`); a label takes its container's frame. It covers the batch
  and stored arrows/labels bound to a batch element; stored ones whose frame
  changed come back as updates (so a stale clipped arrow heals on re-send).
  Unbound arrows keep what they were given.
- Re-send crash (`Bound element with id <child>#label doesn't exist`): the same
  frame step walks a stored child's `boundElements`, which name elements not in
  the batch. Stored elements fed in as references now carry only in-input
  `boundElements`; the merge restores the stored list.
- `core/place/stored.ts` `fromStored(frame).children` no longer lists bound
  text or bound arrows (they follow their container / ends).
- `place` on a canvas-only frame: the refusal from 1.15 is gone. The frame
  moves and every canvas-only child moves by the same delta (children given in
  the same apply keep their own position). Bound arrows follow via 1.16.
- `outside-zone` hints (`core/lint/lint.ts`) now say which element is outside
  which zone and the fix: for a line clipped to a zone, the end that is outside
  it ("re-send it; an arrow joins a frame only when both its ends are inside");
  for a box/text, move it inside, grow the zone or drop it from children.
- Tests: `sidecar.e2e.ts` "convert: a cross-frame arrow is no frame's child and
  draws unclipped" (frameIds, ink in the gap between frames, then a frame
  re-send with labelled stored children; PNG at
  `sidecar/test-results/cross-frame-arrow.png`); `tools.e2e.ts` "frames:
  cross-zone arrows stay unclipped; frames re-send and move"; `lint.test.ts`
  outside-zone hint. The sidecar test fails on the base (`frameId` "fb").
- Found, not fixed: (1) Excalidraw's converter uses `frame.x || minX`, so a
  frame given `x: 0` (or `y: 0`) is re-placed at its children's bounds minus 10. (2) `snap` of a scene with frames draws ~20 px low: its origin is
  `getCommonBounds(roots)`, but export also makes room for the frame name
  above the frame. Crops of frames in `look` may be offset by that much.

### 1.20 Convert: centred/right text drifts from its requested box (2026-09-26)

- Root cause of p1bst-01 (won't-fix in lint, 1.19): traced into
  `@excalidraw/excalidraw`'s bundled `newTextElement` (called by
  `convertToExcalidrawElements`'s `text` case): it always sizes width/height
  from the _measured_ text, ignoring a skeleton's given `width` entirely, and
  for `textAlign: "center"/"right"` it treats the skeleton's `x` as the anchor
  for that measured width (`x: opts.x - metrics.width/2` for centre), not as
  the left edge of a requested box. `{x:84, width:32, textAlign:"center",
text:"0"}` lands at x 79.35, width 9.30 (centred on x=84, not on the box's
  centre, 100) — the exact numbers in the bead. `textAlign:"left"` has no
  anchor offset, so it was already correct.
- Fix in page-side `convert()` (`app/src/headless.ts`, `boxDelta()`, called
  from the `merged` step before `byId`/`route`/the moved-arrow check so those
  see the corrected position): for a free text skeleton with a `width` and
  `textAlign` "center" or "right", recompute `x` from the requested box
  (`s.x`, `s.width`) and the real converted width — `s.x + (s.width -
el.width)/2` for centre, `s.x + s.width - el.width` for right. The element's
  own `width` is left as Excalidraw measured it (not forced to the request):
  the fix is a pure function of (requested box, textAlign, measured width)
  recomputed on every `convert()` call, so it stays correct across a relabel
  (new text) or a moved box (new x) with no extra state to keep in sync.
  Considered forcing `width` to the request with `autoResize: false` instead
  (bead's other option): rejected — `newTextElement` ignores `opts.width` even
  for that at creation time (autoResize only pins width on a later in-editor
  retype), so it would need the text to actually re-wrap into the fixed width,
  which free (unbound) text doesn't do; the shift is the smaller, correct fix.
- Frame `x`/`y` of 0 (1.17 "found, not fixed"): `frame.x || minX` in the same
  bundled converter folds an explicit 0 into "not given" and refits the frame
  to its children. Same `boxDelta()`, other branch: a frame skeleton's
  explicit `x`/`y` (`!== undefined`, so 0 counts) is restored after
  conversion. No fixture had a frame in this bug; covered by a small synthetic
  test instead.
- Test: `app/src/headless.e2e.ts` (new; `test:e2e` now runs it alongside
  `canvas.e2e.ts`), built app + headless Chromium, `window.elkdraw.convert`
  called directly (no Sidecar wrapper: that package is owned by another
  task). One test reads the bst eval's first `Write` straight out of
  `eval/phase-1/bst/transcript.jsonl` (not duplicated by hand) and asserts
  `i0`/`i7`/`i14`/`t-lo`/`t-hi` centre in their requested box, plus a crop
  snap at `app/test-results/bst-r1-array-crop.png` (by eye: matches
  `test/fixtures/eval-p1/bst-r1/look.png`'s array row). Two more cover a
  right-aligned box and a frame given `x:0,y:0`. All three fail on the base
  (verified: `84` vs the expected `100`, frame `x:10` vs `0`, `100` vs the
  expected right edge `150`).
