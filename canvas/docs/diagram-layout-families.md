# Diagram layout families: ELK plus our own freedom

Research date: 2026-09-26. Input: `agent-layer-design.md` §§11–13 and the TL;DR of
`diagram-ir-landscape.md`. Every claim marked **T1**–**T9** comes from a probe run with elkjs
0.12.0 under Node 24 in `/tmp/elkexp`, and **B1** comes from the same probe under Bun 1.4.2. The
probe scripts were throwaway and are not committed. Everything else is cited in the sources.

## TL;DR

1. **ELK covers the graph families but not the axis families.** Flowchart, state, class, ER, C4,
   block, network, tree, mindmap and org chart are all expressible with `layered`, `mrtree`,
   `radial`, `rectpacking` and `box`. For sequence, gantt, timeline and swimlane, ELK has no
   notion of a metric axis. The ELK maintainers say directly that it does not do swimlanes
   (elkjs#327, 2025-03). The sequence-layouter port has been open since 2016 (elk#77).
2. **Nobody has fit every family into one constraint engine.** The mature tools all follow one
   pattern: a small per-family layouter produces a sized box, and a graph engine lays out
   everything around it. D2 does this with `d2sequence` (729 lines) and `d2grid` (about 1,200),
   extracted and re-injected around dagre/ELK/TALA. yFiles does it with `RecursiveGroupLayout`.
   yFiles's own Gantt demo does not use a layout algorithm at all: it uses `getX(date)`, a
   sweep-line row packer and a rule-based edge style. Mermaid writes a bespoke renderer per
   family, and in 2026 added its own 11.6k-line swimlane layouter rather than bend ELK.
3. **ELK already supports nesting different algorithms (option b).** A compound node with
   `elk.algorithm: fixed` whose children already carry our x/y is sized and placed correctly
   inside a `layered` parent (T1). This still holds under root `INCLUDE_CHILDREN` if the compound
   sets `SEPARATE_CHILDREN` (T9). elkjs keeps unknown fields such as `meta` and preset `sections`
   in its output.
4. **Cross-boundary edges need ports.** An edge from outside to a child of a `fixed` compound gets
   no route (T1). Under `INCLUDE_CHILDREN` without the separate boundary, ELK throws
   `UnsupportedGraphException` (T2). The tested fix is a `FIXED_POS` port on the compound
   boundary, which `layered` routes to (T8, T9). D2 hits the same wall and falls back to straight
   lines (`DefaultRouter`, marked `TODO`).
5. **Correction to §11.2: interactive `layered` keeps order, not coordinates.** With every
   strategy set to `INTERACTIVE`, a node at x=400 came back at x=162 (T3). The flow-axis
   coordinate is recomputed per layer. "Pins survive" is therefore true only for order and for
   the cross axis. `layerChoiceConstraint` and `positionChoiceConstraint` are silently ignored by
   `elk.layout()` (T6). The ELK blog says only KLighD's second pass evaluates them.
6. **`fixed` does not route edges** (T4). elkjs cannot route standalone edges or run libavoid (the
   ELK libavoid plug-in talks to a native C++ server process). **libavoid-js** (WebAssembly,
   LGPL-2.1, 0.5.0-beta.5) routed around a blocker in about 5 ms and rerouted incrementally after
   `moveShape` (T7). It is the router for Gantt dependencies, hard pins and drags.
7. **Correction to §11.2: the bundled elkjs does not load under Bun** (`new _Worker` is undefined,
   B1). It works with `elk-api.js` plus a real Web Worker pointed at `elk-worker.min.js`. That is
   a two-line change, but the plan's "runs in Bun" was unverified.
8. **Recommendation.** Use (a)+(b): per-family pre-pass layouters that write x/y into a `fixed`
   compound, composed bottom-up inside ELK. Add libavoid-js as a repair router. Skip a general
   constraint layer (option c), and borrow Bluefish's relation names as vocabulary rather than
   adopting it as a dependency (option d). The minimal own code is about 900–1,100 lines: sequence,
   gantt, timeline, the composition driver and the router glue.
9. **Main cost risk: swimlane/BPMN.** ELK cannot keep lanes and global flow at once (#327).
   Mermaid spent about 11.6k lines on it, and yFiles solves it with a commercial `LayoutGrid`.
   Defer it, or ship a restricted lanes-as-rows variant (§5.3).

---

## 1. How far ELK itself goes

### 1.1 Algorithms

Registered in elkjs 0.12.0 (released 2026-07-17, based on ELK 0.12.0 of 2026-07-22), exact
output of `knownLayoutAlgorithms()`:

`fixed box random layered stress mrtree radial force sporeOverlap sporeCompaction rectpacking`

| Algorithm | In elkjs | What it gives | Families |
|---|---|---|---|
| `layered` | yes | Sugiyama in 5 phases, ports, orthogonal routing, compounds, model order, partitions | flowchart, state, class, ER, C4, block, data flow |
| `mrtree` | yes | Tidy tree, model order | tree, org chart, mindmap (one-sided) |
| `radial` | yes | Radial tree | mindmap (two-sided), sunburst-like |
| `force`, `stress` | yes | Force and stress-majorization | network, "architecture" without a flow axis |
| `rectpacking` | yes | Packs boxes in a target width, keeps order | kanban cards, component packing, treemap-ish |
| `box` | yes | Simple box packing | grid/matrix of equal cells |
| `sporeOverlap`, `sporeCompaction` | yes | Removes overlap and compacts a given drawing | cleanup after human drags |
| `fixed` | yes | Keeps given x/y and given edge `sections`, computes the parent size | **carrier for our layouters** |
| `disco` | listed in the README defaults, **absent from the 0.12 registry** | Packs disconnected components | n/a |
| `vertiflex` (ELK 0.11) | **Java only** | Tree with fixed y per node (`verticalConstraint`) | would be timeline trees |
| `topdownpacking` + `topdownLayout` | **Java only** (the core option exists, the algorithm is not built) | Top-down sizing of nested diagrams | large zoomable C4 |
| `libavoid` | **Java only**, via a native server process | Object-avoiding orthogonal routing of fixed nodes | routing |
| `graphviz.*` | Java only, needs Graphviz | dot/neato/… | n/a |

elkjs builds from `elk/plugins/*.alg.{common,disco,force,layered,mrtree,rectpacking,radial,spore}`
(`elkjs/build.gradle`). An elkjs maintainer has said the libavoid wrapper "cannot be transpiled"
(elkjs#210, 2024-04-10). **Inference, not documented:** elkjs has no API for registering a
custom algorithm, because algorithms are Java compiled with GWT. "Our own layouter" therefore has
to be a JavaScript pre-pass that writes coordinates and hands them to `fixed`.

### 1.2 The "freedom" options, as tested

| Option | Does | Tested result | Use for |
|---|---|---|---|
| `layering.layerConstraint` = FIRST/LAST(_SEPARATE) | Pins a node to the first or last layer | Works (T7) | start/end states, sinks |
| `layering.layerChoiceConstraint`, `crossingMinimization.positionChoiceConstraint` | "Put in layer i / position j" | **Ignored** by `elk.layout()` (T6). Evaluated only by `InteractiveLayeredGraphVisitor`, which elkjs does not expose. The ELK blog (2023-01-09): "Evaluating and enforcing them is not part of ELK" | n/a |
| `crossingMinimization.inLayerPredOf` / `inLayerSuccOf` | Relative in-layer order | Declared; the blog says "in the future" | not relied on |
| `partitioning.activate` + `partition` | Ordinal columns in flow direction | Works, but **only with `separateConnectedComponents: false`** when the partitions are not connected (T5 vs T5b) | phase columns, coarse swimlane-in-flow-direction |
| `portConstraints: FIXED_POS` + port x/y | Edge attaches exactly there | Works, including on a `fixed` compound (T8, T9) | **cross-boundary edges into axis families** |
| `nodeSize.constraints`, `nodeSize.minimum`, `nodeSize.fixedGraphSize` | Size from labels/ports or fixed | Standard | measured Excalifont boxes |
| `cycleBreaking/layering/crossingMinimization/nodePlacement = INTERACTIVE`, `crossingMinimization.semiInteractive` | Derive order from previous positions | Order and cross-axis y kept; **flow-axis x recomputed** (a node at x=400 came back at x=162, T3) | soft pins in graph families |
| `considerModelOrder.strategy`, `crossingMinimization.forceNodeModelOrder`, group model order (0.11) | Keep source order as tie-break or hard | Documented (Domrös et al. 2022–2024) | stable text-driven layout |
| `hierarchyHandling: INCLUDE_CHILDREN` | One layered run across compounds | Cross-hierarchy edges route; a `fixed` child in the same run throws (T2); a `SEPARATE_CHILDREN` boundary inside it works (T9). It "only considers the whole hierarchy for edge crossings but not for the placement of nodes" (maintainer, #327) | zones in flowcharts |
| Per-compound `elk.algorithm` | Different algorithm per subtree, bottom-up | Works (T1, T9) | **nesting families** |

### 1.3 Family-by-family: what pure ELK can express

| Family | Pure ELK | What is missing | Verdict |
|---|---|---|---|
| Flowchart, block | `layered` + compounds + ports | nothing | ELK |
| State | `layered`, FIRST/LAST for start/end, compounds for composite states | orthogonal regions side by side: a `box` or `rectpacking` compound, SEPARATE | ELK |
| Class, ER | `layered` or `stress`; ports per field row (`FIXED_POS`) for ER | nothing major | ELK |
| C4 | `layered` + nested compounds, `INCLUDE_CHILDREN` | top-down sizing is Java only | ELK |
| Network/architecture | `stress`/`force`, or `layered` | D2's TALA-style symmetry | ELK |
| Tree, org chart | `mrtree` | assistant nodes, compact org-chart variants | ELK |
| Mindmap | `radial` or `mrtree` two passes (left/right halves) | balanced two-sided split | ELK + a 30-line split |
| Kanban/matrix/grid | `box`/`rectpacking` per column, `layered` + partitions for columns | exact row alignment across columns | own `grid` (tiny), ELK inside cells |
| **Sequence** | none: participants are an ordered axis and messages are a time axis | everything | **own layouter** |
| **Gantt** | `partitioning` gives ordinal columns, not dates | metric x from dates, row packing | **own layouter** |
| **Timeline** | `vertiflex` would help but is Java only | metric axis | **own layouter** |
| **Swimlane/BPMN** | lanes as compounds break global flow (#327); partitions give columns but not lanes | lane bands and global layering together | own, or deferred (§5.3) |
| Sankey, pie, xy | n/a | a chart, not a node-link layout | out of scope (Vega-Lite or Mermaid) |

---

## 2. Who has done this already

| Project | Status (checked 2026-09-26) | How it handles many families | What we take |
|---|---|---|---|
| **KIELER / ELK** (Kiel RTSYS) | ELK 0.12.0 on 2026-07-22; KLighD last pushed 2026-07-28 | ELK is graph-only. The KIELER sequence-diagram layouter for Papyrus was never migrated: elk#77, "Migrate Sequence Diagram Layouter to ELK", open since 2016-08-30. A 2017 port lives in a fork (Cooperate-Project, last pushed 2017). Hoops, "Automatic Layout of UML Sequence Diagrams", diploma thesis, 2013. Interactive constraints: Petzold et al., VISIGRAPP 2023. Model order: Domrös et al. 2022, 2023, arXiv 2406.11393 (2024). Swimlanes were "once conceptualized for a student thesis" (#327) | Model-order options; two-pass interactive layout lives in the client (KLighD), not in ELK |
| **Sprotty / GLSP** | Sprotty pushed 2026-09-24, GLSP 2026-09-20 | `sprotty-elk` `ElkLayoutEngine` translates the model to ELK; per-element options come from `DefaultLayoutConfigurator` overrides. Custom layouts are separate `IModelLayoutEngine`s. Routing via libavoid in `sprotty-routing-libavoid` (libavoid-js author) | The "configurator per element type" idea is our `meta.family` → options |
| **yFiles** (commercial) | current | Many families: hierarchical, organic, orthogonal, tree, radial, circular, series-parallel, **tabular**, **partial**, `EdgeRouter`. `LayoutGrid` for swimlanes and tables (hierarchical, organic and the router honour it). `RecursiveGroupLayout` maps each group node to its own algorithm, bottom-up, with a `NULL_LAYOUT` that keeps children and only sizes the group. **The Gantt demo is not a layout:** `gantt-utils.ts` `getX(date)`, `sweepline-layout.ts` for sub-rows, `RoutingEdgeStyle.ts` for dependency elbows | The strongest confirmation of (a)+(b), and our `NULL_LAYOUT` equals ELK `fixed` |
| **WebCoLa / cola.js** | npm 3.4.0 last published 2022-06-28; repo last commit 2026-04-30 (README) | Constraint layout: separation, alignment, groups, flow, non-overlap; stress-based | Not adopted (§3) |
| **SetCoLa** | repo last pushed 2020-03 | Set-based constraints compiled to cola (EuroVis 2018) | Idea only |
| **Penrose** | v3.3.1 on 2026-08-30 | Numeric optimization over a Substance/Style program; general but slow and non-deterministic across edits | Not for interactive layout |
| **Bluefish** (UIST 2024) | npm `bluefish-js` 0.0.39 on 2026-05-21 (`@bluefish-js/core` 0.3.0 is stale, 2022) | Relations (`Stack`, `Align`, `Distribute`, `Background`, `Arrow`, `Line`) with per-dimension ownership, solved by local propagation. The paper: "domain-specific solvers could be embedded as special nodes … Bluefish serves more as a layout fabric than a solver" | The vocabulary, and the ownership rule (one owner per axis) |
| **GoTree** (CHI 2020) | not verified in code | A declarative grammar for tree visualizations | n/a |
| **d3-dag** | v1.2.2 on 2026-07-05 | Sugiyama, Zherebko, grid for DAGs only | n/a |
| **Vega / Vega-Lite** | vega-lite v6.4.3 on 2026-04-24 | Gantt as a ranged bar (`x`/`x2` temporal); a chart, no edges | A Gantt without dependencies is a chart; a Gantt with them is ours |
| **Mermaid** | 12.0.0 on 2026-09-10 (ELK bundled and default) | One renderer per family, layout interleaved with d3 drawing: `sequenceRenderer.ts` 2,159 lines (module-level `bounds.verticalPos` cursor), `ganttRenderer.js` 905 (d3 `scaleTime` inside `draw`), `timelineRenderer.ts` 387. **`swimlane-beta` (v11.16+) ships its own Sugiyama-with-lanes layouter plus an orthogonal router, about 11.6k lines, not ELK.** `bpmn-beta` is an open PR (#8166) | Not reusable as a layout library. The swimlane cost is the data point |
| **PlantUML** | pushed 2026-09-25 | Graphviz (or its Java port Smetana) for graph families; its own engines for sequence (Puma by default, Teoz via `!pragma teoz true`) | Confirms the split |
| **D2** | v0.9.0 on 2026-09-07 | `shape: sequence_diagram` and `grid-*` containers. `d2layouts.LayoutNested` extracts each nested diagram, lays it out with `d2sequence`/`d2grid`, lets dagre/ELK/TALA place it as a sized box, re-injects it, then routes cross-graph edges with `DefaultRouter`: straight center-to-center lines, marked `// TODO replace simple straight line edge routing` (`d2layouts.go:376`). TALA supports `top`/`left` locks | **The closest template for our composition**, and its known weak spot |
| **Structurizr** | java v5.0.3 on 2025-11-21 | Graph views via dagre/Graphviz; dynamic views export as sequence diagrams only through PlantUML/Mermaid exporters (`plantuml.sequenceDiagram`) | Delegation, not unification |
| 2024–2026 unification | searched | Nothing unifies layout across diagram kinds. Nearest: Bluefish (relations as composition); Cope-and-Drag / Spytial for Alloy (arXiv 2412.03310, 2024: small orthogonal spatial primitives); ASP-based orthogonal drawing (2025). All are single-engine research | Confirms nothing to adopt |

---

## 3. What "ELK plus additional freedom" looks like

### 3.1 The four patterns

```
(a) pre-pass           (b) nested algorithms          (c) constraint layer      (d) relations
family fn ─► x/y       root: layered                 cola: align/order/pin     Stack/Align/Distribute
   │                     ├─ zone: layered              │                        own per-dimension
   ▼                     ├─ seq:  fixed ◄─ (a)         ▼                        local propagation
ElkNode {fixed}          └─ gantt: fixed ◄─ (a)      ELK or libavoid routes     graph engine = one node
```

| Criterion | (a) pre-pass + `fixed` | (b) nested per compound | (c) cola constraint layer | (d) Bluefish relations |
|---|---|---|---|---|
| Own code | ~150–350 lines per axis family | ~150 lines of driver on top of (a) | a constraint compiler (~400) plus tuning of a second solver | rewrite of the scene model |
| Power per line | High: axis families are simple arithmetic | High: ELK does the rest | Low: cola is stress plus constraints, so axis families still need arithmetic, and graph families lose Sugiyama quality | High in the paper; no graph layout of its own |
| Composes (sequence inside a flowchart zone) | Only via (b) | **Yes, tested (T1, T8, T9)** | Awkward: one global solve | Yes, conceptually |
| Incremental with pins | Axis families have no free positions: drags lift to meaning (reorder, re-date) and re-run | Outer `layered` keeps order; exact pins need a repair pass (§4) | Native pins, but non-deterministic under edits | Native, via ownership |
| Deterministic, diff-stable | yes | yes | no (stress iterations) | yes |
| Maintenance state | ours | ELK is active | npm stale since 2022 | research-grade, 0.0.x |

**Answer:**
- **(a)+(b) gives the most power per line and composes best.** It is also the pattern every
  mature tool converged on independently: D2 (`LayoutNested`), yFiles (`RecursiveGroupLayout`,
  plus a hand-written Gantt) and PlantUML/Mermaid (a renderer per family).
- **(c) buys "align these three" and "keep this left of that".** Our Mermaid source cannot even
  express those, apart from architecture-beta's `align row|column`, and `layered` model order
  already gives stable ordering.
- **(d) is the right vocabulary for the axis layouters.** A sequence diagram is
  `Distribute-x(participants)` and `Distribute-y(messages)`; a Gantt is
  `Align-x(bar.start, axis(date))`. Borrow the names and the one-owner-per-axis rule in our
  layouter code rather than taking a 0.0.x dependency.

### 3.2 Sequence diagram as ELK JSON (our layouter's output)

Tested in T8/T9 shape. The family layouter computes all coordinates. ELK only carries them,
sizes the compound and routes the outer edge to the boundary port. Messages carry preset
`sections`, which `fixed` keeps verbatim; `meta` survives the round trip.

```json
{
  "id": "checkout",
  "layoutOptions": {
    "elk.algorithm": "fixed",
    "elk.hierarchyHandling": "SEPARATE_CHILDREN",
    "elk.portConstraints": "FIXED_POS"
  },
  "meta": { "family": "sequence" },
  "ports": [{ "id": "checkout:in:api", "x": -4, "y": 20, "width": 4, "height": 4,
              "meta": { "anchorOf": "p:api" } }],
  "children": [
    { "id": "p:api", "x": 0,   "y": 0,  "width": 80, "height": 32, "meta": { "role": "participant", "order": 0 } },
    { "id": "p:db",  "x": 160, "y": 0,  "width": 80, "height": 32, "meta": { "role": "participant", "order": 1 } },
    { "id": "life:api", "x": 39,  "y": 32, "width": 2, "height": 120, "meta": { "role": "lifeline", "of": "p:api" } },
    { "id": "life:db",  "x": 199, "y": 32, "width": 2, "height": 120, "meta": { "role": "lifeline", "of": "p:db" } },
    { "id": "act:db:1", "x": 195, "y": 60, "width": 10, "height": 40, "meta": { "role": "activation" } }
  ],
  "edges": [
    { "id": "m1", "sources": ["life:api"], "targets": ["act:db:1"],
      "meta": { "role": "message", "index": 0 },
      "labels": [{ "text": "SELECT", "x": 100, "y": 46, "width": 40, "height": 12 }],
      "sections": [{ "id": "m1s", "startPoint": { "x": 41, "y": 60 }, "endPoint": { "x": 195, "y": 60 } }] },
    { "id": "m2", "sources": ["act:db:1"], "targets": ["life:api"],
      "meta": { "role": "message", "index": 1, "dashed": true },
      "sections": [{ "id": "m2s", "startPoint": { "x": 195, "y": 100 }, "endPoint": { "x": 41, "y": 100 } }] }
  ]
}
```

The options that do the work:

| Option or field | Role |
|---|---|
| `elk.algorithm: fixed` | Keep our coordinates |
| `SEPARATE_CHILDREN` | Allowed even under a root with `INCLUDE_CHILDREN` (T9) |
| `FIXED_POS` port | An outer edge `client → checkout:in:api` routes orthogonally to the boundary (T8) |
| `meta.index` | What a vertical drag lifts to: reorder the message in the `.mmd` |
| `meta.order` | What a horizontal participant drag lifts to: reorder the `participant` lines |

Result inside a `layered` root: the compound sat at (116, 32), sized 260×172, with its children
unchanged and the outer edge ending at the port (T8).

### 3.3 Gantt as ELK JSON

```json
{
  "id": "plan",
  "layoutOptions": { "elk.algorithm": "fixed", "elk.hierarchyHandling": "SEPARATE_CHILDREN" },
  "meta": { "family": "gantt", "scale": { "t0": "2026-10-01", "pxPerDay": 24, "labelGutter": 120 } },
  "children": [
    { "id": "axis",     "x": 120, "y": 0,  "width": 312, "height": 20, "meta": { "role": "axis" } },
    { "id": "t:design", "x": 120, "y": 30, "width": 96,  "height": 20,
      "meta": { "role": "bar", "start": "2026-10-01", "end": "2026-10-05", "row": 0, "section": "Design" } },
    { "id": "t:build",  "x": 216, "y": 58, "width": 168, "height": 20,
      "meta": { "role": "bar", "start": "2026-10-05", "end": "2026-10-12", "row": 1 } },
    { "id": "t:qa",     "x": 336, "y": 86, "width": 96,  "height": 20,
      "meta": { "role": "bar", "start": "2026-10-10", "end": "2026-10-14", "row": 2 } }
  ],
  "edges": [{ "id": "dep1", "sources": ["t:design"], "targets": ["t:build"], "meta": { "role": "dependency" } }]
}
```

The rules:
- `x = gutter + (start - t0) * pxPerDay`, and `width` comes from the duration.
- `row` comes from a greedy interval packing per section (the yFiles `sweepline-layout.ts` idea).
- `fixed` sized this to 462×136 and returned `dep1` **without sections** (T4 applies). The
  dependency needs either the 20-line elbow rule yFiles uses (`RoutingEdgeStyle.ts`: out right,
  down to the midline, into the left side) or libavoid-js when bars are dense.
- A horizontal drag lifts to `start`/`end` through the inverse of `x`, snapped to the day; a
  vertical drag lifts to `section`. Neither is a geometry pin.

A timeline is the same arrangement with points instead of bars: one axis, and events packed into
alternating bands above and below the axis.

---

## 4. Routing edges when nodes are fixed

| Route | Keeps node coordinates | Available in JS | Result |
|---|---|---|---|
| ELK `fixed` | yes | yes | No routing; only keeps preset `sections` (T4) |
| ELK `layered` with every strategy `INTERACTIVE` | order and cross axis only | yes | Routes, but moves nodes on the flow axis (T3) |
| ELK "standalone edge routing" (elk#315, 2018) | — | no | Superseded by the libavoid plug-in (ELK 0.9), which is Java plus a native server; elkjs says it cannot be transpiled (#210, #214) |
| **libavoid-js** 0.5.0-beta.5 (Aksem, LGPL-2.1-or-later, wasm 480 KB, repo pushed 2026-09-06) | yes | yes, Node and browser, async wasm load | Orthogonal route around a blocker in 4.7 ms; after `moveShape_delta` it rerouted straight (T7). Used by `sprotty-routing-libavoid` and a bachelor's thesis |
| TypeFox `elk-libavoid` | yes | Java bridge | n/a for us |
| Rule-based elbows (yFiles Gantt, D2 sequence) | yes | trivial | Enough for sequence messages (always horizontal) and sparse Gantt |

libavoid-js gotchas found in T7: the shipped `.d.ts` does not match the runtime. Enum values are
`A.RouterFlag.OrthogonalRouting.value` and `A.RoutingParameter.shapeBufferDistance.value`, not
`A.OrthogonalRouting`. The route in T7 hugged the blocker's edge at y=-50 despite
`shapeBufferDistance` 8, so buffer behaviour needs one more check before we rely on it.

Where the router is used:

1. Gantt dependencies, once the elbow rule starts to overlap bars.
2. Cross-boundary edges that must reach an inner element. ELK routes to the boundary port, and
   libavoid (or a stub) routes port → inner target.
3. **Hard pins in graph families.** Run `layered` (interactive, for order), overwrite pinned nodes
   with their pinned x/y, then reroute only the edges that touch moved nodes with libavoid. The
   ELK path cannot do this on its own (T3).
4. Live drags: `moveShape` plus `processTransaction` is incremental by design.

---

## 5. Recommendation for our design

### 5.1 What to write, what to delegate

| Piece | Owner | Lines (estimate) | Notes |
|---|---|---|---|
| Graph families (flowchart, state, class, ER, C4, block, network, tree, mindmap) | **ELK options only** | ~60 of option tables in `layout` | `layered`/`mrtree`/`radial`/`stress`; model order on; FIRST/LAST for start/end |
| `sequence` layouter | us | 300–400 | participants, lifelines, messages, activations, notes, `alt`/`loop` frames. D2's is 729 lines of Go with groups and spans |
| `gantt` layouter | us | 150–200 | date scale, section bands, interval row packing, elbow dependencies |
| `timeline` layouter | us | 100–150 | point events on one axis, band packing |
| `grid` (kanban/matrix) | us, only when needed | ~80 | rows × columns of cells; cells hold ELK subgraphs |
| Composition driver | us | ~150 | bottom-up recursion, `fixed` + `SEPARATE_CHILDREN`, boundary ports |
| Router glue (libavoid-js) | us + dependency | ~120 | Gantt dependencies, port → inner stubs, hard pins, drags |
| **Total new** | | **~900–1,100** | on top of the existing `layout` module of §13.3 |

Do not add a constraint layer. Everything it would buy is either unexpressible in Mermaid source
or already covered by model order, `layerConstraint` and `partitioning`. Revisit it only if an
`@align` directive is added and dogfooding shows real demand.

Fix §11.2 alongside this work:
- Load elkjs in Bun through `elk-api.js` and a Web Worker (B1).
- Change "previous positions are respected" to "order is respected; exact pins go through the
  repair router" (T3).

### 5.2 Plug-in interface and composition

```ts
import type { ElkNode, ElkExtendedEdge, ElkPort, LayoutOptions } from "elkjs/lib/elk-api";

/** Our node: elkjs JSON plus a typed meta bag. elkjs passes meta through (T8). */
export interface CNode extends ElkNode {
  meta?: NodeMeta;
  children?: CNode[];
  edges?: CEdge[];
  ports?: (ElkPort & { meta?: { anchorOf?: string } })[];
}
export interface CEdge extends ElkExtendedEdge { meta?: EdgeMeta }
export type Family = "graph" | "sequence" | "gantt" | "timeline" | "grid";
export interface NodeMeta { family?: Family; role?: string; [k: string]: unknown }
export interface EdgeMeta { role?: string; [k: string]: unknown }

/** A pin is presentation, keyed by model id (§13.1). */
export interface Pin { id: string; x: number; y: number; hard: boolean }

export interface FamilyLayout {
  family: Family;
  /** Lay out one compound's direct content. Children that are nested families
   *  arrive already sized (bottom-up). Must return every child with x/y/width/height,
   *  inner edges with sections, and one boundary port per external anchor. */
  layout(node: CNode, ctx: { pins: Map<string, Pin>; measure: (id: string) => { w: number; h: number } }): CNode;
  /** Inverse map for lift: geometry delta → AST patch (reorder, re-date), or null = soft pin. */
  lift?(node: CNode, moved: { id: string; dx: number; dy: number }): AstPatch | null;
}
```

Composition driver (about 150 lines, deliberately not a framework):

```
compose(node):
  for child in node.children where child.meta.family ∉ {undefined, "graph"}:
      compose(child)                                  # bottom-up
      plugins[child.meta.family].layout(child, ctx)   # writes x/y, sections, ports
      child.layoutOptions = { "elk.algorithm": "fixed",
                              "elk.hierarchyHandling": "SEPARATE_CHILDREN",
                              "elk.portConstraints": "FIXED_POS" }
  rewrite external edges that target an inner element → target the boundary port
  (node is graph) ⇒ one elk.layout(root) at the top handles every graph level,
                     INCLUDE_CHILDREN where zones exchange edges (T9)
  after ELK: route port → inner-target stubs; apply hard pins; reroute touched edges (libavoid)
```

Nesting in the other direction (a flowchart inside a Gantt row, a graph inside a grid cell) works
the same way: the inner graph is laid out first by its own `elk.layout` call, then passed to the
axis layouter as a sized box. That is D2's `LayoutNested`, with ports instead of straight lines.

### 5.3 Swimlane decision

Three options, cheapest first:

1. **Defer it.** Mermaid 11.17.2 (our pin) has `swimlane-beta` only as a new diagram type with its
   own renderer, and none of the m2e converters listed in §11.1 covers it.
2. **Lanes as rows, a restricted variant, about 200 lines.** Run `layered` on the whole graph
   ignoring lanes (global flow, direction RIGHT, model order), then do a post-pass: sort each
   node into its lane band by y, compact within the band, and reroute every edge with libavoid.
   This is the two-pass approach the user in #327 attempted, but with our post-pass doing the
   lane work instead of ELK constraints. Crossings inside a lane are not minimised against the
   lane ordering. Acceptable for small process diagrams; not BPMN-grade.
3. **A full lane-aware Sugiyama.** Mermaid's ~11.6k lines and yFiles `LayoutGrid` show the true
   cost. Do not build it.

Recommend 1, then 2 after the eval if swimlanes show up in dogfooding.

### 5.4 Risks

| Risk | Impact | Handling |
|---|---|---|
| The bundled elkjs fails under Bun (B1) | Server layout does not start | `elk-api.js` + `new Worker(elk-worker.min.js)`; add it to the parity suite |
| Pins are order-only in `layered` (T3) | "Positions survive" overstated in §9.4/§13.1 | Wording fix plus the libavoid repair pass for hard pins |
| Edges into the interior of a fixed compound get no route (T1) or throw (T2) | Blank or failing composite diagrams | Boundary-port rewrite in the driver is mandatory, with tests for T1/T2/T9 shapes |
| libavoid-js is LGPL-2.1, beta, and loads wasm asynchronously; its `.d.ts` is wrong | Licence review; startup latency; typing friction | Load it lazily, only when a family or pin needs it; keep a local `.d.ts`; LGPL via an unmodified npm dependency is normally acceptable, but confirm before shipping |
| `partitioning` silently misorders disconnected parts (T5) | Wrong columns | Always set `separateConnectedComponents: false` with partitions |
| Axis-family lift semantics (reorder, re-date) are new code with no ELK help | Wrong `.mmd` edits | `lift` per family, covered by fixture round-trips in the parity suite |
| ELK choice constraints look supported but are ignored (T6) | Silent no-ops if someone relies on them | Lint rule: reject `*ChoiceConstraint` in our option tables |
| Swimlanes demanded early | Weeks of work | §5.3, option 2 as the ceiling |

---

## Probe log (elkjs 0.12.0, Node 24.18; Bun 1.4.2 for B1)

| Id | Setup | Result |
|---|---|---|
| T1 | `layered` root, compound `fixed` with preset children, edge from outside to an inner child | Compound sized 240×92 and placed; children unchanged; inner-target edge **no sections** |
| T2 | T1 with root `INCLUDE_CHILDREN` | `UnsupportedGraphException` naming the cross-hierarchy edge |
| T3 | `layered`, every strategy `INTERACTIVE`, nodes at (0,0), (400,200), (200,100) | Returned (12,12), (162,212), (92,136): order and y kept, x recomputed |
| T4 | `fixed` on a fresh graph | Edge without sections stays without; preset sections kept verbatim |
| T5/T5b | `partitioning` on 3 partitions, one edge | Misordered with components separated; correct with `separateConnectedComponents: false` |
| T6 | `layerChoiceConstraint: 3` on the middle node of a chain | Ignored |
| T7 | libavoid-js orthogonal routing around a blocker, then `moveShape_delta` | Routed in 4.7 ms; rerouted straight after the move |
| T8 | Opaque/fixed compound with a `FIXED_POS` port, outer edge to the port | Routed to the port |
| T9 | Root `INCLUDE_CHILDREN` with two zones; a `fixed` + `SEPARATE_CHILDREN` + port compound in zone B | Cross-zone edge and edge to the port both routed |
| B1 | Bun: `elk.bundled.js`; then `elk-api.js` + `elk-worker.min.js` via Node `Worker` export; then Web Worker | Throws; throws; **works** |

## Sources

- ELK releases: https://github.com/eclipse-elk/elk/releases (0.12.0 on 2026-07-22, 0.11.0 on
  2025-09-15, 0.10.0 on 2025-03-19); notes: https://eclipse.dev/elk/downloads/releasenotes/release-0.11.0.html
  (VertiFlex, group model order, median crossing minimization),
  https://eclipse.dev/elk/downloads/releasenotes/release-0.12.0.html
- elkjs releases: https://github.com/kieler/elkjs/releases (0.12.0 on 2026-07-17); sources list in `elkjs/build.gradle`
- ELK option definitions: `plugins/org.eclipse.elk.alg.layered/.../Layered.melk`, `org.eclipse.elk.core/.../Core.melk`,
  `org.eclipse.elk.alg.vertiflex/.../VertiFlex.melk`, `org.eclipse.elk.alg.libavoid/.../Libavoid.melk` (shallow clone of https://github.com/eclipse-elk/elk, 2026-09-26)
- Domrös, "Layered: Constraining the Model", 2023-01-09: https://eclipse.dev/elk/blog/posts/2023/23-01-09-constraining-the-model.html
- Domrös, "Layered (overview)", 2025-08-21: https://eclipse.dev/elk/blog/posts/2025/25-08-21-layered.html
- Domrös et al., "The Eclipse Layout Kernel", 2023: https://arxiv.org/abs/2311.00533; "Diagram Control and Model Order for Sugiyama Layouts", 2024: https://arxiv.org/abs/2406.11393
- Petzold et al., "An Interactive Graph Layout Constraint Framework", VISIGRAPP 2023: https://www.scitepress.org/Papers/2023/118030/118030.pdf
- KIELER text-first framework, 2024: https://link.springer.com/chapter/10.1007/978-3-031-71291-3_33
- elkjs#327 swimlanes (2025-03): https://github.com/kieler/elkjs/issues/327
- elk#77 sequence layouter (open since 2016): https://github.com/eclipse-elk/elk/issues/77; fork: https://github.com/Cooperate-Project/de.cau.cs.kieler.papyrus.layout
- Hoops, "Automatic Layout of UML Sequence Diagrams", 2013: http://rtsys.informatik.uni-kiel.de/~biblio/downloads/theses/grh-dt.pdf
- elkjs libavoid: https://github.com/kieler/elkjs/issues/210, https://github.com/kieler/elkjs/issues/214, https://github.com/kieler/elkjs/issues/197; elk#315: https://github.com/eclipse-elk/elk/issues/315
- libavoid-js: https://github.com/Aksem/libavoid-js, https://www.npmjs.com/package/libavoid-js; adaptagrams: https://www.adaptagrams.org/documentation/libavoid.html; Sprotty router: https://github.com/Aksem/sprotty-routing-libavoid
- Sprotty ELK: https://sprotty.org/docs/sprotty-elk/introduction/
- yFiles: https://docs.yworks.com/yfiles-html/dguide/layout-table_layout/, https://docs.yworks.com/yfiles-html/dguide/layout/partial_layout.html, https://docs.yworks.com/yfiles-html/api/RecursiveGroupLayout.html, Gantt demo source: https://github.com/yWorks/yfiles-for-html-demos/tree/master/demos/view/ganttchart
- D2 source (shallow clone, last commit 2026-09-20): `d2layouts/d2layouts.go` (`LayoutNested`, `DefaultRouter` at line 376), `d2layouts/d2sequence/`, `d2layouts/d2grid/`: https://github.com/terrastruct/d2; docs: https://d2lang.com/tour/sequence-diagrams/, https://d2lang.com/tour/tala/
- Mermaid source (develop, 2026-09-21; 12.0.0 tree checked): `packages/mermaid/src/diagrams/{sequence,gantt,timeline}`, `rendering-util/layout-algorithms/swimlanes`, `docs/syntax/swimlanes.md`: https://github.com/mermaid-js/mermaid; 12.0.0 release: https://github.com/mermaid-js/mermaid/releases/tag/mermaid@12.0.0
- PlantUML layout engines: https://plantuml.com/layout-engines, Teoz: https://plantuml.com/teoz
- Structurizr PlantUML export: https://docs.structurizr.com/export/plantuml
- Bluefish, UIST 2024: https://arxiv.org/abs/2307.00146, https://vis.csail.mit.edu/pubs/bluefish/
- WebCoLa: https://github.com/tgdwyer/WebCola; SetCoLa: https://github.com/uwdata/setcola; Penrose: https://github.com/penrose/penrose; d3-dag: https://github.com/erikbrinkman/d3-dag
- Cope-and-Drag / lightweight diagramming, 2024: https://arxiv.org/abs/2412.03310
