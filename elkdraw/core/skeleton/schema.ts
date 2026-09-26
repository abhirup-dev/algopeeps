// Strict schema for the `add` tool's input: Excalidraw 0.18.1
// `ExcalidrawElementSkeleton`, narrowed to what an agent should author.
// Every object is strict, so a key Excalidraw would silently ignore
// (`fontSize` on a rectangle, `elbowed` on an arrow) fails with its path.
// Store- and renderer-owned fields (seed, version, versionNonce, updated,
// index, isDeleted, boundElements, containerId, lastCommittedPoint) are not
// input. Text on shapes is `label`; arrow bindings are `start`/`end: {id}`.
// Hand-written: core does not depend on @excalidraw/excalidraw. No transforms,
// so `z.toJSONSchema` works on it.
import { z } from "zod";
import { Allow } from "../src/contracts/index.ts";

// ponytail: "semantic" = lowercase path-like, which rejects Excalidraw's
// mixed-case nanoids. A lowercase random id still passes; tighten if needed.
export const SkeletonId = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._/#@:>-]*$/,
    'semantic id: lowercase letters, digits and . _ / # @ : > -, e.g. "ride/core/trip"',
  );

const FontFamily = z.number().int().positive();
const TextAlign = z.enum(["left", "center", "right"]);
const VerticalAlign = z.enum(["top", "middle", "bottom"]);
const Arrowhead = z
  .enum([
    "arrow",
    "bar",
    "dot",
    "circle",
    "circle_outline",
    "triangle",
    "triangle_outline",
    "diamond",
    "diamond_outline",
  ])
  .nullable();

/** ElementConstructorOpts minus store-owned fields, plus our `allow`. */
const common = {
  id: SkeletonId,
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative().exactOptional(),
  height: z.number().nonnegative().exactOptional(),
  angle: z.number().exactOptional(),
  strokeColor: z.string().exactOptional(),
  backgroundColor: z.string().exactOptional(),
  fillStyle: z
    .enum(["hachure", "cross-hatch", "solid", "zigzag"])
    .exactOptional(),
  strokeWidth: z.number().nonnegative().exactOptional(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]).exactOptional(),
  roughness: z.number().exactOptional(),
  opacity: z.number().min(0).max(100).exactOptional(),
  roundness: z
    .strictObject({
      type: z.literal([1, 2, 3]),
      value: z.number().exactOptional(),
    })
    .nullable()
    .exactOptional(),
  groupIds: z.array(z.string().min(1)).exactOptional(),
  frameId: SkeletonId.nullable().exactOptional(),
  link: z.string().nullable().exactOptional(),
  locked: z.boolean().exactOptional(),
  customData: z.record(z.string(), z.unknown()).exactOptional(),
  /** Lint suppressions, one rule each; compiled into `customData.allow`. */
  allow: z.array(Allow).exactOptional(),
};

const Label = z.strictObject({
  text: z.string().min(1),
  fontSize: z.number().positive().exactOptional(),
  fontFamily: FontFamily.exactOptional(),
  textAlign: TextAlign.exactOptional(),
  verticalAlign: VerticalAlign.exactOptional(),
  strokeColor: z.string().exactOptional(),
});

/** Binds to an existing or same-batch element; inline-created ends have no semantic id. */
const End = z.strictObject({ id: SkeletonId });

const container = (type: "rectangle" | "ellipse" | "diamond") =>
  z.strictObject({
    type: z.literal(type),
    ...common,
    label: Label.exactOptional(),
  });

const linear = (type: "arrow" | "line") =>
  z.strictObject({
    type: z.literal(type),
    ...common,
    points: z
      .array(z.tuple([z.number(), z.number()]))
      .min(2)
      .exactOptional(),
    startArrowhead: Arrowhead.exactOptional(),
    endArrowhead: Arrowhead.exactOptional(),
    label: Label.exactOptional(),
    start: End.exactOptional(),
    end: End.exactOptional(),
  });

const Text = z.strictObject({
  type: z.literal("text"),
  ...common,
  text: z.string().min(1),
  fontSize: z.number().positive().exactOptional(),
  fontFamily: FontFamily.exactOptional(),
  textAlign: TextAlign.exactOptional(),
  verticalAlign: VerticalAlign.exactOptional(),
  lineHeight: z.number().positive().exactOptional(),
  autoResize: z.boolean().exactOptional(),
});

const Frame = z.strictObject({
  type: z.literal("frame"),
  ...common,
  // Optional: convertToExcalidrawElements sizes a frame from its children.
  x: z.number().exactOptional(),
  y: z.number().exactOptional(),
  children: z.array(SkeletonId),
  name: z.string().exactOptional(),
});

// ponytail: image, freedraw, embeddable, iframe and magicframe are left out
// (no Phase 1 use); add a member when a task needs one.
export const SkeletonElement = z.discriminatedUnion("type", [
  container("rectangle"),
  container("ellipse"),
  container("diamond"),
  Text,
  linear("arrow"),
  linear("line"),
  Frame,
]);
export type SkeletonElement = z.infer<typeof SkeletonElement>;

/** The `add` tool input. Ids are unique within one call. */
export const SkeletonInput = z
  .strictObject({ elements: z.array(SkeletonElement).min(1) })
  .superRefine(
    (input, ctx) => {
      // Runs even when elements failed, so the value may be malformed here.
      const elements: unknown = input.elements;
      if (!Array.isArray(elements)) return;
      const seen = new Set<string>();
      elements.forEach((element: unknown, i) => {
        const id =
          typeof element === "object" && element !== null && "id" in element
            ? element.id
            : undefined;
        if (typeof id !== "string") return;
        if (seen.has(id))
          ctx.addIssue({
            code: "custom",
            path: ["elements", i, "id"],
            message: `duplicate id "${id}"`,
          });
        seen.add(id);
      });
    },
    { when: () => true },
  );
export type SkeletonInput = z.infer<typeof SkeletonInput>;

const pathText = (path: readonly PropertyKey[]) =>
  path
    .map((p, i) =>
      typeof p === "number" ? `[${String(p)}]` : `${i ? "." : ""}${String(p)}`,
    )
    .join("");

/** Keys agents coming from yctimlin's `mcp-excalidraw-server` send instead of
 * this schema's fields; each unrecognized-key error for one of them gets a
 * fix hint naming the field to use instead. */
const KNOWN_KEY_FIXES: Record<string, string> = {
  text: "label.text",
  startElementId: "start.id",
  endElementId: "end.id",
};

/** One `path: message` line per error; unknown keys get one line each, with a
 * fix hint for keys a yctimlin-style agent is known to send. */
export function skeletonErrors(error: z.ZodError): string[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys")
      return issue.keys.map((key) => {
        const fix = KNOWN_KEY_FIXES[key];
        return `${pathText([...issue.path, key])}: unknown key${fix ? `; use ${fix}` : ""}`;
      });
    return [`${pathText(issue.path)}: ${issue.message}`];
  });
}

export type SkeletonResult =
  { ok: true; value: SkeletonInput } | { ok: false; errors: string[] };

/** Strict validate; never throws. */
export function validateSkeleton(input: unknown): SkeletonResult {
  const result = SkeletonInput.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: skeletonErrors(result.error) };
}
