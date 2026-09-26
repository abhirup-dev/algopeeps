// The fake backend (design §13.1): the second BackendAdapter, in memory, so
// core stays neutral. Its scene is a NeutralScene, so `read` is a validated
// copy. It takes the branches Excalidraw never does: zones nest to any depth
// and lines are never bound.
import { NeutralScene } from "@elkdraw/core";
import type {
  BackendAdapter,
  Box,
  Capabilities,
  LaidGraph,
  LaidLabel,
  LaidNode,
  MeasureRequest,
  Point,
  RenderResult,
  SceneElement,
  Size,
  TextBox,
} from "@elkdraw/core";

export type FakeScene = NeutralScene;

export const capabilities: Capabilities = {
  nesting: "deep",
  bindings: "none",
  opaqueMeta: true,
  edgeLabels: "bound",
  readBack: true,
  shapes: ["rect"],
  freeform: false,
};

/** Fixed metrics, as fractions of the font size. */
const CHAR_WIDTH = 0.6;
const LINE_HEIGHT = 1.25;

function measureOne(req: MeasureRequest): Size {
  const charWidth = req.fontSize * CHAR_WIDTH;
  const perLine =
    req.wrapWidth === undefined
      ? Infinity
      : Math.max(1, Math.floor(req.wrapWidth / charWidth));
  const lines = req.text.split("\n").flatMap((line) => {
    if (line.length <= perLine) return [line.length];
    const chunks: number[] = [];
    for (let i = 0; i < line.length; i += perLine)
      chunks.push(Math.min(perLine, line.length - i));
    return chunks;
  });
  return {
    width: Math.max(...lines) * charWidth,
    height: lines.length * req.fontSize * LINE_HEIGHT,
  };
}

function labelText(
  labels: readonly LaidLabel[] | undefined,
  at: Point,
): TextBox | undefined {
  const label = labels?.[0];
  if (label === undefined) return undefined;
  return {
    text: label.text,
    box: {
      x: at.x + label.x,
      y: at.y + label.y,
      width: label.width,
      height: label.height,
    },
  };
}

function emit(graph: LaidGraph): FakeScene {
  const elements: SceneElement[] = [];
  const origin = new Map<string, Point>([
    [graph.id, { x: graph.x, y: graph.y }],
  ]);

  // Children are relative to their parent (§14.2); the root is not drawn.
  const walkNodes = (parent: LaidNode, zone: string | undefined): void => {
    const at = origin.get(parent.id) ?? { x: 0, y: 0 };
    for (const node of parent.children ?? []) {
      const abs = { x: at.x + node.x, y: at.y + node.y };
      origin.set(node.id, abs);
      const text = labelText(node.labels, abs);
      const box: Box = { ...abs, width: node.width, height: node.height };
      const isZone = (node.children?.length ?? 0) > 0;
      elements.push({
        type: isZone ? "zone" : "box",
        id: node.id,
        box,
        meta: node.meta,
        ...(zone === undefined ? {} : { zone }),
        ...(node.meta.style === undefined ? {} : { style: node.meta.style }),
        ...(isZone || node.meta.shape === undefined
          ? {}
          : { shape: node.meta.shape }),
        ...(text === undefined ? {} : { text }),
      });
      walkNodes(node, isZone ? node.id : zone);
    }
  };

  // Sections are relative to `container`, else to the node owning the edge.
  const walkEdges = (owner: LaidNode): void => {
    for (const edge of owner.edges ?? []) {
      const at = origin.get(edge.container ?? owner.id) ?? { x: 0, y: 0 };
      const shift = (p: Point): Point => ({ x: at.x + p.x, y: at.y + p.y });
      const points = edge.sections.flatMap((s) =>
        [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(shift),
      );
      if (points.length < 2) continue;
      const text = labelText(edge.labels, at);
      elements.push({
        type: "line",
        id: edge.id,
        points,
        meta: edge.meta,
        ...(edge.meta.style === undefined ? {} : { style: edge.meta.style }),
        ...(text === undefined ? {} : { text }),
      });
    }
    for (const child of owner.children ?? []) walkEdges(child);
  };

  walkNodes(graph, undefined);
  walkEdges(graph);
  return { elements };
}

function boxOf(el: SceneElement): Box | undefined {
  return el.type === "line" || el.type === "text" ? el.text?.box : el.box;
}

export const fakeBackend: BackendAdapter<FakeScene> = {
  id: "fake",
  capabilities,
  // ponytail: `prev` is ignored; merge decisions reach emit in phase 2.
  emit: (graph) => emit(graph),
  read: (scene) => NeutralScene.parse(structuredClone(scene)),
  measure: (texts) => Promise.resolve(texts.map(measureOne)),
  // A stub: no pixels, only where each requested id drew.
  render: (scene, target): Promise<RenderResult> => {
    const ids = new Set(Array.isArray(target) ? target : []);
    const boxes: Record<string, Box> = {};
    for (const el of scene.elements) {
      const box = boxOf(el);
      if (box !== undefined && ids.has(el.id)) boxes[el.id] = box;
    }
    return Promise.resolve({ png: new Uint8Array(), boxes });
  },
  serialise: (scene) => JSON.stringify(scene, null, 2),
};
