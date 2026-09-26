// Headless Chromium on the built app and a real dogfood scene. Run with
// `bun run --cwd elkdraw/backends/excalidraw test:e2e` (builds the app first).
// Acceptance (bead 1.7): a crop around one lint hit's ids at r=150 is <= 512
// x384 px, and the ids' boxes come back in scene coordinates.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Sidecar } from "@elkdraw/sidecar";
import { Element } from "@elkdraw/core";
import {
  look,
  MAX_HEIGHT,
  MAX_WIDTH,
  pad,
  targetBox,
} from "@elkdraw/core/engine";
import { render } from "./render.ts";
import type { ExcalidrawScene } from "../read/read.ts";

const FIXTURE = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "test",
  "fixtures",
  "dogfood",
  "yct",
);

const sidecar = new Sidecar();

beforeAll(async () => {
  await sidecar.start();
}, 60_000);

afterAll(async () => {
  await sidecar.close();
});

/** PNG IHDR: width is bytes 16-19, height 20-23, both big-endian u32
 * (https://www.w3.org/TR/png/#11IHDR). Avoids a PNG-decoding dependency. */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("backend-excalidraw render", () => {
  test("crop around a lint hit's ids at r=150 is <= 512x384, boxes in scene coords", async () => {
    // This package does not declare zod (read.ts's own convention), so only
    // the elements array is validated (via core's own `Element` schema,
    // already a ZodType); the wrapper's shape is trusted.
    const file = (await Bun.file(join(FIXTURE, "scene.excalidraw")).json()) as {
      elements: unknown;
    };
    const elements = Element.array().parse(file.elements);
    // Unchecked cast, same pattern as `app/src/excalidraw.ts` `toScene`:
    // the protocol only checks id/type/version; the rest passes through.
    const scene: ExcalidrawScene = {
      elements: elements as unknown as ExcalidrawScene["elements"],
    };

    // yct-13 (defects.json), not fixed in the final scene: arrow a9 grazes
    // Surge's corner (arrow-through-node). No lint engine yet (task 1.5),
    // so the hit's ids are the fixture's ground truth, not a live lint hit.
    const ids = ["a9", "surge"];

    const tight = await render(sidecar, scene, ids);
    expect(Object.keys(tight.boxes).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const box = tight.boxes[id];
      expect(box).toBeDefined();
      if (box) expect(box.width > 0 || box.height > 0).toBe(true);
    }

    const crop = look(tight.boxes, ids, { r: 150 });
    const result = await render(sidecar, scene, crop.bbox);
    const { width, height } = pngSize(result.png);
    expect(width).toBeLessThanOrEqual(MAX_WIDTH);
    expect(height).toBeLessThanOrEqual(MAX_HEIGHT);

    // The pure half agrees with what render actually produced.
    const expectedBbox = pad(targetBox(tight.boxes, ids), 150);
    expect(crop.bbox).toEqual(expectedBbox);
  }, 30_000);
});
