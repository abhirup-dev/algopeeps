// AstPatch: d2oracle's op vocabulary (design §13.1 #5), produced by lift and
// by agents, turned into line edits by the minimal-edit printer.
import { z } from "zod";
import { Id } from "./ir.ts";

const node = {
  label: z.string().exactOptional(),
  shape: z.string().min(1).exactOptional(),
  roles: z.array(z.string().min(1)).exactOptional(),
};

export const CreateNode = z.strictObject({
  op: z.literal("create"),
  element: z.literal("node"),
  id: Id,
  /** Zone to create it in; absent = the root. */
  parent: Id.exactOptional(),
  ...node,
});

export const CreateEdge = z.strictObject({
  op: z.literal("create"),
  element: z.literal("edge"),
  id: Id,
  from: Id,
  to: Id,
  label: z.string().exactOptional(),
});

export const CreatePatch = z.discriminatedUnion("element", [
  CreateNode,
  CreateEdge,
]);

/** Label, shape or class. A label edit never changes the id. */
export const SetPatch = z.strictObject({
  op: z.literal("set"),
  id: Id,
  ...node,
  // TODO(phase 3): style, for `lift --style` (§12.3).
});

/** Move an edge's ends. At least one of from/to in practice. */
export const ReconnectPatch = z.strictObject({
  op: z.literal("reconnect"),
  id: Id,
  from: Id.exactOptional(),
  to: Id.exactOptional(),
});

/** Edges touching a deleted node cascade (§12.3). */
export const DeletePatch = z.strictObject({
  op: z.literal("delete"),
  id: Id,
});

/** Agent- or text-initiated only; rewrites every occurrence (§13.1 #5). */
export const RenamePatch = z.strictObject({
  op: z.literal("rename"),
  id: Id,
  to: Id,
});

/** Move a node into another zone; `parent` is the root id to leave all zones. */
export const MovePatch = z.strictObject({
  op: z.literal("move"),
  id: Id,
  parent: Id,
});

export const AstPatch = z.discriminatedUnion("op", [
  CreatePatch,
  SetPatch,
  ReconnectPatch,
  DeletePatch,
  RenamePatch,
  MovePatch,
]);
export type AstPatch = z.infer<typeof AstPatch>;
