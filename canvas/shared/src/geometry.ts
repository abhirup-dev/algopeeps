// Vendored from yctimlin/mcp_excalidraw (MIT), adapted.
// Upstream geometry.ts is canvas-HTTP-coupled (align/distribute/group via a
// live canvas client); only pure offline geometry survives here, plus the
// bbox helpers annotate/read/camera need.
import type { Element } from "./types.js";

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounds of one element; uses `points` offsets for lines/arrows. */
export function bboxOf(el: Element): BBox {
  let minX = el.x;
  let minY = el.y;
  let maxX = el.x + (el.width ?? 0);
  let maxY = el.y + (el.height ?? 0);
  if (el.points?.length) {
    for (const [px, py] of el.points) {
      minX = Math.min(minX, el.x + px);
      minY = Math.min(minY, el.y + py);
      maxX = Math.max(maxX, el.x + px);
      maxY = Math.max(maxY, el.y + py);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function padBox(box: BBox, px: number): BBox {
  return {
    x: box.x - px,
    y: box.y - px,
    width: box.width + px * 2,
    height: box.height + px * 2,
  };
}

export function boxesIntersect(a: BBox, b: BBox): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/** Bounds of many elements; empty input → zero box at origin. */
export function bboxOfAll(elements: Element[]): BBox {
  if (elements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = bboxOf(el);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
