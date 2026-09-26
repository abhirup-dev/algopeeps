# Dogfood: elkdraw (ELK draw), "Request a ride" diagram

Tester: Claude agent, CLI only (`bun elkdraw/adapters/cli/src/main.ts … --url http://127.0.0.1:4741`), session `default`, port 4741. The canvas started empty (rev 0).

## 1. Outcome

- **Final elements:** 45 authored elements (18 shapes, 20 arrows incl. 2 legend arrows, 3 text, 4 frames), plus Excalidraw's bound label texts. Canvas rev 6.
- **Tool calls:** 21 CLI invocations sent to the server: 8 `apply` (2 of them `--dry-run`), 1 `validate`, 6 `screenshot`, 2 `describe`, 1 `look`, 1 `diff`, 1 `status`, plus 1 `apply` that failed locally (exit 2). There were also 3 Read calls to view PNGs. About 10 minutes of wall time. Screenshot timestamps show r1 to r6 in about 2.5 minutes; the rest was planning coordinates.
- **Screenshot:** `canvas/docs/dogfood-elkdraw.png` (final, rev 6).
- **Final lint:** 0 errors, 1 info (`crossing` trip-pg × surge-kafka).

| Requirement                                                      | Met?                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ≥25 elements                                                     | ✅ 45                                                                                                             |
| Three labelled zones Edge / Core services / Data                 | ✅ frames. ⚠️ The frame names render at about 11px grey and can't be enlarged (`fontSize` on a frame is rejected) |
| Edge: Rider app, Driver app, API gateway, Auth                   | ✅                                                                                                                |
| Core: Matching, Location, Trip, Pricing, Payment, Notification   | ✅ (+ Surge after edit b)                                                                                         |
| Data: Postgres, Redis geo, Kafka, Analytics as a different shape | ✅ green ellipses                                                                                                 |
| Stripe, APNs/FCM outside zones                                   | ✅ grey dashed boxes left/right                                                                                   |
| Numbered arrows 1–9 in order                                     | ✅ rider→gateway→auth→trip→pricing→matching→location→redis, matching→notification (8), trip→payment (9)           |
| Async arrows into Kafka + Kafka→analytics                        | ✅ dashed orange (trip, payment, surge → kafka; kafka → analytics)                                                |
| Legend (sync / async / store) + title                            | ✅                                                                                                                |
| No overlaps, arrows bound, text readable                         | ✅ lint-clean and bound (they followed moves). ⚠️ Zone titles are too small (see above)                           |
| Edit (a): Pricing next to Matching, arrows attached              | ✅ 1 call                                                                                                         |
| Edit (b): Surge between Pricing and Kafka                        | ✅ 1 call                                                                                                         |

## 2. Hardest parts (ranked)

1. **Hand-planning a collision-free grid, before any tool call.** Most of the time went into computing coordinates by hand, including line-vs-box intersections in my head, so that arrows would clear shapes. The tool has `row/column/grid/rightOf` but no auto-layout. For a flow with 9 numbered hops plus fan-out to stores, the real problem is choosing which column each node goes in, and nothing helps with that. My first layout (columns 260px apart) came back with 11 errors: 4 `text-wrapped`, 1 `label-on-node` pair, 3 `label-on-own-arrowhead`, 2 `arrow-through-label`. Fixing them meant redesigning the whole grid, not tweaking it: 380px columns, row gaps above 200px, Location/Notification swapped, Kafka moved to the far left. The ELK in the name made me expect a layered layout option. There isn't one.
2. **Labelled arrows need about 200px, so the whole diagram gets huge.** `label-on-own-arrowhead` fired on every 80px gap with a short label like "2 verify" (`a1`, `a2`, `a6`). The only fix is to space things apart, and the final canvas is about 2400×1600 with a lot of empty frame area (the Data frame is about 60% empty). There's no option to put the label offset or beside the arrow. The lint is correct, but the only remedy is "make everything bigger."
3. **Ellipse labels wrap at widths that look plenty.** A 200px ellipse wrapped "Postgres (trips)" and "Kafka event bus". A 260px ellipse _still_ wrapped "Analytics warehouse" (rev 2 lint), so it needed a third apply at 310px. The `max(160, chars*12)` sizing rule in the skill is written for rectangles and is wrong for ellipses. Lint caught it every time, but each miss cost a round trip.
4. **Moving a frame doesn't move its children.** A dry-run that moved only `legend` returned 5 `outside-zone` errors. I had to resend the frame plus all 5 children with hand-shifted y values. Dry-run saved me from a broken write, which is good. But "move this zone" should be a single op.
5. **Adding a node to a zone means resending the frame's full `children` list** (edit b). If you forget one child, you'd presumably get an `outside-zone` error, or worse, silently orphan it.
6. **CLI ergonomics.** `--input <path>` isn't accepted, only inline JSON or `-`: `--input: JSON Parse error: Unrecognized token '/'`. The skill's "keep scene.json as source of truth" workflow assumes you can write files and pipe them. `screenshot --out canvas/docs/x.png` (relative) replied `{"path":"canvas/docs/dogfood-elkdraw.png"}`, but the file wasn't at that path relative to my cwd. It seems to resolve against the server's cwd, and the reply echoed the relative path instead of the absolute one. An absolute `--out` worked.

## 3. What was genuinely good (ranked)

1. **Lint in the apply reply, with ids, bbox and a concrete hint.** Every error pointed at the right element with a usable fix ("Give a1 200px+ (move its shapes apart), or drop the label"). I never had to look at a picture to know _what_ was wrong. The rev-2 reply was a single remaining hit, and it was right.
2. **Place-only applies for edits.** Edit (a) was one call: `{"elements":[],"place":[{"op":"below","id":"pricing","of":"matching","gap":210},{"op":"rightOf","id":"location","of":"pricing","gap":200},{"op":"below","id":"redis","of":"location","gap":200}]}`. That's about 200 bytes. All bound arrows (a4, a5, a6, a7) re-routed and lint stayed clean. `leftOf` did the same for Surge in edit (b).
3. **`--dry-run` returns the lints it would produce.** It caught the frame-children trap (#4 above) and let me check edit (a) before writing it. Cheap and safe.
4. **Partial applies are safe by default.** Sending only `analytics` updated just that element; nothing else was touched or pruned. Upserts by semantic id are easy to reason about.
5. **Strict validation with paths.** `elements[0].fontSize: unknown key` came back instantly, with nothing written.
6. **`diff --from 4`** produced a clean summary of both edits: `moved location,redis dx 400`, `moved pricing dx 380`, `added surge…`, `delta: "+1 crossing"`. That's exactly what you want to hand a human reviewer.
7. **Headless `screenshot`** at `--max-px 1800` was readable and fast, with no browser needed.

## 4. Perception

- **Could I see it?** Yes. `screenshot` gave a full, legible PNG, and `look --target trip,pricing,matching --marks` gave a crop plus the rendered boxes. `describe` gave a clean, zone-grouped text model (`a5: pricing -> matching "5 match"`) that's good enough to check topology and numbering without an image.
- **How I found defects:** 11 from lint on the first apply. 1 more from lint on the next apply (analytics still wrapping). 3 by eye from the screenshot that lint doesn't flag:
  - the legend was placed far from everything (I moved it next to the Data zone);
  - the zone titles are too small to read at normal zoom;
  - the Data frame is mostly empty space.
    Lint also stayed silent about two arrowheads landing close together on Kafka (trip-kafka and surge-kafka, visually about 25–30px apart).
- **What `describe` lacks:** styles. It can't confirm that async arrows are dashed/orange or that stores are green, so checking the legend against the drawing needs a picture. The legend arrows show up as `line`, not `arrow`.
- **Views I'd want:** a whitespace/density metric per frame ("Data: 62% empty, could shrink to w=…"), a `fit-frame` suggestion, and a numbered-flow check (list the arrows whose label starts with a digit, in order, so I can verify 1–9 without reading the PNG).

## 5. Action surface

- **Payload cost:** the first full-scene apply was about 9 KB of JSON (≈2.5k tokens), 42 elements at about 200 bytes each. About half of that is repeated style (`backgroundColor/strokeColor/fillStyle` on every node, `strokeColor` on every arrow). There are **no style presets/classes** (`"class":"service"`), and that is the biggest token waste. Replies are small: ids plus lints, with no echo (the r1 reply was about 4 KB because of 15 lints).
- **Too low-level:** frames (no move-with-children, no auto-fit to children plus padding, no title font size). Every arrow needs `"x":0,"y":0` boilerplate even though it gets recomputed.
- **Missing:** auto-layout (layered/ELK) for a subgraph, style classes, frame `fit`, arrow label position/offset, a way to add a child to a frame (e.g. `"parent":"core"` on the child instead of rewriting `children`), and `--input @file`.
- **Confusing:** the skill says `clear` is not implemented in one place and documents `clear --yes` in another. Relative `--out` resolves somewhere unexpected. `updated: 7` for a 3-element place op doesn't say _what_ was updated (labels? arrows?).

## 6. Iteration

- **Edit (a), move Pricing next to Matching:** easy, 1 call, about 200 bytes. The tool did the hard part (arrow re-binding). The human-level decision was mine: there was no free slot next to Matching, so I had to decide to also shift Location and Redis right. A "make room" / push-apart op would have made it a single `below`.
- **Edit (b), add Surge:** easy, 1 call. The annoying part is resending the full `core` frame with the updated `children` array. Placement via `leftOf` was painless. It introduced one `crossing` (info) that I left.
- **What pair diagramming needs that's missing:** `changes` exists, but I didn't exercise human edits. From the docs, a human move is lost if I re-apply an old `scene.json`, and there is no merge. Also missing: a "reflow this frame" command after insertions, style classes so a human's "make stores purple" is one edit, and comment/annotation anchoring.

## 7. Top 5 changes

1. **Layered auto-layout per frame or for the whole scene** (it's called ELK draw; expose ELK layered with the frames as partitions). Hand-computing line clearances was 70% of the effort.
2. **Style classes/presets** (`"class":"service"|"store"|"external"|"async"`), defined once. That would cut about half the payload tokens and make recolour edits trivial.
3. **Frame ops:** move-with-children, `fit` to children plus padding, a `parent` field on children, and a readable title size.
4. **Arrow label placement** (offset/side/near-start). That would remove the need for 200px spacing and shrink diagrams a lot.
5. **CLI polish:** `--input @file`, resolve and return absolute paths for `--out`, include _which_ ids were updated in the reply, and add an ellipse-aware sizing hint (or auto-size shapes to their label).
