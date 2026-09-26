// Headless Chromium on the built app. Run with
// `bun run --cwd elkdraw/sidecar test:e2e` (builds the app first).
import { afterAll, beforeAll, expect, test } from "bun:test";
import { z } from "zod";
import { Sidecar } from "./index.ts";

const WARM_MS = 2000;
const sidecar = new Sidecar();

beforeAll(async () => {
  await sidecar.start();
  await sidecar.start(); // idempotent: same browser
}, 60_000);

afterAll(async () => {
  await sidecar.close();
});

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const value = await fn();
  return [value, performance.now() - t];
}

test("measure returns a stub box per element, warm", async () => {
  const els = [
    { id: "a", type: "rectangle" },
    { id: "b", type: "text", text: "hi" },
  ];
  const [boxes, ms] = await timed(() => sidecar.measure(els));
  expect(boxes).toEqual({
    a: { x: 0, y: 0, width: 100, height: 40 },
    b: { x: 0, y: 0, width: 100, height: 40 },
  });
  expect(ms).toBeLessThan(WARM_MS);
});

test("snap returns a PNG, warm", async () => {
  const [png, ms] = await timed(() =>
    sidecar.snap({ x: 0, y: 0, width: 200, height: 100 }, 2),
  );
  expect([...png.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  expect(ms).toBeLessThan(WARM_MS);
});

test("bad input is rejected before the page", async () => {
  const error: unknown = await sidecar
    .snap({ x: 0, y: 0, width: -1, height: 1 })
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(z.ZodError);
});
