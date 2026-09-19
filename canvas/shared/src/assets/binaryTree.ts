// §6 asset: binary_tree — level-order values, 56×56 ellipses, level height
// 96, subtree width halves per level.
import type { AgentElement } from "../types.js";
import {
  arrowBetween,
  base,
  finalize,
  shape,
  type AssetBase,
} from "./common.js";

const NODE = 56;
const LEVEL_H = 96;
const LEAF_PITCH = 72; // 56 node + 16 gap; width allocated to each deepest-level node

export interface BinaryTreeParams extends AssetBase {
  values: (string | number | null)[]; // level order, null = missing
}

export function generate(p: BinaryTreeParams): {
  elements: AgentElement[];
  groupId: string;
} {
  const b = base(p, "binary_tree");
  const values = p.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(
      "binary_tree: values must be a non-empty array of (string|number|null)",
    );
  }
  if (
    values.some(
      (v) => v !== null && typeof v !== "string" && typeof v !== "number",
    )
  ) {
    throw new Error("binary_tree: values must be (string|number|null)");
  }

  const levels = Math.floor(Math.log2(values.length)) + 1;
  // shift so the leftmost leaf's left edge lands exactly at b.x
  const x0 = b.x - (LEAF_PITCH - NODE) / 2;

  const nodes: Array<{ el: AgentElement; cx: number; cy: number } | undefined> =
    values.map((v, i) => {
      if (v === null) return undefined;
      const level = Math.floor(Math.log2(i + 1));
      const idxInLevel = i + 1 - 2 ** level;
      const levelW = LEAF_PITCH * 2 ** (levels - 1 - level);
      const cx = x0 + (idxInLevel + 0.5) * levelW;
      const cy = b.y + level * LEVEL_H + NODE / 2;
      return {
        el: shape(
          "ellipse",
          cx - NODE / 2,
          cy - NODE / 2,
          NODE,
          NODE,
          String(v),
          "#a5d8ff",
        ),
        cx,
        cy,
      };
    });

  const els: AgentElement[] = [];
  for (const n of nodes) if (n) els.push(n.el);
  for (let i = 0; i < values.length; i++) {
    const parent = nodes[i];
    if (!parent) continue;
    for (const c of [2 * i + 1, 2 * i + 2]) {
      const child = c < values.length ? nodes[c] : undefined;
      if (child) {
        els.push(
          arrowBetween(
            parent.el.id!,
            child.el.id!,
            (parent.cx + child.cx) / 2,
            (parent.cy + child.cy) / 2,
          ),
        );
      }
    }
  }
  return finalize("binary_tree", b.name, b.owner ?? "agent", els);
}
