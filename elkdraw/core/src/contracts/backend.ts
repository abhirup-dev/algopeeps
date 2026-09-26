// The backend seam (design §13): NeutralScene is what `read` returns, the only
// scene shape lint, diff and lift consume. Capabilities document a backend's
// limits. BackendAdapter is an interface: methods cannot be zod.
import { z } from "zod";
import { Box, Id, Point, Style } from "./ir.ts";
import type { LaidGraph } from "./ir.ts";

/** A rendered text box: the text and where it actually drew. */
export const TextBox = z.strictObject({ text: z.string(), box: Box });
export type TextBox = z.infer<typeof TextBox>;

// Coordinates are absolute. `meta` is the backend's raw opaque meta (Excalidraw
// `customData`), not a derived origin: core decides generated vs human (§13.1).
const common = {
  id: Id,
  /** Native containment (Excalidraw `frameId`). Generated parentage comes from meta (§14.2). */
  zone: Id.exactOptional(),
  style: Style.exactOptional(),
  meta: z.unknown().exactOptional(),
};

/** A node or freeform shape. Bound text is folded in as `text`. */
export const SceneBox = z.strictObject({
  type: z.literal("box"),
  ...common,
  box: Box,
  /** Mermaid shape name, or the backend's own kind for freeform (e.g. `freedraw`). */
  shape: z.string().min(1).exactOptional(),
  text: TextBox.exactOptional(),
});

export const SceneZone = z.strictObject({
  type: z.literal("zone"),
  ...common,
  box: Box,
  text: TextBox.exactOptional(),
});

/** An arrow or line as a polyline. `from`/`to` are set only when bound. */
export const SceneLine = z.strictObject({
  type: z.literal("line"),
  ...common,
  points: z.array(Point).min(2),
  from: Id.exactOptional(),
  to: Id.exactOptional(),
  text: TextBox.exactOptional(),
});

/** Free text bound to nothing. */
export const SceneText = z.strictObject({
  type: z.literal("text"),
  ...common,
  text: TextBox,
});

export const SceneElement = z.discriminatedUnion("type", [
  SceneBox,
  SceneZone,
  SceneLine,
  SceneText,
]);
export type SceneElement = z.infer<typeof SceneElement>;

/** Elements in z-order, bottom first. */
export const NeutralScene = z.strictObject({
  elements: z.array(SceneElement),
});
export type NeutralScene = z.infer<typeof NeutralScene>;

export const Capabilities = z.strictObject({
  /** Excalidraw frames cannot nest: `flat`. */
  nesting: z.enum(["flat", "deep"]),
  bindings: z.enum(["native", "none"]),
  /** Opaque meta survives a round trip through the editor. */
  opaqueMeta: z.boolean(),
  edgeLabels: z.enum(["bound", "separate", "none"]),
  /** False = emit-only (SVG, JSON Canvas). */
  readBack: z.boolean(),
  /** Mermaid shape names drawn natively; others degrade. */
  shapes: z.array(z.string().min(1)),
  freeform: z.boolean(),
});
export type Capabilities = z.infer<typeof Capabilities>;

/** One text to measure in the backend's font and wrap rules. */
export const MeasureRequest = z.strictObject({
  text: z.string(),
  fontFamily: z.string().min(1),
  fontSize: z.number().positive(),
  /** Wrap width; absent = no wrapping. */
  wrapWidth: z.number().positive().exactOptional(),
});
export type MeasureRequest = z.infer<typeof MeasureRequest>;

export const Size = z.strictObject({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Size = z.infer<typeof Size>;

export interface RenderResult {
  png: Uint8Array;
  /** Where each requested id drew, for `look`. */
  boxes: Record<string, Box>;
}

export interface BackendAdapter<Scene> {
  readonly id: string;
  readonly capabilities: Capabilities;
  /** Absolute coordinates from ELK's parent-relative ones is this method's job (§14.2). */
  // TODO(phase 2): how merge's per-group keep/write decisions reach emit.
  emit(graph: LaidGraph, prev?: Scene): Scene;
  /** Required when `capabilities.readBack`. */
  read?(scene: Scene): NeutralScene;
  /** One size per request, in order. */
  measure(texts: readonly MeasureRequest[]): Promise<Size[]>;
  render?(scene: Scene, target: readonly string[] | Box): Promise<RenderResult>;
  /** The backend's file format, e.g. `.excalidraw`. */
  serialise(scene: Scene): string;
}
