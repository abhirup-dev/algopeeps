// Placement ops: row, column, grid, rightOf/leftOf/below/above (cheatsheet.md
// "Placement Helpers"). Pure functions: given elements (x/y ignored, width/
// height read) and an ordered list of ops, return elements with x/y
// overwritten for the ids each op names. Ops run in order, each reading the
// positions/sizes left by the ones before it, so `rightOf` etc. can target an
// id a `row`/`grid` op placed earlier in the same list.
import type { SkeletonElement } from "../skeleton/schema.ts";

export interface RowOp {
  op: "row";
  ids: readonly string[];
  at: readonly [number, number];
  gap: number;
}
export interface ColumnOp {
  op: "column";
  ids: readonly string[];
  at: readonly [number, number];
  gap: number;
}
export interface GridOp {
  op: "grid";
  ids: readonly string[];
  cols: number;
  at: readonly [number, number];
  gap: readonly [number, number];
}
export interface RelOp {
  op: "rightOf" | "leftOf" | "below" | "above";
  id: string;
  of: string;
  gap: number;
}
export type PlaceOp = RowOp | ColumnOp | GridOp | RelOp;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ponytail: arrows/lines/frames rarely carry width/height (points or
// child-derived); default to a 100x100 box so row/column/grid/rel ops still
// have something to center against. Widen if a task needs real arrow sizing.
const DEFAULT_SIZE = 100;
const sizeOf = (el: SkeletonElement): { width: number; height: number } => ({
  width: el.width ?? DEFAULT_SIZE,
  height: el.height ?? DEFAULT_SIZE,
});

function requireEl(
  byId: Map<string, SkeletonElement>,
  id: string,
): SkeletonElement {
  const el = byId.get(id);
  if (!el) throw new Error(`place: unknown id "${id}"`);
  return el;
}

function boxOf(byId: Map<string, SkeletonElement>, id: string): Box {
  const el = requireEl(byId, id);
  const { width, height } = sizeOf(el);
  // ponytail: only `frame` elements have optional x/y (sized from children);
  // treat an unset one as 0 rather than widening every caller's type.
  return { x: el.x ?? 0, y: el.y ?? 0, width, height };
}

function setPos(
  byId: Map<string, SkeletonElement>,
  id: string,
  x: number,
  y: number,
): void {
  byId.set(id, { ...requireEl(byId, id), x, y });
}

function applyOne(byId: Map<string, SkeletonElement>, op: PlaceOp): void {
  switch (op.op) {
    case "row": {
      const [atX, atY] = op.at;
      const maxHeight = Math.max(
        ...op.ids.map((id) => sizeOf(requireEl(byId, id)).height),
      );
      const centerY = atY + maxHeight / 2;
      let x = atX;
      for (const id of op.ids) {
        const { width, height } = sizeOf(requireEl(byId, id));
        setPos(byId, id, x, centerY - height / 2);
        x += width + op.gap;
      }
      break;
    }
    case "column": {
      const [atX, atY] = op.at;
      const maxWidth = Math.max(
        ...op.ids.map((id) => sizeOf(requireEl(byId, id)).width),
      );
      const centerX = atX + maxWidth / 2;
      let y = atY;
      for (const id of op.ids) {
        const { width, height } = sizeOf(requireEl(byId, id));
        setPos(byId, id, centerX - width / 2, y);
        y += height + op.gap;
      }
      break;
    }
    case "grid": {
      const [atX, atY] = op.at;
      const [gapX, gapY] = op.gap;
      const sizes = op.ids.map((id) => sizeOf(requireEl(byId, id)));
      const cellWidth = Math.max(...sizes.map((s) => s.width));
      const cellHeight = Math.max(...sizes.map((s) => s.height));
      op.ids.forEach((id, i) => {
        const row = Math.floor(i / op.cols);
        const col = i % op.cols;
        setPos(
          byId,
          id,
          atX + col * (cellWidth + gapX),
          atY + row * (cellHeight + gapY),
        );
      });
      break;
    }
    case "rightOf": {
      const of = boxOf(byId, op.of);
      const { height } = sizeOf(requireEl(byId, op.id));
      setPos(
        byId,
        op.id,
        of.x + of.width + op.gap,
        of.y + of.height / 2 - height / 2,
      );
      break;
    }
    case "leftOf": {
      const of = boxOf(byId, op.of);
      const { width, height } = sizeOf(requireEl(byId, op.id));
      setPos(
        byId,
        op.id,
        of.x - op.gap - width,
        of.y + of.height / 2 - height / 2,
      );
      break;
    }
    case "below": {
      const of = boxOf(byId, op.of);
      const { width } = sizeOf(requireEl(byId, op.id));
      setPos(
        byId,
        op.id,
        of.x + of.width / 2 - width / 2,
        of.y + of.height + op.gap,
      );
      break;
    }
    case "above": {
      const of = boxOf(byId, op.of);
      const { width, height } = sizeOf(requireEl(byId, op.id));
      setPos(
        byId,
        op.id,
        of.x + of.width / 2 - width / 2,
        of.y - op.gap - height,
      );
      break;
    }
  }
}

/** Runs `ops` in order over `elements`; returns a new array, same order, with
 * x/y overwritten for every id an op named. Elements not named by any op are
 * returned unchanged. */
export function place(
  elements: readonly SkeletonElement[],
  ops: readonly PlaceOp[],
): SkeletonElement[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  for (const op of ops) applyOne(byId, op);
  return elements.map((el) => byId.get(el.id) ?? el);
}
