// Schema and referential checks for test/fixtures/dogfood/*/defects.json.
import { expect, test } from "bun:test";
import { parseJson } from "@elkdraw/core";
import { z } from "zod";

const dogfood = new URL("../../fixtures/dogfood/", import.meta.url).pathname;

// Rendered-lint rules v0 (canvas/docs/agent-layer-design.md §5).
const rule = z.enum([
  "text-overflow",
  "text-wrapped",
  "label-on-node",
  "label-on-label",
  "label-on-border",
  "arrow-through-node",
  "node-overlap",
  "dangling-endpoint",
  "outside-zone",
  "crossing",
]);
// Reported defects no v0 rule covers.
const ruleGap = z.enum(["arrow-through-label", "label-on-own-arrowhead"]);

const defect = z
  .strictObject({
    id: z.string(),
    rule: rule.optional(),
    ruleGap: ruleGap.optional(),
    ids: z.array(z.string()).min(1),
    description: z.string().min(1),
    source: z.string().min(1),
    reported: z.boolean(),
    fixedInFinal: z.boolean(),
    note: z.string().optional(),
  })
  .refine((d) => (d.rule === undefined) !== (d.ruleGap === undefined), {
    message: "exactly one of rule, ruleGap",
  });

const manifest = z.strictObject({
  scene: z.string(),
  png: z.string(),
  report: z.string(),
  defects: z.array(defect).min(1),
  cleanRegions: z
    .array(
      z.strictObject({
        name: z.string(),
        ids: z.array(z.string()).min(1),
        bbox: z.strictObject({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
        note: z.string().optional(),
      }),
    )
    .min(1),
  unmapped: z.array(
    z.strictObject({
      description: z.string(),
      source: z.string(),
      reason: z.string(),
    }),
  ),
});

const scene = z.object({ elements: z.array(z.object({ id: z.string() })) });

for (const name of ["yct", "batch", "bst"]) {
  test(`${name}/defects.json is valid and references real elements`, async () => {
    const dir = `${dogfood}${name}/`;
    const m = parseJson(manifest, await Bun.file(`${dir}defects.json`).text());
    const s = parseJson(scene, await Bun.file(dir + m.scene).text());
    expect(await Bun.file(dir + m.png).exists()).toBe(true);

    const known = new Set(s.elements.map((e) => e.id));
    const referenced = [
      ...m.defects.flatMap((d) => d.ids),
      ...m.cleanRegions.flatMap((r) => r.ids),
    ];
    expect(referenced.filter((id) => !known.has(id))).toEqual([]);

    const defectIds = m.defects.map((d) => d.id);
    expect(new Set(defectIds).size).toBe(defectIds.length);

    // A clean region must not contain anything still defective.
    const open = new Set(
      m.defects.filter((d) => !d.fixedInFinal).flatMap((d) => d.ids),
    );
    const clash = m.cleanRegions.flatMap((r) =>
      r.ids.filter((id) => open.has(id)).map((id) => `${r.name}:${id}`),
    );
    expect(clash).toEqual([]);

    // A hit that matches an unfixed defect must not also match a fixed one:
    // same rule, fixed ids a subset of the unfixed ids.
    const code = (d: z.infer<typeof defect>) => d.rule ?? d.ruleGap;
    const ambiguous = m.defects
      .filter((f) => f.fixedInFinal)
      .flatMap((f) =>
        m.defects
          .filter(
            (u) =>
              !u.fixedInFinal &&
              code(u) === code(f) &&
              f.ids.every((id) => u.ids.includes(id)),
          )
          .map((u) => `${f.id}~${u.id}`),
      );
    expect(ambiguous).toEqual([]);
  });
}
