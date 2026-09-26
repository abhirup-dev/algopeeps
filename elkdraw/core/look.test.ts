import { expect, test } from "bun:test";
import {
  clampScale,
  look,
  MAX_HEIGHT,
  MAX_WIDTH,
  pad,
  targetBox,
} from "./look.ts";

const boxes = {
  a: { x: 0, y: 0, width: 40, height: 20 },
  b: { x: 100, y: 50, width: 30, height: 30 },
};

test("targetBox unions one box as itself", () => {
  expect(targetBox(boxes, ["a"])).toEqual(boxes.a);
});

test("targetBox unions two boxes", () => {
  expect(targetBox(boxes, ["a", "b"])).toEqual({
    x: 0,
    y: 0,
    width: 130,
    height: 80,
  });
});

test("targetBox throws on an unmeasured id", () => {
  expect(() => targetBox(boxes, ["missing"])).toThrow();
});

test("targetBox throws on no ids", () => {
  expect(() => targetBox(boxes, [])).toThrow();
});

test("pad grows every side by r", () => {
  expect(pad({ x: 10, y: 10, width: 40, height: 20 }, 150)).toEqual({
    x: -140,
    y: -140,
    width: 340,
    height: 320,
  });
});

test("pad by 0 is a no-op", () => {
  const box = { x: 10, y: 10, width: 40, height: 20 };
  expect(pad(box, 0)).toBe(box);
});

test("clampScale is 1 when the box already fits", () => {
  expect(clampScale({ x: 0, y: 0, width: 100, height: 100 })).toBe(1);
});

test("clampScale shrinks a box wider than the cap", () => {
  const box = { x: 0, y: 0, width: 1024, height: 100 };
  const scale = clampScale(box);
  expect(Math.round(box.width * scale)).toBeLessThanOrEqual(MAX_WIDTH);
  expect(scale).toBeLessThan(1);
});

test("clampScale shrinks a box taller than the cap", () => {
  const box = { x: 0, y: 0, width: 100, height: 768 };
  const scale = clampScale(box);
  expect(Math.round(box.height * scale)).toBeLessThanOrEqual(MAX_HEIGHT);
});

test("clampScale honours maxPx on both sides", () => {
  const box = { x: 0, y: 0, width: 200, height: 200 };
  const scale = clampScale(box, 64);
  expect(Math.round(box.width * scale)).toBeLessThanOrEqual(64);
  expect(Math.round(box.height * scale)).toBeLessThanOrEqual(64);
});

test("clampScale never rounds a side over its cap, many sizes", () => {
  for (let w = 1; w <= 2000; w += 37) {
    const scale = clampScale({ x: 0, y: 0, width: w, height: 1 });
    expect(Math.round(w * scale)).toBeLessThanOrEqual(MAX_WIDTH);
  }
});

test("look pads, clamps and marks a lint hit's ids: the acceptance shape", () => {
  const hitBoxes = {
    a9: { x: 400, y: 200, width: 20, height: 300 },
    surge: { x: 380, y: 480, width: 120, height: 60 },
  };
  const result = look(hitBoxes, ["a9", "surge"], { r: 150, marks: true });
  expect(result.bbox).toEqual({ x: 230, y: 50, width: 420, height: 640 });
  const w = Math.round(result.bbox.width * result.scale);
  const h = Math.round(result.bbox.height * result.scale);
  expect(w).toBeLessThanOrEqual(MAX_WIDTH);
  expect(h).toBeLessThanOrEqual(MAX_HEIGHT);
  expect(Object.keys(result.marks).sort()).toEqual(["a9", "surge"]);
  // The a9 mark sits inside the crop's own pixel rectangle.
  const mark = result.marks["a9"];
  expect(mark).toBeDefined();
  if (mark) {
    expect(mark.x).toBeGreaterThanOrEqual(0);
    expect(mark.x).toBeLessThanOrEqual(w);
    expect(mark.y).toBeGreaterThanOrEqual(0);
    expect(mark.y).toBeLessThanOrEqual(h);
  }
});

test("look without marks returns an empty marks map", () => {
  const result = look(boxes, ["a"], { r: 10 });
  expect(result.marks).toEqual({});
});
