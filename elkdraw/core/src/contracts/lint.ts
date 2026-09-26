import { z } from "zod";
import { Box } from "./geometry.ts";

/** The rendered-lint rules: §5's ten plus two from the fixtures (§19.1 B1). */
export const LintCode = z.enum([
  "text-overflow",
  "text-wrapped",
  "label-on-node",
  "label-on-label",
  "label-on-border",
  "arrow-through-node",
  "arrow-through-label",
  "label-on-own-arrowhead",
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
  /** Where the defect is, in scene coordinates (for `look`). */
  bbox: Box,
  /** `crossing` is info; the §17.4 bar counts errors only. */
  severity: z.enum(["error", "info"]),
  /** Names the fix, e.g. `labelAt`, `pin`, `relayout`. */
  hint: z.string(),
  /** Set when an Allow matched: its `why`. Suppressed hits are returned, not dropped. */
  suppressed: z.string().min(1).exactOptional(),
});
export type LintHit = z.infer<typeof LintHit>;
