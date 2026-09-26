// The one boundary between wire elements and Excalidraw's element types.
import { restoreElements } from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Element } from "./protocol.ts";

export type SceneElement = OrderedExcalidrawElement;

/** Wire elements -> scene elements. The protocol only checks id/type/version,
 * so restoreElements fills defaults and repairs whatever else is off. */
export function toScene(elements: readonly Element[]): SceneElement[] {
  // Unchecked cast is safe only because restoreElements re-validates each field.
  const imported = elements as unknown as Parameters<typeof restoreElements>[0];
  return restoreElements(imported, null, { repairBindings: true });
}

export function toWire(elements: readonly SceneElement[]): Element[] {
  return [...elements];
}
