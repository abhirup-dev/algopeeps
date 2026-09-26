// Headless Chromium on the built app. Run with
// `bun run --cwd elkdraw/sidecar test:e2e` (builds the app first).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type Box, Element, type SkeletonElement } from "@elkdraw/core";
import { z } from "zod";

const BoxShape = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
import { Sidecar } from "./index.ts";

const FIXTURES = join(
  import.meta.dir,
  "..",
  "..",
  "test",
  "fixtures",
  "dogfood",
);
const sidecar = new Sidecar();

beforeAll(async () => {
  await sidecar.start();
  await sidecar.start(); // idempotent: same browser
}, 60_000);

afterAll(async () => {
  await sidecar.close();
});

async function fixture(name: string): Promise<Element[]> {
  const file: unknown = await Bun.file(
    join(FIXTURES, name, "scene.excalidraw"),
  ).json();
  return z.object({ elements: z.array(Element) }).parse(file).elements;
}

/** Ground truth from the live editor canvas, not the sidecar's export path:
 * the scene `measure` loaded, every other element at opacity 0, zoom 2 on a
 * transparent background; the element's ink bbox read from on-screen pixels
 * near its measured box (devicePixelRatio 1: 1 px = half a scene unit). */
async function screenshotBoxes(
  near: Record<string, Box>,
): Promise<Record<string, Box>> {
  const page = await sidecar.page();
  await page.setViewportSize({ width: 3400, height: 2000 });
  await page.waitForFunction(
    () =>
      (document.querySelector<HTMLCanvasElement>(
        "canvas.excalidraw__canvas.static",
      )?.width ?? 0) >= 3400,
  );
  const raw: unknown = await page.evaluate(async (near) => {
    interface El {
      id: string;
      opacity: number;
    }
    const { api } = (
      window as unknown as {
        elkdraw: {
          api: {
            updateScene(scene: unknown): void;
            getSceneElements(): readonly El[];
          };
        };
      }
    ).elkdraw;
    const frame = () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = document.querySelector<HTMLCanvasElement>(
      "canvas.excalidraw__canvas.static",
    );
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) throw new Error("no static canvas");
    const Z = 2;
    const M = 60; // scene units of margin around the measured box
    const all = api.getSceneElements();
    const out: Record<string, Box> = {};
    try {
      for (const el of all) {
        const at = near[el.id];
        if (!at) continue;
        const [ox, oy] = [Math.floor(at.x) - M, Math.floor(at.y) - M];
        api.updateScene({
          elements: all.map((e) => (e.id === el.id ? e : { ...e, opacity: 0 })),
          appState: {
            viewBackgroundColor: "transparent",
            zoom: { value: Z },
            scrollX: -ox,
            scrollY: -oy,
          },
        });
        await frame();
        const width = Math.ceil((at.width + 2 * M) * Z);
        const height = Math.ceil((at.height + 2 * M) * Z);
        const { data } = ctx.getImageData(0, 0, width, height);
        let [x0, y0, x1, y1] = [width, height, -1, -1];
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            if ((data[(y * width + x) * 4 + 3] ?? 0) >= 32) {
              x0 = Math.min(x0, x);
              x1 = Math.max(x1, x);
              y0 = Math.min(y0, y);
              y1 = y;
            }
        if (x1 < 0) continue;
        out[el.id] = {
          x: ox + x0 / Z,
          y: oy + y0 / Z,
          width: (x1 + 1 - x0) / Z,
          height: (y1 + 1 - y0) / Z,
        };
      }
    } finally {
      api.updateScene({ elements: all });
    }
    return out;
  }, near);
  return z.record(z.string(), BoxShape).parse(raw);
}

/** Largest edge distance between two boxes. */
function edgeError(a: Box, b: Box): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.x + a.width - (b.x + b.width)),
    Math.abs(a.y + a.height - (b.y + b.height)),
  );
}

// Arrows get 2 px: the editor draws a linear element into a cached canvas
// before masking under its label; export draws it directly, and curved or
// masked tails land up to 1.5 px apart (yct a8). Everything else: 1 px.
const SLACK: Record<string, number> = { arrow: 2 };

describe.each(["yct", "batch"])("fixture %s", (name) => {
  test("measure is within 1 px of a screenshot per element (arrows 2 px)", async () => {
    const elements = await fixture(name);
    const boxes = await sidecar.measure(elements);
    const live = elements.filter((el) => !el["isDeleted"]);
    expect(Object.keys(boxes).toSorted()).toEqual(
      live.map((el) => el.id).toSorted(),
    );
    const truth = await screenshotBoxes(boxes);
    expect(live.map((el) => el.id).filter((id) => !truth[id])).toEqual([]);
    const off = live
      .map((el) => {
        const [t, m] = [truth[el.id], boxes[el.id]];
        const error = t && m ? edgeError(t, m) : Infinity;
        return { id: el.id, error, slack: SLACK[el.type] ?? 1 };
      })
      .filter((e) => e.error > e.slack);
    expect(off).toEqual([]);
  }, 60_000);
});

test("measure returns rendered boxes, not stored ones", async () => {
  const elements = await fixture("yct");
  const boxes = await sidecar.measure(elements);
  const title = elements.find((el) => el.id === "title");
  const stored = z.object({ x: z.number(), width: z.number() }).parse(title);
  const drawn = boxes["title"];
  if (!drawn) throw new Error("no title box");
  // Stored 622 wide, textAlign center. Excalidraw re-sizes it to the glyphs
  // and keeps x: it draws at the left edge, not centred (dogfood defect).
  expect(drawn.width).toBeLessThan(stored.width - 40);
  expect(Math.abs(drawn.x - stored.x)).toBeLessThan(4);
});

test('"12" in a 44 px circle draws on two lines', async () => {
  const base = { version: 1, angle: 0, strokeColor: "#1e1e1e", seed: 1 };
  const boxes = await sidecar.measure([
    {
      ...base,
      id: "c",
      type: "ellipse",
      x: 0,
      y: 0,
      width: 44,
      height: 44,
      boundElements: [{ id: "t", type: "text" }],
    },
    {
      ...base,
      id: "t",
      type: "text",
      x: 10,
      y: 10,
      width: 24,
      height: 25,
      text: "12",
      originalText: "12",
      fontSize: 20,
      fontFamily: 5,
      containerId: "c",
      textAlign: "center",
      verticalAlign: "middle",
    },
  ]);
  // Stored: one 25 px line. Drawn: "1" over "2", taller than the stored box.
  expect(boxes["t"]?.height).toBeGreaterThan(30);
});

/** Decodes PNGs in the page; per PNG: size, non-white RGB channels, and how
 * many RGBA bytes differ from the first PNG shifted by `at` device px. */
async function inspect(
  pngs: Uint8Array[],
  at = { x: 0, y: 0 },
): Promise<{ width: number; height: number; ink: number; diff: number }[]> {
  const page = await sidecar.page();
  const raw: unknown = await page.evaluate(
    async ({ b64s, at }) => {
      const decode = async (b64: string) => {
        const res = await fetch(`data:image/png;base64,${b64}`);
        const bmp = await createImageBitmap(await res.blob());
        const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d");
        if (!ctx) throw new Error("no 2d");
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height);
      };
      const imgs = await Promise.all(b64s.map(decode));
      const [first] = imgs;
      if (!first) return [];
      return imgs.map(({ width, height, data }) => {
        let ink = 0;
        let diff = 0;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            for (let c = 0; c < 4; c++) {
              const v = data[(y * width + x) * 4 + c] ?? 0;
              if (c < 3 && v !== 255) ink++;
              const w =
                first.data[((y + at.y) * first.width + x + at.x) * 4 + c];
              if (v !== w) diff++;
            }
        return { width, height, ink, diff };
      });
    },
    { b64s: pngs.map((p) => Buffer.from(p).toString("base64")), at },
  );
  return z
    .array(
      z.object({
        width: z.number(),
        height: z.number(),
        ink: z.number(),
        diff: z.number(),
      }),
    )
    .parse(raw);
}

describe("snap", () => {
  beforeAll(async () => {
    await sidecar.measure(await fixture("yct"));
  });

  test("snap of a bbox equals its crop of a larger snap", async () => {
    const scale = 2;
    const big = { x: 0, y: 0, width: 1200, height: 900 };
    const sub = { x: 600, y: 350, width: 300, height: 200 };
    const [, part] = await inspect(
      [await sidecar.snap(big, scale), await sidecar.snap(sub, scale)],
      { x: (sub.x - big.x) * scale, y: (sub.y - big.y) * scale },
    );
    expect(part?.width).toBe(sub.width * scale);
    expect(part?.height).toBe(sub.height * scale);
    expect(part?.ink).toBeGreaterThan(1000); // not blank
    expect(part?.diff).toBe(0);
  }, 30_000);

  test("ids draws only those elements and their bound text", async () => {
    const titleArea = { x: 0, y: 0, width: 700, height: 60 };
    const redisArea = { x: 920, y: 750, width: 200, height: 90 };
    const [all, noTitle, redis] = await inspect([
      await sidecar.snap(titleArea, 1),
      await sidecar.snap(titleArea, 1, ["redis"]),
      await sidecar.snap(redisArea, 1, ["redis"]),
    ]);
    expect(all?.ink).toBeGreaterThan(0);
    expect(noTitle?.ink).toBe(0);
    expect(redis?.ink).toBeGreaterThan(0);
  }, 30_000);
});

test("measureText: wraps, and a cache hit skips the browser", async () => {
  const own = new Sidecar();
  await own.start();
  const one = { text: "Redis geo-index", fontFamily: "Virgil", fontSize: 16 };
  const narrow = { ...one, wrapWidth: 60 };
  let sizes;
  try {
    sizes = await own.measureText([one, narrow, one]);
  } finally {
    await own.close();
  }
  const [line, wrapped, again] = sizes;
  if (!line || !wrapped) throw new Error("no sizes");
  expect(line.height).toBe(20); // 16 px * lineHeight 1.25, one line
  expect(wrapped.height).toBeGreaterThanOrEqual(2 * line.height);
  expect(wrapped.width).toBeLessThanOrEqual(60);
  expect(again).toEqual(line);
  // Browser closed: cached requests still answer, a new one cannot.
  expect(await own.measureText([narrow, one])).toEqual([wrapped, line]);
  const miss: unknown = await own
    .measureText([{ ...one, fontSize: 17 }])
    .catch((e: unknown) => e);
  expect(String(miss)).toContain("start()");
}, 60_000);

test("convert: a frame's children already on the canvas keep their id and version", async () => {
  // Regression: convertToExcalidrawElements only resolves ids within its own
  // batch, so a frame naming a pre-existing (not created this call) child
  // used to throw "Element with <id> wasn't mapped correctly".
  const existing: Element = {
    id: "existing-rect",
    type: "rectangle",
    version: 5,
    versionNonce: 111,
    x: 100,
    y: 100,
    width: 50,
    height: 50,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    isDeleted: false,
  };
  const skeletons: SkeletonElement[] = [
    {
      type: "frame",
      id: "frame-1",
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      children: ["existing-rect"],
    },
  ];
  const out = await sidecar.convert(skeletons, [existing]);
  const frame = out.find((e) => e.id === "frame-1");
  const rect = out.find((e) => e.id === "existing-rect");
  expect(frame).toBeDefined();
  expect(rect?.version).toBe(5);
  expect(rect?.["versionNonce"]).toBe(111);
  expect(rect?.["frameId"]).toBe(frame?.id);
});

test("bad input is rejected before the page", async () => {
  const error: unknown = await sidecar
    .snap({ x: 0, y: 0, width: -1, height: 1 })
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(z.ZodError);
});
