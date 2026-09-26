// ?headless=1: the canvas without the sync client, for the sidecar
// (`sidecar/`). It exposes `window.elkdraw` (HeadlessApi): measure rendered
// boxes, measure text in Excalidraw's own font metrics, snap PNG crops. Boxes
// come from pixels Excalidraw drew, not from stored x/y/width/height.
import {
  convertToExcalidrawElements,
  Excalidraw,
  FONT_FAMILY,
  exportToCanvas as untypedExportToCanvas,
  getCommonBounds,
  restoreElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  Box,
  Element,
  MeasureRequest,
  Size,
  SkeletonElement,
} from "@elkdraw/core";
import { createElement } from "react";
import type { SceneElement } from "./excalidraw.ts";

export function isHeadless(search: string): boolean {
  return new URLSearchParams(search).get("headless") === "1";
}

export interface HeadlessApi {
  /** The live editor, for tests that compare against its canvas. */
  api: ExcalidrawImperativeAPI;
  /** Loads `elements` as the scene (what snap draws) and returns where each
   * non-deleted one drew, by id. */
  measure(elements: readonly Element[]): Promise<Record<string, Box>>;
  /** Excalidraw's own wrap + metrics; one size per request, in order. */
  measureText(requests: readonly MeasureRequest[]): Promise<Size[]>;
  /** PNG data URL of `bbox` (scene units) at `scale`, background included.
   * `ids` limits drawing to those elements and their bound text. */
  snap(bbox: Box, scale: number, ids?: readonly string[]): Promise<string>;
  /** Skeletons -> wire elements (convertToExcalidrawElements, ids kept).
   * Arrow ends naming a `scene` element outside the batch bind to it; that
   * element comes back too, with the arrow added to its boundElements. */
  convert(
    skeletons: readonly SkeletonElement[],
    scene: readonly Element[],
  ): Promise<Element[]>;
}

declare global {
  interface Window {
    elkdraw?: HeadlessApi;
  }
}

export function Headless() {
  return createElement(Excalidraw, {
    excalidrawAPI: (api) => {
      window.elkdraw = headlessApi(api);
    },
  });
}

// The declared type of exportToCanvas does not resolve under type-aware lint
// (tsc is fine); this is the part of its signature used here.
const exportToCanvas = untypedExportToCanvas as unknown as (opts: {
  elements: readonly SceneElement[];
  appState: { exportBackground: boolean };
  files: null;
  exportPadding: number;
  getDimensions: (
    width: number,
    height: number,
  ) => { width: number; height: number; scale: number };
}) => Promise<HTMLCanvasElement>;

// Room around an element for ink outside its bounds (overflowing text, rough
// strokes). ponytail: ink beyond PAD is clipped; grow on edge hits if it bites.
const PAD = 100;
// Export at 2x: boxes come out to the half pixel.
const INK_SCALE = 2;
// Anti-aliasing fringe below this alpha is not ink.
const MIN_ALPHA = 32;
const BACKGROUND = "#ffffff";
// Excalidraw's (not exported): gap between bound text and its container.
const BOUND_TEXT_PADDING = 5;

function headlessApi(api: ExcalidrawImperativeAPI): HeadlessApi {
  let scene: SceneElement[] = [];
  return {
    api,
    async measure(elements) {
      scene = await refreshed(elements);
      api.updateScene({ elements: scene });
      const boxes: Record<string, Box> = {};
      for (const el of scene) boxes[el.id] = await inkBox(el, scene);
      return boxes;
    },
    async measureText(requests) {
      const sizes: Size[] = [];
      for (const req of requests) sizes.push(await textSize(req));
      return sizes;
    },
    async snap(bbox, scale, ids) {
      const keep = ids && new Set(ids);
      const els = keep
        ? scene.filter(
            (el) =>
              keep.has(el.id) ||
              (el.type === "text" &&
                el.containerId !== null &&
                keep.has(el.containerId)),
          )
        : scene;
      const out = document.createElement("canvas");
      out.width = Math.round(bbox.width * scale);
      out.height = Math.round(bbox.height * scale);
      const ctx = context(out);
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, out.width, out.height);
      if (els.length) {
        const src = await exportToCanvas({
          elements: els,
          appState: { exportBackground: false },
          files: null,
          exportPadding: 0,
          getDimensions: (w: number, h: number) => ({
            width: w * scale,
            height: h * scale,
            scale,
          }),
        });
        const [minX, minY] = getCommonBounds(roots(els));
        ctx.drawImage(src, (minX - bbox.x) * scale, (minY - bbox.y) * scale);
      }
      return out.toDataURL("image/png");
    },
    convert,
  };
}

const BINDABLE = new Set(["rectangle", "ellipse", "diamond", "text"]);
// Excalidraw's defaults for text and labels without their own font.
const DEFAULT_FONT = FONT_FAMILY.Excalifont;
const DEFAULT_FONT_SIZE = 20;

async function convert(
  skeletons: readonly SkeletonElement[],
  scene: readonly Element[],
): Promise<Element[]> {
  // Labels are sized with canvas text metrics: load their faces first.
  for (const s of skeletons) {
    const t = s.type === "text" ? s : "label" in s ? s.label : undefined;
    if (t)
      await loadFont(
        t.fontFamily ?? DEFAULT_FONT,
        t.fontSize ?? DEFAULT_FONT_SIZE,
        t.text,
      );
  }
  // convertToExcalidrawElements binds only within its batch: pass the scene
  // elements an arrow names as bare bindable skeletons, then merge the new
  // binding back into the stored element.
  const batch = new Set(skeletons.map((s) => s.id));
  const stored = new Map(scene.map((e) => [e.id, e]));
  const anchors = new Map<string, Element>();
  for (const s of skeletons) {
    if (s.type !== "arrow" && s.type !== "line") continue;
    for (const end of [s.start, s.end]) {
      const e = end && !batch.has(end.id) ? stored.get(end.id) : undefined;
      if (e && BINDABLE.has(e.type) && e["isDeleted"] !== true)
        anchors.set(e.id, e);
    }
  }
  const input = [...skeletons, ...anchors.values()];
  // Unchecked cast: SkeletonElement is our strict subset of Excalidraw's
  // skeleton, and anchors are stored Excalidraw elements.
  const out = convertToExcalidrawElements(
    input as unknown as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false },
  );
  const merged = out.map((el): Element => {
    const prev = anchors.get(el.id);
    if (!prev) return { ...el };
    const had = Array.isArray(prev["boundElements"])
      ? (prev["boundElements"] as { id: string; type: string }[])
      : [];
    const ids = new Set(had.map((b) => b.id));
    const added = (el.boundElements ?? []).filter((b) => !ids.has(b.id));
    return { ...prev, boundElements: [...had, ...added] };
  });
  const byId = new Map(merged.map((e) => [e.id, e]));
  return merged.map((e) => route(e, byId));
}

// Gap between an arrow end and the outline it binds to.
const BIND_GAP = 4;

interface Shape {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const shapeOf = (e: Element | undefined): Shape | undefined => {
  if (!e) return undefined;
  const { x, y, width, height } = e;
  return typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number"
    ? { type: e.type, x, y, width, height }
    : undefined;
};

/** Distance from `s`'s centre to its outline along the unit vector (ux, uy). */
function reach(s: Shape, ux: number, uy: number): number {
  const [a, b] = [s.width / 2, s.height / 2];
  if (a === 0 || b === 0) return 0;
  if (s.type === "ellipse") return 1 / Math.hypot(ux / a, uy / b);
  if (s.type === "diamond") return 1 / (Math.abs(ux) / a + Math.abs(uy) / b);
  return Math.min(
    ux === 0 ? Infinity : a / Math.abs(ux),
    uy === 0 ? Infinity : b / Math.abs(uy),
  );
}

const bindingId = (v: unknown): string | undefined =>
  typeof v === "object" && v !== null && "elementId" in v
    ? String(v.elementId)
    : undefined;

/** convertToExcalidrawElements binds arrows but leaves them where the
 * skeleton put them (usually 0,0): draw each bound two-point arrow straight
 * between the outlines of what it binds, as the editor does once they move.
 * ponytail: straight lines only; arrows with waypoints are left as given. */
function route(e: Element, byId: ReadonlyMap<string, Element>): Element {
  if (e.type !== "arrow" && e.type !== "line") return e;
  const points = e["points"];
  const { x, y } = e;
  if (!Array.isArray(points) || points.length !== 2) return e;
  if (typeof x !== "number" || typeof y !== "number") return e;
  const startId = bindingId(e["startBinding"]);
  const endId = bindingId(e["endBinding"]);
  const from = shapeOf(startId === undefined ? undefined : byId.get(startId));
  const to = shapeOf(endId === undefined ? undefined : byId.get(endId));
  if (!from && !to) return e;
  const last = points[1] as [number, number];
  const centre = (sh: Shape) => ({
    x: sh.x + sh.width / 2,
    y: sh.y + sh.height / 2,
  });
  const s0 = from ? centre(from) : { x, y };
  const s1 = to ? centre(to) : { x: x + last[0], y: y + last[1] };
  const len = Math.hypot(s1.x - s0.x, s1.y - s0.y);
  if (len === 0) return e;
  const ux = (s1.x - s0.x) / len;
  const uy = (s1.y - s0.y) / len;
  const t0 = from ? reach(from, ux, uy) + BIND_GAP : 0;
  const t1 = to ? reach(to, ux, uy) + BIND_GAP : 0;
  const x0 = s0.x + ux * t0;
  const y0 = s0.y + uy * t0;
  const dx = s1.x - ux * t1 - x0;
  const dy = s1.y - uy * t1 - y0;
  const bind = (b: unknown) =>
    typeof b === "object" && b !== null ? { ...b, focus: 0, gap: BIND_GAP } : b;
  return {
    ...e,
    x: x0,
    y: y0,
    points: [
      [0, 0],
      [dx, dy],
    ],
    width: Math.abs(dx),
    height: Math.abs(dy),
    startBinding: bind(e["startBinding"]),
    endBinding: bind(e["endBinding"]),
  };
}

/** Elements not clipped by a frame in the list: what export sizes itself on. */
function roots(els: readonly SceneElement[]): SceneElement[] {
  const frames = new Set(els.map((el) => el.id));
  return els.filter((el) => !el.frameId || !frames.has(el.frameId));
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("elkdraw headless: no 2d context");
  return ctx;
}

/** Where `el` drew, alone on a transparent canvas; its geometric bounds if it
 * drew nothing. Its bound text and container come along at opacity 0:
 * invisible, but an arrow label is placed on its arrow and masks its line. */
async function inkBox(
  el: SceneElement,
  scene: readonly SceneElement[],
): Promise<Box> {
  const alone = { ...el, frameId: null };
  // The editor masks the label box grown by BOUND_TEXT_PADDING; export masks
  // the bare box. Grow it here so export erases what the editor erases.
  const grow = el.type === "arrow" ? BOUND_TEXT_PADDING : 0;
  const container = el.type === "text" ? el.containerId : null;
  const labels = scene
    .filter(
      (t) =>
        t.id === container || (t.type === "text" && t.containerId === el.id),
    )
    .map((t) => ({
      ...t,
      frameId: null,
      opacity: 0,
      x: t.x - grow,
      y: t.y - grow,
      width: t.width + 2 * grow,
      height: t.height + 2 * grow,
    }));
  // Invisible corners at whole units PAD out: export's origin is then an
  // integer, so pixels line up with the editor's at integer scroll.
  const [bx0, by0, bx1, by1] = getCommonBounds([alone, ...labels]);
  const [minX, minY] = [Math.floor(bx0) - PAD, Math.floor(by0) - PAD];
  const corners = restoreElements(
    [
      { x: minX, y: minY },
      { x: Math.ceil(bx1) + PAD, y: Math.ceil(by1) + PAD },
    ].map((at, i) => ({
      ...at,
      id: `elkdraw-corner-${String(i)}`,
      type: "rectangle",
      // 1x1: restore drops invisibly small (0x0) elements.
      width: 1,
      height: 1,
      opacity: 0,
    })) as unknown as Parameters<typeof restoreElements>[0],
    null,
  );
  const canvas = await exportToCanvas({
    elements: [alone, ...labels, ...corners],
    appState: { exportBackground: false },
    files: null,
    exportPadding: 0,
    getDimensions: (w: number, h: number) => ({
      width: w * INK_SCALE,
      height: h * INK_SCALE,
      scale: INK_SCALE,
    }),
  });
  const { width, height } = canvas;
  const { data } = context(canvas).getImageData(0, 0, width, height);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < MIN_ALPHA) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) {
    const [x, y, maxX, maxY] = getCommonBounds([alone]);
    return { x, y, width: maxX - x, height: maxY - y };
  }
  return {
    x: minX + x0 / INK_SCALE,
    y: minY + y0 / INK_SCALE,
    width: (x1 + 1 - x0) / INK_SCALE,
    height: (y1 + 1 - y0) / INK_SCALE,
  };
}

// ponytail: loads the named face only; CJK/emoji fallbacks (Xiaolai) measure unloaded.
async function loadFont(fontFamily: number, fontSize: number, text: string) {
  const name = FONT_NAME.get(fontFamily);
  if (name) await document.fonts.load(`${String(fontSize)}px "${name}"`, text);
}

/** Wire elements as the editor shows them once a text is touched: fonts
 * loaded, then every text re-wrapped to its container and re-sized in real
 * metrics (a "12" in a 44 px circle breaks onto two lines). The app's toScene
 * skips the refresh, so stored sizes can disagree with this. */
async function refreshed(
  elements: readonly Element[],
): Promise<SceneElement[]> {
  for (const el of elements) {
    const { fontFamily, fontSize, text } = el;
    if (el.type === "text" && typeof fontFamily === "number") {
      await loadFont(
        fontFamily,
        typeof fontSize === "number" ? fontSize : 20,
        typeof text === "string" ? text : "",
      );
    }
  }
  // Unchecked cast, as in toScene: restoreElements re-validates each field.
  const input = elements as unknown as Parameters<typeof restoreElements>[0];
  return restoreElements(input, null, {
    repairBindings: true,
    refreshDimensions: true,
  }).filter((el) => !el.isDeleted);
}

/** `fontFamily` is an Excalidraw font name (`Excalifont`, `Virgil`, ...) or its
 * numeric id. */
function fontId(fontFamily: string): number {
  const byName = (FONT_FAMILY as Record<string, number | undefined>)[
    fontFamily
  ];
  const id = byName ?? Number(fontFamily);
  if (!Object.values(FONT_FAMILY).includes(id)) {
    throw new Error(`elkdraw headless: unknown font ${fontFamily}`);
  }
  return id;
}

const FONT_NAME = new Map(
  Object.entries(FONT_FAMILY).map(([name, id]) => [id, name]),
);

/** Size Excalidraw gives the text: wrapped at `wrapWidth` by its wrapText,
 * measured by its canvas metrics once the font has loaded. */
async function textSize(req: MeasureRequest): Promise<Size> {
  const fontFamily = fontId(req.fontFamily);
  await loadFont(fontFamily, req.fontSize, req.text);
  const text = (value: string, wrapWidth?: number) => {
    const draft = {
      id: "measure",
      type: "text",
      x: 0,
      y: 0,
      text: value,
      originalText: value,
      fontFamily,
      fontSize: req.fontSize,
      autoResize: wrapWidth === undefined,
      // Width 1, not 0: restore drops 0x0 elements. Height 0: restore then
      // takes the font's default line height instead of deriving one.
      width: wrapWidth ?? 1,
      height: 0,
    };
    // Unchecked cast, as in toScene: restoreElements fills and repairs the rest.
    const input = [draft] as unknown as Parameters<typeof restoreElements>[0];
    const [el] = restoreElements(input, null, {
      repairBindings: true,
      refreshDimensions: true,
    });
    if (el?.type !== "text")
      throw new Error("elkdraw headless: text restore failed");
    return el;
  };
  // Pass 1 wraps at the fixed width; pass 2 sizes the wrapped lines.
  const wrapped =
    req.wrapWidth === undefined ? req.text : text(req.text, req.wrapWidth).text;
  const el = text(wrapped);
  // Excalidraw's text height: lines x font size x line height.
  const lines = el.text.split("\n").length;
  return { width: el.width, height: lines * el.fontSize * el.lineHeight };
}
