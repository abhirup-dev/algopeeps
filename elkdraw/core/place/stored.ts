// Stored element -> skeleton, so an upsert or a place op on an existing id
// patches it instead of replacing it (task 1.15). The converter fills every
// field a skeleton leaves out with Excalidraw's defaults; merging the given
// fields over the stored ones first keeps size, style, label and customData.
//
// Every value is checked against the skeleton schema key by key, so a wire
// field the skeleton cannot express is left out, never leaked into convert.
import type { z } from "zod";
import type { Element } from "../src/contracts/index.ts";
import { SkeletonElement } from "../skeleton/schema.ts";

const LABEL_KEYS = [
  "fontSize",
  "fontFamily",
  "textAlign",
  "verticalAlign",
  "strokeColor",
] as const;

const endOf = (binding: unknown, live: ReadonlyMap<string, Element>) => {
  const id =
    typeof binding === "object" && binding !== null && "elementId" in binding
      ? binding.elementId
      : undefined;
  return typeof id === "string" && live.has(id) ? { id } : undefined;
};

/** The skeleton that would redraw `el` as stored; undefined if its type has
 * no skeleton. `scene` supplies its label, bound ends and frame children. */
export function fromStored(
  el: Element,
  scene: readonly Element[],
): SkeletonElement | undefined {
  const schema = SkeletonElement.options.find(
    (o) => o.shape.type.value === el.type,
  );
  if (!schema) return undefined;
  const live = new Map(
    scene.filter((e) => e["isDeleted"] !== true).map((e) => [e.id, e]),
  );
  const shape: Record<string, z.ZodType> = schema.shape;
  const linear = el.type === "arrow" || el.type === "line";
  const start = linear ? endOf(el["startBinding"], live) : undefined;
  const end = linear ? endOf(el["endBinding"], live) : undefined;
  const skip = new Set(["label", "start", "end", "children", "allow"]);
  // Linear boxes come from points; text boxes from measuring, unless fixed.
  if (linear || (el.type === "text" && el["autoResize"] !== false))
    skip.add("width").add("height");
  // ponytail: a bound arrow is redrawn between its ends by the converter's
  // router, so its stored points are dropped (waypoints too). Keep them once
  // the router re-routes waypoints (task 1.16).
  if (start || end) skip.add("points");
  const frameId = el["frameId"];
  if (typeof frameId === "string" && !live.has(frameId)) skip.add("frameId");

  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(shape)) {
    if (skip.has(key)) continue;
    const value = key === "text" ? (el["originalText"] ?? el["text"]) : el[key];
    if (value !== undefined && field.safeParse(value).success) out[key] = value;
  }
  if (start) out["start"] = start;
  if (end) out["end"] = end;
  const text = [...live.values()].find(
    (e) => e["containerId"] === el.id && e.type === "text",
  );
  const labelField = shape["label"];
  if (text && labelField) {
    const label: Record<string, unknown> = {
      text: text["originalText"] ?? text["text"],
    };
    for (const k of LABEL_KEYS) if (text[k] !== undefined) label[k] = text[k];
    if (labelField.safeParse(label).success) out["label"] = label;
  }
  // Labels follow their container and bound arrows follow their ends into
  // (or out of) a frame, so neither is listed as a child.
  if (el.type === "frame")
    out["children"] = [...live.values()]
      .filter((e) => e["frameId"] === el.id && !framedByOthers(e))
      .map((e) => e.id);
  const parsed = SkeletonElement.safeParse(out);
  return parsed.success ? parsed.data : undefined;
}

const bound = (b: unknown) => typeof b === "object" && b !== null;
const framedByOthers = (e: Element) =>
  (e.type === "text" && typeof e["containerId"] === "string") ||
  ((e.type === "arrow" || e.type === "line") &&
    (bound(e["startBinding"]) || bound(e["endBinding"])));

/** `given` over the stored `el`: given fields win, a given label merges one
 * level deep, and a type change replaces the element. */
export function mergeStored(
  given: SkeletonElement,
  el: Element,
  scene: readonly Element[],
): SkeletonElement {
  const stored = el.type === given.type ? fromStored(el, scene) : undefined;
  if (!stored) return given;
  const storedLabel = "label" in stored ? stored.label : undefined;
  const givenLabel = "label" in given ? given.label : undefined;
  const merged = SkeletonElement.safeParse({
    ...stored,
    ...given,
    ...(storedLabel && givenLabel
      ? { label: { ...storedLabel, ...givenLabel } }
      : {}),
  });
  return merged.success ? merged.data : given;
}
