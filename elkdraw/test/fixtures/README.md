# Test fixtures

Ground truth for lint (1.6), the eval harness (P0.9) and the Mermaid parity
suite (2.11). Checked by `test/parity/src/defects.test.ts` (manifest schema,
ids exist in the scene) and `test/parity/src/mermaid-fixtures.test.ts` (every
`.mmd` parses with mermaid 11.17.2 and is detected as its family).

```
fixtures/
  dogfood/yct/     scene.excalidraw  final.png  defects.json   one-command-at-a-time tester
  dogfood/batch/   scene.excalidraw  final.png  defects.json   batch-path tester
  tasks/           ride-hailing.mmd  bst.mmd                    the two dogfood tasks as Mermaid
  mermaid/         <family>-N.mmd                               Mermaid docs samples, 10 families
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
    "note": "optional history"
  }],
  "cleanRegions": [{ "name": "legend", "ids": […], "bbox": {x,y,width,height} }],
  "unmapped": [{ "description", "source", "reason" }]
}
```

- **Acceptance for lint:** a hit matches a defect when it has the same rule
  and its ids include all of the defect's `ids`. Every defect with
  `fixedInFinal: false` and a `rule` must be matched; no defect with
  `fixedInFinal: true` may be. The schema test guarantees no hit can match
  both (a fixed entry's ids are never a subset of an unfixed entry's ids under
  the same rule).
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
  batch-11). Lint 1.6 either adds rules or accepts these as known misses.
- **`fixedInFinal: true` ids** point at elements that still exist; their
  geometry in the final scene is the fixed one. The intermediate scenes were
  never committed.

### Counts

| Scene | Defects | Reported | Not reported | Unfixed | Rule gaps | Unmapped |
| ----- | ------- | -------- | ------------ | ------- | --------- | -------- |
| yct   | 23      | 13       | 10           | 14      | 6         | 1        |
| batch | 17      | 11       | 6            | 8       | 4         | 4        |

Not in any fixture: the Mermaid-path scene (batch report §2.6, cleared before
the rebuild), and round 2 and 3 defects (Analytics over Postgres after the
"human" edits, the human note over the legend title, BST label wrapping and
alignment). Those scenes were never exported to the artifacts directory.

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
