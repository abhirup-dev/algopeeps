---
name: elkdraw
description: ELK draw canvas toolkit for creating, editing, and refining diagrams on a live Excalidraw canvas. Use when an agent needs to (1) draw or lay out diagrams, (2) iteratively refine them with rendered lint and cropped looks instead of full screenshots, (3) validate a diagram's structure and references before writing it, (4) delete or relabel elements by id and prune generated ones that fall out of the file, (5) see what a human changed on the canvas, or (6) perform element-level CRUD and row/column/grid placement. Primary interface is the bundled CLI (bun elkdraw/adapters/cli/src/main.ts <command>) against a canvas server you start once; MCP tools and a REST API are equivalent alternatives.
---

# ELK draw Skill

## Step 0: Pick an Interface

Three interfaces drive the same live canvas. Pick the first one that applies:

1. **MCP tools** — if `elkdraw` tools (e.g. `mcp__elkdraw__apply`) are in your tool list, prefer them: results land directly in your context.
2. **CLI** (default when no MCP tools are present), run from the repository root:
   ```bash
   bun elkdraw/adapters/cli/src/main.ts <command>
   ```
   The server does **not** auto-start. Start it once with `bun elkdraw/adapters/cli/src/main.ts start --no-open` (prints the status JSON; a no-op when it is already running). Check it with `status`, stop it with `stop`.
3. **REST API** (last resort, e.g. from application code): `POST /api/tools/<name>` with the tool's input as the JSON body — see `references/cheatsheet.md`. The server must already be running.

The canvas URL comes from `--url`, else `ELKDRAW_URL`, else `http://127.0.0.1:$PORT` (default `http://127.0.0.1:3940`). `status` returns `url` and `branch`: give the user `url` so they can watch the canvas, and check `branch` is the worktree you mean. For a portless `https://….elkdraw.localhost:1355` URL, prefix every CLI call with `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`. Rendering is headless: `look` and `lint` never need an open browser tab.

### CLI Quick Reference

Results are JSON on stdout, always. Diagnostics on stderr. Exit codes: 0 ok, 1 error (the server answered non-2xx; body on stderr), 2 usage or invalid input (nothing was sent), 3 server unreachable. Every command takes `--input <json>` or `--input -` (stdin) for its whole input object; flags override it. A command whose reply is `{"error": {"code": "NOT_IMPLEMENTED", ...}}` is not built on this server yet; see "not available" rows below.

| Task                                  | Command                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start / stop / inspect server         | `start --no-open`, `stop`, `status`                                                                                                                         |
| Create or update elements (batch)     | `apply --input - < scene.json` — `{"elements":[...],"place":[...],"prune":true}`                                                                            |
| Delete / relabel by id                | `apply --patches '[{"op":"delete","id":"a"},{"op":"set","id":"b","label":"New"}]'`                                                                          |
| Create only (fails on an existing id) | `add --input - < elements.json` — `{"elements":[...]}`                                                                                                      |
| Check input without writing           | `validate --input - < scene.json` (reads the canvas to resolve references), or `apply --dry-run` (also returns lints)                                       |
| Read one / query many                 | `get --id <id>` → `{rev, element}`; `query [--type t] [--ids a,b] [--bbox '{"x":0,"y":0,"width":9,"height":9}'] [--limit n]` → `{rev, elements, truncated}` |
| Understand the scene                  | `describe [--scope all\|frame:<id>\|near:<id>,r=<px>]` → `{rev, text}`, one line per element, grouped by zone (arrows read `id: from -> to "label"`)        |
| Check the scene                       | `lint [--scope all\|frame:<id>\|near:<id>,r=<px>] [--ids a,b]` → hits with code, ids, bbox, hint                                                            |
| See part of the scene                 | `look --target <id>[,<id>] [--r 150] [--marks]` → cropped PNG path + rendered boxes                                                                         |
| See the whole scene                   | `screenshot [--format png] [--out path] [--max-px n]` → the full canvas, rendered headlessly (no browser tab needed)                                        |
| What changed                          | `changes [--since <rev>]` (who changed what), `diff [--from <rev>] [--to <rev>]` (changes, lint added/fixed, and a `delta` line)                            |
| Scene files                           | not available — `export`/`import`/`share` are unimplemented; `scene.json` is the file; commit it directly                                                   |
| Snapshots                             | `snapshot --action save --name <name>` / `--action list` / `--action restore --name <name>` — restore is a normal write, so it shows up in `changes`        |
| Wipe canvas                           | `clear --yes` → `{rev, deleted}` (deletes everything in one write; snapshot first if you might want it back)                                                |

### Element Format (CLI and MCP)

Elements are Excalidraw's own element skeletons (`ExcalidrawElementSkeleton`), checked strictly before anything is written:

- **Ids**: every element needs a semantic `"id"` (`"trip"`, `"rider-to-gateway"`), arrows included. Ids are stable: re-sending an id updates that element.
- **Labels**: put `"label": {"text": "My Label"}` on a shape or arrow. The label's own id is `<id>#label` in lint hits.
- **Arrow binding**: `"start": {"id": "a"}` / `"end": {"id": "b"}` — arrows bind to element edges and follow them when they move. `x`/`y` are required but recomputed for bound arrows; pass `0`.
- **Zones**: a `"type": "frame"` with `"name": "Core services"` and `"children": ["trip", "pricing", ...]`. The name is drawn above the frame, never on top of its children.
- **Unknown or misplaced keys are rejected**, with the path: `elements[3].text: unknown key; use label.text`. Nothing is written when any element fails. yctimlin-style `text` on shapes and `startElementId`/`endElementId` are errors here.
- **Suppression**: `"allow": [{"rule": "crossing", "why": "the two async arrows must cross"}]` on one element silences that one lint code for it. Suppressed hits are still returned, with the reason.
- **Replies never echo elements**: `apply` returns `{rev, created, updated, kept, deleted, lints, measured, ...}` — ids and counts only.

---

## Coordinate System

The canvas uses a 2D coordinate grid: **(0, 0) is the origin**, **x increases rightward**, **y increases downward**. Plan your layout before writing any JSON.

**General spacing guidelines:**

- Vertical spacing between tiers: 80–120px (enough that arrows don't crowd labels)
- Horizontal spacing between siblings: 40–60px minimum; give labeled arrows 120px+
- Shape width: `max(160, labelCharCount * 12)` to keep the label on one line
- Shape height: 60px single-line, 80px two-line labels
- Background/zone padding: 50px on all sides around contained elements

**Styling for a professional look:**

- `"fillStyle": "solid"` on shapes gives crisp flat fills — the default is a sketchy hachure pattern
- Pair pastel `backgroundColor` fills with their darker `strokeColor` (palette in the cheatsheet)
- `"strokeStyle": "dashed"` on zone borders and async arrows reads as "boundary / background"

### Placement Helpers

Instead of computing every `x`/`y` by hand, list placement ops in `place` next to `elements`. They run in order before the scene is written and set `x`/`y` on the ids they name (give those elements `"x": 0, "y": 0`; the op overwrites them):

| Op                                                                | Effect                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `{"op":"row","ids":["a","b","c"],"at":[100,200],"gap":60}`        | Left to right from `at`, vertical centres aligned                          |
| `{"op":"column","ids":["a","b"],"at":[100,200],"gap":80}`         | Top to bottom from `at`, horizontal centres aligned                        |
| `{"op":"grid","ids":[...],"cols":3,"at":[100,200],"gap":[60,80]}` | Row-major grid, `gap` = `[x, y]`                                           |
| `{"op":"rightOf","id":"surge","of":"pricing","gap":80}`           | Next to another element, centres aligned (also `leftOf`, `below`, `above`) |

Asset ops generate whole structures as elements with predictable ids: `array`, `linkedList`, `tree`, `stack`, `table`, `hashMap` (shapes in the cheatsheet). Placement is a one-time calculation: nothing re-flows later unless you apply again.

---

## Layout Anti-Patterns (Critical for Complex Diagrams)

These are the most common mistakes that produce unreadable diagrams. Avoid all of them.

### 1. Do NOT use `label.text` on large background zone rectangles

When you put a label on a background rectangle, Excalidraw creates a bound text element centered in the middle of that shape — right where your service boxes will be placed. The text overlaps everything inside the zone (`label-on-node`).

**Wrong:**

```json
{
  "id": "vpc-zone",
  "type": "rectangle",
  "x": 50,
  "y": 50,
  "width": 800,
  "height": 400,
  "label": { "text": "VPC (10.0.0.0/16)" }
}
```

**Right — use a frame; its name sits above the zone:**

```json
{
  "id": "vpc",
  "type": "frame",
  "x": 50,
  "y": 50,
  "width": 800,
  "height": 400,
  "name": "VPC (10.0.0.0/16)",
  "children": ["web", "api", "db"]
}
```

The frame also tells lint which elements belong inside it (`outside-zone`). A free-standing `text` element at the top corner of a plain rectangle works too.

### 2. Avoid cross-zone arrows in complex diagrams

An arrow from an element in one layout zone to an element in a distant zone will draw a long diagonal line crossing through everything in between. In a multi-zone infra diagram this produces an unreadable tangle of spaghetti (`arrow-through-node`, `crossing`).

**Design rule:** Keep arrows within the same zone or tier. To show cross-zone relationships, use annotation text or separate the zones so their edges are adjacent (no elements between them), and place the connected elements on the facing edges.

If you must connect across zones, move the two endpoints so the straight line between them is clear — never through the middle of another zone.

### 3. Use arrow labels sparingly

Arrow labels are placed at the midpoint of the arrow. On short arrows, they overlap the shapes at both ends (`label-on-node`, `label-on-own-arrowhead`). On crowded diagrams, they collide with nearby elements (`label-on-label`, `arrow-through-label`).

- Only add an arrow label when the relationship name is genuinely essential (e.g., protocol, port number, data direction).
- If you're adding a label to every arrow, reconsider — it usually adds visual noise, not clarity.
- Keep arrow labels to ≤ 12 characters. Prefer omitting them entirely on dense diagrams.

---

## Quality: Why It Matters (and How to Check)

Excalidraw diagrams are visual communication. If text is cut off, elements overlap, or arrows cross through unrelated shapes, the diagram becomes confusing and unprofessional — it defeats the whole purpose of drawing it. So after every batch of elements, verify before adding more.

### The Loop

```
write scene.json ──► apply ──► lints in the reply?
      ▲                          │ yes          │ no
      │                          ▼              ▼
      └──── fix scene.json ◄── look at the    look at the whole
                               hit ids        diagram, check intent, done
```

1. **Write**: keep the whole diagram in one file (`scene.json`: `elements` + `place`). It is your source of truth; edit it, don't try to reconstruct it from the canvas.
2. **Apply**: `apply --input - < scene.json`. Re-applying unchanged elements is a no-op, so always send the whole file.
3. **Lint**: the `apply` reply carries `lints`; `lint` re-runs them on demand. Each hit is `{code, ids, bbox, severity, hint}`. Lint measures what was actually drawn, not the stored numbers.
4. **Look**: for each `error` hit you don't understand from the hint, `look --target <ids> --r 150` returns a small crop (≤ 512×384) and the rendered boxes of those ids. Read the PNG.
5. **Fix**: edit `scene.json` as the hint says, apply again. The reply's lints show what is left.

Done means: zero `error` hits, then one `look` over the diagram's full coordinate range (e.g. `look --target 0,0,<w>,<h> --max-px 1024`) to check what lint can't: the diagram says what was asked (every required element, numbering, legend, title).

### Quality Checklist

Lint checks these for you after each `apply`. Each code, what it means, and the usual fix:

| Code                     | Severity | Means                                                                                                                                    | Fix                                                                            |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `text-overflow`          | error    | Label is wider or taller than its shape (text truncated)                                                                                 | Increase `width`/`height`, or shorten the label                                |
| `text-wrapped`           | error    | Label wrapped onto more lines than it was written with                                                                                   | Widen the shape, or put the line break in the text yourself and raise `height` |
| `node-overlap`           | error    | Two leaf shapes partially overlap (full containment is a zone, not this)                                                                 | Move one; keep ≥ 40px between shapes                                           |
| `outside-zone`           | error    | A frame child drawn outside its frame, a shape inside a frame that doesn't list it, or a leaf across a plain containing rectangle's edge | Grow or move the frame/zone (50px padding), or fix `children`                  |
| `arrow-through-node`     | error    | An arrow passes through an unrelated shape                                                                                               | Move that shape off the line, or move an endpoint so the line is clear         |
| `arrow-through-label`    | error    | An arrow crosses an arrow label or free-standing text (not a shape's own label)                                                          | Move the label's owner or the arrow's endpoints                                |
| `label-on-node`          | error    | A label (usually an arrow's) sits on a shape                                                                                             | Lengthen the arrow (move the shapes apart), shorten or drop the label          |
| `label-on-label`         | error    | Two labels overlap                                                                                                                       | Spread the arrows apart, or drop one label                                     |
| `label-on-border`        | error    | A label crosses a shape or frame border                                                                                                  | Move it fully inside or outside; grow the container                            |
| `label-on-own-arrowhead` | error    | An arrow's label covers its own arrowhead: the arrow is too short                                                                        | Give labeled arrows 120px+, or drop the label                                  |
| `dangling-endpoint`      | error    | A bound arrow end names a missing id, or sits >15px off its shape (unbound ends never fire this)                                         | Set `start`/`end` to an existing id, or resend it so the end re-snaps          |
| `crossing`               | info     | Two arrows cross                                                                                                                         | Reorder shapes if it's cheap; otherwise fine to leave                          |

Lint cannot judge intent. Also check by eye, once, at the end:

1. **Readability** — Font size ≥ 16 for body text, ≥ 20 for titles.
2. **Completeness** — Every element the user asked for is there, in the order they asked.

If you find any issue: **stop, fix it, re-apply, then continue.** Say "lint reports [code] on [ids], fixing it" rather than glossing over problems. Only proceed once all `error` hits are gone. A hit that is really intended gets an `allow` with a reason, never silence.

---

## Workflow: Drawing a New Diagram

### Mermaid vs. Direct Creation — Which to Use?

Create elements directly: `apply` does not take Mermaid text. If the user gives you Mermaid, translate its nodes and edges into elements and placement ops.

### Steps (CLI shown; MCP tools are 1:1 — see cheatsheet)

1. Plan your coordinate grid — map out tiers and x-positions before writing JSON. (The colors/sizing guide lives in `references/cheatsheet.md`.)
2. Start the server and note the canvas URL: `bun elkdraw/adapters/cli/src/main.ts start --no-open`. `clear` is not implemented on this server; if you need a blank canvas and know the ids from a prior turn, delete them with `apply --patches` (one `delete` per id).
3. Write the whole diagram — shapes, arrows, zones and placement — into one file. Semantic `id` fields (e.g. `"id": "auth-svc"`) make later updates easy:
   ```bash
   cat > /tmp/scene.json <<'EOF'
   {
     "elements": [
       {"id": "lb", "type": "rectangle", "x": 300, "y": 50, "width": 180, "height": 60, "label": {"text": "Load Balancer"}},
       {"id": "svc-a", "type": "rectangle", "x": 0, "y": 0, "width": 160, "height": 60, "label": {"text": "Web Server 1"}},
       {"id": "svc-b", "type": "rectangle", "x": 0, "y": 0, "width": 160, "height": 60, "label": {"text": "Web Server 2"}},
       {"id": "db", "type": "ellipse", "x": 0, "y": 0, "width": 210, "height": 70, "label": {"text": "PostgreSQL"}},
       {"id": "lb-a", "type": "arrow", "x": 0, "y": 0, "start": {"id": "lb"}, "end": {"id": "svc-a"}},
       {"id": "lb-b", "type": "arrow", "x": 0, "y": 0, "start": {"id": "lb"}, "end": {"id": "svc-b"}},
       {"id": "a-db", "type": "arrow", "x": 0, "y": 0, "start": {"id": "svc-a"}, "end": {"id": "db"}},
       {"id": "b-db", "type": "arrow", "x": 0, "y": 0, "start": {"id": "svc-b"}, "end": {"id": "db"}}
     ],
     "place": [
       {"op": "row", "ids": ["svc-a", "svc-b"], "at": [100, 200], "gap": 190},
       {"op": "below", "id": "db", "of": "lb", "gap": 240}
     ]
   }
   EOF
   bun elkdraw/adapters/cli/src/main.ts apply --input - < /tmp/scene.json
   ```
4. Set shape widths using `max(160, labelLength * 12)`; `text-overflow` tells you when that was not enough.
5. Read `lints` in the reply → `look` at the hit ids → fix the file → apply again (The Loop above).

---

## Arrow Routing — Avoid Overlaps

Arrows are straight lines between the edges of the shapes they bind. The reliable way to route around an obstacle is to move shapes, not to bend arrows:

- **Fan-out** (one source → many targets): put the targets in one `row` below the source, spread wide enough (`gap` 60+) that the arrows fan without touching.
- **Cross-lane** (connecting to side panels): put the side panel level with its partner (`rightOf` / `leftOf`) so the arrow is horizontal and clear.
- **Long connections**: shorten them — place the two ends in adjacent tiers or zones.

**Waypoints** are possible (`"points": [[0, 0], [0, -50], [200, -50], [200, 0]]` on an arrow) but are flattened when an endpoint moves, and `"elbowed": true` is rejected. Use them only for a final, fixed layout, and lint again afterwards.

**Rule:** If lint reports `arrow-through-node`, move the shape it names or an endpoint; re-apply.

---

## Workflow: Iterative Refinement

Pairing `scene.json` with `lint` and `look` is what makes this skill powerful.

- **`scene.json`** → your own file: element IDs, types, positions, labels, connections. Keep it as the source of truth for what you intend even though `describe`/`query`/`get` can also read the live canvas.
- **`lint`** → the defects, with ids and a hint each. Use it to know _what is wrong_ without looking at anything.
- **`look`** → a cropped PNG around ids, plus their rendered boxes. Use it for _visual quality verification_ of one spot — it shows exactly what the user sees there. Add `--marks` to get each id's crop-pixel centre back in the reply (for your own bookkeeping; nothing is drawn on the PNG). The CLI prints the saved file path; read/view that file.

**Feedback loop:**

```
apply scene.json
  → lints: text-overflow [auth-svc#label] → set auth-svc width 220 in the file → apply
  → lints: node-overlap [auth-svc, rate-limiter] → look --target auth-svc,rate-limiter --r 150
    → "rate-limiter sits 20px into auth-svc" → rightOf rate-limiter of auth-svc gap 60 → apply
  → lints: [] → screenshot the whole diagram → "all checks pass"
  → proceed
```

## Workflow: Refine an Existing Diagram

1. `changes` to see what the human did since your last apply (lines like `{"author":"human","op":"moved","ids":["kafka"],"detail":{"dx":120,"dy":0}}`, no `author`/`time` on `diff`'s `changes`). `apply` writes exactly what you send, so a human's move is lost if you re-apply an old position: copy their changes into your file first (`get --id <id>` for the new box).
2. No file (a diagram you didn't draw)? `describe` gives a compact text scene (ids, labels, boxes, arrows, grouped by zone) and `query`/`get` fetch elements by type, id or bounding box — read the live canvas directly instead of reconstructing it from `changes --since 0`.
3. Identify elements by `id` or label text (not by x/y coordinates — they change).
4. Edit the file and re-apply it; `--if-rev <rev>` (the `rev` from `changes`) fails instead of overwriting if the canvas moved on meanwhile. Delete with a `delete` patch, or set `"prune": true` so ids you removed from the file are deleted (only elements you created; human-drawn elements are never pruned). **Bound arrows re-route automatically when you move or resize their endpoints** — no need to delete and recreate them.
5. Read the reply's lints; `look` to confirm the change looks right. `diff` shows what changed since your last turn (no author/time), the lint hits it added or fixed, and a one-line `delta` summary (e.g. `+1 node-overlap, -1 crossing`).
6. If updates fail: `validate` the same input first — it resolves references against both the input and the live canvas and reports which id is missing.

## Workflow: Mermaid Conversion

Not supported: `apply` rejects `text`. Translate the Mermaid nodes and edges into elements (Drawing a New Diagram).

## Workflow: File I/O

Not available: `export`, `import` and `share` are all unimplemented on this server. `scene.json` — the file you write and re-apply — is the only artifact; commit it to the repo directly. `screenshot` renders the whole canvas headlessly to a PNG (`--out`, `--max-px`) when you need a picture rather than a file — use `look` for a crop around specific ids.

### Obsidian vaults

Not available: there is no `--format obsidian` export yet. Commit `scene.json` and note in the PR that the rendered view needs a manual open until export lands.

## Workflow: Snapshots

`snapshot --action save --name <name>` records the current rev under that name; `--action list` lists every saved name with its rev and time; `--action restore --name <name>` writes the canvas back to that rev. Restore is a normal write (like `apply`), so it bumps the rev and shows up in `changes` — it does not rewind history, it adds to it. Snapshot names live only in the running server's memory: they do not survive a restart, so still commit `scene.json` to git before a risky change if you need it to outlast the session.

## Workflow: Duplication

No duplicate command: copy the elements in `scene.json` with new ids and place the copies (`row`, `rightOf`, ...). Useful for repeated patterns or copying layouts.

## Error Recovery

- **Exit code 3 (server unreachable)?** The server is not running at that URL. Run `start --no-open`, or fix `--url` / `ELKDRAW_URL`. For an `https://….elkdraw.localhost` URL, set `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`.
- **Exit code 2 (invalid input)?** Nothing was sent. stderr names the path and the problem (`elements[3].text: unknown key; use label.text`); fix that field. `validate` checks a file the same way, reading the canvas to resolve references, without writing.
- **Exit code 1 with `"code": "NOT_IMPLEMENTED"`?** That tool or option is not available on this server; stderr includes its input schema. Only `export` and `wait` are still in this state — use another route from this skill (`screenshot` for a picture, `changes`/`diff` instead of `wait`).
- **Exit code 1 with a rev mismatch?** Someone changed the canvas after the `--if-rev` you gave. Run `changes`, fold the edits into your file, apply again.
- **Elements not appearing?** `get --id <id>` (or `look --target <id>` for the rendered box) finds one wherever it is and errors by name if it truly isn't on the canvas.
- **Arrow not connecting?** `dangling-endpoint` names it: either the bound id is missing, or the bound end sits more than 15px off its shape. Resend the element (or its `start`/`end`) so it snaps again.
- **Canvas in a bad state?** `snapshot --action restore --name <name>` if you saved one before the change; otherwise delete the elements you added with `apply --patches` (`delete` per id), or `clear --yes` and re-apply `scene.json` from scratch.
- **A defect lint can't see?** `look` at it, fix it, and mention it to the user: it is a missing lint rule.

---

## References

- `references/cheatsheet.md`: full CLI reference, the MCP tools, REST API endpoints + payload shapes, placement and asset ops, and the diagram design guide (colors, sizing).
