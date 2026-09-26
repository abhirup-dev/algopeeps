# Diagram IRs, converters and round-trip prior art: build, adopt or extend

Date 2026-09-26. Input: `agent-layer-design.md` §§9–12 and `dogfood-synthesis.md`. Activity figures
come from `gh api`, `npm view` and the GitLab API, all run on 2026-09-26. Claims marked
**[unverified]** come from product documentation only; we did not test them.

## TL;DR

1. **Nothing to adopt wholesale.** No project, open or commercial, combines all three things we
   need: Mermaid text as truth, incremental re-layout around hand-placed nodes, and edits lifted
   back into minimal text changes. The nearest competitors have each declined one part. tldraw
   closed "keep Mermaid diagrams editable after conversion" as `not_planned` on 2026-09-15
   (#10801). Miro's Mermaid diagrams are bidirectional but auto-layout only, and dragging a node
   means converting the diagram to free-form, which is one-way. draw.io keeps style and label
   overrides but drops positions when it regenerates. Eraser resets the layout after a
   significant code edit.
2. **Restate the §9.4 claim.** Positions that survive already exist: in Structurizr's
   `workspace.json`, in two Obsidian plugins that write `%% mm-pos:` comments, and in D2's
   `top`/`left` keywords on TALA. What nobody ships is the combination: pins, incremental
   re-layout around them, auto-lift into minimal `.mmd` edits, and an interface built for agents.
3. **Mermaid 12.0.0 shipped on 2026-09-10.** ELK is now bundled and is the default layout, Node
   22.12+ is required, and `defaultRenderer` is removed. Flowchart still parses with
   `flow.jison`, so our db-adapter approach survives. **Stay on 11.17.2 for v0**, because
   `@excalidraw/mermaid-to-excalidraw` 2.2.2 depends on `mermaid ^11.12.1` and
   `@tldraw/mermaid` pins 11.16.1. Make the move to 12 a separate task gated by the parity suite.
4. **Flowchart is not moving to Langium.** Issue #4401 has been open since 2024-03. The only PR
   (#5892) was closed unmerged on 2026-04-21. `@mermaid-js/parser` 2.0.0 is public but covers
   only architecture, cynefin, eventmodeling, gitGraph, info, packet, pie, radar, railroad (four
   syntaxes), treeView, treemap and wardley. For flowchart, the internal db is still the only
   route, and there is no date for that to change.
5. **The "universal diagram IR" space is empty.** We found no serious project from 2024 to 2026.
   `i2mint/ij` has 0 stars, and the academic work is about hybrid text and visual editing, not
   interchange. The two official Mermaid→canvas converters (Excalidraw and tldraw) both read
   Mermaid's db, scrape positions from the rendered SVG, and are one-way.
6. **IR recommendation: own the semantic model, borrow the layout shape.** The meaning layer is
   our Mermaid-derived AST. The layout layer is shaped like ELK JSON (`x/y/width/height`, edge
   `sections`, labels, ports), because elkjs reads and writes it, so translation costs nothing.
   JSON Canvas is rejected as the IR: no shapes, no edge points, and no extension fields
   (jsoncanvas #13 and #57 are still open). Use it as an export adapter only.
7. **The seam is an adapter interface with five operations:** `emit`, `read`, `measure`,
   `render` and `capabilities`. Excalidraw leaks into five places today: `customData.gen`,
   frames that cannot nest, bound text as a separate `#label` element, binding semantics, and
   Excalifont measurement. Each becomes a capability flag or an adapter duty. Lint, diff, lift
   rules, layout and the printers stay backend-neutral.
8. **Best prior art to copy:** D2's `d2oracle` for lift (edit operations Create, Set, Move,
   Rename and Delete, each returning id deltas) and D2's `d2target`, one layout IR that feeds
   the SVG, sketch, ASCII and raster renderers. Structurizr's `copyLayoutInformationFrom` is a
   warning: layout merges by name, so a rename loses the layout.
9. **tldraw as a second backend has a licence cost.** Since SDK 4.0 (2025-09), production use
   needs a licence key. The free hobby key is non-commercial and forces a watermark.
   `@tldraw/mermaid` is under the tldraw licence, not MIT. draw.io (Apache-2.0) is the cleaner
   second backend.
10. **Verdict per layer.** Syntax: adopt (Mermaid). Model: build a thin layer over Mermaid's db.
    Layout: adopt elkjs and its JSON shape. Presentation: build a small neutral record.
    Backends: build one adapter each, Excalidraw first.

---

## 1. Existing IRs and interchange formats

The fitness column scores each format against our needs: meaning and geometry kept apart, custom
fields, id-stable round trips, a JavaScript toolchain, and a permissive licence.

| Format | Semantic vs geometry | Extensible | Round-trip friendly | Tooling / activity | Licence | Fit as our IR |
|---|---|---|---|---|---|---|
| **JSON Canvas 1.0** (Obsidian) | Geometry only. Node types are `text/file/link/group`, edges attach by side, 6 preset colours. No shapes, no edge points | Spec says nothing. Custom metadata is an open question (#13 from 2025-02, #57 from 2026-09) | Ids yes; loses shape, route and style | Spec unchanged since 2024-03-11; repo last pushed 2026-07-24; 3.7k stars; Obsidian plus a few apps | MIT | **No.** Export target for Obsidian only |
| **ELK JSON** | Layout graph: nodes, ports, labels, edges, edge `sections` with bend points, `layoutOptions`, nested `children` | `layoutOptions` is a free key/value map; extra properties on elements are carried through in practice | Ids required and stable; input and output share one schema | elkjs 0.12.0 (2026-07-17), commits 2026-09; Mermaid 12 bundles it | EPL-2.0 | **Yes, for the layout layer.** Not a semantic model |
| **Graphviz DOT / xdot / `-Tjson`** | DOT is semantic plus attributes; xdot and json add drawn geometry | Arbitrary attributes | Positions can be fed back with `pos` and `neato -n`; no incremental layered layout | 16.1.0 (2026-09-04), active on GitLab | EPL-1.0 | No. Weaker compounds and no incremental mode, and elkjs already covers layout |
| **GraphML** | Graph plus `<key>/<data>`; geometry only through vendor extensions (yEd) | Yes (`key`) | XML, verbose | Stable, little new tooling | Open spec | No. Nothing it offers is missing from ELK JSON |
| **D2 IR** (`d2ir` → `d2graph` → `d2target`) | Clean split: `d2graph` holds meaning, `d2target.Diagram{Shapes,Connections}` holds positioned output | Classes, vars, globs | `d2oracle` edits the AST with id deltas; D2 Studio edits visually | v0.9.0 (2026-09-07), 25.5k stars; renderers `d2svg`, `d2sketch`, `d2ascii`, `d2raster`, animate; layouts dagre, ELK, TALA | MPL-2.0 (TALA proprietary) | No (Go, different syntax), but **the architecture to copy** |
| **Structurizr workspace** | Model (elements, relationships) kept apart from views (per-view element x/y, vertices) | Properties and perspectives | Layout merged into a new DSL build by element identity; renames lose layout | Most repos archived 2026-02; Lite marked end-of-life; active work is in the new `structurizr/structurizr` (pushed 2026-09-19) | Apache-2.0 | No, but **the model/view split is the right idea**; defer multi-view |
| **PlantUML** | Text only; layout by Graphviz or Smetana; no position model | Skinparams | One-way | Active (snapshot 2026-09-25) | GPL plus LGPL/Apache/EPL/MIT variants | No |
| **draw.io / mxGraph XML** | Geometry-first: `mxCell` with a `style` string and `mxGeometry`; meaning is implicit | `<object>` / UserObject attributes on any cell | Ids stable; everything persists | drawio v31.5.2 (2026-09-23); mxGraph archived 2020, successor maxGraph 0.24.0 | Apache-2.0 | No. Good **backend** |
| **tldraw store** | Typed records (shapes, bindings, pages) with migrations; geometry plus props | `meta: JsonObject` on every record | Ids stable; bindings are first-class records | v5.4.2 (2026-09-10), 50k stars | tldraw licence (key needed in production) | No. Good **backend** with a licence caveat |
| **ExcalidrawElementSkeleton** | Creation-only shorthand for elements; `convertToExcalidrawElements` expands it | `customData` on the resulting elements | **One-way**: there is no element → skeleton function | Excalidraw 0.18.1 (2026-04-21) | MIT | No. It is our emit target |
| **Mermaid db** (jison flowchart) | Semantic: vertices, edges, subgraphs, classes; no geometry | Only through `%%` comments and `@{}` metadata | Parse only; no printer | mermaid 12.0.0 (2026-09-10); flowchart still `flow.jison` | MIT | **Yes, as the source of our semantic model**, behind one adapter |
| **@mermaid-js/parser** (Langium) | Typed AST for the types listed in TL;DR 4 | Grammar-level | Parse only | 2.0.0 (2026-09-10) | MIT | Only for architecture/packet/etc. **Not flowchart, state, sequence, class or ER** |
| **Penrose** | Domain/Substance/Style programs; layout by constrained optimisation | Yes (Style) | Not interactive at edit speed; no hand-edit model | v3.3.1 (2026-08-30) | MIT | No. A research tool for math figures |
| **Kroki** | None; it forwards source text to ~25 renderers and returns SVG/PNG | — | One-way | v0.32.1 (2026-08-12) | MIT | No. Could serve as a "plain SVG of other languages" backend |
| **"Universal diagram IR" (2024–26)** | `i2mint/ij`: Python DiagramIR → Mermaid/PlantUML/D2 | — | Text-to-text only | 0 stars; created 2025-11 | MIT | No. **Finding: no credible neutral IR exists** |

The pattern: formats split into **semantic** (Mermaid db, DOT, Structurizr model, `d2graph`) and
**positioned** (ELK JSON, `d2target`, JSON Canvas, draw.io, tldraw, Excalidraw). Only D2 and
Structurizr own both layers and keep them apart. That is the shape our design already has with
`.mmd` and `.excalidraw`. Our gap is that the positioned layer is currently Excalidraw's own
format, not a neutral one.

## 2. Existing converters

### 2.1 Libraries and plugins

| Project | Direction | Fidelity | Positions and hand edits | Activity | Licence |
|---|---|---|---|---|---|
| `@excalidraw/mermaid-to-excalidraw` 2.2.2 | Mermaid → Excalidraw skeleton | Flowchart, sequence, class, ER, state; the rest become an image. Takes positions from the rendered SVG | None; one-shot | npm 2026-03-24; depends on `mermaid ^11.12.1` | MIT |
| Reverse direction, officially | — | Requested in excalidraw #11187 (2026-04-17, open) and m2e #66 | — | not started | — |
| `sindrel/excalidraw-converter` | Excalidraw → Mermaid, Gliffy, draw.io | Boxes and arrows to a flowchart; direction flag; layout lost | Discarded | pushed 2026-09-01, 294 stars | MIT |
| `@excalidraw-to-mermaid/core` | Excalidraw → Mermaid | Basic | Discarded | one release, 2024-09 | ISC |
| `@tldraw/mermaid` 5.4.2 | Mermaid → tldraw shapes | Flowchart, sequence, state, mindmap; others fall back to SVG. Reads the db, scrapes positions with `getBBox()`, and builds a `blueprint` typed with tldraw styles | None; "one-way snapshot". #10801 closed `not_planned` | created 2026-03, active | tldraw licence |
| draw.io built-in Mermaid (2026-07-03) | Mermaid → native shapes in a container group, source attached | Native shapes; ELK or dagre | **Style and label overrides persist** across source edits; **position and route edits are overwritten on regenerate** | active | Apache-2.0 |
| draw.io → Mermaid | only third-party web tools | Low | — | — | various |
| tldraw → Mermaid | none found | — | — | — | — |
| D2 ↔ others | D2 → SVG/PNG/PDF/PPTX/ASCII; `d2svgimport`; no Mermaid bridge | — | — | — | MPL-2.0 |
| Obsidian **MermaidMaker** | Mermaid ↔ canvas, both ways | Flowchart | Positions saved as `%% mm-pos: A=10,20 B=200,30`; dagre places new nodes | ~1k downloads | [unverified] |
| Obsidian **Mermaid Flow** | Mermaid ↔ visual editor, both ways | Flowchart, plus MVP sequence, mindmap and ER | Positions in hidden Mermaid comments; claims to keep unknown lines | pushed 2026-09-18 | GPL-3.0 |
| Obsidian Draw a Mermaid, Merlay | Visual → Mermaid | Flowchart | Positions in a comment block | small | [unverified] |
| `Kundhan007/mermaid-excalidraw-sync` | Mermaid → Excalidraw workspace | Wraps a converter | No lift | 0 stars, 2026-09 | MIT |

### 2.2 Products that pair diagram-as-code with visual editing

| Product | Text form | Hand edits | Layout persistence | Sketches beside the diagram |
|---|---|---|---|---|
| **Mermaid Chart** visual editor | Mermaid | Flowchart, class, sequence, state, mindmap, ER, requirement. Visual edits **rewrite the code**; the help page says to use the Code Editor "if you want to preserve exact code formatting" | Auto-Layout on, or Manual layout (formerly "Whiteboard") with free dragging. Where manual positions are stored is **[unverified]**; there is no open Mermaid syntax for them | Whiteboard mode |
| **Miro** structured Mermaid (beta) | Mermaid is "the source of truth"; Miro MCP lets agents create and edit | Flowchart only; limited to what Mermaid syntax expresses | **Miro auto-layout only. To move shapes freely, convert to free-form**, which is one-way | Yes, native board |
| **Eraser** | Eraser DSL | Drag or resize a node or group (beta) | Manual layout kept until **"a significant edit to the code"**, which **resets it automatically** | Separate freeform canvas |
| **D2 Studio** (Terrastruct) | D2 | Full visual editing through `d2oracle` | `top`/`left` locks on TALA only; everything else auto-laid out | [unverified] |
| **Structurizr** | DSL | Drag boxes in the web UI | Layout lives in `workspace.json`, copied into each new DSL build; **lost on rename** or on reordering that changes internal ids | No |
| **IcePanel** | None (model UI) | Model-based; one object appears in many diagrams | Per-diagram positions **[unverified]** | Limited |
| **Ilograph** | YAML | None | Auto-layout per perspective **[unverified]** | No |
| **Swimlanes.io** | Sequence text | None | Not applicable (repo not found; text-only product) | No |

## 3. Prior art on the round-trip problem

| Approach | Where | What worked | What failed |
|---|---|---|---|
| **Text truth, layout in a side file keyed by identity** | Structurizr `workspace.json`, our `.excalidraw` | Source stays clean; layout survives DSL edits | Identity was the *name* or creation order, so renames and reorders drop layout. Our explicit Mermaid ids avoid this, which is why §10.1's flat ids matter |
| **Positions inside the text as comments** | MermaidMaker `%% mm-pos:`, Mermaid Flow, Draw a Mermaid | One portable file; renders in stock Mermaid | Diffs get noisy with coordinates; sketches, styles and routes don't fit; every drag rewrites the source. This is our `export --pins`, correctly kept opt-in |
| **Pins in the language** | D2 `top`/`left` (TALA), our `@pin` | Layout moves around locked nodes | Proprietary engine; both coordinates required. ELK's interactive strategies give us the free equivalent |
| **Overrides keep style, regeneration resets geometry** | draw.io Mermaid container | Simple and predictable | Users lose every drag on any source edit. This is exactly the pain our incremental layout exists to remove |
| **Auto-layout only; free-form is an exit** | Miro, Eraser (reset on significant edit) | No merge problem at all | Hand placement is either impossible or temporary |
| **Visual edits regenerate the whole source** | Mermaid Chart | Easy to build | Destroys the author's formatting. Evidence for the §12.2 minimal-edit printer |
| **Edit operations on the AST, minimal text change** | D2 `d2oracle` (Create/Set/Move/Rename/Delete, plus `*IDDeltas`), MPS-style projectional editing | Every visual gesture is a named, typed edit; renames are explicit id deltas | Needs a real printer for the grammar. D2 owns its formatter; for Mermaid we must write a statement-level one |
| **Figma overrides** | Instance property overrides | Overrides persist while layer name and hierarchy match | Renames or restructures of the main component reset them. Same lesson as Structurizr: identity is everything |
| **Bidirectional lenses / evaluation update** | Boomerang lenses; Sketch-n-Sketch (PLDI 2016, "Bidirectional Evaluation with Direct Manipulation", 2018) | Principled; round-trip laws such as GetPut and PutGet | Needs a programmable source language; unresolved edits need heuristics or user choice. Our source is declarative, so a table of lift rules is enough, and proving it lawful is not worth the effort |
| **Hybrid structured editing** | "Hybrid Structured Editing" (arXiv 2603.05644, 2026-03) and "Mixing visual and textual code" (2603.15855, 2026-03) | Text for users, structure for tools. Matches our "agents write `.mmd`, tools own the AST" | Research prototypes |

What these designs teach, applied to ours:

1. **Identity decides whether a round trip survives.** Every failure above, in Structurizr, Figma
   and draw.io, is lost identity. Explicit Mermaid ids plus `e1@-->` edge ids are the most
   important decision we have made.
2. **Separate by who owns a field, not by format.** Meaning (text, bindings) goes up to `.mmd`.
   Presentation (geometry, style) stays in the scene. Every successful system draws the line
   there; the systems that fail blur it (Mermaid Chart rewriting code, comment-embedded positions).
3. **Lift as named operations with id deltas, not as re-serialisation.** Copy `d2oracle`'s
   surface for our lift patches.
4. **Reset is the failure users remember.** Eraser and draw.io both reset. Our interactive-ELK
   seeding plus soft pins is the answer, and the parity and eval steps must measure it.

## 4. A renderer-agnostic architecture

### 4.1 What is Excalidraw-specific today

| Component (design section) | Excalidraw-specific? | What generalises |
|---|---|---|
| **emit** (§3.2, §11.4) | Yes: skeleton, `convertToExcalidrawElements`, bound text as `id#label`, `frameId` | Adapter `emit(model, layout, presentation) → scene patch` |
| **merge via `customData.gen`** (§3.3) | Storage place is specific; the three-way merge by field group is neutral | Capability `opaqueMeta`: Excalidraw `customData`, tldraw `meta`, draw.io cell attributes, JSON Canvas none (fall back to a side table keyed by id) |
| **bindings** (§3.2, §12.3) | Yes: `startBinding`/`endBinding`, and bound arrows follow moves between applies | Adapter `read` normalises to `{edgeId, from, to, bound: boolean}`; capability `bindings: "native" \| "none"` |
| **frames** (§3.1) | Yes: frames cannot nest (#8359), membership is geometric (#6847), `frameId` re-asserted on pull | Capability `nesting: "flat" \| "deep"`. tldraw frames nest; draw.io containers nest; JSON Canvas groups are geometric |
| **measure via the sidecar** (§10.4, §11.2) | Font (Excalifont) and wrap rules are specific | Adapter `measure(texts, font) → sizes`, with the cache keyed by `(backend, font, size, text, width)` |
| **lint geometry** (§5) | Neutral if it runs on layout boxes plus adapter-measured text boxes | Unchanged; takes `Layout` plus measured boxes |
| **look / snap** | Rendering is specific | Adapter `render(ids \| bbox) → PNG + boxes` |
| **lift** (§12.3) | Reading the scene is specific; the rules table is neutral | Adapter `read(scene) → NeutralScene`; lift runs on `NeutralScene` vs last `Layout`/`Presentation` |
| **diff** (§10.5) | Neutral (AST plus geometry deltas) | Unchanged |
| **printers** (§12.2) | Neutral | Unchanged |
| **`.excalidraw` as the presentation file** (§12.1) | Yes | Keep, but it becomes *one adapter's serialisation* of the presentation layer (see 4.4) |

### 4.2 The seam

```
            agent / human edits text                          human edits canvas
                     │                                                  │
                     ▼                                                  │
  .mmd ──► mermaid-adapter ──► Model (semantic AST) ◄─── lift rules ◄───┤
            (jison db, pinned)        │      ▲                          │
                                      ▼      │ minimal-edit printer     │
                            layout (elkjs) ──► Layout (ELK-shaped)      │
                                      │                                 │
                                      ▼                                 │
                             Presentation (overrides, pins, freeform,   │
                             anchors, per-element opaque meta)          │
                                      │                                 │
        ┌──────────────── BackendAdapter interface ─────────────────┐   │
        │  emit │ read │ measure │ render │ capabilities            │   │
        └───┬──────────┬────────────┬─────────────┬─────────────────┘   │
            ▼          ▼            ▼             ▼                     │
       Excalidraw   tldraw      draw.io      SVG / JSON Canvas          │
       (v0, full)  (licence)   (Apache)      (emit-only)                │
            └──────────┴────────────┴── read(scene) ────────────────────┘
```

Lint, diff, lift rules, printers and layout sit above the line and never import a backend.

### 4.3 Type sketches

```ts
// ── Semantic layer: our AST, filled from Mermaid's db. Owned by us. ─────────
type Id = string;                        // Mermaid node id, `from->to`/`e1` edge id, `z:<subgraph>`
interface Model {
  kind: "flowchart" | "state" | "sequence" | "class" | "er";
  direction?: "TB" | "LR" | "BT" | "RL";
  nodes: Map<Id, { label: string; shape: string /* Mermaid shape name */; roles: string[] }>;
  edges: Map<Id, { from: Id; to: Id; label?: string; kind: "solid" | "dotted" | "thick"; heads: [Head, Head] }>;
  zones: Map<Id, { label?: string; members: Id[]; parent?: Id }>;  // nesting is semantic
  classes: Map<string, StyleDecl>;       // classDef, backend-neutral CSS-ish keys
  directives: Directive[];               // @pin @labelAt @allow @eject @include @note
  source: { text: string; spans: Map<Id, Span> };   // for the minimal-edit printer
}

// ── Layout layer: ELK-shaped, so elkjs in and out costs nothing. ─────────────
interface Box { x: number; y: number; width: number; height: number }
interface Layout {
  nodes: Map<Id, Box & { zone?: Id }>;
  zones: Map<Id, Box>;
  edges: Map<Id, { sections: { start: Pt; bends: Pt[]; end: Pt }[]; label?: Box }>;
  measured: boolean;                     // false = cache/table fallback
}

// ── Presentation layer: what humans own. Neutral, small. ─────────────────────
interface Presentation {
  pins: Map<Id, { kind: "soft" | "hard"; at: Pt }>;
  overrides: Map<Id, Partial<StyleDecl>>;        // human style changes, kept by merge
  gen: Map<Id, { geom: Hash; style: Hash; text: Hash }>;  // three-way merge base
  freeform: FreeformItem[];                      // human shapes, text, freedraw; opaque per backend
  anchors: Map<string /* freeform id */, { to: Id; offset: Pt }>;
  tombstones: Set<Id>;
}
type FreeformItem = { id: string; backend: BackendId; payload: unknown; bbox: Box };

// ── Backend adapter. One per canvas. ─────────────────────────────────────────
type BackendId = "excalidraw" | "tldraw" | "drawio" | "svg" | "jsoncanvas";
interface Capabilities {
  nesting: "flat" | "deep";              // Excalidraw frames: flat
  bindings: "native" | "none";
  opaqueMeta: boolean;                   // survives a round trip through the editor
  edgeLabels: "bound" | "separate" | "none";
  readBack: boolean;                     // false = emit-only (SVG, JSON Canvas, Kroki)
  shapes: ReadonlySet<string>;           // Mermaid shape names drawn natively; others degrade
  freeform: boolean;
}
interface NeutralScene {                 // what `read` returns; lift works only on this
  elements: Map<string, { id: string; genId?: Id; box: Box; text?: string; style: Partial<StyleDecl>;
                          bound?: { from?: string; to?: string }; zone?: string }>;
  deleted: Set<Id>;
}
interface BackendAdapter<Scene> {
  id: BackendId;
  capabilities: Capabilities;
  emit(m: Model, l: Layout, p: Presentation, prev?: Scene): { scene: Scene; report: ApplyReport };
  read?(scene: Scene): NeutralScene;     // required when capabilities.readBack
  measure(texts: MeasureReq[]): Promise<Box[]>;  // backend font + wrap rules
  render?(scene: Scene, target: Id[] | Box): Promise<{ png: Uint8Array; boxes: Map<string, Box> }>;
  serialise(scene: Scene): string;       // e.g. .excalidraw, .tldr, .drawio
}
```

Lift is then one neutral function, `lift(read(scene), layout, presentation, gen) → { patch:
AstPatch[], presentation }`. `AstPatch` copies `d2oracle`'s vocabulary: `create`, `set`
(label/shape/class), `reconnect`, `delete`, `rename`, `move` (zone). Each patch carries id
deltas, and the minimal-edit printer turns patches into line edits.

### 4.4 How tldraw and draw.io would map

| Concept | Excalidraw (v0) | tldraw | draw.io |
|---|---|---|---|
| Node | `rectangle`/`ellipse`/`diamond` + bound `text` (`id#label`) | `geo` shape; label inside `props.richText` | `mxCell vertex` with a `style` string (`shape=cylinder3;…`) and a value label |
| Edge | `arrow` with points, `startBinding`/`endBinding` | `arrow` shape + two `binding` records; bends via `bend` or elbow | `mxCell edge` with `source`/`target` and `mxGeometry` points |
| Edge label | separate bound text | `props.text` on the arrow | cell value; position via `mxGeometry` offset |
| Zone | `frame`, flat only | `frame` or `group`, nests | container cell (`container=1`), nests |
| Opaque meta (`gen`, pins) | `customData` (copied on paste; §10.2 handles it) | `meta` (copied on duplicate as well; same derived-id rule applies) | UserObject attributes on the cell |
| Ids | we set element ids | `shape:<id>` prefix required | cell `id` free-form |
| Measure | Excalifont via sidecar | tldraw's draw font; the tldraw converter inflates font size for the same reason | Helvetica default; html labels measured in the browser |
| Render | sidecar Playwright | `editor.toImage` in a headless page | draw.io export (desktop CLI or `export3` servlet) |
| Serialise | `.excalidraw` JSON | `.tldr` JSON | `.drawio` XML |
| Licence | MIT | tldraw licence: key in production, hobby = non-commercial + watermark | Apache-2.0 |
| Effort for an adapter | built as v0 | ~2 days, plus the licence decision | ~2–3 days; style-string mapping is the bulk |

SVG and JSON Canvas are **emit-only** adapters (about half a day each). SVG comes straight from
`Layout` plus `Presentation`. JSON Canvas maps nodes to `text` nodes, zones to `group`, and edges
to `fromNode`/`toNode` with the side nearest the routed endpoint. It loses shapes, bends and
style, so its adapter reports those losses.

### 4.5 Our own AST, or an existing format?

| Option | Gain | Cost | Verdict |
|---|---|---|---|
| Our AST (Model) + ELK-shaped Layout + small Presentation | Exact fit; elkjs speaks Layout natively; Mermaid stays the syntax | ~150 lines of types plus adapters; we own the schema | **Recommended** |
| JSON Canvas as presentation + Mermaid model | "Open format" label; Obsidian reads it | No shapes, bends, style or custom fields; we would extend it immediately, which is a fork in all but name | Reject; export adapter only |
| ELK JSON as *the* IR | One format | ELK has no roles, classes, directives or freeform; we would push semantics into `layoutOptions`, which is abuse | Use for Layout only |
| draw.io XML or tldraw store as the neutral format | Rich and persistent | Binds us to another editor, the exact thing to avoid | Reject |
| `@tldraw/mermaid` blueprint | Already exists | Typed with `TL*Style`, filled from the SVG scrape, tldraw licence | Reject; its `x,y,w,h,kind,parentId` node shape confirms our Layout shape |

**Cost of the seam now:** about one extra day on top of §11.6. It covers splitting `apply` into
merge (neutral) and emit (adapter), writing `read` for Excalidraw, and moving `gen` into
`Presentation`. **Cost of adding it later:** every module written against Excalidraw elements
(lint, lift, diff, look) has to be rewritten. The seam is cheap now because none of it is built.

**On `.excalidraw` as the stored presentation.** Keep it for v0: it opens on excalidraw.com
and is the file the human edits. Derive `Presentation` from it with `read`. When a second
backend arrives, add a neutral `ride.layout.json` (Presentation + last Layout) as the file that
carries meaning across backends, and treat each backend file as a cache it can rebuild from.
Do not build that file now.

## 5. Verdict per layer

| Layer | Verdict | What | Change from the current design | Keep |
|---|---|---|---|---|
| Syntax | **Adopt** | Mermaid flowchart syntax + `%%` directives | Stay on 11.17.2 for v0 (m2e depends on `^11`); record 12.0.0 as a gated upgrade; Mermaid 12's bundled ELK makes stock renders look more like ours | Everything in §9, §11.1 |
| Model | **Build (thin)** | Normalised AST from the jison db | Name it `Model`; add `source.spans` for the minimal-edit printer; zones carry `parent` even though Excalidraw can't nest | Pinning, parity suite, happy-dom |
| Layout | **Adopt** | elkjs, ELK JSON shape as the `Layout` type | Make `Layout` a first-class value that lint, diff and adapters consume, not an internal of emit | Interactive seeding, compounds, orthogonal routes |
| Presentation | **Build (small)** | Pins, overrides, `gen`, freeform, anchors, tombstones | Move `gen`/pins out of the "`customData` schema" into `Presentation`; `customData` becomes Excalidraw's storage for it | Three-way merge table §3.3, lift rules §12.3 |
| Lift | **Build, copying d2oracle** | Operations with id deltas → minimal-edit printer | Define `AstPatch` = create/set/reconnect/delete/rename/move | §12.3 rules and amendments |
| Backend | **Build per adapter** | Excalidraw now; draw.io next; tldraw after a licence decision; SVG/JSON Canvas emit-only | `BackendAdapter` + `Capabilities`; frames-can't-nest and bound-text move into the Excalidraw adapter | Sidecar, `measure` cache (add `backend` to the key) |
| Converters | **Wrap** m2e for non-flowchart families (§11.3) | — | Note that m2e pins us to Mermaid 11 | Wrap, not fork |

## Risks

| Risk | Likelihood | Handling |
|---|---|---|
| Mermaid 12 drift: m2e and `@tldraw/mermaid` stay on 11 while bug fixes land only in 12 | Medium | Parity suite; plan a 12 upgrade once m2e moves, or replace m2e for the four families with our own family layouts (§9.2 already plans that) |
| Flowchart jison internals change in 12.x (db field names, `@{}` metadata) | Medium | Exact pin, one adapter, AST snapshots |
| Langium flowchart lands and the jison db is removed | Low (no activity since 2026-04) | Adapter isolates it; a typed Langium AST would make the adapter smaller |
| The seam becomes an abstraction with one implementation for months | Medium | Keep it to types plus one adapter; don't build a second adapter until someone asks. `Capabilities` exists to document Excalidraw's limits, not to invite backends |
| Presentation diverges between backends | Low until a second backend exists | Presentation keyed by our ids only; freeform stays backend-opaque and is reported, not converted |
| tldraw licence | Certain if chosen | Treat tldraw as a licensed, optional adapter; draw.io first |
| Identity loss on rename (the Structurizr and Figma failure) | Medium | Rename as an explicit `AstPatch` with id deltas; `renamed?` detection from §3.1 |
| Overclaiming differentiation | — | Use the TL;DR 2 wording in external descriptions |
| Coverage gaps | — | Mermaid Chart manual-layout storage, IcePanel, Ilograph and some Obsidian plugin licences are **[unverified]**; the Swimlanes repo was not found |

## Sources

- Mermaid 12.0.0 release (2026-09-10): https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0
- Mermaid Langium tracking issue #4401: https://github.com/mermaid-js/mermaid/issues/4401 ; flowchart Langium PR #5892 (closed 2026-04-21): https://github.com/mermaid-js/mermaid/pull/5892
- `@mermaid-js/parser` grammars: https://github.com/mermaid-js/mermaid/tree/develop/packages/parser/src/language ; flowchart jison: https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/src/diagrams/flowchart/parser
- JSON Canvas spec 1.0: https://jsoncanvas.org/spec/1.0/ ; issues #13, #57: https://github.com/obsidianmd/jsoncanvas/issues
- ELK JSON format: https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html ; elkjs: https://github.com/kieler/elkjs
- Graphviz releases: https://gitlab.com/graphviz/graphviz/-/releases
- D2 repo (d2oracle, d2target, d2renderers): https://github.com/d2lang/d2 ; D2 positions (`top`/`left`, TALA): https://d2lang.com/tour/positions/
- Structurizr Lite workflow and layout: https://docs.structurizr.com/lite/workflow ; troubleshooting (renames lose layout): https://docs.structurizr.com/lite/troubleshooting ; new repo: https://github.com/structurizr/structurizr
- draw.io editable Mermaid (2026-07-03): https://www.drawio.com/blog/mermaid-updates/ ; manual: https://www.drawio.com/docs/manual/mermaid/
- tldraw Mermaid docs: https://tldraw.dev/docs/mermaid ; blog: https://tldraw.dev/blog/turning-mermaid-code-into-shapes ; #10801 (not_planned): https://github.com/tldraw/tldraw/issues/10801 ; #10790: https://github.com/tldraw/tldraw/issues/10790 ; blueprint: https://github.com/tldraw/tldraw/blob/main/packages/mermaid/src/blueprint.ts ; licence: https://github.com/tldraw/tldraw/blob/main/LICENSE.md , https://tldraw.dev/get-a-license/hobby
- Excalidraw reverse-direction request #11187: https://github.com/excalidraw/excalidraw/issues/11187 ; m2e: https://github.com/excalidraw/mermaid-to-excalidraw
- excalidraw-converter: https://github.com/sindrel/excalidraw-converter ; `@excalidraw-to-mermaid/core`: https://www.npmjs.com/package/@excalidraw-to-mermaid/core
- Mermaid Chart visual editor: https://mermaid.ai/docs/build-and-edit/use-the-visual-editor ; Editing & Layout (2026-08-18): https://mermaid-25331.zendesk.com/hc/en-us/articles/51052468630547-Editing-Layout
- Miro Mermaid diagrams (beta): https://help.miro.com/hc/en-us/articles/7004628130962-Create-Mermaid-diagrams-Beta
- Eraser drag-drop editing: https://docs.eraser.io/docs/draggable-edits-beta
- IcePanel diagramming: https://docs.icepanel.io/core-features/diagramming ; Ilograph: https://www.ilograph.com/docs/editing/
- Obsidian: MermaidMaker https://community.obsidian.md/plugins/mermaid-maker ; Mermaid Flow https://github.com/THANSHEER/obsidian-mermaid-flow ; Merlay https://community.obsidian.md/plugins/merlay ; Draw a Mermaid https://community.obsidian.md/plugins/draw-a-mermaid
- Penrose: https://github.com/penrose/penrose ; Kroki: https://github.com/yuzutech/kroki ; ij: https://github.com/i2mint/ij
- Figma overrides: https://help.figma.com/hc/en-us/articles/360039150733-Apply-changes-to-instances
- Sketch-n-Sketch: https://ravichugh.github.io/sketch-n-sketch/ ; Bidirectional Evaluation with Direct Manipulation: https://arxiv.org/abs/1809.04209 ; Hybrid Structured Editing: https://arxiv.org/abs/2603.05644 ; Mixing visual and textual code: https://arxiv.org/abs/2603.15855 ; MPS projectional editing: https://www.jetbrains.com/help/mps/mps-faq.html
