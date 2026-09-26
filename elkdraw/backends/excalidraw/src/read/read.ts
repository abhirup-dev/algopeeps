// Excalidraw scene -> NeutralScene (design §13), from stored element data:
// boxes from x/y/width/height, lines from points, bound text folded into its
// container. Rendered geometry is the sidecar's job (task 1.3): pass its
// `measure` to replace stored text boxes with what actually drew.
import { NeutralScene } from "@elkdraw/core";
import type { Box, SceneElement, Style, TextBox } from "@elkdraw/core";
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";

/** What `read` takes: the `elements` of a `.excalidraw` file or a live scene. */
export interface ExcalidrawScene {
  elements: readonly ExcalidrawElement[];
}

/** The seam to the sidecar: rendered text boxes by text element id. Same
 * shape as `Sidecar.measure`. Ids it omits keep their stored box. */
export type MeasureText = (
  texts: { id: string; type: string; text: string }[],
) => Promise<Record<string, Box>>;

// ponytail: Excalidraw draws dashed as [8, 8 + w] and dotted as [1.5, 6 + w];
// fixed approximations here until emit (1.1) settles the inverse mapping.
const DASH: Partial<Record<ExcalidrawElement["strokeStyle"], string>> = {
  dashed: "8 8",
  dotted: "1.5 6",
};

const box = (e: ExcalidrawElement): Box => ({
  x: e.x,
  y: e.y,
  width: e.width,
  height: e.height,
});

function style(e: ExcalidrawElement, label?: ExcalidrawTextElement): Style {
  const s: Style = {
    fill: e.backgroundColor,
    stroke: e.strokeColor,
    strokeWidth: e.strokeWidth,
  };
  const dash = DASH[e.strokeStyle];
  if (dash !== undefined) s.strokeDasharray = dash;
  const text = label ?? (e.type === "text" ? e : undefined);
  if (text) {
    s.color = text.strokeColor;
    s.fontSize = text.fontSize;
  }
  return s;
}

export async function readScene(
  scene: ExcalidrawScene,
  measure?: MeasureText,
): Promise<NeutralScene> {
  const live = scene.elements.filter((e) => !e.isDeleted);
  const ids = new Set(live.map((e) => e.id));
  // Bound text whose container is gone reads as free text.
  const labels = new Map<string, ExcalidrawTextElement>();
  for (const e of live) {
    if (e.type === "text" && e.containerId && ids.has(e.containerId)) {
      labels.set(e.containerId, e);
    }
  }
  const folded = new Set([...labels.values()].map((t) => t.id));
  const texts = live.filter((e) => e.type === "text");
  const rendered = measure
    ? await measure(
        texts.map((t) => ({ id: t.id, type: t.type, text: t.text })),
      )
    : {};
  const textBox = (t: ExcalidrawTextElement): TextBox => ({
    text: t.text,
    box: rendered[t.id] ?? box(t),
  });

  const elements: SceneElement[] = [];
  for (const e of live) {
    if (folded.has(e.id)) continue;
    const label = labels.get(e.id);
    const common = {
      id: e.id,
      ...(e.frameId ? { zone: e.frameId } : {}),
      style: style(e, label),
      ...(e.customData === undefined ? {} : { meta: e.customData }),
      ...(label ? { text: textBox(label) } : {}),
    };
    switch (e.type) {
      case "text":
        elements.push({ type: "text", ...common, text: textBox(e) });
        break;
      case "arrow":
      case "line":
        elements.push({
          type: "line",
          ...common,
          points: points(e.points).map(([px = 0, py = 0]) => ({
            x: e.x + px,
            y: e.y + py,
          })),
          ...(e.startBinding ? { from: e.startBinding.elementId } : {}),
          ...(e.endBinding ? { to: e.endBinding.elementId } : {}),
        });
        break;
      case "frame":
      case "magicframe":
        // ponytail: frame names are not TextBoxes (no drawn box); add when lint needs them.
        elements.push({ type: "zone", ...common, box: box(e) });
        break;
      case "rectangle":
      case "diamond":
      case "ellipse":
      case "freedraw":
      case "image":
      case "iframe":
      case "embeddable":
      case "selection": {
        // ponytail: `angle` ignored; boxes are axis-aligned until a rule needs rotation.
        const shape = meta(e.customData)?.shape ?? e.type;
        elements.push({ type: "box", ...common, box: box(e), shape });
      }
    }
  }
  return NeutralScene.parse({ elements });
}

function meta(data: unknown): { shape?: string } | undefined {
  if (typeof data !== "object" || data === null || !("shape" in data)) return;
  return typeof data.shape === "string" ? { shape: data.shape } : undefined;
}

// LocalPoint is a branded [x, y] tuple the lint project cannot resolve
const points = (p: unknown): readonly (readonly number[])[] =>
  p as readonly (readonly number[])[];
