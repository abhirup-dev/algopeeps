// End-to-end: built bundle + a tiny Bun static server + headless Chromium,
// driving `window.elkdraw` directly (?headless=1). No sync client, no
// Sidecar wrapper (that package is owned elsewhere): the built app is enough
// to call `convert`. Run with `bun run --cwd elkdraw/app test:e2e` (builds
// first).
//
// p1.20 (algopeeps-4c0.23): a free text's requested box (`x`, `width`,
// `textAlign: "center"/"right"`) drifted -- convertToExcalidrawElements
// centres/right-aligns on the measured text's width, not the requested one,
// treating the skeleton's `x` as the anchor instead of the box's left edge.
// Also: an explicit frame `x`/`y` of 0 was folded into "not given" and the
// frame was refit to its children (1.17's "found, not fixed").
import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type Page, chromium } from "playwright";
import { parseJson, SkeletonInput, type SkeletonElement } from "@elkdraw/core";
import { z } from "zod";

const appDir = join(import.meta.dir, "..");
const dist = join(appDir, "dist");
const repoRoot = join(appDir, "..");
const shot = join(appDir, "test-results", "bst-r1-array-crop.png");

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: appDir,
    // bun test sets NODE_ENV=test, which would make Vite emit a dev React build.
    env: { ...process.env, NODE_ENV: "production" },
  });
  expect(build.exitCode).toBe(0);
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const { pathname } = new URL(req.url);
      const file = Bun.file(
        join(dist, pathname === "/" ? "index.html" : pathname),
      );
      return (await file.exists())
        ? new Response(file)
        : new Response("", { status: 404 });
    },
  });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`http://127.0.0.1:${String(server.port)}/?headless=1`);
  await page.waitForFunction(() => Boolean(window.elkdraw));
}, 60_000);

afterAll(async () => {
  await browser.close();
  await server.stop(true);
});

const TranscriptLine = z.looseObject({
  message: z
    .looseObject({
      // A user turn's content is a plain string; only assistant turns (tool
      // calls included) use the array-of-blocks shape.
      content: z
        .union([
          z.string(),
          z.array(
            z.looseObject({
              type: z.string(),
              name: z.string().exactOptional(),
              input: z.looseObject({}).exactOptional(),
            }),
          ),
        ])
        .exactOptional(),
    })
    .exactOptional(),
});

/** The bst eval's first `Write`: the initial scene it applied, before the
 * tester's relabel edits (bst-r1, defect p1bst-01). Read from the transcript
 * rather than duplicated by hand, so this stays byte-identical to what the
 * eval actually sent. */
function firstWriteSkeletons(): SkeletonElement[] {
  const path = join(repoRoot, "eval", "phase-1", "bst", "transcript.jsonl");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    const obj = parseJson(TranscriptLine, line);
    const content = obj.message?.content;
    if (!Array.isArray(content)) continue;
    const write = content.find(
      (c) => c.type === "tool_use" && c.name === "Write",
    );
    const writeContent = write?.input?.["content"];
    if (typeof writeContent === "string")
      return parseJson(SkeletonInput, writeContent).elements;
  }
  throw new Error("no Write tool call found in the bst transcript");
}

/** Requested box centre/right edge, given the real (measured) width. */
function wantX(s: SkeletonElement, measuredWidth: number): number {
  if (s.type !== "text" || s.width === undefined)
    throw new Error(`${s.id}: not a boxed text skeleton`);
  return s.textAlign === "right"
    ? s.x + s.width - measuredWidth
    : s.x + (s.width - measuredWidth) / 2;
}

test("bst-r1: centred array/pointer labels land in their requested box", async () => {
  const skeletons = firstWriteSkeletons();
  const byId = new Map(skeletons.map((s) => [s.id, s]));
  const targets = ["i0", "i7", "i14", "t-lo", "t-hi"];
  for (const id of targets) expect(byId.get(id)?.type).toBe("text");

  const out = await page.evaluate(
    (sk) => window.elkdraw?.convert(sk, []),
    skeletons,
  );
  expect(out).toBeDefined();
  const outById = new Map((out ?? []).map((e) => [e.id, e]));

  for (const id of targets) {
    const s = byId.get(id);
    const el = outById.get(id);
    if (s?.type !== "text" || typeof el?.["width"] !== "number") {
      throw new Error(`${id}: missing from skeleton or convert output`);
    }
    const width = el["width"];
    const centre = s.x + (s.width ?? 0) / 2;
    const gotCentre = Number(el["x"]) + width / 2;
    // Within 0.1 px of the requested box's centre (both are center-aligned).
    expect(gotCentre).toBeCloseTo(centre, 1);
    expect(Number(el["x"])).toBeCloseTo(wantX(s, width), 1);
  }

  // Crop for a by-eye compare against test/fixtures/eval-p1/bst-r1/look.png.
  const cellIds = skeletons
    .filter((s) => s.type === "text" && /^i\d+$/.test(s.id))
    .map((s) => s.id);
  const box = await page.evaluate(
    async ({ sk, ids }) => {
      const api = window.elkdraw;
      if (!api) throw new Error("no elkdraw");
      const converted = await api.convert(sk, []);
      const boxes = await api.measure(converted);
      const xs = ids.map((id) => boxes[id]?.x ?? 0);
      const ys = ids.map((id) => boxes[id]?.y ?? 0);
      const x2 = ids.map((id) => (boxes[id]?.x ?? 0) + (boxes[id]?.width ?? 0));
      const y2 = ids.map(
        (id) => (boxes[id]?.y ?? 0) + (boxes[id]?.height ?? 0),
      );
      return {
        x: Math.min(...xs) - 10,
        y: Math.min(...ys) - 10,
        width: Math.max(...x2) - Math.min(...xs) + 20,
        height: Math.max(...y2) - Math.min(...ys) + 20,
      };
    },
    { sk: skeletons, ids: cellIds },
  );
  const dataUrl = await page.evaluate(({ b }) => window.elkdraw?.snap(b, 3), {
    b: box,
  });
  if (dataUrl) {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    await Bun.write(shot, Buffer.from(base64, "base64"));
  }
});

test("frame given x:0/y:0 is not refit to its children", async () => {
  const skeletons: SkeletonElement[] = [
    { id: "n1", type: "rectangle", x: 20, y: 20, width: 40, height: 40 },
    { id: "n2", type: "rectangle", x: 80, y: 20, width: 40, height: 40 },
    { id: "f", type: "frame", x: 0, y: 0, children: ["n1", "n2"] },
  ];
  const out = await page.evaluate(
    (sk) => window.elkdraw?.convert(sk, []),
    skeletons,
  );
  const frame = (out ?? []).find((e) => e.id === "f");
  expect(frame?.["x"]).toBe(0);
  expect(frame?.["y"]).toBe(0);
});

test("right-aligned text lands with its right edge at the box's right edge", async () => {
  const skeletons: SkeletonElement[] = [
    {
      id: "r1",
      type: "text",
      x: 100,
      y: 200,
      width: 50,
      textAlign: "right",
      text: "hi",
      fontSize: 16,
    },
  ];
  const out = await page.evaluate(
    (sk) => window.elkdraw?.convert(sk, []),
    skeletons,
  );
  const el = (out ?? []).find((e) => e.id === "r1");
  if (!el || typeof el["width"] !== "number" || typeof el["x"] !== "number") {
    throw new Error("r1 missing from convert output");
  }
  expect(el["x"] + el["width"]).toBeCloseTo(150, 1);
});
