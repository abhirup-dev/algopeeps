import type { CompactElement, Element } from "./types.js";
import { ownerOf } from "./owner.js";

const round = (n: unknown): number => Math.round(Number(n) || 0);

/**
 * Contract §5: what the model reads. `byId` (optional map of the whole
 * scene) resolves bound labels — the label element whose containerId is
 * this element's id.
 */
export function toCompact(
  el: Element,
  rev: number,
  byId?: ReadonlyMap<string, Element>,
): CompactElement {
  const owner = ownerOf(el);
  const text =
    el.type === "text"
      ? typeof el.text === "string"
        ? el.text
        : undefined
      : (el.label?.text ?? (byId ? boundLabel(el, byId) : undefined));
  const from =
    el.type === "arrow"
      ? (el.startBinding?.elementId ?? el.start?.id)
      : undefined;
  const to =
    el.type === "arrow" ? (el.endBinding?.elementId ?? el.end?.id) : undefined;

  const c: CompactElement = {
    id: el.id,
    type: el.type,
    owner,
    x: round(el.x),
    y: round(el.y),
    w: round(el.width ?? 0),
    h: round(el.height ?? 0),
    rev,
  };
  if (text !== undefined) c.text = text;
  if (from !== undefined) c.from = from;
  if (to !== undefined) c.to = to;
  if (el.groupIds?.length) c.group = el.groupIds[0];
  if (owner === "agent") {
    if (el.customData?.kind) c.kind = el.customData.kind;
    if (el.customData?.ref) c.ref = el.customData.ref;
  }
  if (el.customData?.editedBy) c.editedBy = el.customData.editedBy;
  return c;
}

function boundLabel(
  el: Element,
  byId: ReadonlyMap<string, Element>,
): string | undefined {
  for (const other of byId.values()) {
    if (other.containerId === el.id && typeof other.text === "string")
      return other.text;
  }
  return undefined;
}
