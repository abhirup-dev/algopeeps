# Dogfood: draw one hard diagram with an existing Excalidraw MCP, then report honestly

You are a test user of an Excalidraw agent tool. The point is **feedback on the tool**, not a pretty picture. Do not edit any code or files in this repo except your report. Do not commit.

## The diagram (same for every tester)

"Request a ride" architecture for a ride-hailing backend. At least 25 elements:

- Three zones drawn as labelled containers (frames or big rectangles): **Edge**, **Core services**, **Data**.
- Edge: Rider app, Driver app, API gateway, Auth service.
- Core: Matching service, Location service, Trip service, Pricing service, Payment service, Notification service.
- Data: Postgres (trips), Redis geo-index (driver locations), Kafka event bus, Analytics warehouse; use a different shape for stores (ellipse or cylinder-ish) than for services.
- External: Stripe, APNs/FCM, outside the zones.
- Labelled arrows for the request-a-ride flow, numbered 1–9 in order (rider → gateway → auth → trip → pricing → matching → location/redis → driver notification → payment on completion), plus unnumbered async arrows into Kafka and from Kafka to analytics.
- A legend box (colours: sync call, async event, store) and a title.
- Nothing overlapping, arrows bound to shapes (they move with the boxes), text readable.

## Procedure

1. Draw it in as few or as many calls as you like. Keep a running log of every tool call: tool, rough payload size, what you expected, what happened.
2. Check your own work with whatever perception the tool offers (describe, screenshot, export). Find at least three defects and fix them.
3. Then do two edits a human collaborator would ask for: (a) "move Pricing next to Matching and keep the arrows attached", (b) "add a Surge service between Pricing and Kafka". Note how hard each was.

## Report

Write `canvas/docs/dogfood-<tool>.md` (tool name given in your prompt), sections:

1. Outcome: final element count, number of tool calls, time, a screenshot path if you could get one, did it meet every requirement above (checklist).
2. **Hardest parts**, ranked, each with the concrete moment it hurt (the call, the error, the wrong output).
3. **What was genuinely good**, ranked, same concreteness.
4. Perception: could you actually see what you drew? How did you find the defects? What view would you have wanted (region crop around an element, spatial query, numbered overlay, diff)?
5. Action surface: which tools/params were too low-level, too verbose, missing, or confusing. Token cost of payloads.
6. Iteration: how painful were the two follow-up edits? What would a "pair diagramming" loop with a human need that this tool lacks?
7. Top 5 changes you would make to the tool, most valuable first.

Be blunt. When done, send a one-line summary with the report path.
