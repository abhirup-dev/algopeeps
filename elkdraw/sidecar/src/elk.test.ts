// Probe B1 (canvas/docs/diagram-layout-families.md): under Bun, elk.bundled.js
// throws; elk-api.js plus a real Web Worker on elk-worker.min.js works.
import { expect, test } from "bun:test";
import ELK from "elkjs/lib/elk-api.js";

test("elkjs lays out a 3-node graph under Bun via a Web Worker", async () => {
  const elk = new ELK({
    workerUrl: Bun.resolveSync("elkjs/lib/elk-worker.min.js", import.meta.dir),
  });
  try {
    const out = await elk.layout({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: ["a", "b", "c"].map((id) => ({ id, width: 40, height: 20 })),
      edges: [
        { id: "ab", sources: ["a"], targets: ["b"] },
        { id: "bc", sources: ["b"], targets: ["c"] },
      ],
    });
    const nodes = out.children ?? [];
    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    const xs = nodes.map((n) => n.x ?? Number.NaN);
    for (const n of nodes) expect(n.y).toBeNumber();
    // layered runs left to right: a, b, c on distinct increasing x
    expect(xs.every(Number.isFinite)).toBe(true);
    expect(new Set(xs).size).toBe(3);
    expect(xs).toEqual(xs.toSorted((p, q) => p - q));
  } finally {
    elk.terminateWorker();
  }
});
