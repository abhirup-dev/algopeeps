// Asset generators: array, linkedList, tree, stack, table, hashMap
// (cheatsheet.md "Placement and Asset Ops"). Each is a pure function from a
// values shape + `at` to a whole `SkeletonElement[]`, already positioned
// (no further placement op needed) with the ids the cheatsheet promises.
import type { SkeletonElement } from "../skeleton/schema.ts";

type Cell = string | number;

// ponytail: ids are lowercase-only (SkeletonId); non-numeric keys/values are
// slugged for the id but the original string is kept as the label.
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9._/#@:>-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/^$/, "x");

const rect = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
): SkeletonElement => ({
  type: "rectangle",
  id,
  x,
  y,
  width,
  height,
  label: { text },
});

const text = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  value: string,
): SkeletonElement => ({
  type: "text",
  id,
  x,
  y,
  width,
  height,
  text: value,
  textAlign: "center",
});

const arrow = (id: string, start: string, end: string): SkeletonElement => ({
  type: "arrow",
  id,
  x: 0,
  y: 0,
  start: { id: start },
  end: { id: end },
});

/** `{"op":"array","id":"arr","values":[1,3,5],"at":[x,y]}` → cells `arr-0`…,
 * index labels `arr-0-idx`…. */
export function array(
  id: string,
  values: readonly Cell[],
  at: readonly [number, number],
): SkeletonElement[] {
  const [atX, atY] = at;
  const cellWidth = 60;
  const cellHeight = 40;
  const out: SkeletonElement[] = [];
  values.forEach((value, i) => {
    const x = atX + i * cellWidth;
    out.push(
      rect(`${id}-${String(i)}`, x, atY, cellWidth, cellHeight, String(value)),
    );
    out.push(
      text(
        `${id}-${String(i)}-idx`,
        x,
        atY + cellHeight + 6,
        cellWidth,
        18,
        String(i),
      ),
    );
  });
  return out;
}

/** `{"op":"linkedList","id":"ll","values":[...],"at":[x,y]}` → nodes `ll-0`…,
 * arrows `ll-0-1`…. */
export function linkedList(
  id: string,
  values: readonly Cell[],
  at: readonly [number, number],
): SkeletonElement[] {
  const [atX, atY] = at;
  const nodeWidth = 100;
  const nodeHeight = 60;
  const gap = 60;
  const out: SkeletonElement[] = [];
  values.forEach((value, i) => {
    out.push(
      rect(
        `${id}-${String(i)}`,
        atX + i * (nodeWidth + gap),
        atY,
        nodeWidth,
        nodeHeight,
        String(value),
      ),
    );
    if (i > 0) {
      const prev = `${id}-${String(i - 1)}`;
      const cur = `${id}-${String(i)}`;
      out.push(arrow(`${prev}-${String(i)}`, prev, cur));
    }
  });
  return out;
}

interface TreeNode {
  key: number;
  left?: TreeNode;
  right?: TreeNode;
}

function insertBst(root: TreeNode | undefined, key: number): TreeNode {
  if (!root) return { key };
  if (key < root.key) return { ...root, left: insertBst(root.left, key) };
  if (key > root.key) return { ...root, right: insertBst(root.right, key) };
  return root; // duplicate key: keep the first insertion
}

/** `{"op":"tree","id":"t","keys":[8,4,12],"at":[x,y]}` (inserted as a binary
 * search tree) → nodes `t-8`…, edges `t-8-4`…. In-order index gives x, depth
 * gives y (44px nodes, 60px x-step, 90px level gap: the dogfood BST fixture's
 * layout). */
export function tree(
  id: string,
  keys: readonly number[],
  at: readonly [number, number],
): SkeletonElement[] {
  const [atX, atY] = at;
  const nodeSize = 44;
  const xSpacing = 60;
  const levelGap = 90;
  let root: TreeNode | undefined;
  for (const key of keys) root = insertBst(root, key);

  const out: SkeletonElement[] = [];
  let index = 0;
  const visit = (node: TreeNode | undefined, depth: number): void => {
    if (!node) return;
    visit(node.left, depth + 1);
    const x = atX + index * xSpacing;
    const y = atY + depth * levelGap;
    index += 1;
    const nodeId = `${id}-${String(node.key)}`;
    out.push({
      type: "ellipse",
      id: nodeId,
      x,
      y,
      width: nodeSize,
      height: nodeSize,
      label: { text: String(node.key) },
    });
    if (node.left) {
      const childId = `${id}-${String(node.left.key)}`;
      out.push(arrow(`${nodeId}-${String(node.left.key)}`, nodeId, childId));
    }
    if (node.right) {
      const childId = `${id}-${String(node.right.key)}`;
      out.push(arrow(`${nodeId}-${String(node.right.key)}`, nodeId, childId));
    }
    visit(node.right, depth + 1);
  };
  visit(root, 0);
  return out;
}

/** `{"op":"stack","id":"s","frames":["main","f(3)"],"at":[x,y]}` → frames
 * `s-0`… (top last: the highest index sits at the top, lowest y). */
export function stack(
  id: string,
  frames: readonly string[],
  at: readonly [number, number],
): SkeletonElement[] {
  const [atX, atY] = at;
  const width = 160;
  const height = 40;
  return frames.map((frame, i) =>
    rect(
      `${id}-${String(i)}`,
      atX,
      atY + (frames.length - 1 - i) * height,
      width,
      height,
      frame,
    ),
  );
}

/** `{"op":"table","id":"tb","rows":[["a","b"],["1","2"]],"at":[x,y]}` →
 * cells `tb-r0c0`…. */
export function table(
  id: string,
  rows: readonly (readonly Cell[])[],
  at: readonly [number, number],
): SkeletonElement[] {
  const [atX, atY] = at;
  const cellWidth = 100;
  const cellHeight = 40;
  const out: SkeletonElement[] = [];
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      out.push(
        rect(
          `${id}-r${String(r)}c${String(c)}`,
          atX + c * cellWidth,
          atY + r * cellHeight,
          cellWidth,
          cellHeight,
          String(value),
        ),
      );
    });
  });
  return out;
}

/** `{"op":"hashMap","id":"h","buckets":4,"entries":[["k","v"]],"at":[x,y]}` →
 * buckets `h-0`…, entries `h-k`. Bucket index = sum of char codes mod
 * `buckets`; entries in the same bucket stack to its right. */
export function hashMap(
  id: string,
  buckets: number,
  entries: readonly (readonly [string, string])[],
  at: readonly [number, number],
): SkeletonElement[] {
  const [atX, atY] = at;
  const bucketWidth = 80;
  const bucketHeight = 40;
  const entryWidth = 140;
  const entryHeight = 40;
  const entryGap = 10;

  const out: SkeletonElement[] = [];
  for (let b = 0; b < buckets; b += 1) {
    out.push(
      rect(
        `${id}-${String(b)}`,
        atX,
        atY + b * bucketHeight,
        bucketWidth,
        bucketHeight,
        String(b),
      ),
    );
  }

  const bucketOf = (key: string): number => {
    if (buckets <= 0) return 0;
    let sum = 0;
    for (let i = 0; i < key.length; i += 1) sum += key.charCodeAt(i);
    return sum % buckets;
  };
  const perBucket = new Map<number, number>();
  for (const [key, value] of entries) {
    const b = bucketOf(key);
    const slot = perBucket.get(b) ?? 0;
    perBucket.set(b, slot + 1);
    out.push(
      rect(
        `${id}-${slug(key)}`,
        atX + bucketWidth + 40,
        atY + b * bucketHeight + slot * (entryHeight + entryGap),
        entryWidth,
        entryHeight,
        `${key}: ${value}`,
      ),
    );
  }
  return out;
}
