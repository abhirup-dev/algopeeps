import type { AgentKind, Element, Owner } from "./types.js";

export const AGENT_COLOR = "#9c36b5";

export function ownerOf(el: { customData?: { owner?: unknown } }): Owner {
  return el.customData?.owner === "agent" ? "agent" : "human";
}

/**
 * Stamp ownership per contract §2: owner "agent", purple stroke. Mutates and
 * returns the element. Ownership is decided at creation and never changes;
 * nothing is locked (v1.2 — ownership is provenance, not a lock).
 */
export function stampAgent(
  el: Element,
  kind: AgentKind = "free",
  ref?: string,
): Element {
  el.strokeColor = AGENT_COLOR;
  el.locked = false;
  el.customData = {
    ...el.customData,
    owner: "agent",
    kind,
    ...(ref !== undefined ? { ref } : {}),
  };
  return el;
}
