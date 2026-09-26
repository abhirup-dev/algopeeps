# Dogfood: mcp-excalidraw-server (CLI v2.0.0), batch / apply / mermaid paths

Tester: Claude (Opus 5.5), 2026-09-25. Brief: `canvas/briefs/DOGFOOD-diagram.md`.
Interface: `npx -y mcp-excalidraw-server <cmd>` against a private canvas on `http://127.0.0.1:3020`, browser tab in ego-browser task space 2.
Angle: the other tester drives the CLI one element at a time; this run deliberately used the **bulk paths** (`mermaid`, one big `add`, multi-op `apply`) and nothing else for mutation.

## Decisions taken without asking

- **Port.** The prompt said to prefix `PORT=3020`. The CLI ignores `PORT`: `core/spawn.js` derives the port from `EXPRESS_SERVER_URL` and overwrites `PORT` when spawning `dist/server.js`. I set both, but only `EXPRESS_SERVER_URL=http://127.0.0.1:3020` matters. Never touched :3000 / :3010.
- **Mermaid first, then direct batch.** Mermaid was tried as the "one call" path, judged unusable for this brief, then the canvas was cleared and rebuilt with one `add`.
- **Zones = big rectangles + free-standing text** (skill anti-pattern #1), not Excalidraw frames. The CLI has no frame concept in its docs.
- **"Move Pricing next to Matching"** became Pricing directly under Matching. Location moved one column right to make room, so it now sits over Redis. A literal same-row placement would have meant pushing Notification and APNs right and re-flowing the Edge row.
- **"Surge between Pricing and Kafka"** became a new Core row under Pricing: Core zone grows 100px and the Data zone shifts down. Pricing → Surge is sync, Surge → Kafka is async.
- Screenshots were taken with a 2s `sleep` after each mutation as a precaution against sync races. I did not test whether it is needed.
- Working files live in `/tmp/dogfood-batch/` (not committed, per the brief).

## 1. Outcome

| | |
|---|---|
| Final elements | 77 on the canvas (48 authored + 3 for Surge, plus auto-generated bound label texts): 17 rect, 5 ellipse, 21 arrow, 34 text |
| Mutating calls | 8: `mermaid` ×1, `clear` ×1, `add` ×1 (whole diagram), `apply` ×5 (fix, fix, edit a, edit b, fix) |
| All CLI calls | 34 (incl. 7 `screenshot`, 5 `export`, 3 `get`, 2 `describe`, 2 `query`, 2 `snapshot`, start/status/version) |
| Wall time | ~5.5 min of CLI time from server start to final export; most of it was my own layout reasoning, not tool latency (each call takes about 0.7–0.9s) |
| Screenshots | `/tmp/dogfood-batch/01-mermaid.png` (mermaid attempt), `02-batch.png` (first batch), `03-fix1.png`, `04-fix2.png`, `05-edit-a.png`, `06-edit-b.png`, `07-final.png` (final) |
| Scene file | `/tmp/dogfood-batch/final.excalidraw` |

Requirement checklist (final state):

- [x] ≥25 elements (77)
- [x] Title, and three labelled zones (Edge / Core services / Data)
- [x] Edge: Rider app, Driver app, API gateway, Auth. Core: Matching, Location, Trip, Pricing, Payment, Notification (+ Surge)
- [x] Data stores as ellipses (Postgres, Redis geo-index, Kafka, Analytics warehouse). Services are rectangles
- [x] Stripe and APNs/FCM outside the zones (grey)
- [x] Numbered sync arrows 1–9 in flow order (1 rider→gw, 2 gw→auth, 3 gw→trip, 4 trip→pricing, 5 trip→matching, 6 matching→location, 7 location→redis, 8 matching→notification, 9 trip→payment); unnumbered notification→APNs→driver and payment→Stripe
- [x] Dashed orange async arrows trip/matching/payment/surge → Kafka, Kafka → warehouse
- [x] Legend box (sync / async / store)
- [x] Every flow arrow bound at both ends (19/19 per `export`); they followed boxes through both edits
- [x] Text readable (16px body, 20px zones, 28px title). "Analytics warehouse" wraps to two lines inside its ellipse, but is not clipped
- [ ] **Nothing overlapping: partial.** No shape overlaps and no labels on borders, but two arrow/arrow crossings remain (Trip→Postgres × Payment→Kafka, 4 quote × Matching→Kafka). Labels 1 and 2 touch their own arrowheads

## 2. Hardest parts (ranked)

1. **Custom arrow routing is lost on any endpoint move.** I fixed the Trip→Postgres crossing by setting `points: [[0,0],[-60,250],[-258,376]]` + `roundness:{type:2}` in `apply` (fix2). The curve rendered and `export` showed the points. Edit (b) then moved Postgres down 100px, and the frontend re-routed the bound arrow back to a straight 2-point line (`get a-trip-pg` → `points: [[0,0],[-274.56,473.16]]`). No warning. Any manual routing you do is undone by the next layout change.
2. **`elbowed: true` is a silent no-op on bound arrows.** fix1 set `{"id":"a-trip-pg","elbowed":true}`. `apply` said `updated: 29`, `get` shows `elbowed: True`, and the screenshot shows the same straight diagonal. Excalidraw elbow arrows need `fixedPoint` bindings; the server stores `fixedPoint: null`. The skill's "Arrow Routing" section presents `elbowed` as a working tool.
3. **Arrow labels can't be placed; they sit at the midpoint.** Three of my first-pass defects came from this: labels 2/5/8 collided with boxes (gap 130px was too small), "3 create trip" landed on the Core zone's dashed border, and "7 GEOSEARCH" landed on the Data border. Fixing these meant re-flowing whole columns and rows so midpoints fell in empty space. After edit (b), label 7 landed on a border again, and I had to move Location to shift the midpoint. There is no `labelPosition` or offset.
4. **Nothing tells you about crossings or collisions.** Every defect came from reading the PNG myself. `describe` has no overlap, crossing, or "label on another element" signal. Both edits introduced new problems (a new arrow crossing after (a), and label 7 on a border plus the lost curve after (b)), and each `apply` just returned `success: true`.
5. **Layout planning is all on the agent.** There is no auto-layout for direct creation, and mermaid's layout (below) is worse than hand-placed. The one-shot `add` only worked because I spent the planning time up front on a column/row grid in a Python generator. Adding Surge "between" two things was a manual reflow of 7 elements.
6. **The Mermaid path doesn't meet the brief.** One call, 0.7s, 64 elements, 17/17 arrows bound, subgraphs grouped. But:
   - `[(Postgres)]` cylinders became rectangles, so store shapes were lost.
   - The subgraph titles sat mid-container: "Edge" was centred in its zone, "Core services" was on top of an arrow, and "Data" was rendered on the Kafka→warehouse arrow.
   - Cross-subgraph edges were long curves through other zones; the "7 GEOSEARCH" label floated detached, and Stripe landed between zones.
   - No styling, and element IDs are random (`6MQzdEiHpaADgheK_KGsv`), so every later edit needs a label→id lookup.

   Fixing it would have taken more calls than rebuilding.

## 3. What was genuinely good (ranked)

1. **The whole diagram in one `add` call.** 48 elements, 8KB of JSON, 0.85s, rendered almost right on the first try: fills, dashed async arrows, custom IDs, bound labels via plain `"text"`. The agent-friendly format (`text`, `startElementId`/`endElementId`, arrows with `x:0,y:0` and no points) is a big win over raw Excalidraw JSON.
2. **Binding really works.** 19/19 arrows stayed attached through two re-flows. Edit (a) was a two-line patch (`pricing` and `location` x/y) and all 7 affected arrows re-routed cleanly.
3. **`apply` is the right primitive for edits.** Mixed update and create in one atomic call (edit b: 7 updates + 3 creates, 684 bytes). The response is terse (`created/updated/deleted` counts, ~90 bytes), and I could reference new IDs (`surge`) in arrows in the same patch.
4. **Custom IDs make follow-ups cheap.** Everything after the first `add` addressed elements by name (`pricing`, `a-trip-pg`). No lookups needed.
5. **Screenshots are fast and faithful** once a tab is open: `screenshot --out f.png` about 1s, full-scene fit. `snapshot save` gave a cheap safety net before the edits (not needed in the end).
6. **Port isolation was clean.** `EXPRESS_SERVER_URL` alone gave a private server on :3020; `stop` is identity-checked.

## 4. Perception

- **Could I see what I drew?** Yes, but only through a full-scene PNG, which needs a live browser tab (exit code 4 otherwise). At a ~2000px-wide image the 16px labels were legible. For a much larger diagram they would not be, and there's no crop or zoom-to-region in the CLI (`set_viewport` is MCP-only).
- **How I found defects:** entirely by eye on the PNG. `describe` could not have found any of them:
  - Arrows are listed only as `[a-trip-pg] arrow | at (792, 497)`. No size, no points, no source→target (`grep '→'` = 0 hits), even though the skill says `describe` gives "connections".
  - Labels are listed on their parents, with no rendered bbox for the label.
- **`get` and `export` disagree on shape.** `get` returns the agent format (`start`/`end`, `label`); `export` returns native Excalidraw (`startBinding.elementId`). My first binding check on `get` wrongly read "no binding". You have to know which view you're looking at.
- **`query --bbox` works** (returned pricing, surge and their arrows for a region) and is the closest thing to a spatial query. It matches element anchors, not rendered extents.
- **Views I wanted:**
  1. a lint report: shape/shape overlaps, arrow crossings, label-over-element, label-over-border, text wrap/clip, unbound arrows;
  2. a region crop screenshot (`screenshot --bbox` or `--around <id> --pad 80`);
  3. a numbered/ID overlay screenshot so a PNG pixel can be mapped back to an ID;
  4. a before/after diff after `apply` (what moved, which arrows re-routed, which custom points were discarded).

## 5. Action surface

- **Too low-level:** arrow routing (raw relative `points`, overwritten on re-route) and label placement (none). Zones are hand-built rectangle+text pairs; a `zone`/`frame` element with a title slot and auto-fit-to-children would remove a whole class of bugs (the skill spends an anti-pattern section on this).
- **Missing:** relative placement ("right of X, 80px gap"), auto-layout for directly created elements, "grow container to fit children", a label offset on arrows, and working elbow routing.
- **Confusing:**
  - `PORT` is ignored by the CLI.
  - `elbowed` is accepted but ignored.
  - The `get` and `export` schemas differ.
  - `describe` promises connections it doesn't print.
  - One authored element becomes two (a shape plus a `<id>-label` text), so element counts don't match what you wrote (48 authored → 73 on canvas).
- **Token cost of payloads:**
  - Input: `add` 8,004 B for 48 elements (about 170 B/element; generated by a 50-line script, which I'd recommend over hand-writing). `apply` patches 90–1,100 B. Mermaid source 911 B.
  - Output: `add` **echoes every element back: 20,388 B** for no benefit. There's no `--quiet` or ids-only mode, and it's the single largest cost in the run. `apply` is ~90 B (good). `describe` is 4.3 KB final / 10.2 KB for the mermaid scene (random IDs inflate it). Screenshots are ~2000×1100 images, the dominant context cost overall (7 of them).

## 6. Iteration

- **Edit (a), move Pricing next to Matching:** easy. One `apply`, 2 updates, ~90 B, 8s including screenshot. Arrows stayed attached. The hard part was the decision (where does "next to" fit without collisions?). It introduced a new arrow crossing the tool didn't mention.
- **Edit (b), add Surge between Pricing and Kafka:** medium. One `apply` (7 updates + 3 creates, 684 B). Making room was manual: resize the Core zone, shift the Data zone, its label and all 4 ellipses. It then silently regressed two earlier fixes (the curve was lost, and label 7 was back on a border), which took another `apply` and screenshot to find and fix.
- **Batch vs one-at-a-time (vs the other tester):** I haven't seen their results. From this run, batch collapses creation to one call and each edit to one call, so call count is not the problem. The cost moves into (1) up-front coordinate planning and (2) visual verification after every patch. Batching makes regressions bigger per step, because one patch can move 7 things and the tool reports none of the side effects.
- **What pair diagramming with a human needs that this lacks:**
  - A way to point at the human's selection ("the box I just clicked" → id). Nothing exposes browser selection to the CLI.
  - Change notifications or a diff when the human edits in the tab.
  - Layout intents that survive later edits ("keep Pricing right of Matching", "zone fits children").
  - A lint pass the agent can run after each patch instead of eyeballing a PNG.

## 7. Top 5 changes, most valuable first

1. **`lint` / `describe --issues`:** report shape overlaps, arrow crossings (including arrow-through-shape), labels on other elements or zone borders, wrapped/clipped text and unbound arrows, with IDs. This would have found every defect in this run without a screenshot.
2. **Arrow routing that survives edits:** real elbow routing (set `fixedPoint` so `elbowed:true` works, or reject it with an error), plus waypoints that are kept or warned about on re-route instead of silently dropped. Add a label position/offset for arrows.
3. **Containers as first-class:** a `zone` (or real Excalidraw `frame`) with a title slot that sits outside the child area, and `fit` to auto-resize around children. This removes the rectangle+text workaround and the manual reflow in edit (b).
4. **Relative placement and a small layout helper:** `{"rightOf":"matching","gap":80}`, `below`, `between`, plus auto-layout for directly created graphs (Mermaid's layout without Mermaid's shape and label losses). Also fix Mermaid conversion to keep `[( )]` cylinders and to put subgraph titles at the top.
5. **Output hygiene and consistent views:**
   - `add` should return ids only by default.
   - `get` and `export` should use one schema, or label which one each returns.
   - `describe` should print `source → target` and the arrow bbox.
   - `screenshot --around <id>|--bbox` should give region crops.
   - The CLI should honour or reject `PORT`.
