// One final scene through OUR pipeline, the same one test/parity/lint/lint.e2e.ts
// runs: sidecar measure -> readScene -> lint, then a sidecar snap of the whole
// scene. Takes an Excalidraw scene file ({elements: [...]}: a yctimlin
// `export` or an elkdraw `query`). Writes <out>/lint.json and <out>/sidecar.png.
//   bun elkdraw/eval/audit-p1/render.js <scene.json> <out-dir> [--paint] [--drop-index]
// --paint rewrites texts to what the yctimlin frontend paints (font-probe.png):
// bound labels Excalifont 20 as test/parity/lint/paint.ts does; free text in
// Virgil becomes Excalifont, other free text keeps its font and size.
import { writeFileSync, readFileSync } from "node:fs";
import { parseJson } from "@elkdraw/core";
import { lint } from "@elkdraw/core/engine";
import { readScene } from "@elkdraw/backend-excalidraw";
import { Sidecar } from "@elkdraw/sidecar";
import { z } from "zod";

const [file, out] = process.argv.slice(2);
if (file === undefined || out === undefined)
  throw new Error(
    "usage: render.js <scene.json> <out-dir> [--paint] [--drop-index]",
  );
const paint = process.argv.includes("--paint");
// yctimlin exports fractional indices like "a10", "a80" that Excalidraw's
// validator rejects ("invalid order key"); --drop-index keeps array order.
const dropIndex = process.argv.includes("--drop-index");
const Scene = z.looseObject({ elements: z.array(z.looseObject({})) });
const scene = parseJson(Scene, readFileSync(file, "utf8"));
const elements = scene.elements
  .filter((e) => e["isDeleted"] !== true)
  .map((e) => (dropIndex ? { ...e, index: null } : e))
  .map((e) => {
    if (!paint || e["type"] !== "text") return e;
    // font-probe.png: bound labels paint Excalifont 20 whatever the shape
    // asked for; free text keeps an explicit font, Virgil (1) paints Excalifont.
    if (e["containerId"]) return { ...e, fontFamily: 5, fontSize: 20 };
    return e["fontFamily"] === 1 ? { ...e, fontFamily: 5 } : e;
  });

const sidecar = new Sidecar();
try {
  await sidecar.start();
  const boxes = await sidecar.measure(elements);
  const neutral = await readScene({ elements }, () => Promise.resolve(boxes));
  const hits = lint(neutral);
  writeFileSync(`${out}/lint.json`, JSON.stringify(hits, null, 2) + "\n");
  const all = Object.values(boxes);
  const x = Math.min(...all.map((b) => b.x)) - 20;
  const y = Math.min(...all.map((b) => b.y)) - 20;
  const width = Math.max(...all.map((b) => b.x + b.width)) - x + 20;
  const height = Math.max(...all.map((b) => b.y + b.height)) - y + 20;
  // At most 2400 px on the long edge, as the 1.12 finals (--max-px 2400).
  const scale = Math.min(2, 2400 / Math.max(width, height));
  writeFileSync(
    `${out}/sidecar.png`,
    await sidecar.snap({ x, y, width, height }, scale),
  );
  const counts = {};
  for (const h of hits) counts[h.code] = (counts[h.code] ?? 0) + 1;
  console.log(JSON.stringify({ elements: elements.length, hits: counts }));
} finally {
  await sidecar.close();
}
