# Two candidate SDK sketches (paper only, nothing implemented)

Both compile to plain Excalidraw elements via `convertToExcalidrawElements`; meaning is kept in
`customData`. Layout: ELK per zone unless a node is pinned. Lint runs on the rendered scene.
Escape hatch in both: raw Excalidraw elements, and anything a human draws natively, is kept
and linted but never regenerated.

## Sketch A: TypeScript builder

```ts
import { diagram, component } from "@canvas/sdk";

const svcCache = component("svc-cache", (c, p: { svc: string; cache: string; tone: Tone }) => {
  const s = c.node("svc", p.svc, { role: "service", tone: p.tone });
  const k = c.store("cache", p.cache, { tone: p.tone });
  c.edge(s, k, { label: "read-through" });
  return { port: s };                      // what the outside may connect to
});

export default diagram("ride", { theme: "system-design", direction: "right" }, (d) => {
  const edge = d.zone("Edge");
  const rider = edge.node("rider", "Rider app", { role: "client" });
  const gw = edge.node("gateway", "API gateway");
  const trip = d.zone("Core services").use(svcCache, "trip", { svc: "Trip", cache: "trip-cache", tone: "blue" });
  d.edge(rider, gw, { label: "1 request" });
  d.edge(gw, trip.port, { label: "3 create trip" });
  d.edge(trip.port, d.ref("kafka"), { kind: "async", allow: ["crosses-edge"] }); // lint suppression with intent
  d.pin(gw, { rightOf: rider, gap: 80 });  // human-style nudge that survives re-layout
  d.raw([{ type: "freedraw", /* native Excalidraw */ }]);                          // escape hatch
});
```
Checks: `tsc` (unknown node, wrong param type, missing port = compile error), then
`cv render ride.ts --lint` → elements + lint report.

## Sketch B: JSON spec (for MCP / chat hosts)

```json
{
  "diagram": "ride", "theme": "system-design", "direction": "right",
  "components": {
    "svc-cache": {
      "params": { "svc": "string", "cache": "string", "tone": "tone" },
      "nodes": [ { "id": "svc", "label": "{svc}", "role": "service", "tone": "{tone}" },
                 { "id": "cache", "label": "{cache}", "role": "store", "tone": "{tone}" } ],
      "edges": [ { "from": "svc", "to": "cache", "label": "read-through" } ],
      "ports": [ "svc" ]
    }
  },
  "zones": [
    { "id": "edge", "label": "Edge", "nodes": [
      { "id": "rider", "label": "Rider app", "role": "client" },
      { "id": "gateway", "label": "API gateway", "pin": { "rightOf": "rider", "gap": 80 } } ] },
    { "id": "core", "label": "Core services", "use": [
      { "component": "svc-cache", "as": "trip", "with": { "svc": "Trip", "cache": "trip-cache", "tone": "blue" } } ] }
  ],
  "edges": [
    { "from": "rider", "to": "gateway", "label": "1 request" },
    { "from": "gateway", "to": "trip.svc", "label": "3 create trip" },
    { "from": "trip.svc", "to": "kafka", "kind": "async", "allow": ["crosses-edge"] }
  ],
  "raw": []
}
```
Checks: JSON Schema (path-precise errors, e.g. `edges[2].to: unknown node "kafka"`), then
`validate` / `render` / `lint` as separate MCP tools.

## Shared behaviour

- `apply` is an id-stable upsert: re-rendering a changed spec diffs against the canvas; human
  overrides on generated elements are kept and reported.
- Component change → every instance re-renders; `customData.{component, version, instance}`.
- Lint rules: arrow-through-node, label-on-node/label/border, node-overlap, dangling-endpoint,
  text-wrapped/overflow (measured in a render), outside-zone, crosses-edge (count, info).
