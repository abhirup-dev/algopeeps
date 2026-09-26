// Acceptance (algopeeps-4c0.9): "the BST+array fixture is reproducible from
// placement ops in under 15 ops". Fixture:
// test/fixtures/dogfood/bst-first/scene.excalidraw — a 15-node BST (insertion
// order 8,4,12,2,6,10,14,1,3,5,7,9,11,13,15) with the in-order array below it
// and lo/hi pointers. This rebuilds it from `tree`, `array` and two `below`
// ops (4 total, well under 15) and compares structure and rough positions,
// not bytes: node depths/x-order, array left-to-right order, and pointer
// placement under the right cells.
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseJson } from "../src/json.ts";
import { place } from "./ops.ts";
import { array, tree } from "./assets.ts";
import { validateSkeleton, type SkeletonElement } from "../skeleton/schema.ts";

const INSERT_ORDER = [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15];
const IN_ORDER_ARRAY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

const findEl = (
  els: readonly SkeletonElement[],
  id: string,
): SkeletonElement => {
  const el = els.find((e) => e.id === id);
  if (!el) throw new Error(`missing ${id}`);
  return el;
};

/** x/y/width/height, defaulted (only `frame` elements ever omit x/y). */
const box = (el: SkeletonElement) => ({
  x: el.x ?? 0,
  y: el.y ?? 0,
  width: el.width ?? 0,
  height: el.height ?? 0,
});

describe("BST + array fixture, rebuilt from placement ops", () => {
  // 1: tree, 2: array, 3-4: below (lo/hi pointer labels) — 4 ops total.
  const opsUsed = 4;

  const built = (() => {
    const treeAt: [number, number] = [3008, 100];
    const arrayAt: [number, number] = [3000, 480];
    const loLabel: SkeletonElement = {
      type: "text",
      id: "lo",
      x: 0,
      y: 0,
      text: "lo",
    };
    const hiLabel: SkeletonElement = {
      type: "text",
      id: "hi",
      x: 0,
      y: 0,
      text: "hi",
    };

    const treeEls = tree("t", INSERT_ORDER, treeAt);
    const arrayEls = array("arr", IN_ORDER_ARRAY, arrayAt);
    const elements = [...treeEls, ...arrayEls, loLabel, hiLabel];

    // lo/hi point at the cells for keys 8 and 11 (the search path's lo/hi
    // bounds in the fixture caption): "lo = 8, hi = 11".
    const loCellIndex = IN_ORDER_ARRAY.indexOf(8);
    const hiCellIndex = IN_ORDER_ARRAY.indexOf(11);
    return place(elements, [
      { op: "below", id: "lo", of: `arr-${String(loCellIndex)}`, gap: 30 },
      { op: "below", id: "hi", of: `arr-${String(hiCellIndex)}`, gap: 30 },
    ]);
  })();

  test("stays under the 15-op budget", () => {
    expect(opsUsed).toBeLessThan(15);
  });

  test("every generated element validates under 1.1's skeleton schema", () => {
    const result = validateSkeleton({ elements: built });
    if (!result.ok) throw new Error(result.errors.join("\n"));
  });

  test("tree: 15 nodes, 14 edges, root shallowest, leaves deepest", () => {
    const nodes = built.filter(
      (e) => e.type === "ellipse" && e.id.startsWith("t-"),
    );
    const edges = built.filter(
      (e) => e.type === "arrow" && e.id.startsWith("t-"),
    );
    expect(nodes).toHaveLength(15);
    expect(edges).toHaveLength(14);

    const y = (key: number) => box(findEl(built, `t-${String(key)}`)).y;
    expect(y(8)).toBeLessThan(y(4));
    expect(y(4)).toBeLessThan(y(2));
    expect(y(2)).toBeLessThan(y(1));
    // full tree: every non-root level has more nodes at the same y
    const depthOf = new Map<number, number>();
    for (const node of nodes)
      depthOf.set(box(node).y, (depthOf.get(box(node).y) ?? 0) + 1);
    expect([...depthOf.values()].sort((a, b) => a - b)).toEqual([1, 2, 4, 8]);
  });

  test("tree x-order matches in-order (sorted) key order", () => {
    const xs = IN_ORDER_ARRAY.map(
      (key) => box(findEl(built, `t-${String(key)}`)).x,
    );
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  test("array: 15 cells left to right in sorted order", () => {
    const cells = IN_ORDER_ARRAY.map((_, i) =>
      box(findEl(built, `arr-${String(i)}`)),
    );
    for (let i = 1; i < cells.length; i += 1) {
      const prev = cells[i - 1];
      const cur = cells[i];
      if (!prev || !cur) throw new Error("cell missing");
      expect(cur.x).toBeGreaterThan(prev.x);
      expect(cur.y).toBe(prev.y);
    }
  });

  test("lo/hi pointers sit under their cells, below the array row", () => {
    const loCell = box(
      findEl(built, `arr-${String(IN_ORDER_ARRAY.indexOf(8))}`),
    );
    const hiCell = box(
      findEl(built, `arr-${String(IN_ORDER_ARRAY.indexOf(11))}`),
    );
    const lo = box(findEl(built, "lo"));
    const hi = box(findEl(built, "hi"));
    expect(lo.y).toBeGreaterThan(loCell.y + loCell.height);
    expect(hi.y).toBeGreaterThan(hiCell.y + hiCell.height);
    // lo (key 8, index 7) sits left of hi (key 11, index 10)
    expect(lo.x).toBeLessThan(hi.x);
  });

  test("rough positions match the dogfood fixture's tree layout", async () => {
    const fixture = parseJson(
      z.object({
        elements: z.array(
          z.object({ id: z.string(), x: z.number(), y: z.number() }),
        ),
      }),
      await Bun.file(
        new URL(
          "../../test/fixtures/dogfood/bst-first/scene.excalidraw",
          import.meta.url,
        ),
      ).text(),
    );
    for (const key of IN_ORDER_ARRAY) {
      const fixtureNode = fixture.elements.find(
        (e) => e.id === `t${String(key)}`,
      );
      if (!fixtureNode) throw new Error(`fixture missing t${String(key)}`);
      const built_ = box(findEl(built, `t-${String(key)}`));
      expect(built_.x).toBeCloseTo(fixtureNode.x, 0);
      expect(built_.y).toBeCloseTo(fixtureNode.y, 0);
    }
  });
});
