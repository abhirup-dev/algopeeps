// §6 asset: linked_list — 96×56 nodes, 40 px gap, arrows between successors.
import type { AgentElement } from "../types.js";
import {
  arrowBetween,
  base,
  finalize,
  shape,
  textEl,
  type AssetBase,
} from "./common.js";

const NODE_W = 96;
const NODE_H = 56;
const GAP = 40;
const PITCH = NODE_W + GAP; // 136

export interface LinkedListParams extends AssetBase {
  values: (string | number)[];
  doubly?: boolean;
}

export function generate(p: LinkedListParams): {
  elements: AgentElement[];
  groupId: string;
} {
  const b = base(p, "linked_list");
  if (!Array.isArray(p.values) || p.values.length === 0) {
    throw new Error("linked_list: values must be a non-empty array");
  }
  const nodes = p.values.map((v, i) =>
    shape(
      "rectangle",
      b.x + i * PITCH,
      b.y,
      NODE_W,
      NODE_H,
      String(v),
      "#a5d8ff",
    ),
  );
  const els: AgentElement[] = [...nodes];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const ax = b.x + i * PITCH + NODE_W + GAP / 2;
    const ay = b.y + NODE_H / 2;
    els.push(arrowBetween(nodes[i].id!, nodes[i + 1].id!, ax, ay));
    if (p.doubly)
      els.push(arrowBetween(nodes[i + 1].id!, nodes[i].id!, ax, ay));
  }
  els.push(textEl(b.x + p.values.length * PITCH - GAP + 24, b.y + 16, "null"));
  return finalize("linked_list", b.name, b.owner ?? "agent", els);
}
