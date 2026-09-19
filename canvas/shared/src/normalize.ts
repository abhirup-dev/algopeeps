// Vendored from yctimlin/mcp_excalidraw (MIT), adapted.
// Dropped: file-path sanitiser, config/logger imports, prepareElementUpdate
// (our contract has no element-update tool — updates go through canvas_draw).
import type { AgentElement, Element } from "./types.js";
import { newId } from "./ids.js";

export function normalizePoints(
  points: NonNullable<AgentElement["points"]>,
): [number, number][] {
  return points.map((p) =>
    Array.isArray(p) ? (p as [number, number]) : [p.x, p.y],
  );
}

// text → bound label for non-text shapes; standalone text keeps its text.
export function convertTextToLabel(element: Element): Element {
  const { text, ...rest } = element;
  if (text && element.type !== "text") {
    return { ...rest, label: { text } };
  }
  return element;
}

// Vendored from yctimlin/mcp_excalidraw (MIT), adapted: fontFamily map.
export function normalizeFontFamily(
  fontFamily: string | number | undefined,
): number | undefined {
  if (fontFamily === undefined) return undefined;
  if (typeof fontFamily === "number") return fontFamily;
  const map: Record<string, number> = {
    virgil: 1,
    hand: 1,
    handwritten: 1,
    helvetica: 2,
    sans: 2,
    "sans-serif": 2,
    cascadia: 3,
    mono: 3,
    monospace: 3,
    excalifont: 5,
    nunito: 6,
    lilita: 7,
    "lilita one": 7,
    comic: 8,
    "comic shanns": 8,
    "1": 1,
    "2": 2,
    "3": 3,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
  };
  return map[fontFamily.toLowerCase()];
}

// Shared element preparation: id generation, arrow binding conversion,
// fontFamily normalisation, default points for bound arrows, timestamps,
// and text→label conversion. Everything the server does to a canvas_draw
// payload before storing it.
export function prepareElement(input: AgentElement): Element {
  const { startElementId, endElementId, id: customId, ...elementProps } = input;
  const element: Element = {
    ...elementProps,
    id: customId ?? newId(),
    ...(elementProps.points
      ? { points: normalizePoints(elementProps.points) }
      : {}),
    ...(startElementId ? { start: { id: startElementId } } : {}),
    ...(endElementId ? { end: { id: endElementId } } : {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  } as Element;

  if (element.fontFamily !== undefined) {
    element.fontFamily = normalizeFontFamily(
      element.fontFamily as string | number,
    );
  }

  // Bound arrows without explicit points get a default; the app auto-routes.
  if ((startElementId || endElementId) && !element.points) {
    element.points = [
      [0, 0],
      [100, 0],
    ];
  }

  return convertTextToLabel(element);
}
