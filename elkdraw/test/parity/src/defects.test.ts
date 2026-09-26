// Schema and referential checks for test/fixtures/dogfood/*/defects.json and
// test/fixtures/eval-p1/*/defects.json.
import { expect, test } from "bun:test";
import { LintCode, parseJson } from "@elkdraw/core";
import { z } from "zod";

const fixtures = new URL("../../fixtures/", import.meta.url).pathname;

// A ruleGap names a defect no LintCode covers: the two fixture-only gap
// names (dogfood), or, on a `wontFix` entry, a free sentence (eval-p1).
const ruleGap = z.string().min(1);

const defect = z
  .strictObject({
    id: z.string(),
    rule: LintCode.optional(),
    ruleGap: ruleGap.optional(),
    ids: z.array(z.string()).min(1),
    description: z.string().min(1),
    // Absent on a `wontFix` entry with no report/transcript source (eval-p1).
    source: z.string().min(1).optional(),
    reported: z.boolean(),
    fixedInFinal: z.boolean(),
    note: z.string().optional(),
    // Open in final.png but not painted by our renderer (tester's environment):
    // out of lint's must-flag set. `evidence` is a PNG next to the manifest.
    envOnly: z
      .strictObject({ reason: z.string().min(1), evidence: z.string() })
      .optional(),
    // Open but not drawn in final.png either: the measured gap, not flagged.
    notDrawn: z
      .strictObject({ reason: z.string().min(1), evidence: z.string() })
      .optional(),
    // Open (or seen) but no rule over the scene can see it: out of the
    // must-flag set, like `notDrawn` (eval-p1, 1.19).
    wontFix: z.strictObject({ reason: z.string().min(1) }).optional(),
  })
  .refine((d) => (d.rule === undefined) !== (d.ruleGap === undefined), {
    message: "exactly one of rule, ruleGap",
  })
  .refine((d) => !(d.envOnly && d.fixedInFinal), {
    message: "envOnly applies to open defects only",
  });

const manifest = z.strictObject({
  scene: z.string(),
  png: z.string(),
  // dogfood manifests point at a report doc; eval-p1 ones name their source
  // run and rev note instead (test/fixtures/eval-p1/README.md).
  report: z.string().optional(),
  source: z.string().optional(),
  note: z.string().optional(),
  defects: z.array(defect).min(1),
  cleanRegions: z
    .array(
      z.strictObject({
        name: z.string(),
        ids: z.array(z.string()).min(1),
        // eval-p1 clean regions carry ids only, no bbox (dogfood's is for
        // `look` and humans).
        bbox: z
          .strictObject({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .optional(),
        note: z.string().optional(),
      }),
    )
    .min(1),
  unmapped: z
    .array(
      z.strictObject({
        description: z.string(),
        source: z.string(),
        reason: z.string(),
      }),
    )
    .optional(),
});

const scene = z.object({ elements: z.array(z.object({ id: z.string() })) });

/**
 * Schema and referential checks shared by both fixture families.
 * `dogfood` and `evidenceFiles` are dogfood-only: eval-p1 has one entry per
 * lint hit (repeats a source defect's id, README) and its `notDrawn`/`envOnly`
 * evidence can be a description rather than a file (e.g. rh-r1's p1rh-08).
 */
function checkManifest(
  dir: string,
  // dogfood-only: unique defect ids and no clean region holding an open one
  // (the must-flag invariants). eval-p1 repeats an id per lint hit and its
  // clean regions can list ids a `wontFix`/`notDrawn` entry also names.
  opts: { dogfood: boolean; evidenceFiles: boolean },
) {
  return async () => {
    const m = parseJson(manifest, await Bun.file(`${dir}defects.json`).text());
    const s = parseJson(scene, await Bun.file(dir + m.scene).text());
    expect(await Bun.file(dir + m.png).exists()).toBe(true);
    if (opts.evidenceFiles) {
      for (const d of m.defects) {
        for (const e of [d.envOnly, d.notDrawn]) {
          if (e) expect(await Bun.file(dir + e.evidence).exists()).toBe(true);
        }
      }
    }

    const known = new Set(s.elements.map((e) => e.id));
    const referenced = [
      ...m.defects.flatMap((d) => d.ids),
      ...m.cleanRegions.flatMap((r) => r.ids),
    ];
    expect(referenced.filter((id) => !known.has(id))).toEqual([]);

    if (opts.dogfood) {
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
    }

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
  };
}

for (const name of [
  "yct",
  "batch",
  "bst",
  "bst-first",
  "yct-painted",
  "batch-painted",
  "bst-first-painted",
]) {
  test(
    `dogfood/${name}/defects.json is valid and references real elements`,
    checkManifest(`${fixtures}dogfood/${name}/`, {
      dogfood: true,
      evidenceFiles: true,
    }),
  );
}

for (const name of ["rh-r1", "rh-r2", "rh-r4", "rh-r8", "rh-r9", "bst-r1"]) {
  test(
    `eval-p1/${name}/defects.json is valid and references real elements`,
    checkManifest(`${fixtures}eval-p1/${name}/`, {
      dogfood: false,
      evidenceFiles: false,
    }),
  );
}
