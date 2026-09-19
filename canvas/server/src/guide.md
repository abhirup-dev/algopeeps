# Canvas cheat-sheet

Thanks for calling canvas_guide! Everything you draw is **agent-owned**: the server forces the
stroke to purple `#9c36b5` — you cannot override that, so never set `strokeColor`. The human may
move or edit your annotations; check `editedBy` in `canvas_read` before referring to them.
Human-drawn elements (black strokes) are the learner's: read and annotate them, and edit them
only when asked — ownership is provenance, not a lock (v1.2 §2). Read before drawing:
`canvas_read` (compact) or `canvas_describe` (prose). Poll `canvas_changes` after the human edits.

## Element format (input to canvas_draw)

```jsonc
{ "id": "a1",              // optional; server generates a 12-char id
  "type": "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line" | "freedraw",
  "x": 100, "y": 100, "width": 160, "height": 60,
  "text": "label",         // on shapes → bound label; on "text" → the text itself
  "startElementId": "a0", "endElementId": "a2",  // arrows: auto-routed to element edges
  "points": [[0,0],[100,0]],          // arrows/lines without bindings
  "backgroundColor": "#a5d8ff", "fillStyle": "solid",
  "strokeStyle": "solid" | "dashed" | "dotted", "strokeWidth": 2, "roughness": 1,
  "fontSize": 20, "fontFamily": "helvetica",
  "groupIds": ["g1"], "customData": { "note": "anything; owner/kind are overwritten" } }
```

- Reusing an existing **agent** id updates it in place (redraw a state, don't pile up).
- Array order = z-order (first = back, last = front). Emit progressively: shape → its label →
  its arrows → next shape, not all shapes then all arrows.
- Standalone text: `x` is the LEFT edge. Center at `cx` with `x = cx - text.length * fontSize * 0.5`.
- Fonts: `fontSize ≥ 20` for anything the human must read; min shape ~120×60.
- Coordinates: scene px, origin top-left, y down. Keep a 20 px grid and ≥ 40 px gaps.
- No emoji in text.

## Colours (backgrounds only — strokes are forced purple)

| Fill | Hex | Use |
|------|-----|-----|
| Light Blue | `#a5d8ff` | input, primary nodes |
| Light Green | `#b2f2bb` | success, output, completed |
| Light Orange | `#ffd8a8` | warning, pending |
| Light Purple | `#d0bfff` | processing, special |
| Light Red | `#ffc9c9` | error, counterexamples |
| Light Yellow | `#fff3bf` | notes, decisions |
| Light Teal | `#c3fae8` | storage, memory |

Use one fill per semantic role, consistently.

## Assets (canvas_asset) — prefer these over hand-drawn structures

`array` (cells + optional `pointers`, `showIndex`), `linked_list` (`doubly`), `binary_tree`
(level-order `values`, `null` = missing), `stack_frames`, `state_table` (`columns`, `rows`),
`hash_map` (`entries`, `buckets`). All take `name, x, y` and return `{ids, groupId}`; members
share a `groupIds:[groupId]` and carry `customData.asset`.

## Annotations (canvas_annotate)

`circle` = ellipse around the ref's bbox (12 px pad) · `counterexample` = `✗ ` text 24 px below
· `invariant` = `⟂ ` text 24 px above · `reply` = plain text (no prefix) 24 px below, left-aligned
to the ref, ≥ 240 px wide — answer a note the human wrote on the canvas. Always annotate a *ref*
id, e.g. the cell that breaks.

## Comment threads (canvas_comment / canvas_reply / canvas_resolve)

Threads are id-anchored sidebar conversations, not annotations: no marker element is added to
the scene. `canvas_comment {targetIds:[...]}` opens one on one or more existing elements;
`canvas_reply` appends; `canvas_resolve` closes it — resolved threads keep their messages but
leave the default view, so resolve instead of deleting. The human asks from the sidebar too:
poll `canvas_changes` and answer ids from `threads.opened` / `threads.replied`, reading the
conversation with `canvas_threads` (each thread lists `targetIds`, `detached`, and `near`).
Prefer threads over `annotate reply` for anything conversational; use `invariant` /
`counterexample` for claims about the learner's drawing.

## Camera (canvas_camera — a tool call, not an element)

- `{session, x, y, width, height}` — rect to frame (leave padding around content).
- `{session, fitIds: [...]}` / `{session, fitAll: true}` — let the view fit.
- Applied **once**, then the human owns the camera. One camera per teaching beat; don't spam.

## Worked example 1 — array with two pointers

```
canvas_asset   {session:"two-sum", kind:"array", name:"nums", x:120, y:120,
                values:[2,7,11,15], showIndex:true,
                pointers:[{label:"i", index:0},{label:"j", index:3}]}
canvas_annotate{session:"two-sum", kind:"invariant", ref:"<id of nums[0]>",
                text:"i ≤ j always"}
canvas_camera  {session:"two-sum", fitAll:true}
```

## Worked example 2 — circle + counterexample on the human's box

```
canvas_read    {session:"two-sum", owner:"human"}          → get the human's box id, e.g. h7
canvas_annotate{session:"two-sum", kind:"circle", ref:"h7"}
canvas_annotate{session:"two-sum", kind:"counterexample", ref:"h7",
                text:"[3,3] sums to 6, not 9 — not an answer"}
canvas_camera  {session:"two-sum", fitIds:["h7"]}
```

Common mistakes: no padding in the camera rect (clipped edges); labels wider than their arrow;
text stacking when y-coordinates are close; re-sending identical elements instead of updating
ids in place; drawing over the human's elements instead of annotating them.
