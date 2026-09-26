// End to end with the real sidecar (needs app/dist; `bun run test:e2e`):
// draft -> apply -> lint -> look -> fix over REST and MCP, never reading
// elements back.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import type { LintHit } from "@elkdraw/core";
import { ApplyReply, parseJson } from "@elkdraw/core";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { defs } from "@elkdraw/mcp";
import { z } from "zod";
import { startServer } from "./index.ts";

const dir = mkdtempSync(join(tmpdir(), "elkdraw-tools-e2e-"));
const server = startServer({
  port: 0,
  session: "e2e",
  open: false,
  appDir: resolve(import.meta.dir, "../../../app/dist"),
  dataDir: dir,
});
const client = new Client({ name: "e2e", version: "0.0.0" });
afterAll(async () => {
  await client.close();
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

async function rest<T extends z.ZodType>(tool: string, input: unknown, out: T) {
  const res = await fetch(`${server.url}/api/tools/${tool}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${tool}: ${String(res.status)} ${text}`);
  return parseJson(out, text);
}

const errors = (hits: readonly LintHit[]) =>
  hits.filter((h) => h.severity === "error" && !h.suppressed);

// The draft: "svc" is drawn on top of "lb" (node-overlap); the arrow to db
// comes in a second batch, binding to boxes already on the canvas.
const lb = {
  id: "lb",
  type: "rectangle",
  x: 100,
  y: 50,
  width: 180,
  height: 60,
  label: { text: "Load Balancer" },
};
const svc = {
  id: "svc",
  type: "rectangle",
  x: 150,
  y: 80,
  width: 160,
  height: 60,
  label: { text: "Web Server" },
};
const db = {
  id: "db",
  type: "ellipse",
  x: 0,
  y: 0,
  width: 200,
  height: 70,
  label: { text: "PostgreSQL" },
};
const lbDb = {
  id: "lb-db",
  type: "arrow",
  x: 0,
  y: 0,
  start: { id: "lb" },
  end: { id: "db" },
};
const draft = {
  elements: [lb, svc, db],
  place: [{ op: "below", id: "db", of: "lb", gap: 140 }],
};

test("draft -> apply -> lint -> look -> fix", async () => {
  // Draft over MCP.
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)),
  );
  const first = await client.callTool({ name: "apply", arguments: draft });
  expect(first.isError).toBeFalsy();
  const reply = ApplyReply.parse(first.structuredContent);
  expect(reply.created).toEqual(["lb", "svc", "db"]);
  expect(reply.measured).toBe(true);
  const bad = errors(reply.lints);
  const overlap = bad.find((h) => h.code === "node-overlap");
  expect(overlap?.ids).toEqual(["lb", "svc"]);

  // Arrow in its own batch, bound to boxes outside it.
  const arrow = ApplyReply.parse(
    await rest("apply", { elements: [lbDb] }, z.unknown()),
  );
  expect(arrow.created).toEqual(["lb-db"]);
  expect(errors(arrow.lints).map((h) => h.code)).not.toContain(
    "dangling-endpoint",
  );

  // lint on demand agrees with the reply.
  const lint = await rest("lint", {}, defs.lint.output);
  expect(errors(lint.hits).map((h) => h.code)).toContain("node-overlap");

  // look at the hit ids: a small crop plus rendered boxes.
  const out = join(dir, "look.png");
  const look = await rest(
    "look",
    { target: overlap?.ids.join(",") ?? "lb", r: 150, out },
    defs.look.output,
  );
  expect(look.path).toBe(out);
  const png = new Uint8Array(await Bun.file(out).arrayBuffer());
  const view = new DataView(png.buffer);
  expect(view.getUint32(16)).toBeLessThanOrEqual(512);
  expect(view.getUint32(20)).toBeLessThanOrEqual(384);
  expect(Object.keys(look.boxes)).toEqual(overlap?.ids ?? []);

  // Fix: move svc clear of lb; re-send the whole file with the arrow.
  const file = {
    elements: [lb, svc, db, lbDb],
    place: [...draft.place, { op: "rightOf", id: "svc", of: "lb", gap: 80 }],
  };
  const fixed = ApplyReply.parse(
    (await client.callTool({ name: "apply", arguments: file }))
      .structuredContent,
  );
  expect(errors(fixed.lints)).toEqual([]);

  // Re-sending the whole file unchanged is a no-op through the real converter.
  const again = await rest("apply", file, ApplyReply);
  expect(again).toMatchObject({
    rev: fixed.rev,
    created: [],
    updated: 0,
    kept: 4,
  });

  const d = await rest("diff", {}, defs.diff.output);
  expect(d.lints.fixed.map((h) => h.code)).toContain("node-overlap");
  expect(d.delta).toContain("-1 node-overlap");

  // screenshot: the whole canvas, real PNG, capped by maxPx (IHDR width/height,
  // big-endian at bytes 16 and 20 -- the fake renderer's 4-byte PNG can't
  // check this, only the real sidecar can.
  const shotOut = join(dir, "screenshot.png");
  const shot = await rest(
    "screenshot",
    { out: shotOut, maxPx: 300 },
    defs.screenshot.output,
  );
  expect(shot.path).toBe(shotOut);
  const shotPng = new Uint8Array(await Bun.file(shotOut).arrayBuffer());
  const shotView = new DataView(shotPng.buffer);
  const ihdrWidth = shotView.getUint32(16);
  const ihdrHeight = shotView.getUint32(20);
  expect(ihdrWidth).toBe(shot.width);
  expect(ihdrHeight).toBe(shot.height);
  expect(ihdrWidth).toBeLessThanOrEqual(300);
  expect(ihdrHeight).toBeLessThanOrEqual(300);
}, 30_000);

/** The PNG spec's per-scanline unfilter predictors (§9): `a` is the pixel to
 * the left, `b` above, `c` above-left, all already unfiltered. Filter 0 (or
 * anything else the format doesn't define) predicts 0, i.e. passes the byte
 * through unchanged. */
function predictor(filter: number, a: number, b: number, c: number): number {
  switch (filter) {
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return Math.floor((a + b) / 2);
    case 4: {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    default:
      return 0;
  }
}

/** Decodes an 8-bit RGBA, non-interlaced PNG (what the sidecar's
 * `canvas.toDataURL` always emits) into raw pixel bytes. Avoids a
 * PNG-decoding dependency: chunk walk + `node:zlib` inflate + the PNG
 * spec's per-scanline unfilter (§9, four predictors: sub, up, average,
 * paeth). Only IDAT and IHDR are read; other chunks are skipped. */
function decodePng(png: Uint8Array): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = png[24];
  const colorType = png[25];
  if (bitDepth !== 8 || colorType !== 6)
    throw new Error(
      `decodePng: only 8-bit RGBA is handled (got bitDepth=${String(bitDepth)} colorType=${String(colorType)})`,
    );
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const len = view.getUint32(offset);
    const type = String.fromCharCode(...png.slice(offset + 4, offset + 8));
    if (type === "IDAT")
      idat.push(Buffer.from(png.slice(offset + 8, offset + 8 + len)));
    offset += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const data = new Uint8Array(width * height * bpp);
  let prevRow = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const rowStart = y * (stride + 1) + 1;
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const filtered = raw[rowStart + x] ?? 0;
      const a = x >= bpp ? (row[x - bpp] ?? 0) : 0;
      const b = prevRow[x] ?? 0;
      const c = x >= bpp ? (prevRow[x - bpp] ?? 0) : 0;
      const pred = predictor(filter, a, b, c);
      row[x] = (filtered + pred) & 0xff;
    }
    data.set(row, y * stride);
    prevRow = row;
  }
  return { width, height, data };
}

/** A row's pixels are all background (`snap`'s white fill) if the PNG has
 * no ink there. */
function rowIsBlank(decoded: ReturnType<typeof decodePng>, y: number): boolean {
  const start = y * decoded.width * 4;
  for (let x = 0; x < decoded.width; x++) {
    const i = start + x * 4;
    if (
      decoded.data[i] !== 255 ||
      decoded.data[i + 1] !== 255 ||
      decoded.data[i + 2] !== 255
    )
      return false;
  }
  return true;
}

// 1.18: the whole-canvas screenshot cropped the scene's bottom. The eval's
// ride-hailing final scene (`eval/phase-1/phase-1.md`) reproduces it: the
// "legend-zone" rectangle is the scene's bottommost element, and its rough,
// hand-drawn bottom edge overshoots its stored geometric box by a few units
// -- exactly the ink `screenshotTool`'s corner markers (`tools.ts`,
// `corners`) now carry the sidecar's own render bounds out to, so the
// `snap` after them has nothing left to clip.
test("screenshot does not crop the ride-hailing scene's bottom edge", async () => {
  const rideHailing: unknown = await Bun.file(
    join(import.meta.dir, "screenshot-ride-hailing.fixture.json"),
  ).json();
  const applied = ApplyReply.parse(
    await rest("apply", rideHailing, z.unknown()),
  );
  expect(applied.created.length).toBeGreaterThan(40);

  const out = join(dir, "ride-hailing-screenshot.png");
  const shot = await rest(
    "screenshot",
    { out, maxPx: 2400 },
    defs.screenshot.output,
  );
  const png = new Uint8Array(await Bun.file(out).arrayBuffer());
  const decoded = decodePng(png);
  expect(decoded.width).toBe(shot.width);
  expect(decoded.height).toBe(shot.height);

  // A cropped bottom means the last rows of the image are blank even though
  // the scene has ink there (the legend's rough bottom edge). Scan up from
  // the last row for the first row with ink, and require it be within a
  // couple of rows of the image's edge -- rounding slack, not a crop.
  let lastInkRow = -1;
  for (let y = decoded.height - 1; y >= 0; y--) {
    if (!rowIsBlank(decoded, y)) {
      lastInkRow = y;
      break;
    }
  }
  expect(lastInkRow).toBeGreaterThanOrEqual(decoded.height - 3);
}, 30_000);
