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
        // Export sizes and positions itself from getCommonBounds of whatever
        // it draws, not from bbox. For a frame that is a root, export
        // silently grows upward to fit the frame's name label above it
        // (~20px, always on unless frameRendering.name is off) even though
        // getCommonBounds(roots(els)) does not see that label. For rough.js
        // strokes at the scene's extreme edge, export draws from the
        // *stored* geometry, not ink, so overshoot past the stored corner
        // clips (1.18). Both drift the crop's origin from the real content
        // bounds. Two invisible 1x1 corner markers (mirrors inkBox's own
        // trick), PAD clear of the real content *and* of bbox on every side,
        // make export's own bounds a known quantity: PAD (100) comfortably
        // beats both the name label's growth and any stroke overshoot, so
        // the markers -- not the label or the overshoot -- become
        // getCommonBounds' extremes.
        const [ex0, ey0, ex1, ey1] = getCommonBounds(roots(els));
        const minX = Math.floor(Math.min(ex0, bbox.x)) - PAD;
        const minY = Math.floor(Math.min(ey0, bbox.y)) - PAD;
        const maxX = Math.ceil(Math.max(ex1, bbox.x + bbox.width)) + PAD;
        const maxY = Math.ceil(Math.max(ey1, bbox.y + bbox.height)) + PAD;
        const corners = restoreElements(
          [
            { x: minX, y: minY },
            { x: maxX, y: maxY },
          ].map((at, i) => ({
            ...at,
            id: `elkdraw-snap-corner-${String(i)}`,
            type: "rectangle",
            // 1x1: restore drops invisibly small (0x0) elements.
            width: 1,
            height: 1,
            opacity: 0,
          })) as unknown as Parameters<typeof restoreElements>[0],
          null,
        );
        const src = await exportToCanvas({
          elements: [...els, ...corners],
          appState: { exportBackground: false },
          files: null,
          exportPadding: 0,
          getDimensions: (w: number, h: number) => ({
            width: w * scale,
            height: h * scale,
            scale,
          }),
        });
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

/** Two things convertToExcalidrawElements gets wrong for a requested box
 * (p1.20): (1) a free text's `newTextElement` always sizes width/height from
 * the measured text, but for `textAlign: "center"/"right"` it also treats the
 * skeleton's `x` as the anchor for that measured width, not as the left edge
 * of the requested `width` box — `{x:84, width:32, textAlign:"center"}`
 * centres on x=84 instead of the box centre (100). Left is already correct
 * (no anchor offset). Recomputed here (in `boxDelta`) from the requested box
 * and the real (measured) width; the width itself is left as measured, not
 * forced to the request, so this stays correct across a relabel (new text,
 * same box) with no extra state. (2) its frame step folds an explicit `x`/`y`
 * of 0 into "not given" (`frame.x || minX`, falsy zero) and refits the frame
 * to its children; restore an explicitly given 0 (or any explicit x/y). */
function boxDelta(
  el: { type: string; width?: number },
  s: SkeletonElement | undefined,
): { x?: number; y?: number } {
  if (
    el.type === "text" &&
    s?.type === "text" &&
    s.width !== undefined &&
    (s.textAlign === "center" || s.textAlign === "right") &&
    typeof el.width === "number"
  ) {
    return {
      x:
        s.textAlign === "center"
          ? s.x + (s.width - el.width) / 2
          : s.x + s.width - el.width,
    };
  }
  if (el.type === "frame" && s?.type === "frame") {
    const patch: { x?: number; y?: number } = {};
    if (s.x !== undefined) patch.x = s.x;
    if (s.y !== undefined) patch.y = s.y;
    return patch;
  }
  return {};
}

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
  // convertToExcalidrawElements resolves ids only within its own batch: an
  // arrow end or a frame `children` entry naming a stored element outside the
  // batch (not created in this call) is otherwise unresolvable and throws
  // ("Element with <id> wasn't mapped correctly" for a frame child). Pass
  // those stored elements in as bare skeletons too, then merge whatever field
  // the reference changed (a binding, a frameId) back onto the original, so
  // its id, version and everything else stay exactly as stored.
  const batch = new Set(skeletons.map((s) => s.id));
  const stored = new Map(scene.map((e) => [e.id, e]));
  const referenced = new Map<string, Element>();
  for (const s of skeletons) {
    if (s.type !== "arrow" && s.type !== "line") continue;
    for (const end of [s.start, s.end]) {
      const e = end && !batch.has(end.id) ? stored.get(end.id) : undefined;
      if (e && BINDABLE.has(e.type) && e["isDeleted"] !== true)
        referenced.set(e.id, e);
    }
  }
  for (const s of skeletons) {
    if (s.type !== "frame") continue;
    for (const id of s.children) {
      const e = !batch.has(id) ? stored.get(id) : undefined;
      if (e && e["isDeleted"] !== true) referenced.set(id, e);
    }
  }
  // A stored element's boundElements may name elements outside this input (its
  // label, other stored arrows); the frame step throws on those ("Bound element
  // with id <child>#label doesn't exist"). Keep only in-input ones here; the
  // merge below restores the stored list.
  const inputIds = new Set([...batch, ...referenced.keys()]);
  const bare = [...referenced.values()].map((e) =>
    Array.isArray(e["boundElements"])
      ? {
          ...e,
          boundElements: (e["boundElements"] as { id: string }[]).filter((b) =>
            inputIds.has(b.id),
          ),
        }
      : e,
  );
  const input = [...skeletons, ...bare];
  // Unchecked cast: SkeletonElement is our strict subset of Excalidraw's
  // skeleton, and referenced entries are stored Excalidraw elements.
  const out = convertToExcalidrawElements(
    input as unknown as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false },
  );
  const bySkeleton = new Map(skeletons.map((s) => [s.id, s]));
  const merged = out.map((el): Element => {
    const positioned = { ...el, ...boxDelta(el, bySkeleton.get(el.id)) };
    const prev = referenced.get(positioned.id);
    if (!prev) return { ...positioned };
    const had = Array.isArray(prev["boundElements"])
      ? (prev["boundElements"] as { id: string; type: string }[])
      : [];
    const ids = new Set(had.map((b) => b.id));
    const added = (positioned.boundElements ?? []).filter(
      (b) => !ids.has(b.id),
    );
    return {
      ...prev,
      boundElements: [...had, ...added],
      frameId: positioned.frameId,
    };
  });
  const byId = new Map(merged.map((e) => [e.id, e]));
  const routed = merged.map((e) => route(e, byId));
  // Stored arrows bound to a batch element that moved or resized follow it
  // (binding means "follow", human-drawn arrows included). They come back as
  // extra elements; apply counts them as updated.
  const moved = new Set(
    skeletons
      .map((s) => s.id)
      .filter((id) => {
        const [a, b] = [shapeOf(stored.get(id)), shapeOf(byId.get(id))];
        return (
          a !== undefined &&
          b !== undefined &&
          (a.type !== b.type ||
            a.x !== b.x ||
            a.y !== b.y ||
            a.width !== b.width ||
            a.height !== b.height)
        );
      }),
  );
  if (moved.size === 0) return framed(routed, scene);
  // The far end may be a stored element outside the batch.
  const ends = new Map([...stored, ...byId]);
  const followers = scene
    .filter(
      (e) =>
        (e.type === "arrow" || e.type === "line") &&
        !byId.has(e.id) &&
        e["isDeleted"] !== true &&
        [e["startBinding"], e["endBinding"]].some((b) => {
          const id = bindingId(b);
          return id !== undefined && moved.has(id);
        }),
    )
    .map((e) => follow(e, ends, moved));
  return framed([...routed, ...followers], scene);
}

const frameOf = (e: Element | undefined): string | null =>
  typeof e?.["frameId"] === "string" ? e["frameId"] : null;

/** Excalidraw clips a frame's children to the frame, and its converter puts
 * every arrow bound to a child into the frame, cross-zone arrows included
 * (p1rh-01). Here a bound arrow is in a frame only when both its ends are,
 * and a label is in its container's frame. Stored arrows and labels whose
 * frame changes come back too (apply counts them as updated). */
function framed(out: Element[], scene: readonly Element[]): Element[] {
  const given = new Set(out.map((e) => e.id));
  const all = new Map<string, Element>([
    ...scene
      .filter((e) => e["isDeleted"] !== true)
      .map((e): [string, Element] => [e.id, e]),
    ...out.map((e): [string, Element] => [e.id, e]),
  ]);
  const changed = new Map<string, Element>();
  const set = (e: Element, frameId: string | null) => {
    if (frameOf(e) === frameId) return;
    const next = { ...e, frameId };
    all.set(e.id, next);
    changed.set(e.id, next);
  };
  for (const e of [...all.values()]) {
    if (e.type !== "arrow" && e.type !== "line") continue;
    const [s, t] = [bindingId(e["startBinding"]), bindingId(e["endBinding"])];
    if (s === undefined && t === undefined) continue;
    if (!given.has(e.id) && !given.has(s ?? "") && !given.has(t ?? ""))
      continue;
    const [fs, ft] = [frameOf(all.get(s ?? "")), frameOf(all.get(t ?? ""))];
    set(e, s !== undefined && t !== undefined && fs === ft ? fs : null);
  }
  for (const e of [...all.values()]) {
    const c = e["containerId"];
    if (e.type !== "text" || typeof c !== "string") continue;
    if (given.has(e.id) || given.has(c) || changed.has(c))
      set(e, frameOf(all.get(c)));
  }
  return [
    ...out.map((e) => changed.get(e.id) ?? e),
    ...[...changed.values()].filter((e) => !given.has(e.id)),
  ];
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

const centre = (sh: Shape) => ({
  x: sh.x + sh.width / 2,
  y: sh.y + sh.height / 2,
});

const isPoint = (p: unknown): p is [number, number] =>
  Array.isArray(p) &&
  p.length >= 2 &&
  typeof p[0] === "number" &&
  typeof p[1] === "number";

/** A stored arrow whose bound shape (an id in `moved`) moved: a two-point
 * arrow is redrawn straight, as `route` does; an arrow with waypoints keeps
 * them and only its end on a moved shape moves, onto that shape's outline
 * along the line from the neighbouring waypoint to the shape's centre.
 * ponytail: elbow arrows lose their right angles; re-route them properly
 * (libavoid) when elbows are in use. */
function follow(
  e: Element,
  byId: ReadonlyMap<string, Element>,
  moved: ReadonlySet<string>,
): Element {
  const points = e["points"];
  const { x, y } = e;
  if (!Array.isArray(points) || !points.every(isPoint)) return e;
  if (typeof x !== "number" || typeof y !== "number") return e;
  if (points.length === 2) return route(e, byId);
  if (points.length < 2) return e;
  const abs = points.map(([px, py]) => ({ x: x + px, y: y + py }));
  const snap = (binding: unknown, i: number, j: number) => {
    const id = bindingId(binding);
    const sh =
      id !== undefined && moved.has(id) ? shapeOf(byId.get(id)) : undefined;
    const n = abs[j];
    if (!sh || !n) return;
    const c = centre(sh);
    const len = Math.hypot(c.x - n.x, c.y - n.y);
    if (len === 0) return;
    const [ux, uy] = [(c.x - n.x) / len, (c.y - n.y) / len];
    const t = reach(sh, ux, uy) + BIND_GAP;
    abs[i] = { x: c.x - ux * t, y: c.y - uy * t };
  };
  snap(e["startBinding"], 0, 1);
  snap(e["endBinding"], abs.length - 1, abs.length - 2);
  const [o = { x, y }] = abs;
  const rel = abs.map((p) => [p.x - o.x, p.y - o.y] as [number, number]);
  const xs = rel.map((p) => p[0]);
  const ys = rel.map((p) => p[1]);
  return {
    ...e,
    x: o.x,
    y: o.y,
    points: rel,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
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
