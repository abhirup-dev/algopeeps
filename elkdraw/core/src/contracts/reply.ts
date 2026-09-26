import { z } from "zod";
import { FieldGroup, Id } from "./ir.ts";
import { LintHit } from "./lint.ts";

const Count = z.int().nonnegative();

/** Field groups where the canvas differs from `gen` (§3.3). */
const GroupsHit = z.strictObject({
  id: Id,
  groups: z.array(FieldGroup).min(1),
});

/**
 * The whole `apply` reply (§3.3). Elements are never echoed.
 * TODO(phase 5): `tombstoned`, once tombstones exist (include/instance content only, §12.3).
 */
export const ApplyReply = z.strictObject({
  rev: Count,
  created: z.array(Id),
  updated: Count,
  kept: Count,
  deleted: z.array(Id),
  /** Kept canvas values; the new value was equal to `gen`. */
  overrides: z.array(GroupsHit),
  /** Kept canvas values; both sides changed. `force` writes the new value. */
  conflicts: z.array(GroupsHit),
  /** Placer shoves (§15.2). */
  moved: z.array(z.strictObject({ id: Id, dx: z.number(), dy: z.number() })),
  lints: z.array(LintHit),
  /** False = sizes came from the cache/table fallback, not the backend. */
  measured: z.boolean(),
});
export type ApplyReply = z.infer<typeof ApplyReply>;

/** One line of the change feed the agent reads (§12.4). */
export const FeedLine = z.strictObject({
  // TODO(phase 1.5): named authors, if collaboration needs more than two.
  author: z.enum(["human", "agent"]),
  time: z.iso.datetime(),
  op: z.enum([
    "added",
    "removed",
    "moved",
    "relabelled",
    "restyled",
    "reconnected",
    "applied",
  ]),
  ids: z.array(Id),
  /** `relabelled`: old/new label; `moved`: the shift. */
  detail: z
    .strictObject({
      oldLabel: z.string().exactOptional(),
      newLabel: z.string().exactOptional(),
      dx: z.number().exactOptional(),
      dy: z.number().exactOptional(),
    })
    .exactOptional(),
});
export type FeedLine = z.infer<typeof FeedLine>;
