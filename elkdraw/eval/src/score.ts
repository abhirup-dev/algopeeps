// Scores lint hits against a defect manifest (test/fixtures/README.md,
// "defects.json"). Skeleton: there is no lint engine yet, so hits are input;
// once lint lands, its hits on the final scene feed this directly.
import type { LintHit } from "@elkdraw/core";
import { z } from "zod";

// Only the fields scoring reads; test/parity/src/defects.test.ts owns the strict schema.
export const Manifest = z.object({
  defects: z.array(
    z.object({
      id: z.string(),
      rule: z.string().optional(),
      ruleGap: z.string().optional(),
      ids: z.array(z.string()).min(1),
      fixedInFinal: z.boolean(),
    }),
  ),
  cleanRegions: z.array(
    z.object({ name: z.string(), ids: z.array(z.string()) }),
  ),
});
export type Manifest = z.infer<typeof Manifest>;

export interface Score {
  /** Unfixed defects some hit flags. */
  found: string[];
  /** Unfixed defects no hit flags, rule gaps included: the §17.4 "missed" count. */
  missed: string[];
  /** Hits on defects fixed during the session: false positives. */
  flaggedFixed: string[];
  /** Hits whose ids all sit in one clean region: false positives. */
  cleanRegionHits: LintHit[];
}

type Defect = Manifest["defects"][number];

// Same rule, and the hit names every id of the defect.
const matches = (h: LintHit, d: Defect) =>
  h.code === d.rule && d.ids.every((id) => h.ids.includes(id));

export function score(manifest: Manifest, hits: LintHit[]): Score {
  const flagged = (d: Defect) => hits.some((h) => matches(h, d));
  const open = manifest.defects.filter((d) => !d.fixedInFinal);
  return {
    found: open.filter(flagged).map((d) => d.id),
    missed: open.filter((d) => !flagged(d)).map((d) => d.id),
    flaggedFixed: manifest.defects
      .filter((d) => d.fixedInFinal && flagged(d))
      .map((d) => d.id),
    cleanRegionHits: hits.filter((h) =>
      manifest.cleanRegions.some((r) =>
        h.ids.every((id) => r.ids.includes(id)),
      ),
    ),
  };
}
