// ?headless=1: the canvas without the sync client, for the sidecar
// (`sidecar/`). It exposes `window.elkdraw` (HeadlessApi): measure rendered
// boxes, measure text in Excalidraw's own font metrics, snap PNG crops. Boxes
// come from pixels Excalidraw drew, not from stored x/y/width/height.
import {
  Excalidraw,
  FONT_FAMILY,
  exportToCanvas as untypedExportToCanvas,
  getCommonBounds,
  restoreElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Box, Element, MeasureRequest, Size } from "@elkdraw/core";
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
