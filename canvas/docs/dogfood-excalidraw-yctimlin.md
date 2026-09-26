# Dogfood: yctimlin/mcp_excalidraw (via excalidraw-skill CLI)

Tool: `mcp-excalidraw-server` (npx), driven through the CLI (`npx -y mcp-excalidraw-server <cmd>`), following `~/.claude/skills/excalidraw-skill/SKILL.md`. Canvas server on `127.0.0.1:3010` (the package honours `PORT` / `EXPRESS_SERVER_URL`; `status` confirmed `:3010`, the other `:3000` server was never touched). Browser tab: ego-browser task space 1 → `http://127.0.0.1:3010`.

## 1. Outcome

| Metric | Value |
|---|---|
| Final element count | 50 server-side elements (16+1 shapes, 5 ellipses, 20 arrows, 8 free text; arrow/shape labels are embedded, not separate) |
| Canvas CLI calls | ~40 total; 17 did real work (1 `add`, 9 `apply`, 8 `screenshot`, 1 `describe`, snapshots); the rest were `get`/`status`/`export` checks |
| Wall time | ~6 min of tool time (331 s from first `status` to final export, plus one re-route pass) |
| Screenshot | `/tmp/xd_final.png` (final); history `/tmp/xd_v1.png` … `/tmp/xd_v8.png`, `/tmp/xd_bindtest.png`; scene export `/tmp/xd_final.excalidraw` (`/tmp` is wiped on reboot) |

Requirement checklist:

- [x] ≥ 25 elements (50)
- [x] Three labelled zones (Edge / Core services / Data): dashed rectangles with free-standing text labels
- [x] Edge: Rider app, Driver app, API gateway, Auth service
- [x] Core: Matching, Location, Trip, Pricing, Payment, Notification (+ Surge after edit b)
- [x] Data: Postgres, Redis geo-index, Kafka, Analytics, drawn as ellipses (services are rectangles)
- [x] External Stripe, APNs/FCM outside the zones
- [x] Numbered arrows 1–9 in flow order (1 rider→gateway, 2 gateway→auth, 3 auth→trip, 4 trip→pricing, 5 pricing→matching, 6 matching→location, 7 location→redis, 8 matching→notification, 9 trip→payment), plus unnumbered notification→APNs→driver, payment→Stripe, trip→Postgres
- [x] Async dashed purple arrows into Kafka (trip, payment, surge) and Kafka→Analytics
- [x] Legend (sync / async / store) and title
- [x] Arrows bound to shapes: verified by moving Trip, Pricing, and Payment; every endpoint followed
- [~] Nothing overlapping: no shape overlaps and no label collisions, but some arrows still cross (Payment→Stripe crosses arrow 7 and Payment→Kafka; Trip→Kafka crosses arrow 9; arrow 9 grazes Surge's top-right corner)
- [x] Text readable

## 2. Hardest parts (ranked)

1. **Hand-routed arrows don't survive anything.** I fixed three defects by giving bound arrows explicit `points` (a8 arced, a9 curved, s-stripe elbowed under Location). Then:
   - `apply {"update":[{"id":"payment","set":{"x":700,"y":540}}]}` collapsed **both** a9 and s-stripe back to 2-point straight lines. `get a9` showed `points:[[0,0],[424.6,123.3]]`, and s-stripe went straight through Location again (`/tmp/xd_bindtest.png`).
   - `snapshot restore final` (saved *before* that move) put positions back but also flattened a8, a9, and s-stripe. All three fixed defects came back (`"restored":50`, no warning). I had to re-send the routing patch.
   So "arrows move with the boxes" is true only for straight arrows. Any routing work is lost on the next move, and snapshots don't protect it.
2. **Silent no-ops.** `apply` returned `success` with `updated: N` for changes that did nothing:
   - `{"id":"a1","set":{"fontSize":16}}` on arrows: labels unchanged.
   - `{"id":"a8","set":{"label":{"text":"8 notify","fontSize":14}}}`: unchanged.
   - `{"id":"s-stripe","set":{"elbowed":true}}`: still a straight line through Location. `elbowed` doesn't auto-route around obstacles; it only shapes the points you give it.
   I only found these by screenshotting. No error, no warning.
3. **Custom points are raw coordinates with no snapping.** My first curved a9 (`x:236,y:424`, end at +404) started inside Trip and stopped ~40 px short of Payment (`/tmp/xd_v7.png`). A binding exists (`end:{id:"payment"}`), but the server doesn't clip or snap custom points to the shape edge, so I had to compute edge coordinates by hand.
4. **Layout planning is entirely on the agent.** The first `add` put a5 (pricing→matching) straight through Trip, with the "4 quote" and "5 match" labels printed on top of Trip. Arrows 6 and 9 crossed and their labels merged into garbage ("θ ㎝arge", `/tmp/xd_v1.png`). Nothing warns about arrow-through-shape or label collisions. Fixing it meant moving nodes, which is exactly what (1) punishes.
5. **Label placement is not controllable.** Arrow labels always sit at the midpoint (or the middle vertex). The only way to move "9 charge" off the Pricing→Surge arrow was to invent a waypoint, which then broke on the next move (see 1).

## 3. What was genuinely good (ranked)

1. **One-shot creation works.** A 6.3 KB JSON array (47 elements, custom ids, `text` on shapes, `startElementId`/`endElementId` on arrows) rendered correctly in one `add` call, in 2 s. Custom ids made every later edit trivial.
2. **Straight bound arrows follow moves.** Edit (a) was one 2-field patch (`pricing.x=380`, `trip.x=80`). All six arrows touching Trip/Pricing re-routed to the right edges (`/tmp/xd_v5.png`). No arrow re-creation needed.
3. **`apply` multi-op patch.** Create + update in one call, fast (~1 s), readable JSON. Edit (b) (Surge + 2 arrows) was a single `apply` with 3 creates.
4. **Screenshot is honest and cheap.** `screenshot --out` gives a PNG of what the browser renders (~1–6 s). Every defect I found came from it.
5. **Port handling is clean.** `PORT`/`EXPRESS_SERVER_URL` are respected, `status` prints the URL and `browserClients`, so it was easy to prove I wasn't touching `:3000`.

## 4. Perception

- **Could I see what I drew?** Yes, but only through full-canvas PNGs (8 screenshots, ~1470×900 each). That's my only reliable perception channel.
- **`describe`** (3.6 KB) lists ids, types, positions, sizes, labels. It does **not** list arrow endpoints or connections, despite the skill saying it does, and it has no end coordinates. It can't show overlaps, crossings, or label collisions. It reported every defect-bearing arrow as normal.
- **`get <id>`** was the only way to learn what an arrow really was (e.g. that the waypoints had been discarded). That's a per-element poll.
- **How I found defects:** by eye from the screenshot, then reasoning backwards to ids and coordinates.
- **What I'd want:**
  - A `lint`/`check` command: shape overlaps, arrow-through-shape, label-on-shape, label-label collisions, arrows not reaching their bound shape. Each with element ids.
  - `screenshot --around <id> [--pad N]` region crop, so small defects are visible without the whole canvas.
  - A numbered-overlay screenshot (id tags drawn on elements) to map pixels to ids.
  - `describe` with arrow `from → to`, rendered endpoints, and label boxes.
  - A diff after `apply`: "moved a9 route: 3 pts → 2 pts". That would have caught the silent flattening immediately.

## 5. Action surface

- **Too low-level:** arrow routing. You hand-author relative `points` in canvas coordinates, with no obstacle avoidance and no edge snapping. `elbowed:true` does no routing by itself.
- **Missing:**
  - Arrow label font size and position (`labelPosition: 0..1`, offsets).
  - A "route around obstacles" option.
  - Relative placement: "place X right of Y with gap 40", "insert between A and B".
  - Obstacle-aware auto-layout for an existing scene.
- **Confusing:**
  - `apply` reports `updated` for fields it drops (fontSize, label.fontSize).
  - The patch accepts but ignores arbitrary keys.
  - `snapshot restore` isn't a faithful restore of arrow geometry.
- **Verbose / token cost:**
  - Creation payload is reasonable: 6.3 KB ≈ 1.8k tokens for 47 elements.
  - The `add` response echoes every element back: 18.7 KB ≈ 5k tokens, 3× the input, all noise. I redirected it to a file.
  - `apply` responses are nicely terse.
  - `describe` ≈ 1k tokens.
  - Screenshots are the real cost (an image per check).
- **Friction outside the tool:** the skill examples assume `:3000`, and screenshots need a live browser tab (exit 4 otherwise). Fine once known, but an agent needs a browser before it can see anything.

## 6. Iteration: the two follow-up edits

- **(a) Move Pricing next to Matching, keep arrows attached:** easy. There was no free slot, so I swapped Trip into Pricing's old spot. That was one `apply` with two x-changes, all arrows stayed bound, and it also fixed the a5-through-Trip defect. About 1 minute.
- **(b) Add Surge between Pricing and Kafka:** creating it was easy (one `apply`, 3 elements). But the new Pricing→Surge arrow cut through the "9 charge" label. Fixing that took 2 more patches plus 2 screenshots (hand-computed waypoints, first attempt off by 40 px). That fix was then wiped by the move/restore test and had to be re-applied. Moderate pain, all of it in routing.
- **What pair diagramming with a human needs that this lacks:**
  - Routing that persists and re-solves itself when endpoints move.
  - A change feed of *human* edits (what did they just move?), not just full-scene state.
  - Region/element-scoped perception, to answer "does the thing I just touched look right?" cheaply.
  - Semantic edits ("insert between", "align row", "make room") so the agent doesn't have to renegotiate coordinates on every request.
  - Loud errors for unsupported fields, so the agent doesn't tell the human something changed when it didn't.

## 7. Top 5 changes, most valuable first

1. **Durable, obstacle-aware arrow routing.** Keep user/agent waypoints when endpoints move (translate or re-solve them), make `elbowed` actually route around shapes, snap custom points to bound shape edges, and make `snapshot restore` byte-faithful for arrows.
2. **A `check`/`lint` command returning geometric defects with ids:** overlaps, arrow-through-shape, label collisions, dangling endpoints. This would have found all six defects I found by eye, at a fraction of the screenshot cost.
3. **Strict patches:** reject or warn on unknown or unsupported fields, and return a per-element diff of what actually changed (including "route flattened").
4. **Richer, cheaper perception:**
   - `describe` with arrow connections, endpoints, and label boxes.
   - `screenshot --around <ids>` crops.
   - An id-overlay render mode.
5. **Arrow label control and a leaner `add` response.** Add `labelFontSize` and `labelPosition` for arrows, and make `add` return `{count, ids}` instead of echoing the whole scene (saves ~5k tokens per big batch).
