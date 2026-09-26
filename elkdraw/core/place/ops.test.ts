import { describe, expect, test } from "bun:test";
import type { SkeletonElement } from "../skeleton/schema.ts";
import { place } from "./ops.ts";

const box = (id: string, width: number, height: number): SkeletonElement => ({
  type: "rectangle",
  id,
  x: 0,
  y: 0,
  width,
  height,
});

const pos = (els: readonly SkeletonElement[], id: string) => {
  const el = els.find((e) => e.id === id);
  if (!el) throw new Error(id);
  return { x: el.x ?? 0, y: el.y ?? 0 };
};

describe("place", () => {
  test("row: left to right, vertical centres aligned", () => {
    const els = place(
      [box("a", 100, 40), box("b", 60, 80)],
      [{ op: "row", ids: ["a", "b"], at: [100, 200], gap: 20 }],
      [],
    );
    expect(pos(els, "a")).toEqual({ x: 100, y: 220 }); // centreY 240, height 40
    expect(pos(els, "b")).toEqual({ x: 220, y: 200 }); // 100+100+20, centreY 240, height 80
  });

  test("column: top to bottom, horizontal centres aligned", () => {
    const els = place(
      [box("a", 100, 40), box("b", 60, 40)],
      [{ op: "column", ids: ["a", "b"], at: [0, 0], gap: 10 }],
      [],
    );
    expect(pos(els, "a")).toEqual({ x: 0, y: 0 });
    expect(pos(els, "b")).toEqual({ x: 20, y: 50 }); // centreX 50, width 60 -> x=20
  });

  test("grid: row-major with [x,y] gap", () => {
    const els = place(
      [box("a", 40, 40), box("b", 40, 40), box("c", 40, 40)],
      [
        {
          op: "grid",
          ids: ["a", "b", "c"],
          cols: 2,
          at: [0, 0],
          gap: [10, 20],
        },
      ],
      [],
    );
    expect(pos(els, "a")).toEqual({ x: 0, y: 0 });
    expect(pos(els, "b")).toEqual({ x: 50, y: 0 });
    expect(pos(els, "c")).toEqual({ x: 0, y: 60 });
  });

  test("rightOf / below chain off an already-placed id", () => {
    const els = place(
      [box("a", 100, 40), box("b", 50, 20), box("c", 50, 20)],
      [
        { op: "row", ids: ["a"], at: [0, 0], gap: 0 },
        { op: "rightOf", id: "b", of: "a", gap: 30 },
        { op: "below", id: "c", of: "a", gap: 10 },
      ],
      [],
    );
    expect(pos(els, "b")).toEqual({ x: 130, y: 10 }); // a: x0 w100 h40, centre y20, b h20 -> y10
    expect(pos(els, "c")).toEqual({ x: 25, y: 50 }); // a centre x50, c w50 -> x25; below a: y0+40+10
  });
});
