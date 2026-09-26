# Test fixtures

Ground truth for lint (1.6), the eval harness (P0.9) and the Mermaid parity
suite (2.11). Checked by `test/parity/src/defects.test.ts` (manifest schema,
ids exist in the scene) and `test/parity/src/mermaid-fixtures.test.ts` (every
`.mmd` parses with mermaid 11.17.2 and is detected as its family).

```
fixtures/
  dogfood/yct/        scene.excalidraw  final.png  defects.json   one-command-at-a-time tester
  dogfood/batch/      scene.excalidraw  final.png  defects.json   batch-path tester
  dogfood/bst/        scene.excalidraw  final.png  defects.json   round-3 BST, final
  dogfood/bst-first/  scene.excalidraw  final.png  defects.json   round-3 BST, first add
  dogfood/*-painted/  scene.excalidraw  final.png  defects.json   yct, batch, bst-first as the tester's browser painted them
  tasks/              ride-hailing.mmd  bst.mmd                    the two dogfood tasks as Mermaid
  mermaid/            <family>-N.mmd                               Mermaid docs samples, 10 families
```

## Dogfood scenes

The final round-1 scenes from the two testers of `mcp-excalidraw-server` 2.0.0
(ride-hailing "request a ride" architecture, after edits (a) and (b)). Copied
byte for byte from `canvas/.artifacts/dogfood/` (gitignored there):

| Fixture                          | Source                                                             | Report                                       |
| -------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `dogfood/yct/scene.excalidraw`   | `yct-final.excalidraw` (= `/tmp/xd_final.excalidraw`)              | `canvas/docs/dogfood-excalidraw-yctimlin.md` |
| `dogfood/yct/final.png`          | `xd_final.png`                                                     |                                              |
| `dogfood/batch/scene.excalidraw` | `batch-final.excalidraw` (= `/tmp/dogfood-batch/final.excalidraw`) | `canvas/docs/dogfood-excalidraw-batch.md`    |
| `dogfood/batch/final.png`        | `07-final.png`                                                     |                                              |

Round 3 (tester A, dense BST figure) has no written report section; its report
is the tester's round-3 chat answer (transcript `d24dbb60…jsonl`, line 408)
and the R3 rows of `canvas/docs/dogfood-synthesis.md`. The BST scenes are not
byte for byte: both are filtered to the 95 BST elements (the 65 the tester
added plus their bound `-label` texts), dropping the round-2 ride-hailing state
on the same canvas. The PNGs are cropped to the tester's own 1000x720 window
(`sips -c 720 1000 --cropOffset 0 2900`):

| Fixture                              | Source                                                                                                                                    | Report                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `dogfood/bst/scene.excalidraw`       | fresh `export` from the tester's still-running server (2026-09-26); geometry equals the tester's final `query` dump `/tmp/xd_r3_all.json` | `canvas/docs/dogfood-synthesis.md` |
| `dogfood/bst/final.png`              | `/tmp/xd_bst_v3.png` (after fix1, fix2)                                                                                                   |                                    |
| `dogfood/bst-first/scene.excalidraw` | `/tmp/xd_r3.excalidraw` (exported after the first add, before both fixes)                                                                 | `canvas/docs/dogfood-synthesis.md` |
| `dogfood/bst-first/final.png`        | `/tmp/xd_bst_v1.png` (first add)                                                                                                          |                                    |

The final BST is clean, so `bst` only measures false positives; `bst-first`
holds the same two wraps unfixed and is the one that tests lint.

### As painted (`*-painted`)

`yct-painted`, `batch-painted` and `bst-first-painted` are the same scenes
rewritten to what the testers' browser painted (see `envOnly` below), so
`text-wrapped` and `label-on-own-arrowhead` have real must-flag cases. Written
by `bun elkdraw/test/parity/lint/paint.ts` from the originals:

- every text in Excalifont (fontFamily 5); bound labels at 20 px (the server
  stores none; free texts keep their stored size, which the server has too);
- container geometry `final.png` shows changed: in `bst-first` the wrapped
  keys stretched circles `t12` and `t10` to height 80 (ink 88 px tall at
  1x in `final.png`, 85 in our snap; the unstretched `t8` inks 52 and 48).
  yct and batch keep their geometry.

`final.png` is a copy of the original's. `defects.json` is the original's with
every `envOnly` dropped (those defects are drawn now and must be flagged), and
batch-10 marked `notDrawn`. `evidence/` holds the same composites as the
originals, with the painted scene on the right. Clean regions are unchanged:
the stretched circles stay inside the `tree` region's bbox, and no region's
ids changed.

The PNG is what the browser rendered and is the truth. The stored geometry is
not: arrow label `x/y` and arrow endpoints are recomputed at render time (for
example the stored yct `a8-label` box overlaps Matching and Notification, but
the rendered label sits on the arc, on the Core border). Lint must run on
measured boxes, as the design says.

### defects.json

```jsonc
{
  "scene": "scene.excalidraw", "png": "final.png", "report": "canvas/docs/…",
  "defects": [{
    "id": "batch-08",
    "rule": "crossing",              // a Rules v0 code (design §5) …
    "ruleGap": "…",                  // … or, instead, a named gap (see below)
    "ids": ["a-trip-pg", "e-payment-kafka"],   // element ids the hit must name
    "description": "one line",
    "source": "report §1 checklist", // report section, transcript, or final.png
    "reported": true,                // false = seen in final.png, not in the report
    "fixedInFinal": false,           // true = fixed during the session; still listed
    "note": "optional history",
    "envOnly": { "reason": "…", "evidence": "evidence/batch-12.png" }, // optional, see below
    "notDrawn": { "reason": "…", "evidence": "evidence/batch-10.png" }  // optional, see below
  }],
  "cleanRegions": [{ "name": "legend", "ids": […], "bbox": {x,y,width,height} }],
  "unmapped": [{ "description", "source", "reason" }]
}
```

- **Acceptance for lint:** a hit matches a defect when its code is the
  defect's `rule` (or `ruleGap`: lint 1.5 implements both gap codes) and its
  ids include all of the defect's `ids`. Lint names bound text
  `<owner>#label`; the test maps it to the fixtures' `<owner>-label`. Every
  defect with `fixedInFinal: false` and no `envOnly` or `notDrawn` must be
  matched; no defect
  with `fixedInFinal: true` may be; every hit must match some defect. The
  schema test guarantees no hit can match both a fixed and an unfixed entry (a
  fixed entry's ids are never a subset of an unfixed entry's ids under the same
  rule). Checked by `test/parity/lint/lint.e2e.ts`
  (`bun run --cwd elkdraw/test/parity test:e2e`): sidecar `measure`, then
  `readScene`, then `lint`.
- **`envOnly`:** the defect is in `final.png` but our renderer does not paint
  it for the stored scene, so it is out of the must-flag set (lint may still
  flag it). Ground truth is what our renderer paints: lint is right when it
  flags that. `reason` says why the tester saw it; `evidence` is a composite
  next to the manifest, `final.png` crop at 2x on the left, the sidecar's snap
  of the same scene region at 2x on the right. The cause of the 10 today: the
  testers' `mcp-excalidraw-server` stores labels as `label: {text}` with no
  font (seen on the yct tester's live server; inferred for batch and bst from
  the same software and the glyph size), so its frontend painted them in
  Excalidraw's defaults (Excalifont 20 px), while the exported scene records
  Virgil 16 (nodes) or 14 (arrow labels). Re-measured with bound labels at
  Excalifont 20, lint flags 9 of the 10; batch-10 is a near-miss in both
  renders. The `*-painted` variants hold them as must-flag defects.
- **`notDrawn`:** reported, but drawn in neither `final.png` nor our render of
  the painted scene; `reason` records the measured gap. Only batch-10 in
  `batch-painted`: label ink to the arrowhead's wing is 14 px in `final.png`
  and 13 px in our snap (tip 38 px from the label box; lint fires under 30).
- **Clean regions:** a lint hit whose ids all belong to one region's `ids` is a
  false positive. `bbox` (scene coordinates, 10 px padding) is for `look` and
  humans; the ids are the contract. Regions include the legends (unbound arrows
  on purpose), Stripe/APNs (outside every zone by design), zone titles, and
  elements that were defects earlier and are clean now.
- **`reported: false`:** not in the report text: hits visible in `final.png`
  that the testers did not list, and three first-pass wraps (batch-07a-c) that
  only the batch tester's transcript mentions. The final-PNG hits are store labels wrapping, labels touching arrowheads and
  two corner grazes or crossings; they are listed so lint does not look like it has false positives.
- **Rule gaps:** two reported defects fit no v0 rule. `arrow-through-label` (an
  arrow drawn over another arrow's label: yct-08, yct-12) and
  `label-on-own-arrowhead` (a label running into its own arrowhead: batch-10,
  batch-11). Lint 1.5 added both as rules under these codes.
- **`fixedInFinal: true` ids** point at elements that still exist; their
  geometry in the final scene is the fixed one. The intermediate scenes were
  never committed, except the BST first add (`bst-first`).

### Counts

| Scene     | Defects | Reported | Not reported | Unfixed | Rule gaps | Unmapped | Env only | Must flag |
| --------- | ------- | -------- | ------------ | ------- | --------- | -------- | -------- | --------- |
| yct       | 23      | 13       | 10           | 14      | 6         | 1        | 3        | 11        |
| batch     | 17      | 11       | 6            | 8       | 4         | 4        | 5        | 3         |
| bst       | 2       | 2        | 0            | 0       | 0         | 1        | 0        | 0         |
| bst-first | 2       | 2        | 0            | 2       | 0         | 1        | 2        | 0         |

The `*-painted` variants have the same defect lists; must flag: yct-painted
14, batch-painted 7 (batch-10 is `notDrawn`), bst-first-painted 2.

Not in any fixture: the Mermaid-path scene (batch report §2.6, cleared before
the rebuild), and round 2 defects (Analytics over Postgres after the "human"
edits, the human note over the legend title). Those scenes were never exported
to the artifacts directory.

## Tasks

- `tasks/ride-hailing.mmd`: the round-1 brief (`canvas/briefs/DOGFOOD-diagram.md`)
  in its final state, after both edits (Pricing next to Matching, Surge between
  Pricing and Kafka). Node ids match `dogfood/batch/scene.excalidraw`. Stores
  are `[( )]`, async edges `-.->`, sync edges labelled 1-9. Based on the batch
  tester's own `ride.mmd`.
- `tasks/bst.mmd`: the round-3 figure. A 15-node BST, the search path for 11
  (8 -> 12 -> 10 -> 11) highlighted with `classDef` and `linkStyle`, the
  in-order array with indices, lo/hi at indices 8 and 11, and a caption. The
  "each cell under its tree column" requirement is a layout constraint Mermaid
  cannot express.

## Mermaid samples

Taken verbatim (dedented) from the Mermaid docs at tag `mermaid@11.17.2`,
`packages/mermaid/src/docs/syntax/<file>.md`. Mermaid is MIT-licensed:
"Copyright (c) 2014 - 2022 Knut Sveidqvist", https://github.com/mermaid-js/mermaid/blob/mermaid%4011.17.2/LICENSE.
Provenance lives here rather than in the files, since a `%%` comment above
`---` frontmatter breaks it.

| File                | Docs file                      | Section                                   |
| ------------------- | ------------------------------ | ----------------------------------------- |
| `flowchart-1.mmd`   | `flowchart.md`                 | Subgraphs: edges to and from subgraphs    |
| `flowchart-2.mmd`   | `flowchart.md`                 | Subgraphs: direction limitation           |
| `class-1.mmd`       | `classDiagram.md`              | Class diagrams (Animal example)           |
| `class-2.mmd`       | `classDiagram.md`              | Nested Namespaces (v11.15.0+)             |
| `er-1.mmd`          | `entityRelationshipDiagram.md` | Attribute Keys and Comments               |
| `er-2.mmd`          | `entityRelationshipDiagram.md` | Default class                             |
| `state-1.mmd`       | `stateDiagram.md`              | Composite states                          |
| `state-2.mmd`       | `stateDiagram.md`              | Concurrency                               |
| `requirement-1.mmd` | `requirementDiagram.md`        | Combined Example                          |
| `requirement-2.mmd` | `requirementDiagram.md`        | Larger Example                            |
| `sequence-1.mmd`    | `sequenceDiagram.md`           | Actor Creation and Destruction (v10.3.0+) |
| `sequence-2.mmd`    | `sequenceDiagram.md`           | Background Highlighting                   |
| `gantt-1.mmd`       | `gantt.md`                     | A Gantt Diagram                           |
| `gantt-2.mmd`       | `gantt.md`                     | Syntax                                    |
| `timeline-1.mmd`    | `timeline.md`                  | An example of a timeline                  |
| `timeline-2.mmd`    | `timeline.md`                  | Grouping of time periods in sections/ages |
| `mindmap-1.mmd`     | `mindmap.md`                   | An example of a mindmap                   |
| `mindmap-2.mmd`     | `mindmap.md`                   | Markdown Strings                          |
| `kanban-1.mmd`      | `kanban.md`                    | Full Example                              |

Kanban has one sample: the docs' other two blocks are three-line fragments.
