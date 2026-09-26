# Dogfood: ELK draw (elkdraw) — "Request a ride" architecture

Tester: Claude (Opus 5.5) · Interface: CLI (`bun elkdraw/adapters/cli/src/main.ts … --url http://127.0.0.1:4721`) · Session `default`, port 4721, rev 0 → 9.

## 1. Outcome

- **Final element count:** 51 top-level elements (per `describe`), plus bound arrow labels.
- **Tool calls:** 22 elkdraw CLI calls: 9 `apply` (1 rejected with exit 2), 5 `screenshot`, 2 `get`, 1 `look`, 1 `snapshot`, 1 `describe`, 1 `status`, 1 `apply --place`, 1 `apply` for Surge. 4 more calls were blocked by the eval sandbox hook (see §2.6).
- **Time:** about 6 minutes wall clock. The first screenshot and the final one were 162 s apart.
- **Screenshot:** `tmp/elkdraw/default-screenshot-r9-1790433383773.png` (final, rev 9).

Checklist:

| Requirement                                         | Met?             | Notes                                                                                                                                                                  |
| --------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 25 elements                                       | ✅               | 51                                                                                                                                                                     |
| 3 labelled zones Edge / Core services / Data        | ✅ (workaround)  | Dashed rectangles plus a free-standing header text. **Frames had to be abandoned**: they clip cross-zone arrows (§2.1).                                                |
| Edge: rider, driver, gateway, auth                  | ✅               |                                                                                                                                                                        |
| Core: 6 services                                    | ✅               | Plus Surge after edit (b)                                                                                                                                              |
| Data stores in a different shape                    | ✅               | Green ellipses                                                                                                                                                         |
| External Stripe, APNs/FCM outside zones             | ✅               | Grey boxes left and right of Core                                                                                                                                      |
| Numbered arrows 1–9 in order                        | ✅               | rider→gw→auth→trip→pricing→matching→location→redis, matching→notification (8), trip→payment (9)                                                                        |
| Unnumbered async arrows into Kafka, Kafka→analytics | ✅               | Orange dashed: trip, payment, notification, surge → Kafka; Kafka → Analytics                                                                                           |
| Legend (sync / async / store) and title             | ✅               |                                                                                                                                                                        |
| No overlap, arrows bound, text readable             | ⚠️               | Lint is clean apart from two `crossing` infos (s7×notif-apns, pay-stripe×trip-pg). Arrows are bound, but they do **not** move with their boxes through `apply` (§2.2). |
| Edit (a) Pricing next to Matching, arrows attached  | ✅ after 3 calls |                                                                                                                                                                        |
| Edit (b) Surge between Pricing and Kafka            | ✅               | Needed a repair call because of edit (a)'s damage                                                                                                                      |

Defects found and fixed (more than three):

1. **Frames clipped cross-zone arrows.** Arrows 3 and 7 lost their labels, and pay-stripe/notif-apns/apns-driver were cut at the frame edge. Lint reported this only as a misleading `outside-zone` "take s3 out of its children"; I never put arrows in `children`. Fixed by replacing frames with plain rectangles.
2. **`label-on-own-arrowhead` on s1, s2, s4, s5, s6** with 140 px gaps, even though the skill says 120 px+ is enough. Fixed by widening column gaps to 200 px.
3. **Ellipse labels wrapped** ("Kafka event / bus", "Postgres / (trips)", "Analytics / warehouse"). I only saw this by eye in the screenshot. **`text-wrapped` did not fire.** Fixed by widening the ellipses to 260–300 px.
4. **"7 GEOSEARCH" label sat on the notif-apns line.** Seen by eye, **not reported by lint** (`arrow-through-label` did not fire). Fixed by moving the Data zone down 80 px so the label midpoint cleared the line.
5. **Legend lost its styling and size** after a partial upsert (§2.3). Seen by eye. Fixed by resending the whole legend.
6. **Pricing became a blank 100×100 unlabelled black box** after a `place`-only `leftOf` op (§2.4). Seen by eye, **no lint hit**. Fixed by resending it in full.

## 2. Hardest parts (ranked)

1. **Frames and cross-zone arrows are incompatible.** First `apply` (rev 1): the server assigned every arrow to a frame (`get s3` → `"zone":"core"`, the end shape's frame), and Excalidraw frame clipping then cut them. The labels "3 create trip" and "7 GEOSEARCH" disappeared completely. The lint text `Grow or move core (50px padding), or take s3 out of its children` points at the wrong cause and suggests a fix that is impossible (s3 was never in `children`). The skill tells you to use frames for zones _and_ that cross-zone arrows are sometimes unavoidable. In an architecture diagram they are the whole point. I had to throw frames away, which also loses `describe`'s grouping by zone.
2. **Moving a shape does not move its bound arrows, contrary to the docs.** The skill says "Bound arrows re-route automatically when you move or resize their endpoints". At rev 3, moving the four Data ellipses produced 7 `dangling-endpoint` errors (`s7 end is 84px off redis`). The same happened at rev 6 when a `leftOf` place op moved Pricing (s4, s5 dangling). Every move is really a move plus resending every arrow touching the shape, and the caller has to know that list. The only saving grace is that lint names the arrows.
3. **Upsert is replace, not patch, and fails silently.** `{"id":"legend-zone","type":"rectangle","x":40,"y":1170}` reset the rectangle to 100×100 with default stroke. Resending the legend arrows with only x/y dropped their colour, dash and points. No warning, and lint was clean at rev 4 even though the legend arrow now ran across a 100 px box border. Text elements are stricter: the same partial update was rejected with `elements[6].text: expected string`. So partial updates are sometimes rejected and sometimes silently destructive. Neither behaviour is documented.
4. **`place`-only apply destroys the element.** `apply --place '[{"op":"leftOf","id":"pricing","of":"matching","gap":160}]'` on an existing, styled, labelled Pricing box returned `updated:1` with no warnings. `get pricing` afterwards: `{"fill":"transparent","stroke":"#1e1e1e"}, width 100, height 100`, label gone. This is the op the skill recommends for exactly edit (a). It is the worst bug I hit: silent data loss on the recommended path.
5. **Lint gaps.** No `text-wrapped` for labels in ellipses. No `arrow-through-label` when an arrow label touches another arrow's line. Nothing when an unbound arrow crosses a shape border (legend at rev 4). Nothing when a labelled box loses its label. Lint was "clean" at the moment the diagram looked worst (rev 8).
6. **Environment friction, not the tool's fault, but it hurt.** The sandbox hook blocked reading `elkdraw/AGENTS.md`, writing a `scene.json` to /tmp, and any `cmd1; cmd2` bash. So the "keep scene.json as source of truth" loop was impossible, and I had to pipe heredocs. That made the partial-update footguns in 2.3 and 2.4 much more likely.

## 3. What was genuinely good (ranked)

1. **Headless `screenshot` that just works.** No browser tab needed, a path back in about 1 s, and a readable 1800 px PNG. All of defects 3–6 were found this way. Without it this run would have shipped a broken diagram with clean lint.
2. **Strict schema with precise errors.** `elements[6].text: Invalid input: expected string, received undefined`, and exit 2 with nothing written. The atomic all-or-nothing batch is exactly right.
3. **Lint in every `apply` reply, with ids and actionable hints.** `dangling-endpoint` said `s7 end is 84px off redis: … set end to redis again so it snaps`, which is precise enough to fix blind. `label-on-own-arrowhead` found 5 real problems on the first write.
4. **Compact replies.** `apply` returns ids and counts, never echoes elements. A 45-element write cost about 7 KB in and about 3 KB out.
5. **Semantic ids plus `describe`.** `describe` gives `s4: trip -> pricing "4 quote"`, a readable text form of the graph, which is ideal for checking the numbering 1–9 without pixels.
6. **Snapshots.** `snapshot --action save --name base` was a single call, and a comforting one before risky edits.

## 4. Perception

- **Could I see what I drew?** Yes, via `screenshot`. It was the only reliable signal. Lint caught geometry (arrowheads, dangling ends) but missed half the visible defects.
- **How defects were found:** 2 by lint on the first apply (label-on-own-arrowhead, the confusing outside-zone), 4 only by eye in full screenshots (clipping, ellipse wrap, label on arrow, wiped legend and Pricing).
- **`look`:** `look --target s7,notif-apns,legend-zone --r 40` returned a union bbox of 2118×879 px at scale 0.24. That is useless as a crop when the targets are far apart. Its `boxes` output was useful, though: `legend-zone: 103×103` gave away the partial-update wipe numerically.
- **What I wanted:**
  - A **numbered/id overlay** on screenshots so I can map "that blank square" to an id without guessing.
  - **Per-target crops** (one image per id) rather than one union crop.
  - A **style/label diff** in `diff`, i.e. "pricing: label removed, width 200→100, fill #a5d8ff→transparent". That would have caught 2.3 and 2.4 instantly.
  - A **"shape lost its label" / "element reset to defaults" lint**.

## 5. Action surface

- **Too low-level:** moving a node means resending the node _and_ every attached arrow with full style. There is no `move` or `set x/y` patch. `patches` supports only `delete` and `set label`.
- **Confusing:** `apply` elements are replace-semantics while `place` ops look like patch-semantics, yet both wipe fields. Text elements need `text` on update, other types silently default. `updated` counts don't match what I sent (13 sent → `updated:21`), presumably because labels are counted.
- **Missing:**
  - A way to exclude arrows from frames (or to not clip), or zones that don't clip.
  - Label position control on arrows (the midpoint is forced, so fixing "7 GEOSEARCH" meant moving an entire zone).
  - Elbow routing (`elbowed` is rejected), so the long APNs→Driver diagonal crosses two zone borders.
  - `export`.
- **Docs vs reality:** the skill says `clear` is not implemented in one place and documents `clear --yes` in another. It also says arrows re-route automatically, which they don't via `apply`.
- **Token cost:** full scene about 7 KB per `apply`. Resending everything each iteration (the recommended loop) would be about 7 KB × 9 ≈ 60 KB. Partial resends were cheaper but dangerous (§2.3). Screenshot reads are the biggest cost, roughly 1.5–2 k tokens each.

## 6. Iteration (the two edits)

- **(a) Move Pricing next to Matching:** 3 calls (place op, resend s4/s5, then a later full resend of Pricing once I noticed it had been wiped). The recommended one-liner (`leftOf`) silently destroyed the node _and_ left its arrows dangling. That is two separate bugs on one "move a box" request. Painful.
- **(b) Add Surge between Pricing and Kafka:** 1 call (shape + 2 arrows + `below` place op on a _new_ element worked fine). Its bad y came from the wiped 100 px Pricing, and one more call fixed it. Adding is easy. Changing is hard.
- **What pair diagramming needs:**
  - Moves that keep arrows attached (really re-route on move).
  - Patch semantics (`{"op":"set","id":"pricing","x":940}`).
  - `changes` that show style/label loss.
  - `wait` (not implemented) to block until the human edits.
  - A way to "pin" human-moved positions so an agent re-apply doesn't clobber them.

## 7. Top 5 changes (most valuable first)

1. **Make `place` ops and partial element updates merge into the existing element** (keep style, size and label), or reject partial input loudly. Silent reset to a 100×100 blank box is data loss.
2. **Re-route bound arrows when their endpoints move**, through `apply` and `place`, as the docs already promise.
3. **Stop clipping cross-zone arrows**: don't assign arrows to frames (or assign only when both ends are in the same frame). Change the `outside-zone` hint for arrows to say so.
4. **Close the lint gaps**: `text-wrapped` in ellipses/diamonds, arrow line through another arrow's label, "shape lost its label / reset to defaults", unbound arrow across a shape border. Add a style/label field diff to `diff`.
5. **Better perception primitives**: an id overlay on `screenshot`/`look`, per-target crops instead of one union bbox, and a `move`/`set x,y` patch op plus arrow label offset so small fixes don't need big re-layouts.
