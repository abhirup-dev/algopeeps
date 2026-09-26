// The placer: matches `ApplyDeps["place"]` in core/apply/apply.ts exactly.
// Runs `ops` in order over `elements` (the batch apply is about to write),
// reading anchors from `scene` (what is already on the canvas) when an op
// names an id apply didn't just give it. Layout ops (row/column/grid/rel)
// move ids; asset ops (array/linkedList/tree/stack/table/hashMap) generate
// whole structures. An id in `elements` that matches a generated id
// overrides the fields it gives (cheatsheet line 123) — its position is
// still the generator's, like every other place op overwrites x/y.
import type { Element } from "../src/contracts/index.ts";
import type { SkeletonElement } from "../skeleton/schema.ts";
import type { PlaceOp } from "./schema.ts";
import {
  array,
  hashMap,
  linkedList,
  type PositionedSkeletonElement,
  stack,
  table,
  tree,
} from "./assets.ts";
import { fromStored } from "./stored.ts";

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

const numberField = (e: Element, key: string): number | undefined => {
  const v = (e as unknown as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
};

const sceneBox = (e: Element): Box => ({
  x: numberField(e, "x") ?? 0,
  y: numberField(e, "y") ?? 0,
  width: numberField(e, "width") ?? DEFAULT_SIZE,
  height: numberField(e, "height") ?? DEFAULT_SIZE,
});

const skeletonBox = (e: SkeletonElement): Box => ({
  x: e.x ?? 0,
  y: e.y ?? 0,
  width: e.width ?? DEFAULT_SIZE,
  height: e.height ?? DEFAULT_SIZE,
});

/** Runs `ops` in order over `elements`; returns the elements to send to
 * `convert`: every input element (repositioned as ops require), plus
 * whatever asset ops generated, in each one's original/first-seen order. */
export function place(
  elements: SkeletonElement[],
  ops: readonly PlaceOp[],
  scene: readonly Element[],
): SkeletonElement[] {
  const overrides = new Map(elements.map((e) => [e.id, e]));
  const out = new Map(overrides);
  const order = elements.map((e) => e.id);
  const sceneById = new Map(scene.map((e) => [e.id, e]));

  const boxOf = (id: string): Box => {
    const sk = out.get(id);
    if (sk) return skeletonBox(sk);
    const sc = sceneById.get(id);
    if (sc) return sceneBox(sc);
    throw new Error(`place: unknown id "${id}"`);
  };

  const setPos = (id: string, x: number, y: number): void => {
    const existing = out.get(id);
    if (existing) {
      out.set(id, { ...existing, x, y });
      return;
    }
    // An id only on the canvas moves as stored: everything but x/y is kept.
    const sc = sceneById.get(id);
    const stored = sc && sc["isDeleted"] !== true && fromStored(sc, scene);
    if (!stored) throw new Error(`place: unknown id "${id}"`);
    // ponytail: a frame moves without its children, and the converter
    // cannot re-take stored labelled children yet; place them instead.
    if (stored.type === "frame")
      throw new Error(`place: "${id}" is a frame; place its children instead`);
    out.set(id, { ...stored, x, y });
    order.push(id);
  };

  /** Adds (or merges an override onto) a generated asset element. */
  const put = (el: PositionedSkeletonElement): void => {
    const override = overrides.get(el.id);
    // The override's own x/y are dummy placeholders (same convention as
    // every other place op): the generator's layout always wins.
    const merged: SkeletonElement = override
      ? { ...el, ...override, x: el.x, y: el.y }
      : el;
    if (!out.has(el.id)) order.push(el.id);
    out.set(el.id, merged);
  };

  for (const op of ops) {
    switch (op.op) {
      case "row": {
        const [atX, atY] = op.at;
        const maxHeight = Math.max(...op.ids.map((id) => boxOf(id).height));
        const centerY = atY + maxHeight / 2;
        let x = atX;
        for (const id of op.ids) {
          const { width, height } = boxOf(id);
          setPos(id, x, centerY - height / 2);
          x += width + op.gap;
        }
        break;
      }
      case "column": {
        const [atX, atY] = op.at;
        const maxWidth = Math.max(...op.ids.map((id) => boxOf(id).width));
        const centerX = atX + maxWidth / 2;
        let y = atY;
        for (const id of op.ids) {
          const { width, height } = boxOf(id);
          setPos(id, centerX - width / 2, y);
          y += height + op.gap;
        }
        break;
      }
      case "grid": {
        const [atX, atY] = op.at;
        const [gapX, gapY] = op.gap;
        const sizes = op.ids.map((id) => boxOf(id));
        const cellWidth = Math.max(...sizes.map((s) => s.width));
        const cellHeight = Math.max(...sizes.map((s) => s.height));
        op.ids.forEach((id, i) => {
          const row = Math.floor(i / op.cols);
          const col = i % op.cols;
          setPos(
            id,
            atX + col * (cellWidth + gapX),
            atY + row * (cellHeight + gapY),
          );
        });
        break;
      }
      case "rightOf": {
        const of = boxOf(op.of);
        const { height } = boxOf(op.id);
        setPos(
          op.id,
          of.x + of.width + op.gap,
          of.y + of.height / 2 - height / 2,
        );
        break;
      }
      case "leftOf": {
        const of = boxOf(op.of);
        const { width, height } = boxOf(op.id);
        setPos(op.id, of.x - op.gap - width, of.y + of.height / 2 - height / 2);
        break;
      }
      case "below": {
        const of = boxOf(op.of);
        const { width } = boxOf(op.id);
        setPos(
          op.id,
          of.x + of.width / 2 - width / 2,
          of.y + of.height + op.gap,
        );
        break;
      }
      case "above": {
        const of = boxOf(op.of);
        const { width, height } = boxOf(op.id);
        setPos(op.id, of.x + of.width / 2 - width / 2, of.y - op.gap - height);
        break;
      }
      case "array":
        for (const el of array(op.id, op.values, op.at)) put(el);
        break;
      case "linkedList":
        for (const el of linkedList(op.id, op.values, op.at)) put(el);
        break;
      case "tree":
        for (const el of tree(op.id, op.keys, op.at)) put(el);
        break;
      case "stack":
        for (const el of stack(op.id, op.frames, op.at)) put(el);
        break;
      case "table":
        for (const el of table(op.id, op.rows, op.at)) put(el);
        break;
      case "hashMap":
        for (const el of hashMap(op.id, op.buckets, op.entries, op.at)) put(el);
        break;
    }
  }

  return order
    .map((id) => out.get(id))
    .filter((e): e is SkeletonElement => e !== undefined);
}
