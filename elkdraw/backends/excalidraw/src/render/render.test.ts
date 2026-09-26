import { expect, test } from "bun:test";
import { MAX_HEIGHT, MAX_WIDTH, pad, targetBox } from "@elkdraw/core/engine";
import type { Box } from "@elkdraw/core";
import { render, type RenderDeps } from "./render.ts";
import type { ExcalidrawScene } from "../read/read.ts";

// Real elements carry many more fields; render only needs id/type/version to
// satisfy the wire shape, so a minimal stand-in element covers the rest.
type FakeElement = ExcalidrawScene["elements"][number];
const a9El = { id: "a9", type: "line", version: 1 } as unknown as FakeElement;
const surgeEl = {
  id: "surge",
  type: "rectangle",
  version: 1,
} as unknown as FakeElement;
const scene: ExcalidrawScene = { elements: [a9El, surgeEl] };

const boxes: Record<string, Box> = {
  a9: { x: 400, y: 200, width: 20, height: 300 },
  surge: { x: 380, y: 480, width: 120, height: 60 },
};

function fakeDeps(measured: Record<string, Box>): RenderDeps & {
  snapCalls: { bbox: Box; scale: number }[];
} {
  const snapCalls: { bbox: Box; scale: number }[] = [];
  return {
    snapCalls,
    measure: () => Promise.resolve(measured),
    snap: (bbox, scale) => {
      snapCalls.push({ bbox, scale });
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    },
  };
}

test("render(ids) returns the tight union box, scene coordinates", async () => {
  const deps = fakeDeps(boxes);
  const result = await render(deps, scene, ["a9", "surge"]);
  expect(result.boxes).toEqual(boxes);
  expect(deps.snapCalls).toEqual([
    { bbox: targetBox(boxes, ["a9", "surge"]), scale: 1 },
  ]);
});

test("render(ids) clamps scale when the union exceeds the pixel caps", async () => {
  const big: Record<string, Box> = {
    a9: { x: 0, y: 0, width: 2000, height: 2000 },
  };
  const deps = fakeDeps(big);
  await render(deps, scene, ["a9"]);
  const call = deps.snapCalls[0];
  expect(call).toBeDefined();
  if (call) {
    expect(call.scale).toBeLessThan(1);
    expect(Math.round(call.bbox.width * call.scale)).toBeLessThanOrEqual(
      MAX_WIDTH,
    );
    expect(Math.round(call.bbox.height * call.scale)).toBeLessThanOrEqual(
      MAX_HEIGHT,
    );
  }
});

test("render(Box) crops exactly that box and returns no ids", async () => {
  const deps = fakeDeps(boxes);
  const target = pad(targetBox(boxes, ["a9", "surge"]), 150);
  const result = await render(deps, scene, target);
  expect(result.boxes).toEqual({});
  expect(deps.snapCalls[0]?.bbox).toEqual(target);
});

test("render(ids) throws on an id the sidecar never measured", async () => {
  const deps = fakeDeps({ a9: { x: 400, y: 200, width: 20, height: 300 } });
  let threw = false;
  try {
    await render(deps, scene, ["a9", "surge"]);
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);
});
