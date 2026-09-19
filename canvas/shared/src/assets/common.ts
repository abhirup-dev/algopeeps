// Shared helpers for asset generators (contract §6).
import { newId } from "../ids.js";
import { AGENT_COLOR } from "../owner.js";
import type { AgentElement, Owner } from "../types.js";

export const CELL = 56; // standard cell size
export const FONT = 20; // asset font size

/** Params every generator takes. */
export interface AssetBase {
  name: string;
  x: number;
  y: number;
  owner?: Owner;
}

// Validate the params every kind shares; returns them typed.
export function base(
  p: { name?: unknown; x?: unknown; y?: unknown; owner?: unknown },
  kind: string,
): AssetBase {
  if (typeof p.name !== "string" || !p.name.trim()) {
    throw new Error(`${kind}: name must be a non-empty string`);
  }
  if (typeof p.x !== "number" || !Number.isFinite(p.x))
    throw new Error(`${kind}: x must be a number`);
  if (typeof p.y !== "number" || !Number.isFinite(p.y))
    throw new Error(`${kind}: y must be a number`);
  if (p.owner !== undefined && p.owner !== "agent" && p.owner !== "human") {
    throw new Error(`${kind}: owner must be "agent" or "human"`);
  }
  return { name: p.name, x: p.x, y: p.y, owner: p.owner ?? "agent" };
}

export function shape(
  type: "rectangle" | "ellipse" | "diamond",
  x: number,
  y: number,
  w: number,
  h: number,
  text?: string,
  bg?: string,
): AgentElement {
  const el: AgentElement = {
    id: newId(),
    type,
    x,
    y,
    width: w,
    height: h,
    fillStyle: "solid",
    fontSize: FONT,
  };
  if (text !== undefined) el.text = text;
  if (bg) el.backgroundColor = bg;
  return el;
}

export function textEl(x: number, y: number, text: string): AgentElement {
  return {
    id: newId(),
    type: "text",
    x,
    y,
    width: Math.max(20, text.length * 11),
    height: 25,
    text,
    fontSize: FONT,
  };
}

// Bound arrow between two element ids; (x, y) is its nominal start, the app
// auto-routes to element edges on conversion.
export function arrowBetween(
  fromId: string,
  toId: string,
  x: number,
  y: number,
): AgentElement {
  return {
    id: newId(),
    type: "arrow",
    x,
    y,
    startElementId: fromId,
    endElementId: toId,
    strokeWidth: 2,
  };
}

// Stamp group + asset customData (+ agent ownership) on every member.
export function finalize(
  kind: string,
  name: string,
  owner: Owner,
  elements: AgentElement[],
): { elements: AgentElement[]; groupId: string } {
  const groupId = newId();
  for (const el of elements) {
    el.groupIds = [...(el.groupIds ?? []), groupId];
    const cd: Record<string, unknown> = {
      ...(el.customData ?? {}),
      asset: { kind, name },
    };
    if (owner === "agent") {
      el.strokeColor = AGENT_COLOR;
      cd.owner = "agent";
      cd.kind = "asset";
    }
    el.customData = cd;
  }
  return { elements, groupId };
}
