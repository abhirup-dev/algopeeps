// The `render` half of `BackendAdapter<ExcalidrawScene>` (design §13,
// `core/src/contracts/backend.ts`): thin — the sidecar does the work
// (`measure` sets the scene and where things drew; `snap` crops it to a PNG).
// Padding by a margin and clamping the output to a pixel cap is core/look's
// job (`@elkdraw/core/engine`, pure); this file only calls it and the sidecar.
import { clampScale, targetBox } from "@elkdraw/core/engine";
import type { Box, Element, RenderResult } from "@elkdraw/core";
import type { ExcalidrawScene } from "../read/read.ts";

/** The `Sidecar` methods `render` needs (`sidecar/src/index.ts`), narrowed so
 * a test can fake them with no browser. */
export interface RenderDeps {
  measure(elements: readonly Element[]): Promise<Record<string, Box>>;
  snap(bbox: Box, scale: number): Promise<Uint8Array>;
}

/** `Element` (the sync-protocol wire shape: id/type/version, rest passes
 * through) is what the sidecar validates against; `ExcalidrawScene`'s
 * elements satisfy it structurally (same pattern as `app/src/excalidraw.ts`
 * `toWire`, which this package cannot import). */
function toWire(elements: ExcalidrawScene["elements"]): Element[] {
  return [...elements];
}

// A plain `Array.isArray(target)` guard on a `readonly string[] | Box` union
// leaves `Box & unknown[]` in the narrowed type (Box has no index signature
// ruling out "also an array"); an explicit predicate sidesteps that.
function isIds(target: readonly string[] | Box): target is readonly string[] {
  return Array.isArray(target);
}

/** `target` is either ids (a tight crop of their union, ids drawn among the
 * rest of the scene so what they collide with still shows) or an already
 * computed scene-coordinate box (e.g. `core/look`'s padded crop). Either way
 * the output is clamped to `core/look`'s pixel caps: `render` alone cannot
 * take `r`/`maxPx` (the interface has neither), so a caller wanting a margin
 * pads the box itself before passing it as `target` (`@elkdraw/core/engine`
 * `pad`). `boxes` on the result holds every requested id's box, in scene
 * coordinates; empty when `target` was already a box. */
export async function render(
  deps: RenderDeps,
  scene: ExcalidrawScene,
  target: readonly string[] | Box,
): Promise<RenderResult> {
  const boxes = await deps.measure(toWire(scene.elements));
  const bbox = isIds(target) ? targetBox(boxes, target) : target;
  const scale = clampScale(bbox);
  const png = await deps.snap(bbox, scale);
  const requested: Record<string, Box> = {};
  if (isIds(target)) {
    for (const id of target) {
      const box = boxes[id];
      if (box) requested[id] = box;
    }
  }
  return { png, boxes: requested };
}
