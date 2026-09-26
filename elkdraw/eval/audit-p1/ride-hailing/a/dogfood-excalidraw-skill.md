# Dogfood: excalidraw-skill (yctimlin mcp-excalidraw-server 2.0.0, CLI only)

Canvas: `http://127.0.0.1:4731` (own session, `--url` on every call). Interface: `npx -y mcp-excalidraw-server <cmd>` only.

## 1. Outcome

- **Final element count:** 52 per `status` (shape labels are stored as properties, so bound texts aren't counted separately). That's 17 rectangles (13 service/external boxes, 3 zones, 1 legend box), 5 ellipses (4 stores + the legend swatch), 9 free texts, and 21 arrows (19 bound, 2 legend).
- **Tool calls:** 22 CLI calls. One more was blocked by my harness hook (piping to `head`), which was not the tool's fault. Breakdown: 1 `add`, 6 `apply`, 5 `update`, 6 `screenshot`, 1 `describe`, 1 `get`, 1 `query`, plus `status`×2 and `help`×1 on top.
- **Time:** about 5.5 min wall clock (`status` timestamps 15:44:19 → 15:49:53).
- **Final screenshot:** `tmp/df4731-6.png`. Earlier stages: `tmp/excalidraw-screenshot-1790437533772.png` (first draw), `tmp/df4731-2.png` … `-5.png`.

### Requirement checklist

| Requirement                                                      | Met?                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 labelled zones: Edge / Core services / Data                    | ✅ dashed rects with free-standing labels                                                                                                                                  |
| Edge: Rider, Driver, API gateway, Auth                           | ✅                                                                                                                                                                         |
| Core: Matching, Location, Trip, Pricing, Payment, Notification   | ✅ (+ Surge after edit b)                                                                                                                                                  |
| Data: Postgres, Redis geo, Kafka, Analytics as a different shape | ✅ green ellipses                                                                                                                                                          |
| External Stripe, APNs/FCM outside zones                          | ✅                                                                                                                                                                         |
| Numbered arrows 1–9 in flow order                                | ✅ 1 rider→gw, 2 gw→auth, 3 auth→trip, 4 trip→pricing, 5 pricing→matching, 6 matching→location, 7 location→redis, 8 matching→notification, 9 trip→payment                  |
| Unnumbered async arrows into Kafka + Kafka→analytics             | ✅ dashed orange from location, notification, payment, surge; kafka→analytics                                                                                              |
| Legend (sync / async / store) + title                            | ✅                                                                                                                                                                         |
| Arrows bound, moving with boxes                                  | ✅ for 17 of 19 bound arrows. ⚠️ The two hand-routed polylines (a9, s-pg) stay bound, but moving their endpoints won't re-route the waypoints sensibly (see §2).           |
| Nothing overlapping                                              | ⚠️ **Not fully.** 3 arrow crossings remain: a9's top rail crosses arrow 3; a9's descent crosses notification→APNs; surge→kafka crosses 7 GEO query. No box/label overlaps. |
| Text readable                                                    | ✅ (16–28 px; "1 request ride" sits tight against its boxes)                                                                                                               |

## 2. Hardest parts (ranked)

1. **Binding and routing are mutually exclusive at create time.** Creating `a9` with `startElementId`/`endElementId` plus 4-point `points` (route over the top of the core row) silently came back as a straight 2-point line. The `apply` response showed `points: [[0,0],[884,112]]`, and my waypoints were gone with no warning. Workaround: create it bound, then `update a9 --set '{"x":..,"y":..,"points":[...]}'`. That kept both binding and waypoints. The workaround isn't documented anywhere; the skill doc implies waypoints plus binding just work.
2. **`elbowed: true` arrows vanished silently.** My first `apply` created `a9` and `s-pg` with `elbowed:true` + bindings. The response said `"created": 5` and listed both. The next screenshot showed neither, and `get a9` returned `Element with ID a9 not found`. No error, no warning. Presumably the frontend rejected the elbowed arrow and its auto-sync wrote the scene back without it. This was the most dangerous behaviour I hit: the tool reported success and then lost data.
3. **`apply` computes arrow routes against the pre-update positions.** In the same `apply` where I moved boxes and created new bound arrows, the returned arrows were routed from the _old_ coordinates (e.g. `e-pay-k2` started at (640,615), where Payment used to be). The browser fixed it on the next sync, so the screen looked right, but the `apply` response was stale and misleading. I couldn't trust the echoed geometry.
4. **Updating only `points` on a bound polyline re-anchors its origin.** After edit (b) I sent `{"id":"s-pg","points":[...]}` without x/y. The arrow's origin jumped from Trip's left edge to its bottom edge, so the "route down the left margin" line ended up running straight through the Postgres ellipse (`df4731-5.png`). I had to resend x, y and points together.
5. **No way to route a bound arrow around obstacles.** Every bound arrow is a straight centre-to-centre line. Avoiding crossings meant re-laying out the whole graph by hand. I moved Payment, Notification, Location, Redis, Kafka and Analytics over three rounds, and still ended with 3 crossings. A topologically awkward edge like trip→payment (step 9) had no clean straight path.
6. **No group translate.** Edit (b) needed the Data zone, 4 stores, 7 legend items and a polyline shifted 100 px down: 16 hand-written `{"id":..,"y":..}` entries, each with absolute coordinates I had to compute myself. `arrange` has align/distribute/duplicate but no "move these ids by dx,dy".

## 3. What was genuinely good (ranked)

1. **Moving a box keeps its bound arrows attached and re-routes them live.** Edit (a), swapping Pricing and Location via a 2-entry `apply`, re-routed arrows 4, 5, 6, 7 and the async ones with zero arrow edits. The same went for the first big re-layout: 11 box moves, and every straight bound arrow followed.
2. **One-shot creation of 49 elements from a heredoc** (`add` with stdin) worked first try. The agent-friendly format (`text` on shapes, `startElementId`/`endElementId`, string ids) is pleasant, and custom ids made every later edit by name trivial.
3. **`apply` with create/update/delete in one payload** meant most fix rounds took one call.
4. **Screenshots are fast and faithful.** The PNG matched what the browser shows, including the sketchy font. That's how I found every visual defect.
5. **Arrow labels are just `"text"` on the arrow** and render centred with a background knockout. That's readable, though label collision is your problem (see §4).

## 4. Perception

- **Could I see what I drew?** Yes, via `screenshot` → Read the PNG. It was the only reliable signal. All defects were found by eye on the full-canvas PNG:
  - First draw: labels "5 match" and "9 charge" rendered on top of each other at the X where the arrows crossed; Trip→Postgres ran through the Pricing box and overlapped arrow 4; Payment→Stripe cut through Notification service; 7 GEO query and two async arrows crossed the core zone diagonally; APNs→Driver cut through the "External" label.
  - After re-layout: the elbowed a9 and s-pg had disappeared; the s-pg polyline struck through the "Data" zone label; I'd created a duplicate `e-pay-k2` exactly on top of `e-pay-k`, which was invisible in the PNG and only showed up in `query`.
  - After edit (a): labels "4 quote" and "6 nearby" stacked on the same pixel.
  - After edit (b): s-pg drawn through the middle of the Postgres ellipse.
- **`describe`** gives ids, types, top-left positions and sizes, but **no arrow endpoints/bindings and no arrow bounding size**. The skill doc says it lists "connections"; it doesn't. It can't tell you "arrow X crosses box Y" or "label A overlaps label B". It also reports arrow positions stale (the create-time origin).
- **`query`** dumps full JSON with pretty-printed point arrays (every `[0,0]` takes 4 lines), with no field projection. 19 arrows came to about 500 lines.
- **Views I wanted:**
  - A **lint/overlap report**: arrow–shape intersections, arrow–arrow crossings, label–label bbox overlaps, text overflow. Every defect I found was computable from geometry.
  - A **region crop** (`screenshot --bbox` or `--around <id> --pad 80`) so I didn't have to eyeball a 1800 px image for a 10 px collision.
  - A **numbered/id overlay** on the screenshot, to map what I see to ids without guessing.
  - **Diff** between two states ("what moved/changed since snapshot X"), which would have caught the silently dropped arrows immediately.

## 5. Action surface

- **Too low-level:** absolute coordinates for everything; no relative placement (`below: pricing, gap: 40`), no translate-by-delta, no "grow container to fit children". Zones aren't containers: growing the Core zone meant hand-moving everything under it.
- **Missing:** an obstacle-avoiding router for bound arrows (or at least respecting supplied waypoints); arrow label offset/position; a batch `move --ids … --by dx,dy`; a dry-run/validate mode that would have flagged the elbowed arrows before they were lost.
- **Confusing:**
  - `elbowed: true` is accepted and echoed back, then silently dropped.
  - `points` are ignored on create when bound, but honoured on update.
  - Partial `update` of `points` moves the origin.
  - `apply` responses echo stale geometry.
  - `apply` with only updates returns `"elements": []`, so no confirmation of the new geometry.
- **Token cost:**
  - The initial `add` payload was about 7 KB of JSON (49 elements). The response echoed every element back pretty-printed, about 20 KB: roughly 3× the input for no value. I needed the ids and maybe the routed arrow endpoints, nothing else.
  - `query --type arrow` came to about 12 KB.
  - A `--quiet` / `--fields id,x,y` option would cut output tokens by an order of magnitude.

## 6. Iteration: the two follow-up edits

- **(a) Move Pricing next to Matching, keeping arrows attached.** The move itself was trivial and the arrows stayed attached (one `apply`, 2 updates). The hard part was finding a slot "next to Matching": there wasn't one, so I swapped with Location. That created a new crossing (4 quote × 6 nearby, labels stacked), which I only caught by screenshot. It took one more `update` to move Location. Total: 3 calls, about 1 min. The tool gave no help deciding where "next to" is or noticing that my move broke something.
- **(b) Add a Surge service between Pricing and Kafka.** Moderately painful. Adding the box and its 2 arrows was easy, but making room took 16 absolute-coordinate updates (zone resize, Data zone + stores + legend shifted down). That then broke the s-pg polyline (origin re-anchored into Postgres) and left a crossing with 7 GEO query. Total: 4 calls, about 2 min, 1 regression introduced and fixed, 1 crossing left.
- **What a pair-diagramming loop needs that this lacks:**
  - Semantic edits ("insert node between A and B", "make room below X", "move X next to Y") with auto-reflow.
  - Automatic post-edit linting ("your change introduced 1 new crossing and a label collision").
  - Change diffs a human can review.
  - Stable, respected arrow routes.
  - A way to see and address what the human has selected in the browser.

## 7. Top 5 changes I'd make

1. **Never lose elements silently.** If the frontend rejects an element (the elbowed arrows), the CLI should report the failure, or at least have `apply` verify persistence and warn. Also return post-sync geometry instead of stale create-time geometry.
2. **Geometry lint command** (`lint` / `describe --issues`) listing arrow–box intersections, arrow crossings, label overlaps and text overflow, each with ids. That turns perception from eyeballing PNGs into a checklist.
3. **Real bound-arrow routing:** respect supplied waypoints on create, support `elbowed` with obstacle-avoiding routing, and preserve the route (not the origin) when an endpoint moves.
4. **Relative layout operations:** `move --ids … --by dx,dy`, `place X --right-of Y --gap 60`, `insert-between A B`, and containers (zones) that auto-grow to fit children and move with them.
5. **Compact output mode:** `--quiet` / `--fields` for `add`/`apply`/`query`, compact point arrays, and `describe` that includes arrow endpoints/bindings, plus `screenshot --around <id>` for region crops with an optional id overlay.
