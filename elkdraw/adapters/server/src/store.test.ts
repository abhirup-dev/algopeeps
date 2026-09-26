import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExcalidrawScene, readScene } from "@elkdraw/backend-excalidraw";
import type { Element } from "@elkdraw/core";
import { diff, feed } from "@elkdraw/core/engine";
import { Store } from "./store.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "elkdraw-store-"));
  dirs.push(dir);
  return dir;
}

const rect = (id: string, version = 1): Element => ({
  id,
  type: "rectangle",
  version,
});

test("sceneAt replays to any rev, across keyframes, without touching the head", () => {
  const store = new Store(tempDir(), 2);
  store.apply("agent", [rect("a")], []); // 1
  store.apply("agent", [rect("b")], []); // 2, keyframe
  store.apply("human", [rect("a", 2)], ["b"]); // 3
  store.apply("human", [rect("c")], []); // 4, keyframe
  store.apply("agent", [], ["a"]); // 5
  expect(store.sceneAt(0)).toEqual([]);
  expect(store.sceneAt(1)).toEqual([rect("a")]);
  expect(store.sceneAt(2)).toEqual([rect("a"), rect("b")]);
  expect(store.sceneAt(3)).toEqual([rect("a", 2)]);
  expect(store.sceneAt(4)).toEqual([rect("a", 2), rect("c")]);
  expect(store.sceneAt(5)).toEqual([rect("c")]);
  expect(store.scene()).toEqual([rect("c")]);
  expect(() => store.sceneAt(6)).toThrow(RangeError);
  expect(store.log(3).map((e) => [e.rev, e.author])).toEqual([
    [4, "human"],
    [5, "agent"],
  ]);
});

// Dogfood round 2 (canvas/docs/dogfood-synthesis.md): the "human" moved Kafka,
// deleted an arrow and added a note, as three REST deltas on the yct scene.
test("round 2 collaboration reads as three change lines", async () => {
  const file = Bun.file(
    join(
      import.meta.dir,
      "../../../test/fixtures/dogfood/yct/scene.excalidraw",
    ),
  );
  // Stored fixture, trusted: readScene validates its own output.
  const yct = ((await file.json()) as { elements: Element[] }).elements;
  const byId = new Map(yct.map((el) => [el.id, el]));
  const get = (id: string): Element => {
    const el = byId.get(id);
    if (!el) throw new Error(`no ${id} in yct`);
    return el;
  };
  const shift = (id: string, dx: number): Element => {
    const el = get(id);
    return { ...el, x: Number(el["x"]) + dx, version: el.version + 1 };
  };
  // Move one end of a two-point arrow by dx: the end bound to Kafka.
  const drag = (id: string, end: "start" | "end", dx: number): Element => {
    const el = get(id);
    const [p, q] = el["points"] as [[number, number], [number, number]];
    return end === "end"
      ? { ...el, points: [p, [q[0] + dx, q[1]]], version: el.version + 1 }
      : { ...shift(id, dx), points: [p, [q[0] - dx, q[1]]] };
  };

  const store = new Store(tempDir());
  store.apply("agent", yct, []);
  const start = store.rev;
  // Kafka +120 px; its label and bound arrows follow (Excalidraw rewrites them).
  store.apply(
    "human",
    [
      shift("kafka", 120),
      shift("kafka-label", 120),
      drag("e-trip", "end", 120),
      drag("e-surge", "end", 120),
      drag("e-an", "start", 120),
    ],
    [],
  );
  store.apply("human", [], ["e-pay"]);
  store.apply(
    "human",
    [
      {
        ...get("legend-t"),
        id: "note",
        text: "why is Redis here?",
        originalText: "why is Redis here?",
        y: 712,
      },
    ],
    [],
  );

  const sceneAt = (rev: number) =>
    // Wire elements are Excalidraw elements; the store keeps them opaque.
    readScene({ elements: store.sceneAt(rev) } as unknown as ExcalidrawScene);
  const lines = await feed(start, store.log(start), sceneAt);
  expect(lines.map(({ time: _, ...line }) => line)).toEqual([
    { author: "human", op: "added", ids: ["note"] },
    { author: "human", op: "removed", ids: ["e-pay"] },
    {
      author: "human",
      op: "moved",
      ids: ["kafka"],
      detail: { dx: 120, dy: 0 },
    },
  ]);

  const d = diff(await sceneAt(start), await sceneAt(store.rev));
  expect(d.changes).toHaveLength(3);
  // Kafka lands on Redis, e-trip now crosses Surge, the note sits on the
  // legend title; deleting e-pay fixed its crossing with s-stripe.
  expect(d.delta).toBe(
    "+1 arrow-through-node, +2 label-on-label, +2 label-on-node, +1 node-overlap, -1 crossing",
  );
});
