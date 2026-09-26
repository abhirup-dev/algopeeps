// Strict schema for `place` ops (cheatsheet.md "Placement and Asset Ops"):
// row/column/grid/rel share the layout op vocabulary; array/linkedList/tree/
// stack/table/hashMap sit in the same union (cheatsheet line 123: "Instead of
// computing every x/y by hand, list placement ops in `place`... Asset ops
// generate whole structures as elements"). Every member is a strictObject, so
// an unknown key or wrong shape is rejected with its path, like
// core/skeleton/schema.ts.
import { z } from "zod";
import { SkeletonId } from "../skeleton/schema.ts";

const At = z.tuple([z.number(), z.number()]);
const Ids = z.array(SkeletonId).min(1);
const Cell = z.union([z.string(), z.number()]);

const RowOp = z.strictObject({
  op: z.literal("row"),
  ids: Ids,
  at: At,
  gap: z.number(),
});
const ColumnOp = z.strictObject({
  op: z.literal("column"),
  ids: Ids,
  at: At,
  gap: z.number(),
});
const GridOp = z.strictObject({
  op: z.literal("grid"),
  ids: Ids,
  cols: z.number().int().positive(),
  at: At,
  gap: z.tuple([z.number(), z.number()]),
});

const relOp = <Op extends "rightOf" | "leftOf" | "below" | "above">(op: Op) =>
  z.strictObject({
    op: z.literal(op),
    id: SkeletonId,
    of: SkeletonId,
    gap: z.number(),
  });
const RightOfOp = relOp("rightOf");
const LeftOfOp = relOp("leftOf");
const BelowOp = relOp("below");
const AboveOp = relOp("above");

const ArrayOp = z.strictObject({
  op: z.literal("array"),
  id: SkeletonId,
  values: z.array(Cell).min(1),
  at: At,
});
const LinkedListOp = z.strictObject({
  op: z.literal("linkedList"),
  id: SkeletonId,
  values: z.array(Cell).min(1),
  at: At,
});
const TreeOp = z.strictObject({
  op: z.literal("tree"),
  id: SkeletonId,
  keys: z.array(z.number()).min(1),
  at: At,
});
const StackOp = z.strictObject({
  op: z.literal("stack"),
  id: SkeletonId,
  frames: z.array(z.string()).min(1),
  at: At,
});
const TableOp = z.strictObject({
  op: z.literal("table"),
  id: SkeletonId,
  rows: z.array(z.array(Cell).min(1)).min(1),
  at: At,
});
const HashMapOp = z.strictObject({
  op: z.literal("hashMap"),
  id: SkeletonId,
  buckets: z.number().int().positive(),
  entries: z.array(z.tuple([z.string(), z.string()])),
  at: At,
});

export const PlaceOp = z.discriminatedUnion("op", [
  RowOp,
  ColumnOp,
  GridOp,
  RightOfOp,
  LeftOfOp,
  BelowOp,
  AboveOp,
  ArrayOp,
  LinkedListOp,
  TreeOp,
  StackOp,
  TableOp,
  HashMapOp,
]);
export type PlaceOp = z.infer<typeof PlaceOp>;
