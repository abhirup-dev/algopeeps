# ELK draw: beads spec for Phases 1, 1.5, 2, 3, 4, 5

Source: canvas/docs/agent-layer-design.md §§1–18. Product: ELK draw (`elkdraw/`), separate from
the algopeeps canvas and from yctimlin's mcp-excalidraw-server; runs side by side. Every task
description below must be created verbatim in structure: Goal / Owns / Acceptance / Parallel.
Priorities: P1 for phases 1, 1.5, 2; P2 for 3, 4, 5. Labels: `elkdraw`, `phase:<n>`, and one
`lane:*` label per task. Phase 0 epic title: "ELK draw Phase 0: scaffolding" (created by the
other session; cross-phase deps reference its tasks by searching their titles, else the epic).

Lanes: lane:core, lane:backend-excalidraw, lane:app, lane:cli-mcp, lane:eval, lane:docs, lane:test.

---

## Epic P1: "ELK draw Phase 1: skeleton+ (Excalidraw-native, no Mermaid/ELK)"  [P1]
Goals: the agent writes Excalidraw skeleton (text on shapes, bound arrows, semantic ids) through a
strict, terse surface; rendered lint and crops replace full screenshots; a change feed and diff
exist. Gain expected: fewer tool calls and tokens than the dogfood baseline from terse replies,
lint with hints, and id crops; this phase sets the measured baseline for Phase 2.
Exit: eval run on the two dogfood tasks (ride-hailing with insert+move; dense BST) with the dogfood
prompts; gains recorded vs the dogfood; every defect listed in the dogfood reports flagged by lint.
Acceptance: `bun run check` green; parity fixtures pass; eval report committed under eval/.

Tasks:
1.1 Skeleton input schema and strict validate
  Goal: zod-strict schema for ExcalidrawElementSkeleton input (unknown keys rejected, path-precise errors, semantic ids required, `allow:[{rule,why}]` accepted).
  Owns: elkdraw/core/skeleton/**
  Acceptance: 20-line negative fixture rejected with path per error; the two dogfood scenes validate.
  Parallel: can run alongside 1.3, 1.4, 1.9, 1.11; blocked by Phase 0 types.
  lane:core
1.2 Apply for skeleton: id-stable upsert with terse reply
  Goal: upsert by id, ifRev, dryRun, prune scope; reply = {rev, created, updated, deleted, lints, skipped}; never echoes elements.
  Owns: elkdraw/core/apply/**
  Acceptance: re-applying the same input is a no-op; reply under 300 bytes for a clean apply; dryRun writes nothing.
  Parallel: alongside 1.3, 1.4; blocked by 1.1.
  lane:core
1.3 Sidecar: measure and snap
  Goal: Playwright page on the app bundle exposing measure(elements)->rendered boxes and snap(bbox, scale, ids?)->png; measurement cache keyed (backend, font, size, text, width).
  Owns: elkdraw/backends/excalidraw/sidecar/**
  Acceptance: boxes within 1 px of a screenshot for the two fixtures; snap of a bbox equals its crop; cache hit skips the browser.
  Parallel: alongside 1.1, 1.4, 1.9; blocked by Phase 0 app shell.
  lane:backend-excalidraw
1.4 Neutral scene read: boxes and segments
  Goal: read(scene) -> NeutralScene (id, box, text, style, bindings, zone, raw meta) per Phase 0 type; the only input lint and diff consume.
  Owns: elkdraw/backends/excalidraw/read/**
  Acceptance: both dogfood scenes read to a NeutralScene snapshot; bound text folded into its container entry.
  Parallel: alongside 1.1, 1.3; blocked by Phase 0 types.
  lane:backend-excalidraw
1.5 Rendered lint, 10 rules
  Goal: text-overflow, text-wrapped, label-on-node, label-on-label, label-on-border, arrow-through-node, node-overlap, dangling-endpoint, outside-zone, crossing(info); each hit {code, ids, bbox, hint}; suppression via allow {rule, why} on the element, returned under `suppressed`.
  Owns: elkdraw/core/lint/**
  Acceptance: runs on NeutralScene + measured boxes only; unit test per rule.
  Parallel: alongside 1.7, 1.9; blocked by 1.3, 1.4.
  lane:core
1.6 Lint validated on the dogfood fixtures
  Goal: parity test: every defect listed in dogfood-excalidraw-yctimlin.md and dogfood-excalidraw-batch.md is flagged on the .artifacts/dogfood scenes; no false positives on clean regions.
  Owns: elkdraw/test/parity/lint/**
  Acceptance: the defect list is encoded as expectations and passes.
  Parallel: alongside 1.7, 1.8; blocked by 1.5.
  lane:test
1.7 look --around ids
  Goal: look {ids|bbox, r, scale, marks?} -> png path/bytes + rendered boxes for the ids; no full-canvas default.
  Owns: elkdraw/backends/excalidraw/render/**, elkdraw/core/look.ts
  Acceptance: crop around one lint hit at r=150 is ≤ 512×384; boxes returned in scene coords.
  Parallel: alongside 1.5, 1.8; blocked by 1.3.
  lane:backend-excalidraw
1.8 Change feed and diff with lint delta
  Goal: changes --since rev as compact lines with author and time; diff A B over NeutralScene: added/removed/moved/relabelled + lint delta ("+2 crossings, -1 label collision").
  Owns: elkdraw/core/diff/**
  Acceptance: the R2 collaboration round (moved Kafka, deleted arrow, added note) is reported in three lines; lint delta correct on a fixture pair.
  Parallel: alongside 1.7, 1.9; blocked by 1.2, 1.5.
  lane:core
1.9 Placement helpers: row, column, grid, assets
  Goal: placement ops (row/column/grid with gap, rightOf/below relative placement) and the algopeeps asset generators (array, linked list, tree, stack frames, table, hash map) ported as skeleton producers.
  Owns: elkdraw/core/place/**
  Acceptance: the BST+array fixture is reproducible from placement ops in under 15 ops; assets validate under 1.1.
  Parallel: alongside everything in Phase 1; blocked by 1.1.
  lane:core
1.10 CLI and MCP wiring for Phase 1 tools
  Goal: validate, apply, lint, look, diff, changes exposed in the CLI and the MCP server on the Phase 0 shell, with the yctimlin-compatible names as aliases.
  Owns: elkdraw/adapters/cli/**, elkdraw/adapters/mcp/**
  Acceptance: `cv apply` and the MCP tool return identical replies for the same input; pi via pi-mcp-adapter completes draft -> lint -> look -> fix without reading elements.
  Parallel: alongside 1.11; blocked by 1.2, 1.5, 1.7, 1.8.
  lane:cli-mcp
1.11 Agent guide and skill
  Goal: SKILL.md + guide tool text: the loop (write -> apply -> lint -> look -> fix), lint codes with fixes, placement helpers, exit codes.
  Owns: elkdraw/skill/**
  Acceptance: a fresh Opus session given only the skill completes the ride-hailing draft.
  Parallel: alongside everything; blocked by nothing (updated at phase end).
  lane:docs
1.12 Phase 1 eval
  Goal: run the two dogfood tasks with the dogfood prompts through Phase 1 tools; record calls, tokens, lint hits, defects-by-eye vs the dogfood baseline in eval/phase-1.md.
  Owns: elkdraw/eval/phase-1/**
  Acceptance: report written; go/no-go for Phase 2 stated (Phase 2 bar per §17.4 is measured against this run).
  Parallel: none; blocked by 1.6, 1.10, 1.11.
  lane:eval

## Epic P1.5: "ELK draw Phase 1.5: collaboration layer (threads, review loop, presence)"  [P1]
Goals: port the algopeeps canvas comment/review layer (CONTRACT v1.4 §11–12) behind the backend
seam: element-anchored threads, sidebar with numbered badges, agent read/reply/resolve, a blocking
`cv wait --review`, agent presence pointer, turn checkpoints with per-turn undo. Gain expected: the
pair-diagramming loop (human comments, agent replies in place, human reviews) on the new product.
Exit: the R2 collaboration round replayed with a human commenting and the agent replying in-thread;
eval records round-trip time and calls. Proposals-as-threads is deferred to Phase 3 (needs lift).
Acceptance: threads keyed by element id survive apply; sidebar screenshots reviewed by eye.

Tasks:
1.5.1 Thread model and MCP/CLI tools behind the seam
  Goal: port Thread/ThreadMessage (targetIds = element ids), threads/comment/reply/resolve tools and store replay, neutral of backend.
  Owns: elkdraw/core/threads/**, elkdraw/adapters/mcp/threads.ts, elkdraw/adapters/cli/threads.ts
  Acceptance: smoke: comment -> reply -> resolve round trip; threads survive an apply that moves the target.
  Parallel: alongside 1.5.2, 1.5.4, 1.5.5; blocked by Phase 0 tool schemas.
  lane:core
1.5.2 Sidebar, badges and comment tool in the app
  Goal: port ThreadsSidebar, Badges, selection bubble, comment tool and asset palette from canvas/app into elkdraw/app against the Phase 0 app shell.
  Owns: elkdraw/app/src/sidebar/**, elkdraw/app/src/palette/**, elkdraw/app/src/CanvasApp.tsx (wiring only)
  Acceptance: the four existing Playwright specs pass in the new app; 1400×900 screenshot reviewed.
  Parallel: alongside 1.5.1, 1.5.4; blocked by Phase 0 app shell.
  lane:app
1.5.3 Review loop: cv wait --review and the agent trigger
  Goal: Finish/Approve in the app emits a review event; `cv wait --review` blocks on it; a pi/Claude hook replaces tutor-watch.sh (event -> prompt with thread, anchor, near, crop).
  Owns: elkdraw/adapters/cli/wait.ts, elkdraw/core/events/**, elkdraw/hooks/**
  Acceptance: agent blocked on wait resumes within 1 s of Finish; a human comment reaches the agent prompt with a crop path.
  Parallel: alongside 1.5.4, 1.5.5; blocked by 1.5.1, 1.5.2.
  lane:cli-mcp
1.5.4 Agent presence and pointer
  Goal: collaborators map: agent laser pointer and selection shown for look/edit targets; human deixis (selection, pointer) readable by the agent.
  Owns: elkdraw/app/src/presence/**, elkdraw/adapters/mcp/presence.ts
  Acceptance: `look n12` moves the agent pointer to n12 in the app; `describe --selection` returns the human's selected ids.
  Parallel: alongside 1.5.1, 1.5.2; blocked by Phase 0 app shell.
  lane:app
1.5.5 Turn checkpoints and per-turn undo
  Goal: each agent apply batch is a checkpoint; `cv undo --turn` reverts the agent's last turn without touching human edits since.
  Owns: elkdraw/core/store/checkpoints.ts
  Acceptance: apply, human move, undo --turn -> agent elements gone, human move kept.
  Parallel: alongside 1.5.2, 1.5.4; blocked by 1.2.
  lane:core
1.5.6 Phase 1.5 eval: pair-diagramming round
  Goal: replay the R2 collaboration round with a human (or the orchestrator) commenting in the sidebar and the agent replying in-thread; record calls and round-trip in eval/phase-1.5.md.
  Owns: elkdraw/eval/phase-1.5/**
  Acceptance: report written.
  Parallel: none; blocked by 1.5.3, 1.5.4, 1.5.5.
  lane:eval

## Epic P2: "ELK draw Phase 2: Mermaid in, ELK layout, merge, apply"  [P1]
Goals: Mermaid-superset text as the agent's working format; ELK two-mode layout with the 1-D
placer; three-way merge on gen hashes; apply with terse reply; TS builder; CLI/MCP apply.
Gain expected (§17.4): ≤ ⅓ of Phase-1 tool calls and ≤ ⅕ of tokens on the two tasks, zero unfixed
lint errors, no defects lint missed on the ride-hailing task. Exit: eval; a second no-go after one
fix cycle stops the layer. Acceptance: parity suite green on Node and Bun; fake backend passes the
apply tests.

Tasks:
2.1 Mermaid adapter: parse and getData to Graph
  Goal: mermaid 11.17.2 exact pin, happy-dom shim set once, parse first then getDiagramFromText; LayoutData -> Graph (compounds from isGroup/parentId, meta.shape/roles/style/kind/heads, compartments), getClasses for the theme map; directives parser (@pin @labelAt @allow @eject @tombstone @include @note); edge ids explicit or from->to[#n] in source order, never Mermaid's auto ids; source spans in meta for the printer.
  Owns: elkdraw/core/mermaid/**
  Acceptance: flowchart, class, state fixtures snapshot to Graph identically on re-run; e1@ ids kept; auto ids not used.
  Parallel: alongside 2.3, 2.5, 2.6, 2.7, 2.9; blocked by Phase 0 IR types.
  lane:core
2.2 Validate for Mermaid input
  Goal: references, directive targets, hyperedge rejection, unknown-shape fallback with warning, Mermaid syntax errors surfaced with line/column.
  Owns: elkdraw/core/validate/**
  Acceptance: 20-line negative fixture rejected with line and column; unknown shape degrades to rect with a warning.
  Parallel: alongside 2.3, 2.5; blocked by 2.1.
  lane:core
2.3 ELK layout: full and interactive, in-process Bun
  Goal: elkjs 0.12.0 via elk-api.js + Web Worker (invocation from probe B1 of diagram-layout-families.md); layered per zone as compounds; hierarchyHandling INCLUDE_CHILDREN; interactive strategies; labelAt on routed sections; relative->absolute handled downstream.
  Owns: elkdraw/core/layout/elk.ts
  Acceptance: ride-hailing Graph lays out with 0 overlaps under Bun and Node; cross-zone edges have sections.
  Parallel: alongside 2.1, 2.5, 2.6; blocked by Phase 0 IR types.
  lane:core
2.4 Placer: 1-D push for soft pins
  Goal: §15.2: when soft pins exist, take ELK order only; kept nodes keep coordinates; new node placed in the layer gap; downstream push along the flow axis by the deficit; zone growth; moved[] report; relayout clears pins.
  Owns: elkdraw/core/layout/placer.ts
  Acceptance: chain-insert test: A->B->C with C moved, insert Y -> B and C shift by the deficit, order intact, moved[] correct.
  Parallel: alongside 2.5, 2.6; blocked by 2.3.
  lane:core
2.5 Merge: three-way on gen hashes
  Goal: §3.3 table over Presentation/meta gen hashes; origin derived from id-vs-meta (§10.2); tombstones only for include/instance content; eject/adopt; prune scope; overrides and conflicts reported; force.
  Owns: elkdraw/core/merge/**
  Acceptance: unit tests for each table row; pasted copy of a generated element is treated as human with copiedFrom.
  Parallel: alongside 2.1, 2.3, 2.6; blocked by Phase 0 IR types.
  lane:core
2.6 Excalidraw adapter: emit and serialise
  Goal: LaidGraph + Presentation -> skeleton -> convertToExcalidrawElements({regenerateIds:false}); bound text as id#label; zones as frames with flattening + frameId re-assert on pull; ELK relative -> absolute coords; classDef/themeVariables -> Excalidraw style map; .excalidraw serialise with customData {mmdHash, compiledAt, rev}.
  Owns: elkdraw/backends/excalidraw/emit/**, elkdraw/backends/excalidraw/serialise.ts
  Acceptance: a nested-zone Graph flattens to sibling frames with a groupId; coordinate test for relative->absolute; ride-hailing opens on excalidraw.com.
  Parallel: alongside 2.1, 2.3, 2.5; blocked by Phase 0 adapter interface.
  lane:backend-excalidraw
2.7 Fake backend
  Goal: in-memory adapter (nesting deep, bindings none, opaqueMeta true, readBack true) used by the apply and merge tests so neutrality is enforced by CI.
  Owns: elkdraw/backends/fake/**
  Acceptance: the apply test suite runs against both backends and passes.
  Parallel: alongside everything in Phase 2; blocked by Phase 0 adapter interface.
  lane:test
2.8 Apply composition
  Goal: apply = parse -> validate -> layout (two-mode) -> merge -> emit; reply per §3.3 (rev, created, updated, kept, deleted, overrides, conflicts, tombstoned, moved, lints, measured); dryRun; relayout; ifRev.
  Owns: elkdraw/core/apply/**
  Acceptance: ride-hailing draft, insert Surge, move Pricing sequence produces the expected replies; a human move survives a re-apply.
  Parallel: alongside 2.9, 2.10; blocked by 2.2, 2.4, 2.5, 2.6, 2.7.
  lane:core
2.9 TS builder
  Goal: typed construction of Graph (diagram/zone/node/edge/note, pins, allow), emitting Graph directly and canonical .mmd via Phase 3 printer later; functions as components.
  Owns: elkdraw/core/builder/**
  Acceptance: the BST figure built from a 20-line TS loop compiles to the same Graph as its .mmd.
  Parallel: alongside everything in Phase 2; blocked by Phase 0 IR types.
  lane:core
2.10 CLI and MCP apply for .mmd
  Goal: `cv apply file.mmd [--dry-run] [--relayout] [--if-rev]`, MCP `apply {mmd|patch}`; JSON Schema of Graph published from zod with typed error codes.
  Owns: elkdraw/adapters/cli/apply.ts, elkdraw/adapters/mcp/apply.ts, elkdraw/schema/**
  Acceptance: CLI and MCP return identical replies; pi completes draft -> insert -> look with .mmd only.
  Parallel: alongside 2.9; blocked by 2.8.
  lane:cli-mcp
2.11 Parity suite for Phase 2
  Goal: fixture .mmd -> Graph, LaidGraph, skeleton snapshots on Node and Bun; fails loudly on mermaid or elkjs upgrade.
  Owns: elkdraw/test/parity/mermaid/**, elkdraw/test/parity/layout/**
  Acceptance: CI runs both runtimes; a deliberate version bump fails the suite.
  Parallel: alongside 2.8; blocked by 2.1, 2.3.
  lane:test
2.12 Phase 2 eval
  Goal: the two tasks via .mmd; measure against Phase 1 per §17.4; write eval/phase-2.md with go/no-go.
  Owns: elkdraw/eval/phase-2/**
  Acceptance: report written; bar applied.
  Parallel: none; blocked by 2.10, 2.11, 1.12.
  lane:eval

## Epic P3: "ELK draw Phase 3: lift, printers, two-file persistence, semantic diff, proposals"  [P2]
Goals: human canvas edits flow back to the .mmd under §12.3 rules; minimal-edit and canonical
printers; .mmd + .excalidraw side by side with hash check; semantic diff on the masked view;
proposals-as-threads. Gain expected: hand-edits survive re-layout and land in the text; reviews are
plain text diffs. Exit: R2 collaboration round replayed with lift; eval/phase-3.md.

Tasks:
3.1 Lift: NeutralScene vs LaidGraph to AstPatch
  Goal: §12.3 table: geometry -> soft pin; style -> override; label edit, bound human arrow, delete -> auto-lift (set/create/delete); unbound -> freeform; ambiguous -> adopt proposal; AstPatch = create|set|reconnect|delete|rename|move; undo-symmetric.
  Owns: elkdraw/core/lift/**
  Acceptance: unit test per table row on the fake backend and Excalidraw.
  Parallel: alongside 3.2, 3.3; blocked by 2.8.
  lane:core
3.2 Minimal-edit printer
  Goal: apply AstPatch to the source text using meta spans: replace a label token, add/remove a statement or directive line, keep author ordering and comments.
  Owns: elkdraw/core/print/minimal.ts
  Acceptance: a label lift changes exactly one line; a delete removes the node line and its edges only.
  Parallel: alongside 3.1, 3.3; blocked by 2.1.
  lane:core
3.3 Canonical printer and export
  Goal: sorted, one statement per line, directives in fixed order, byte-stable; `cv export [--pins] [--include-human]`.
  Owns: elkdraw/core/print/canonical.ts, elkdraw/adapters/cli/export.ts
  Acceptance: export(parse(export(x))) == export(x) on all fixtures.
  Parallel: alongside 3.1, 3.2; blocked by 2.1.
  lane:core
3.4 Two-file persistence
  Goal: ride.mmd + ride.excalidraw side by side; customData {mmdHash, compiledAt, rev}; hash mismatch -> compile seeded from scene and reported; session store holds the pair; .gitattributes *.excalidraw -diff; coalesced .mmd writes (debounce + quiet period).
  Owns: elkdraw/core/store/**, elkdraw/adapters/cli/open.ts
  Acceptance: edit .mmd externally, open -> seeded compile with mismatch reported; a typed label produces one .mmd write.
  Parallel: alongside 3.5; blocked by 3.2, 3.3.
  lane:core
3.5 Semantic diff and cv diff A B
  Goal: semantic(tree) view masking geometry; AST diff (added/removed/relabelled/re-zoned/role changed) + geometry deltas above threshold + lint delta; works on two file versions with pure layout.
  Owns: elkdraw/core/diff/semantic.ts, elkdraw/adapters/cli/diff.ts
  Acceptance: diff of two fixture versions lists the semantic changes in ≤ 10 lines with the lint delta.
  Parallel: alongside 3.4; blocked by 3.3, 1.8.
  lane:core
3.6 Proposals as threads
  Goal: Thread.proposal {kind: adopt|edge|patch, patch}; accept in the sidebar applies the patch and resolves; reject resolves; CONTRACT bump to v1.5.
  Owns: elkdraw/core/threads/proposal.ts, elkdraw/app/src/sidebar/Proposal.tsx
  Acceptance: the ambiguous-shape case yields an adopt proposal; accept lifts it into the .mmd.
  Parallel: alongside 3.4, 3.5; blocked by 3.1, 1.5.1, 1.5.2.
  lane:app
3.7 Lift feed and Phase 3 eval
  Goal: feed lines for every lift; replay the R2 round with lift on; eval/phase-3.md.
  Owns: elkdraw/eval/phase-3/**
  Acceptance: report written; every human edit in R2 appears as a feed line and lands in the .mmd or the scene per §12.3.
  Parallel: none; blocked by 3.4, 3.5, 3.6.
  lane:eval

## Epic P4: "ELK draw Phase 4: families (class/ER/state/requirement, router, sequence/gantt/timeline/mindmap)"  [P2]
Goals: Mermaid family parity beyond flowchart. Gain expected: Mermaid's own samples for each family
render with 0 lint errors; family lift maps work. Exit: eval/phase-4.md.

Tasks:
4.1 Class, ER, state, requirement via the ELK path
  Goal: compartments emit (container with multi-line label), ER crow's-foot heads, state pseudo-shapes, requirement typed nodes; all via getData.
  Owns: elkdraw/core/mermaid/families/{class,er,state,requirement}.ts, elkdraw/backends/excalidraw/emit/compartments.ts
  Acceptance: Mermaid's samples render with 0 lint errors and correct arrowheads.
  Parallel: alongside 4.2, 4.3; blocked by 2.8.
  lane:core
4.2 libavoid-js router
  Goal: router for placer-touched edges, hard pins, drags and gantt dependencies; loaded as an unmodified separate WASM file, server-side only, never inlined in the app bundle (LGPL-2.1); shapeBufferDistance/idealNudgingDistance tuned; hugging fixture.
  Owns: elkdraw/core/router/**
  Acceptance: reroute < 50 ms on the ride-hailing scene; no obstacle hugging on the fixture.
  Parallel: alongside 4.1, 4.3, 4.5, 4.6; blocked by 2.4.
  lane:core
4.3 Sequence layouter and lift map
  Goal: §14.3: participants by order, lifelines with FIXED_POS ports, activations own ports, fragments as bands with meta.range, self-messages three bends; lift: vertical drag past a neighbour = reorder, participant drag = reorder participants.
  Owns: elkdraw/core/families/sequence/**
  Acceptance: Mermaid's sequence samples render; a message drag reorders in the .mmd.
  Parallel: alongside 4.1, 4.2, 4.5; blocked by 3.1.
  lane:core
4.4 Gantt layouter and lift map
  Goal: x=scale(start), width=scale(duration), section bands, `after` edges via router, axis ticks in meta; lift: bar drag = start snapped to axis unit, right-edge drag = duration.
  Owns: elkdraw/core/families/gantt/**
  Acceptance: Mermaid's gantt sample renders; drag snaps to the unit.
  Parallel: alongside 4.3, 4.5; blocked by 4.2, 3.1.
  lane:core
4.5 Timeline layouter and lift map
  Goal: periods by order, stacked events; lift: event dropped on a period moves it.
  Owns: elkdraw/core/families/timeline/**
  Acceptance: Mermaid's timeline sample renders; drop moves in the .mmd.
  Parallel: alongside 4.3, 4.4; blocked by 3.1.
  lane:core
4.6 Mindmap: split pass and mrtree
  Goal: getData -> split children left/right of the root -> ELK mrtree per side.
  Owns: elkdraw/core/families/mindmap/**
  Acceptance: Mermaid's mindmap sample renders with 0 overlaps.
  Parallel: alongside 4.3–4.5; blocked by 2.3.
  lane:core
4.7 Composition driver and lint family gating
  Goal: axis family nested in a flowchart zone = fixed compound with SEPARATE_CHILDREN under INCLUDE_CHILDREN and FIXED_POS boundary ports; lint rules gated by meta.family.
  Owns: elkdraw/core/layout/compose.ts, elkdraw/core/lint/family.ts
  Acceptance: a sequence block inside a flowchart zone lays out and routes; gantt bar-in-band is not an overlap error.
  Parallel: alongside 4.4–4.6; blocked by 4.3.
  lane:core
4.8 Phase 4 eval
  Goal: family samples plus one mixed diagram through the loop; eval/phase-4.md.
  Owns: elkdraw/eval/phase-4/**
  Acceptance: report written.
  Parallel: none; blocked by 4.1–4.7.
  lane:eval

## Epic P5: "ELK draw Phase 5: @include, kanban, draw.io backend, Mermaid 12"  [P2]
Goals: composition by reference, a second editable backend proving the seam, Mermaid 12 upgrade.
Gain expected: reuse across files; backend independence demonstrated. Exit: eval/phase-5.md.

Tasks:
5.1 @include
  Goal: `%% @include ./core.mmd as core` namespaces ids under the alias; edges target core:trip; zone-free include = one frame, else sibling frames with a groupId; tombstones for included content.
  Owns: elkdraw/core/mermaid/include.ts
  Acceptance: an included file renders as a namespaced zone; edges into it resolve.
  Parallel: alongside 5.2, 5.3; blocked by 3.4.
  lane:core
5.2 Kanban grid pass
  Goal: getData -> columns × cards grid.
  Owns: elkdraw/core/families/kanban/**
  Acceptance: Mermaid's kanban sample renders.
  Parallel: alongside 5.1, 5.3; blocked by 2.3.
  lane:core
5.3 draw.io backend adapter
  Goal: emit/read/measure/render/serialise for .drawio (mxCell vertex/edge, containers nest, style-string mapping); Capabilities {nesting deep, bindings native}.
  Owns: elkdraw/backends/drawio/**
  Acceptance: the apply test suite passes on draw.io; ride-hailing opens in draw.io desktop.
  Parallel: alongside 5.1, 5.2; blocked by 2.7, 2.8.
  lane:backend-drawio
5.4 Mermaid 12 upgrade
  Goal: bump to 12.x behind the parity suite; evaluate replacing direct elkjs with Mermaid's bundled ELK.
  Owns: elkdraw/core/mermaid/** (version pin), elkdraw/test/parity/**
  Acceptance: parity suite green on 12.x; decision recorded on bundled ELK.
  Parallel: alongside 5.3; blocked by 2.11, 4.1.
  lane:core
5.5 Swimlanes as rows (on demand)
  Goal: post-pass placing nodes in lane rows by meta.lane (~200 lines); only if a user asks.
  Owns: elkdraw/core/layout/lanes.ts
  Acceptance: a lane fixture renders with nodes in their rows.
  Parallel: alongside 5.1–5.4; blocked by 2.4. Deferred: create with status open, priority P3.
  lane:core
5.6 Phase 5 eval
  Goal: include + second backend + Mermaid 12 through the loop; eval/phase-5.md.
  Owns: elkdraw/eval/phase-5/**
  Acceptance: report written.
  Parallel: none; blocked by 5.1, 5.3, 5.4.
  lane:eval
