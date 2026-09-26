import { z } from "zod";

/** The v0 rendered-lint rules (design §5). */
export const LintCode = z.enum([
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
export type LintCode = z.infer<typeof LintCode>;

/** Suppression on one element. Names one rule: no global or wildcard allow. */
export const Allow = z.strictObject({
  rule: LintCode,
  why: z.string().min(1),
});
export type Allow = z.infer<typeof Allow>;

export const LintHit = z.strictObject({
  code: LintCode,
  ids: z.array(z.string().min(1)).min(1),
  /** Names the fix, e.g. `labelAt`, `pin`, `relayout`. */
  hint: z.string(),
  /** Set when an Allow matched: its `why`. Suppressed hits are returned, not dropped. */
  suppressed: z.string().min(1).exactOptional(),
  // TODO(phase 1): severity (`crossing` is info in §5); design has no field yet.
});
export type LintHit = z.infer<typeof LintHit>;
