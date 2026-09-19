import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generate,
  type AssetKind,
  type AssetParams,
} from "../src/assets/index.js";
import { bboxOfAll } from "../src/geometry.js";
import type { Element } from "../src/types.js";

const CASES: Array<[AssetKind, Omit<AssetParams, "x" | "y">]> = [
  [
    "array",
    {
      name: "nums",
      values: [3, 1, 4],
      showIndex: true,
      pointers: [{ label: "i", index: 1 }],
    },
  ],
  ["linked_list", { name: "l", values: ["a", "b", "c"], doubly: true }],
  ["binary_tree", { name: "t", values: [1, 2, 3, 4, 5, 6, 7] }],
  [
    "stack_frames",
    {
      name: "cs",
      frames: [{ fn: "main" }, { fn: "f", args: [1, 2], locals: ["x"] }],
    },
  ],
  [
    "state_table",
    {
      name: "st",
      columns: ["i", "sum"],
      rows: [
        ["0", "0"],
        ["1", "1"],
      ],
    },
  ],
  ["hash_map", { name: "m", entries: [{ key: "a", value: 1 }], buckets: 4 }],
];

for (const [kind, params] of CASES) {
  await test(`asset ${kind}: count, group, bbox, no NaN`, () => {
    const { elements, groupId } = generate(kind, { ...params, x: 100, y: 200 });
    assert.ok(elements.length > 0);
    for (const el of elements) {
      assert.ok((el.groupIds ?? []).includes(groupId), `${el.id} not in group`);
      assert.deepEqual(el.customData?.asset, { kind, name: params.name });
      for (const key of ["x", "y", "width", "height"] as const) {
        if (el[key] !== undefined)
          assert.ok(Number.isFinite(el[key]), `${el.id}.${key} not finite`);
      }
    }
    const box = bboxOfAll(elements as Element[]);
    assert.equal(box.x, 100, "bbox does not start at x");
    assert.equal(box.y, 200, "bbox does not start at y");
  });
}

await test("asset stamps agent ownership by default; human stays unowned", () => {
  const agent = generate("array", { name: "a", values: [1], x: 0, y: 0 });
  const el = agent.elements[0]!;
  assert.equal(el.customData?.owner, "agent");
  assert.equal(el.strokeColor, "#9c36b5");
  assert.notEqual(el.locked, true, "v1.2: agent elements are not locked");

  const human = generate("array", {
    name: "a",
    values: [1],
    x: 0,
    y: 0,
    owner: "human",
  });
  const hel = human.elements[0]!;
  assert.equal(hel.customData?.owner, undefined);
  assert.equal(hel.locked, undefined);
  assert.deepEqual(hel.customData?.asset, { kind: "array", name: "a" });
});

await test("asset validates params with one-line errors", () => {
  assert.throws(
    () => generate("array", { name: "a", x: 0, y: 0 } as AssetParams),
    /values/,
  );
  assert.throws(
    () => generate("array", { name: "", values: [1], x: 0, y: 0 }),
    /name/,
  );
  assert.throws(
    () =>
      generate("array", {
        name: "a",
        values: [1],
        x: 0,
        y: 0,
        pointers: [{ label: "p", index: 9 }],
      }),
    /pointers/,
  );
  assert.throws(
    () =>
      generate("state_table", {
        name: "s",
        columns: ["a"],
        rows: [["1", "2"]],
        x: 0,
        y: 0,
      }),
    /row/,
  );
  assert.throws(
    () => generate("nope", { name: "a", x: 0, y: 0 }),
    /unknown asset kind/,
  );
});
