---
name: elkdraw
description: ELK draw canvas toolkit for creating, editing, and refining diagrams on a live Excalidraw canvas. Use when an agent needs to (1) draw or lay out diagrams, (2) iteratively refine them with rendered lint and cropped looks instead of full screenshots, (3) export .excalidraw files or PNG/SVG images, (4) save/restore canvas snapshots, (5) see what a human changed on the canvas, or (6) perform element-level CRUD and row/column/grid placement. Primary interface is the bundled CLI (bun elkdraw/adapters/cli/src/main.ts <command>) against a canvas server you start once; MCP tools and a REST API are equivalent alternatives.
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

The canvas URL comes from `--url`, else `ELKDRAW_URL`, else `http://127.0.0.1:$PORT` (default `http://127.0.0.1:3940`). `status` returns `url` and `branch`: give the user `url` so they can watch the canvas, and check `branch` is the worktree you mean. For a portless `https://….elkdraw.localhost:1355` URL, prefix every CLI call with `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`. Rendering is headless: `screenshot`, `look` and `lint` never need an open browser tab.

### CLI Quick Reference

Results are JSON on stdout, always (including `describe`). Diagnostics on stderr. Exit codes: 0 ok, 1 error (the server answered non-2xx; body on stderr), 2 usage or invalid input (nothing was sent), 3 server unreachable. Every command takes `--input <json>` or `--input -` (stdin) for its whole input object; flags override it.

| Task                                  | Command                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Start / stop / inspect server         | `start --no-open`, `stop`, `status`                                                                                               |
| Create or update elements (batch)     | `apply --input - < scene.json` — `{"elements":[...],"place":[...],"prune":true}`                                                  |
| Delete / relabel by id                | `apply --patches '[{"op":"delete","id":"a"},{"op":"set","id":"b","label":"New"}]'`                                                |
| Create only (fails on an existing id) | `add --input - < elements.json` — `{"elements":[...]}`                                                                            |
| Check input without writing           | `validate --input - < scene.json`, or `apply --dry-run` (also returns lints)                                                      |
| Read one / query many                 | `get --id <id>`, `query [--type box\|zone\|line\|text] [--ids a,b] [--bbox '{"x":0,"y":0,"width":800,"height":600}'] [--limit n]` |
| Understand the scene                  | `describe [--scope frame:<id>]` (`{rev, text}`: ids, positions, labels, connections)                                              |
| Check the scene                       | `lint [--scope all\|frame:<id>\|near:<id>,r=<px>] [--ids a,b]` → hits with code, ids, bbox, hint                                  |
| See part of the scene                 | `look --target <id>[,<id>] [--r 150] [--marks]` → cropped PNG path + rendered boxes                                               |
| See the whole scene                   | `screenshot [--out f.png] [--format svg] [--max-px n]` → `{path, format, width, height}`                                          |
| What changed                          | `changes [--since <rev>]` (who changed what), `diff [--from <rev>] [--to <rev>]` (changes + lint delta)                           |
| Scene files                           | `export --format excalidraw\|obsidian\|svg\|png [--out f]` (no `--out` → `content` inline)                                        |
| Snapshots                             | `snapshot --action save\|list\|restore [--name <name>]`                                                                           |
| Wipe canvas                           | `clear --yes`                                                                                                                     |

### Element Format (CLI and MCP)

Elements are Excalidraw's own element skeletons (`ExcalidrawElementSkeleton`), checked strictly before anything is written:

- **Ids**: every element needs a semantic `"id"` (`"trip"`, `"rider-to-gateway"`), arrows included. Ids are stable: re-sending an id updates that element.
- **Labels**: put `"label": {"text": "My Label"}` on a shape or arrow. The label's own id is `<id>#label` in lint hits and `describe`.
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
      └──── fix scene.json ◄── look at the    screenshot once,
                               hit ids        check intent, done
```

1. **Write**: keep the whole diagram in one file (`scene.json`: `elements` + `place`). It is your source of truth; edit it, don't rebuild it from `describe`.
2. **Apply**: `apply --input - < scene.json`. Re-applying unchanged elements is a no-op, so always send the whole file.
3. **Lint**: the `apply` reply carries `lints`; `lint` re-runs them on demand. Each hit is `{code, ids, bbox, severity, hint}`. Lint measures what was actually drawn, not the stored numbers.
4. **Look**: for each `error` hit you don't understand from the hint, `look --target <ids> --r 150` returns a small crop (≤ 512×384) and the rendered boxes of those ids. Read the PNG. Don't take a full screenshot to find a defect.
5. **Fix**: edit `scene.json` as the hint says, apply again. The reply's lints show what is left.

Done means: zero `error` hits, then one `screenshot` to check what lint can't: the diagram says what was asked (every required element, numbering, legend, title).

### Quality Checklist

Lint checks these for you after each `apply`. Each code, what it means, and the usual fix:

| Code                     | Severity | Means                                                                                         | Fix                                                                            |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `text-overflow`          | error    | Label is wider or taller than its shape (text truncated)                                      | Increase `width`/`height`, or shorten the label                                |
| `text-wrapped`           | error    | Label wrapped onto more lines than it was written with                                        | Widen the shape, or put the line break in the text yourself and raise `height` |
| `node-overlap`           | error    | Two shapes share space                                                                        | Move one; keep ≥ 40px between shapes                                           |
| `outside-zone`           | error    | A frame child is drawn outside its frame, or a shape sits inside a frame that doesn't list it | Grow or move the frame (50px padding), or fix `children`                       |
| `arrow-through-node`     | error    | An arrow passes through an unrelated shape                                                    | Move that shape off the line, or move an endpoint so the line is clear         |
| `arrow-through-label`    | error    | An arrow crosses another element's label                                                      | Move the label's owner or the arrow's endpoints                                |
| `label-on-node`          | error    | A label (usually an arrow's) sits on a shape                                                  | Lengthen the arrow (move the shapes apart), shorten or drop the label          |
| `label-on-label`         | error    | Two labels overlap                                                                            | Spread the arrows apart, or drop one label                                     |
| `label-on-border`        | error    | A label crosses a shape or frame border                                                       | Move it fully inside or outside; grow the container                            |
| `label-on-own-arrowhead` | error    | An arrow's label covers its own arrowhead: the arrow is too short                             | Give labeled arrows 120px+, or drop the label                                  |
| `dangling-endpoint`      | error    | An arrow end is not bound, or points at an id that doesn't exist                              | Set `start`/`end` to an existing id                                            |
| `crossing`               | info     | Two arrows cross                                                                              | Reorder shapes if it's cheap; otherwise fine to leave                          |

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
2. Start the server and note the canvas URL: `bun elkdraw/adapters/cli/src/main.ts start --no-open`. Optional fresh start: `clear --yes`.
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

Pairing `describe` with `look` is what makes this skill powerful.

- **`describe`** → `{rev, text}`: element IDs, types, positions, labels, connections. Use it to know _what's on the canvas_ when you don't have the file (a human drew it, or you lost track).
- **`lint`** → the defects, with ids and a hint each. Use it to know _what is wrong_ without looking at anything.
- **`look`** → a cropped PNG around ids, plus their rendered boxes. Use it for _visual quality verification_ of one spot — it shows exactly what the user sees there. `--marks` draws the ids on the crop. The CLI prints the saved file path; read/view that file.
- **`screenshot`** → the whole canvas as one PNG. Use it once at the end, not per defect.

**Feedback loop:**

```
apply scene.json
  → lints: text-overflow [auth-svc#label] → set auth-svc width 220 in the file → apply
  → lints: node-overlap [auth-svc, rate-limiter] → look --target auth-svc,rate-limiter --r 150
    → "rate-limiter sits 20px into auth-svc" → rightOf rate-limiter of auth-svc gap 60 → apply
  → lints: [] → screenshot → "all checks pass"
  → proceed
```

## Workflow: Refine an Existing Diagram

1. `changes` to see what the human did since your last apply (lines like `{"author":"human","op":"moved","ids":["kafka"],"detail":{"dx":120,"dy":0}}`). `apply` writes exactly what you send, so a human's move is lost if you re-apply an old position: copy their changes into your file first (`get --id <id>` for the new values).
2. No file (a diagram you didn't draw)? `describe` to understand current state — note element IDs and positions — and `query --type box|zone|line|text` for the elements you need.
3. Identify elements by `id` or label text (not by x/y coordinates — they change).
4. Edit the file and re-apply it; `--if-rev <rev>` (the `rev` from `changes`) fails instead of overwriting if the canvas moved on meanwhile. Delete with a `delete` patch, or set `"prune": true` so ids you removed from the file are deleted (only elements you created; human-drawn elements are never pruned). **Bound arrows re-route automatically when you move or resize their endpoints** — no need to delete and recreate them.
5. Read the reply's lints; `look` to confirm the change looks right. `diff` shows what changed since your last turn and which lint hits it added or fixed.
6. If updates fail: check the ID exists with `get --id <id>`.

## Workflow: Mermaid Conversion

Not supported: `apply` rejects `text`. Translate the Mermaid nodes and edges into elements (Drawing a New Diagram).

## Workflow: File I/O

- Export scene: `export --format excalidraw --out diagram.excalidraw` (no `--out` → the JSON in `content`)
- Import scene: not supported; re-apply your `scene.json` instead
- Image: `export --format png --out diagram.png` / `export --format svg --out diagram.svg` (headless; no browser tab)
- Share link: not supported (local only)

This is how diagrams live in a repo: commit `scene.json` (what you edit) and the exported `.excalidraw` (what people open), and re-apply + export when the architecture changes.

### Obsidian vaults: use `.excalidraw.md`

Check the destination before writing: if any ancestor directory contains `.obsidian/`, it is an Obsidian vault. A raw `.excalidraw` file there opens in the Excalidraw plugin only in **compatibility mode** ("Convert to new format" warning), gets no block references or vault-wide search, and default Obsidian Sync skips non-`.md` files. Export with `--format obsidian` and a `.excalidraw.md` extension:

```bash
bun elkdraw/adapters/cli/src/main.ts export --format obsidian --out "$VAULT/diagrams/system-map.excalidraw.md"
```

## Workflow: Snapshots

1. `snapshot --action save --name <name>` before risky changes.
2. Make changes, evaluate with `lint` / `look`.
3. `snapshot --action restore --name <name>` to roll back if needed. `snapshot --action list` shows what's saved.

## Workflow: Duplication

No duplicate command: copy the elements in `scene.json` with new ids and place the copies (`row`, `rightOf`, ...). Useful for repeated patterns or copying layouts.

## Error Recovery

- **Exit code 3 (server unreachable)?** The server is not running at that URL. Run `start --no-open`, or fix `--url` / `ELKDRAW_URL`. For an `https://….elkdraw.localhost` URL, set `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`.
- **Exit code 2 (invalid input)?** Nothing was sent. stderr names the path and the problem (`elements[3].text: unknown key`); fix that field. `validate` checks a file without touching the canvas.
- **Exit code 1 with `"code": "NOT_IMPLEMENTED"`?** That tool or option is not available on this server; stderr includes its input schema. Use another route from this skill.
- **Exit code 1 with a rev mismatch?** Someone changed the canvas after the `--if-rev` you gave. Run `changes`, fold the edits into your file, apply again.
- **Elements not appearing?** Check `describe` — they may be off-screen or outside the region you looked at. `look --target <id>` finds one wherever it is.
- **Arrow not connecting?** `dangling-endpoint` names it. Verify element IDs with `get --id <id>`. Make sure `start.id`/`end.id` match existing element IDs.
- **Canvas in a bad state?** `snapshot --action save` first, then `clear --yes` and re-apply `scene.json`. Or `snapshot --action restore` to go back.
- **A defect lint can't see?** `look` at it with `--marks`, fix it, and mention it to the user: it is a missing lint rule.

---

## References

- `references/cheatsheet.md`: full CLI reference, the MCP tools, REST API endpoints + payload shapes, placement and asset ops, and the diagram design guide (colors, sizing).
