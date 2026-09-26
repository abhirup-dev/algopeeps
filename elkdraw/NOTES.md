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
