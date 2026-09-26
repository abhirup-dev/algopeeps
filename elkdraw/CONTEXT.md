# ELK draw glossary

One meaning per term: the current one from `canvas/docs/agent-layer-design.md`
(later sections win; §§14–19 are authoritative). "(phase N)" = not built yet.
Add a term when you introduce one; fix it here when the design changes it.

## Product and surfaces

- **ELK draw / elkdraw** — The product: an MCP server plus CLI that opens a
  local Excalidraw canvas laid out by ELK. `elkdraw/` is its Bun workspace.
- **Tool** — One MCP tool (`add`, `apply`, `lint`, `look`, `diff`, ...); one
  zod schema each in `adapters/mcp/src/tools.ts` drives MCP, REST and CLI.
  Verbs follow yctimlin's `mcp-excalidraw-server` so both run side by side.
- **Server / session / rev** — One Bun process (`adapters/server`) serves the
  app, `/ws` sync (`hello`, `snapshot`, `delta`, `ack`), REST and `/mcp`. A
  session is one canvas; `rev` is its scene revision.
- **Store / event log** — `adapters/server/src/store.ts`: last-writer-wins by
  element `version`, per-session `events.jsonl` with keyframes.
  `sceneAt(rev)` replays to any rev (phase 1, task 1.8).
- **Branch URL / portless** — Each worktree serves at
  `https://<branch-tail>.elkdraw.localhost:1355` (last branch segment, dots
  as dashes). Without portless: `http://127.0.0.1:3940`.

## Model and IR

- **IR** — One ELK-shaped tree with a typed meta bag, in two phases, `Graph`
  and `LaidGraph` (`core/src/contracts/ir.ts`).
- **Graph** — The tree as compiled from text: ids, meta, sizes, no positions.
  Zones are compound nodes; hyperedges are rejected.
- **LaidGraph** — The same tree after layout, with `x`, `y`, edge `sections`;
  child coordinates are parent-relative, as ELK returns them.
- **Meta bag** — Strict `meta` on every tree object (`NodeMeta`, `EdgeMeta`,
  `ElementMeta`): `origin`, `gen`, `style`, `allow`, `roles`, `shape`, `pin`,
  `family`, `kind`. Backends store it opaquely (Excalidraw: `customData`).
- **semantic() view** — The tree with `x`, `y`, `width`, `height`,
  `sections`, `layoutOptions` masked so a layout is never a change; also masks
  `meta.gen`, `meta.pin` (phase 2, task 2.0). Type `Semantic`.
- **Presentation** — What the tree cannot hold: freeform elements, anchors,
  style overrides, keyed by model id (phase 2, task 2.0).
- **Zone / role** — A zone is a Mermaid `subgraph`: compound node in the tree,
  frame in Excalidraw. A role is a Mermaid class (`:::svc`) in `meta.roles`.
- **Origin** — `generated | raw | human`. Generated = compiled from text; raw
  = ejected, never regenerated; human = drawn by hand.
- **Derived origin** — Generated only if the element's id equals the id core
  derives from its meta, else human (paste copies meta). Core, not adapters.
- **Derived id** — Node = Mermaid id (`trip`); edge = explicit `e1@`, else
  `from->to[#n]` in source order; label `<id>#label`; port `<id>@port`;
  included `alias:id`. Human ids stay random, shown as `h1…hN` in text only.
- **Skeleton** — Excalidraw's `ExcalidrawElementSkeleton`, the `add` tool's
  input; schema loose until phase 1.

## Layout

- **Families (graph vs axis)** — Graph families (flowchart, class, state, ER,
  requirement, mindmap, kanban) take the ELK path via Mermaid `getData()`.
  Axis families (sequence, gantt, timeline) get a family layouter, no ELK
  (phase 4). `Family`; lint rules gate on `meta.family`.
- **Placer** — Two modes. No soft pins: take ELK interactive coordinates
  wholesale. Soft pins: take ELK's order only; kept nodes keep canvas xy, a
  new node fills the gap between layer neighbours, a deficit pushes
  downstream nodes along the flow axis (`moved[]`). `relayout: true` = first
  mode, pins cleared (phase 2).
- **Routing** — ELK `sections` when ELK chose coordinates; after a placer
  apply, touched edges become straight bound arrows (phase 2); libavoid
  reroutes them (phase 4).

## Merge and lift

- **Field groups / gen hashes** — `geom`, `style`, `text`; `meta.gen` holds
  each group's hash as last compiled, the merge base (`Gen`, `FieldGroup`).
- **Three-way merge** — Per group, canvas vs `gen` vs new: only new differs →
  write; only canvas differs → keep, `override`; both → keep, `conflict`
  (`force` writes) (phase 2).
- **Soft / hard pin** — `Pin {kind, at}`, absolute. Soft = a human drag, kept
  until `relayout` or another drag; hard = `@pin` in text.
- **Prune** — Generated ids the text no longer declares are deleted inside
  the prune scope (default: the diagram), else reported.
- **Tombstone** — `@tombstone`: stops an included or instanced element from
  being recreated. Ordinary deletes just remove the line (phase 5).
- **Eject** — `@eject <id>`: stops generating the element; it keeps geometry
  and style, stays bound, origin becomes raw.
- **Adopt** — Promotes a human element into the text with a stable id, using
  `customData.copiedFrom` when present (phase 3).
- **Freeform** — Human shapes, text or freedraw bound to nothing: stay in the
  scene, linted, may be anchored or adopted.
- **Meaning vs presentation** — Text and bindings are meaning (`.mmd`);
  geometry and style are presentation (`.excalidraw`). Axis-family lift maps
  are the one inversion: a snapped drag is meaning there.
- **Lift** — On a human save, diff the scene against the last compile via
  `gen` into `AstPatch[]`. Label edits, bound arrows and deletes auto-lift to
  `.mmd` (coalesced, one feed line each); moves become soft pins (phase 3).
- **AstPatch ops** — `create | set | reconnect | delete | rename | move`
  (d2oracle's vocabulary, `patch.ts`). `set` never changes an id; `rename`
  comes only from the agent or the text.
- **Minimal-edit vs canonical printer** — Minimal-edit applies lifts touching
  only changed lines, keeping order and comments. Canonical (sorted,
  byte-stable) is only for `export` and diff (phase 3).
- **Directives** — `%%` lines stock Mermaid ignores: `@pin`, `@labelAt`,
  `@allow`, `@eject`, `@tombstone`, `@include`, `@note` (phase 2+).
- **Two-file persistence** — `ride.mmd` = meaning; `ride.excalidraw` = full
  scene, `{mmdHash, compiledAt, rev}` in `appState.customData` (phase 3).
- **Proposal** — A comment thread carrying a patch (`Thread.proposal`,
  canvas CONTRACT v1.5); accept applies and resolves (phase 3).

## Checks and lint

- **Validate** — Pure, no browser: Mermaid syntax, directive targets,
  references, `@include`, hyperedges, with line and column. Phase 1:
  strict skeleton validation.
- **Rendered lint** — Rules on measured boxes and routed points (what drew),
  never stored geometry (phase 1, task 1.5).
- **LintHit** — `{code, ids, bbox, severity: error | info, hint,
suppressed?}` in `lint.ts`. The §17.4 bar counts errors only.
- **Allow / suppression** — `Allow {rule, why}` on one element (`@allow`,
  skeleton `allow` → `meta.allow`). Suppressed hits are returned with the
  reason, never dropped; no global or wildcard allow.
- **Lint codes** — `text-overflow`, `text-wrapped`, `label-on-node`,
  `label-on-label`, `label-on-border`, `arrow-through-node`, `node-overlap`,
  `dangling-endpoint`, `outside-zone`, `crossing` (info),
  `arrow-through-label`, `label-on-own-arrowhead`, `unlabelled-node`,
  `arrowhead-overlap` (14 total).
- **`unlabelled-node`** — A leaf with no label and no free text inside it,
  with at least one arrow bound to it.
- **`arrowhead-overlap`** — Two arrows into the same target whose last
  points sit under `HEAD` (25 px) apart; ids `[a, b, target]`.
- **Container / leaf** — Lint's split of boxes: a container is a zone or a
  box that fully holds another box (dashed zone rectangles, a legend); the
  rest are leaves (nodes). Labels on leaves are `label-on-node`, across a
  container's edge `label-on-border`; arrows pass through containers freely.

## Diff and feed

- **FeedLine** — `{author: human|agent, time, op, ids, detail?}`
  (`reply.ts`). `op`: `added`, `removed`, `moved`, `relabelled`, `restyled`,
  `reconnected`, `applied`; `detail`: `oldLabel`/`newLabel`, `dx`/`dy`.
- **Feed / changes** — Short feed lines the agent reads instead of scene
  JSON; the `changes` tool returns them since a rev.
- **Low-level diff** — Scene vs scene at two revs (`sceneAt`): moves, adds,
  restyles, plus the lint delta `{added, fixed}` (phase 1).
- **Semantic diff** — Change records over `semantic()` of two versions, both
  compiled with pure layout so it is deterministic (phase 3, task 3.0).
- **ApplyReply** — The whole `apply` reply, never elements: `rev`, `created`,
  `updated`, `kept`, `deleted`, `overrides`, `conflicts`, `moved`, `lints`,
  `measured`. Phase 1 fills merge fields with `[]`.

## Backends

- **BackendAdapter** — The seam: `emit`, `read?`, `measure`, `render?`,
  `serialise` (`backend.ts`). Core never imports a backend. `read` is
  async so it can reach the sidecar.
- **Capabilities** — A backend's limits: `nesting`, `bindings`, `opaqueMeta`,
  `edgeLabels`, `readBack`, `shapes`, `freeform`.
- **NeutralScene** — What `read` returns and lint, diff, lift consume: box,
  zone, line and text elements, absolute coordinates, rendered text boxes,
  raw opaque meta.
- **Fake backend** — `backends/fake`: in-memory, `nesting: deep`,
  `bindings: none`; takes branches Excalidraw never does, so CI keeps core
  neutral. Excalidraw is the one real backend; draw.io is phase 5.
- **core vs core/engine entry** — `@elkdraw/core` exports contracts and zod
  helpers only; engine code goes in `@elkdraw/core/engine`, banned from
  `app`, `adapters/mcp`, `adapters/cli` (lint-enforced; `core/src/engine/index.ts`, §19.1 B4).

## Perception and sidecar

- **Sidecar** — `sidecar/`: headless Chromium on the app bundle, behind the
  Excalidraw backend's `measure` and `render`. Real since task 1.3: rendered
  boxes via per-element export, text sizes cached by (font, size, text, width).
- **Measure** — Text sizes in the backend's font (`MeasureRequest` →
  `Size`), behind a cache keyed by font family, size, text and wrap width.
  `measured: false` marks fallback sizes.
- **Snap / look** — `snap(bbox, scale)` is the sidecar's PNG crop. `look` is
  the tool: a crop around ids with marks and rendered boxes, called on lint
  hits. `screenshot` is the full canvas.

## Collaboration (phase 1.5)

- **Thread** — A comment anchored to element ids; the agent reads, replies,
  resolves. Ported from canvas CONTRACT v1.4 §11–12 (task 1.5.0).
- **Review wait / presence / checkpoints** — `wait --for review` blocks on a
  human review request; a presence pointer; turn checkpoints with undo.

## Process and eval

- **Phase** — Build unit (§18): 0 scaffold, 1 skeleton+, 1.5 collaboration,
  2 Mermaid + ELK, 3 lift, 4 families, 5 composition; each ends in an eval.
- **Skeleton+** — Phase 1: Excalidraw-native, no Mermaid or ELK. Skeleton
  input, terse replies, sidecar, rendered lint, `look`, feed, low-level diff,
  row/column/grid placement helpers.
- **Bead / lane / Owns** — A bead is one `bd` task; its `lane:` label
  (`core`, `app`, `test`, ...) names the area, `Owns:` the paths it may touch.
- **Contracts task (N.0)** — The one task per phase allowed to change
  `core/src/contracts/` (1.0, 1.5.0, 2.0, 3.0, 4.0); logs to `CONTRACTS.md`.
- **Parity harness** — `test/parity`: fixture parsing, manifest schema,
  snapshots, fake-backend runs; snapshots change only via an update script.
- **Fixtures / defect manifest** — `test/fixtures`: dogfood scenes, task
  `.mmd`s, Mermaid samples. `defects.json` lists each defect's rule (or
  `ruleGap`), ids, `fixedInFinal`. BST has none yet (task 1.13).
- **Clean region** — Manifest ids where any lint hit is a false positive.
- **Baseline** — Dogfood reference per task in `eval/baseline.json` (best
  per measure across the two testers).
- **Eval bar (§17.4)** — Per task: calls ≤ ⅓ and tokens ≤ ⅕ of baseline, 0
  unfixed lint errors, 0 missed defects (BST ≤ 1). `eval/src/bar.ts`.
- **Go / no-go** — Verdict `go | no-go | incomplete`. The first no-go buys
  one scoped fix cycle and a re-run; a second stops the layer.

## Don't say

| Don't say                        | Say                                |
| -------------------------------- | ---------------------------------- |
| `cv` (CLI), `canvas_apply`       | `elkdraw` CLI, `apply` tool        |
| spec, `spec.json`, JSON spec     | `.mmd` text, `Graph`               |
| `Model` / `Layout` types         | `Graph` / `LaidGraph`              |
| path ids (`ride/core/trip`)      | flat derived ids (`trip`)          |
| m2e path, mermaid-to-excalidraw  | ELK path (m2e dropped, §17.2)      |
| ELK keeps canvas positions       | ELK keeps order; placer keeps xy   |
| tombstone on every delete        | delete removes the line            |
| `@raw`, `@id`, `shape` directive | freeform, `e1@` id, `@{ shape }`   |
| advance-width table              | measurement cache                  |
| `customData.origin` as truth     | derived origin                     |
| relative pins (`rightOf`)        | absolute `pin {kind, at}`          |
| ten lint rules                   | 14 lint codes                      |
| `skipped` in the reply           | `kept`                             |
| steps 0–8                        | phases 0–5                         |
| elkjs in a Node subprocess       | in-process Bun Web Worker          |
| `@elkdraw/engine` package        | `@elkdraw/core/engine` entry       |
| lane, meaning a swimlane         | swimlane (`lane:` is a bead label) |
