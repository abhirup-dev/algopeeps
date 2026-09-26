import { describe, expect, test } from "bun:test";
import { validateSkeleton } from "../skeleton/schema.ts";
import { array, hashMap, linkedList, stack, table, tree } from "./assets.ts";

const ok = (elements: unknown): void => {
  const result = validateSkeleton({ elements });
  if (!result.ok) throw new Error(result.errors.join("\n"));
};

describe("asset generators validate under 1.1's skeleton schema", () => {
  test("array", () => {
    const els = array("arr", [1, 3, 5], [0, 0]);
    ok(els);
    expect(els.map((e) => e.id)).toEqual([
      "arr-0",
      "arr-0-idx",
      "arr-1",
      "arr-1-idx",
      "arr-2",
      "arr-2-idx",
    ]);
  });

  test("linkedList", () => {
    const els = linkedList("ll", ["a", "b", "c"], [0, 0]);
    ok(els);
    expect(els.map((e) => e.id)).toEqual([
      "ll-0",
      "ll-1",
      "ll-0-1",
      "ll-2",
      "ll-1-2",
    ]);
  });

  test("tree", () => {
    const els = tree("t", [8, 4, 12, 2, 6], [0, 0]);
    ok(els);
    expect(els.some((e) => e.id === "t-8")).toBe(true);
    expect(els.some((e) => e.id === "t-8-4")).toBe(true);
  });

  test("stack", () => {
    const els = stack("s", ["main", "f(3)", "f(2)"], [0, 0]);
    ok(els);
    expect(els.map((e) => e.id)).toEqual(["s-0", "s-1", "s-2"]);
    // top last: highest index has the smallest y (drawn highest on screen)
    const y = (id: string): number => {
      const el = els.find((e) => e.id === id);
      if (!el) throw new Error(id);
      return el.y ?? 0;
    };
    expect(y("s-2")).toBeLessThan(y("s-1"));
    expect(y("s-1")).toBeLessThan(y("s-0"));
  });

  test("table", () => {
    const els = table(
      "tb",
      [
        ["a", "b"],
        ["1", "2"],
      ],
      [0, 0],
    );
    ok(els);
    expect(els.map((e) => e.id)).toEqual([
      "tb-r0c0",
      "tb-r0c1",
      "tb-r1c0",
      "tb-r1c1",
    ]);
  });

  test("hashMap", () => {
    const els = hashMap(
      "h",
      4,
      [
        ["k", "v"],
        ["foo", "bar"],
      ],
      [0, 0],
    );
    ok(els);
    expect(els.map((e) => e.id)).toEqual([
      "h-0",
      "h-1",
      "h-2",
      "h-3",
      "h-k",
      "h-foo",
    ]);
  });
});
