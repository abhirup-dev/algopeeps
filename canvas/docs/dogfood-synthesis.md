# Dogfood synthesis: what makes Excalidraw hard for agents, and what our layer must do

Date 2026-09-25. Two Claude Code testers (Opus 5.5, medium) drove `mcp-excalidraw-server`
2.0.0 (yctimlin) through the excalidraw-skill CLI, on private ports. Five rounds in total:

| Round | Tester | Task |
|---|---|---|
| 1 | both | 25+ element ride-hailing architecture, self-check, two edits (move Pricing, insert Surge). A: one command at a time; B: batch paths (`add`, `apply`, Mermaid) |
| 2 | A | Collaboration: the orchestrator, as "the human", moved Kafka and Analytics, deleted arrow 7, left the note "why is Redis here?" |
| 2 | B | Composition: component "service with cache" × 3 instances, change the definition, reuse one instance in a second diagram |
| 3 | A | Dense figure: 15-node BST, highlighted search path, aligned in-order array, lo/hi pointers, 14 px text |
| 4 | both | Paper round: write the diagram in two SDK sketches (`canvas/briefs/DOGFOOD-sdk-sketches.md`) and critique |

Raw material: `dogfood-excalidraw-yctimlin.md`, `dogfood-excalidraw-batch.md`, the testers'
transcripts, fixtures in `canvas/.artifacts/dogfood/` (final scenes + PNGs; known defects listed
in the reports make them lint ground truth). Research context: `agent-native-diagramming.md`.

## 1. Pain points, ranked by frequency × damage

| # | Pain | Seen in | Evidence |
|---|---|---|---|
| 1 | **Geometry defects are invisible to text.** Arrow through node, label on node/label/border, overlaps; nothing reports them | every round, both | All ~15 first-pass defects found by eye from PNGs; `describe` gives no arrow endpoints, no label boxes. A had the numbers for one defect in an output and still missed it |
| 2 | **Hand routing does not survive.** Waypoints flattened on any endpoint move and on `snapshot restore`; fixed defects come back | R1 both, R2 A | `get a9` → 2 points after moving Payment; restore flattened 3 arrows, no warning |
| 3 | **Stored state ≠ rendered state.** `textAlign:center` stored, drawn left; "12" wrapped in a 44 px circle while export said one line 24×22 | R3 | Stored-data lint would have passed everything |
| 4 | **Silent no-ops.** `fontSize` on arrow labels, `elbowed:true`, `autoResize:false` return `success` and change nothing | R1 both, R3 | Found only by screenshot |
| 5 | **Layout is entirely the agent's job.** Both wrote a Python grid generator; inserting Surge = 7 manual moves; midpoint labels force whole-row reflows | R1 both, R3 | "the script stands in for a layout primitive, style presets, and zones as containers" (B) |
| 6 | **Human edits are undetectable.** No change feed, no author, no timestamps; element count unchanged (one delete + one add) | R2 A | Found only because A happened to keep an export and diffed it with its own script |
| 7 | **No composition.** No component or instance concept; native `duplicate` keeps the original's group and customData and leaves copied arrows bound to the original | R2 B | 60-line `comp.py` + reconciler + drift checker; duplicate had to be rolled back |
| 8 | **Perception is one full-canvas PNG.** Downscaled ~2×, 14 px text unreadable; crops done by hand with `sips`, offset guessed | R3 | "The 1000×720 native crop was fully legible" |
| 9 | **Output noise.** `add` echoes the whole scene (18–20 KB, 3× the input); `get` and `export` use different schemas; 48 authored → 73 elements | R1 both | B's first binding check read the wrong schema and concluded "no binding" |

What was genuinely good (keep): one-shot batch creation with custom ids; the skeleton format
(`text` on shapes, `start/end` ids); bound straight arrows following moves; atomic multi-op
`apply` with terse replies; `snapshot restore` as a rollback; honest, fast screenshots.

## 2. What the testers asked for, unprompted, and how they rank it

| Ask | A | B | Notes |
|---|---|---|---|
| `lint`/`check` with ids | #2 (R1) | #1 (R1) | Must use **rendered measurements** (R3) |
| Routing that persists / re-solves | #1 | #2 | Solved by owning routing in the layer, never storing hand points as truth |
| Crop around ids with padding + measured boxes | #4 (R1), #1 (R3) | #5 | Return image **and** per-element rendered boxes |
| `diff --since` with author and time | R2 top ask | (R1 §6) | The pair-diagramming prerequisite |
| Id-stable `upsert` with prune scope, dry run | | R2 top ask | = our `apply` |
| Strict patches (reject unknown fields) | #3 | #5 | |
| Graph + auto-layout with pins | biggest effect (est. 9 apply + 8 shots → 3 + 3) | biggest effect (8 → 4 calls) | Only with incremental layout and visible pins |
| Relative placement verbs | little | modest | Pain was routing, not node placement |
| Short server ids (n1…) | no / slightly worse | no | Semantic custom ids won; short ids only as a visual overlay |
| Id overlay on the image | low | wanted (R1) | Helps hand-placed scenes, not generated ones |

## 3. The SDK paper round (round 4)

Both testers chose **B (JSON spec) first**, then **A (TypeScript) as a typed generator that emits B**:
chat hosts can only use B; coding agents already emit B from scripts (both did); every problem that
hurt sits in the shared layer either way.

Static checks vs rendered lint, from their own mistakes: types remove the *tool-format* errors
(unknown fields, `text` vs `label`, `start` vs `startElementId`, point arithmetic); almost every
*diagram* defect is geometric and only the rendered lint catches it. Both invest; lint first.

Design corrections they made to the sketches:

- Drop `d.ref("id")` string lookups in A; variables only, so `tsc` checks references.
- Uniform `(id, label, opts)` for every entity; one way to say "store" (shorthand for the role).
- Named ports, and only ports are addressable from outside a component (`trip.in`, not `trip.svc`).
- No `"{svc}"` string templating in B; real JSON Schema for params. Referential checks are a
  `validate` tool, not "JSON Schema".
- `flow([...])` / `step:` for numbered sequences so inserting a step renumbers.
- Arrow `labelAt` (0..1) so a label collision has a fix, not just a lint.
- Lint suppression = `{rule, why}` with a required reason; rename the ambiguous `crosses-edge`.
- `annotations` / comments anchored to an id as a first-class primitive (A, R2: "there is no reply
  feature").

## 4. Rules for human edits and the escape hatch (both testers, converged)

1. Every element has an origin in `customData`: `generated | raw | human`. Only `generated` is rewritten.
2. Generated ids are deterministic from the spec path (diagram/zone/instance/node) and never recreated.
3. Three-way merge (last generated, new generated, canvas): canvas differs → keep canvas, report
   override; both changed → report conflict; never silent last-write-wins.
4. Deleting a generated element leaves a **tombstone**; it is never resurrected ("a7 suppressed;
   the spec still declares it").
5. Raw and human elements can **anchor** to an id with relative coordinates, so notes follow
   re-layout; a deleted anchor makes them dangling, not deleted.
6. `adopt <id>` pulls a human-drawn element into the spec.
7. Layout is **incremental by default** (existing nodes stay; new ones placed), full re-layout on
   request, with a movement report ("7 nodes move > 40 px") before commit. A drag is a *soft pin*,
   reported, hardened only on confirmation. Never silently move a node back into its zone.

## 5. Revised v0 surface (delta over `agent-native-diagramming.md` §v0)

```
 spec (JSON B)  ◄── TS builder A (later, emits B)
    │ validate   (schema + references; path-precise errors)
    ▼
 compile ──► skeleton → convertToExcalidrawElements ──► canvas (Excalidraw, unchanged)
    │             ELK per zone, incremental, pins, labelAt, owned routing
    ▼
 apply = id-stable upsert, 3-way merge, tombstones, dry-run, prune-scope
    │
 render (headless or live tab) ──► lint(measured) · look(crop ids, pad, scale → png + boxes)
    │
 diff --since rev  (author, time, side effects)  ──► pair loop / comments
```

Order of work implied by the evidence:

1. `lint` on rendered measurements, validated against the two fixture scenes (every defect in the
   reports must be flagged).
2. `look --around <ids> --pad --scale` returning PNG + rendered boxes.
3. `diff --since` with author and timestamps (our server already logs events; expose them).
4. JSON spec + `validate` + `apply` upsert with the merge rules in §4.
5. ELK layout with pins and `labelAt`; components and instances.
6. TS builder emitting the JSON spec.

Existing pieces to build on, not rebuild: `convertToExcalidrawElements` (skeleton),
`@excalidraw/utils` export + `elementsOverlappingBBox`, Excalidraw's own geometry in
`@excalidraw/element` (snapshot builds only), `restore`/`reconcileElements`. Idea sources:
Microsoft Flint (semantic types → compiler picks the low-level details; separate
create/validate/render tools), Structurizr (one model, many views), ExcalidrawAutomate (builder
ergonomics).

## 6. Caveats

- Two testers, same model family, same tool. No human participants; round 2's "human" was the
  orchestrator via REST. Estimates of saved calls are the testers' own.
- The official `excalidraw/excalidraw-mcp` was not tested: the claude.ai connector needs an OAuth
  sign-in from a terminal session.
- Tool-specific bugs (`PORT` ignored, `add` echo) are about yctimlin's server, not Excalidraw.
