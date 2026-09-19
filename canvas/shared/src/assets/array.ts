// §6 asset: array — cells in a row, optional index labels and pointers.
import { newId } from "../ids.js";
import type { AgentElement } from "../types.js";
import {
  base,
  CELL,
  finalize,
  shape,
  textEl,
  type AssetBase,
} from "./common.js";

export interface ArrayParams extends AssetBase {
  values: (string | number)[];
  pointers?: { label: string; index: number }[];
  showIndex?: boolean;
}

export function generate(p: ArrayParams): {
  elements: AgentElement[];
  groupId: string;
} {
  const b = base(p, "array");
  const values = p.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("array: values must be a non-empty array");
  }
  if (values.some((v) => v === null || v === undefined)) {
    throw new Error("array: values must be strings or numbers");
  }

  const els: AgentElement[] = values.map((v, i) =>
    shape("rectangle", b.x + i * CELL, b.y, CELL, CELL, String(v), "#a5d8ff"),
  );

  if (p.showIndex) {
    for (let i = 0; i < values.length; i++) {
      els.push(textEl(b.x + i * CELL, b.y + CELL + 18, String(i)));
    }
  }

  // pointers: small text + up-arrow beneath the pointed-at cell
  const ptrY = b.y + CELL + (p.showIndex ? 36 : 8);
  for (const ptr of p.pointers ?? []) {
    if (
      typeof ptr?.label !== "string" ||
      !Number.isInteger(ptr.index) ||
      ptr.index < 0 ||
      ptr.index >= values.length
    ) {
      throw new Error(
        "array: pointers must be {label, index} with index within range",
      );
    }
    const cx = b.x + ptr.index * CELL + CELL / 2;
    els.push({
      id: newId(),
      type: "arrow",
      x: cx,
      y: ptrY,
      points: [
        [0, 24],
        [0, 4],
      ],
      strokeWidth: 2,
    });
    els.push(textEl(cx + 4, ptrY + 28, ptr.label));
  }

  return finalize("array", b.name, b.owner ?? "agent", els);
}
