// Lint parity on the dogfood fixtures (bead 1.6): every open defect in
// test/fixtures/dogfood/*/defects.json is flagged, no fixed defect is, and no
// hit falls in a clean region or matches no defect. Pipeline as in production:
// sidecar measure -> readScene -> lint. Defects marked `envOnly` were painted
// only in the tester's browser and are out of the must-flag set (see
// test/fixtures/README.md). Run with `bun run --cwd elkdraw/test/parity test:e2e`.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Element, parseJson } from "@elkdraw/core";
import { lint } from "@elkdraw/core/engine";
import { readScene, type ExcalidrawScene } from "@elkdraw/backend-excalidraw";
import { Sidecar } from "@elkdraw/sidecar";
import { z } from "zod";

const dogfood = new URL("../../fixtures/dogfood/", import.meta.url).pathname;

const Manifest = z.object({
  defects: z.array(
    z.object({
      id: z.string(),
      rule: z.string().optional(),
      ruleGap: z.string().optional(),
      ids: z.array(z.string()),
      fixedInFinal: z.boolean(),
      envOnly: z.object({ reason: z.string() }).optional(),
    }),
  ),
  cleanRegions: z.array(
    z.object({ name: z.string(), ids: z.array(z.string()) }),
  ),
});
const Scene = z.object({ elements: z.array(Element) });

/** Must-flag defects per fixture, from the manifests (open, not envOnly). */
const EXPECTED = { yct: 11, batch: 3, "bst-first": 0, bst: 0 };

const sidecar = new Sidecar();
beforeAll(async () => {
  await sidecar.start();
}, 60_000);
afterAll(async () => {
  await sidecar.close();
});

for (const [name, mustFlag] of Object.entries(EXPECTED)) {
  test(`${name}: lint flags every open defect, nothing else`, async () => {
    const dir = `${dogfood}${name}/`;
    const m = parseJson(Manifest, await Bun.file(`${dir}defects.json`).text());
    const scene = parseJson(
      Scene,
      await Bun.file(`${dir}scene.excalidraw`).text(),
    );
    const boxes = await sidecar.measure(scene.elements);
    // Same unchecked cast as render.e2e.ts: the wire Element passes the rest through.
    const excalidraw: ExcalidrawScene = {
      elements: scene.elements as unknown as ExcalidrawScene["elements"],
    };
    const neutral = await readScene(excalidraw, () => Promise.resolve(boxes));
    // lint names bound text `<owner>#label`; the fixtures say `<owner>-label`.
    const hits = lint(neutral).map((h) => ({
      code: h.code,
      ids: h.ids.map((id) => id.replace(/#label$/, "-label")),
    }));
    const tag = (h: (typeof hits)[number]) => `${h.code}:${h.ids.join(",")}`;
    const matches = (d: (typeof m.defects)[number]) =>
      hits.filter(
        (h) =>
          h.code === (d.rule ?? d.ruleGap) &&
          d.ids.every((id) => h.ids.includes(id)),
      );

    const open = m.defects.filter((d) => !d.fixedInFinal && !d.envOnly);
    expect(open.length).toBe(mustFlag);
    expect(open.filter((d) => !matches(d).length).map((d) => d.id)).toEqual([]);
    expect(
      m.defects
        .filter((d) => d.fixedInFinal && matches(d).length)
        .map((d) => d.id),
    ).toEqual([]);
    expect(
      hits
        .filter((h) =>
          m.cleanRegions.some((r) => h.ids.every((id) => r.ids.includes(id))),
        )
        .map(tag),
    ).toEqual([]);
    const listed = new Set(m.defects.flatMap((d) => matches(d)));
    expect(hits.filter((h) => !listed.has(h)).map(tag)).toEqual([]);
  }, 60_000);
}
