// The pure half of `look` (design §13, MCP tool in adapters/mcp/src/tools.ts):
// the union of a target's rendered boxes, padded by `r`, and the scale that
// keeps the crop within the pixel caps. No I/O and no sidecar import: the
// rendered boxes come in as `Record<Id, Box>` (from `BackendAdapter.render`,
// task 1.7's other half in `backends/excalidraw/render/**`).
import type { Box, Id, Point } from "./src/contracts/index.ts";

/** Default longest-side caps (the `look` acceptance: a crop is <= 512x384).
 * `maxPx` (the MCP tool's "longest image side") overrides both. */
export const MAX_WIDTH = 512;
export const MAX_HEIGHT = 384;

/** The app's headless `snap` sizes the output canvas with `Math.round(side *
 * scale)`; shrink the raw ratio so rounding never pushes a side over the cap. */
const ROUND_SAFETY = 1 - 1e-9;

/** The union of `ids`' boxes. Throws if `ids` names one `boxes` lacks: a
 * missing box is a caller bug (measure it first), not an empty crop. */
export function targetBox(
  boxes: Record<string, Box>,
  ids: readonly string[],
): Box {
  const [firstId, ...rest] = ids;
  if (firstId === undefined) throw new Error("look: no ids given");
  const first = boxes[firstId];
  if (!first) throw new Error(`look: no rendered box for id ${firstId}`);
  let box = first;
  for (const id of rest) {
    const b = boxes[id];
    if (!b) throw new Error(`look: no rendered box for id ${id}`);
    box = {
      x: Math.min(box.x, b.x),
      y: Math.min(box.y, b.y),
      width: Math.max(box.x + box.width, b.x + b.width) - Math.min(box.x, b.x),
      height:
        Math.max(box.y + box.height, b.y + b.height) - Math.min(box.y, b.y),
    };
  }
  return box;
}

/** `box` grown by `r` scene units on every side. */
export function pad(box: Box, r: number): Box {
  if (r === 0) return box;
  return {
    x: box.x - r,
    y: box.y - r,
    width: box.width + 2 * r,
    height: box.height + 2 * r,
  };
}

/** Scale (<= 1: never upscale) that keeps `box` within the pixel caps once
 * rendered at `Math.round(side * scale)`. `maxPx` caps both sides (the "longest
 * side" cap applies per-side under uniform scale, since the shorter side is
 * then automatically under it too). */
export function clampScale(box: Box, maxPx?: number): number {
  const maxW = maxPx ?? MAX_WIDTH;
  const maxH = maxPx ?? MAX_HEIGHT;
  const candidates = [1];
  if (box.width > 0) candidates.push((maxW * ROUND_SAFETY) / box.width);
  if (box.height > 0) candidates.push((maxH * ROUND_SAFETY) / box.height);
  return Math.min(...candidates);
}

export interface LookOptions {
  /** Margin in scene units around the target's union box. Default 0. */
  r?: number;
  /** Longest side cap in px; default the 512x384 caps. */
  maxPx?: number;
  /** Compute `marks` (each id's box centre, in the crop's own pixel space). */
  marks?: boolean;
}

export interface LookResult {
  /** The padded crop, in scene coordinates. */
  bbox: Box;
  /** `Math.round(bbox.<side> * scale)` is `<=` the pixel cap on every side. */
  scale: number;
  /** Each id's box centre mapped to the crop's pixel space: `(centre - bbox
   * origin) * scale`. Empty unless `opts.marks`. */
  marks: Record<string, Point>;
}

/** The crop bbox, scale and marks for `ids`' rendered `boxes`. Pure: pairs with
 * `BackendAdapter.render(scene, bbox)` (or `render(scene, ids)` first, to get
 * `boxes`) in the backend, which is the part that touches the sidecar. */
export function look(
  boxes: Record<string, Box>,
  ids: readonly string[],
  opts: LookOptions = {},
): LookResult {
  const bbox = pad(targetBox(boxes, ids), opts.r ?? 0);
  const scale = clampScale(bbox, opts.maxPx);
  const marks: Record<string, Point> = {};
  if (opts.marks) {
    for (const id of ids) {
      const b = boxes[id];
      if (!b) continue;
      marks[id] = {
        x: (b.x + b.width / 2 - bbox.x) * scale,
        y: (b.y + b.height / 2 - bbox.y) * scale,
      };
    }
  }
  return { bbox, scale, marks };
}

// Re-exported so `look.test.ts` and `@elkdraw/core/engine` type against the
// same `Box`/`Id` without a second import path.
export type { Box, Id, Point };
