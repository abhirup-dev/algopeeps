// The IR: one ElkNode tree with a typed meta bag (design §14.2), in two phases.
// Graph is compiled from text (ids, meta, sizes, no positions); LaidGraph is
// the same tree after layout (x, y, sections). Shapes follow elkjs's
// ElkNode / ElkExtendedEdge / ElkLabel / ElkPort so elkjs consumes the tree
// as is. Tree objects strip unknown keys instead of rejecting them: elkjs
// writes an internal `$H` onto every node it lays out. Meta bags are strict.
import { z } from "zod";
import { Allow } from "./lint.ts";

export const Id = z.string().min(1);

export const Point = z.strictObject({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof Point>;

export const Box = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Box = z.infer<typeof Box>;

/** Neutral style: the §11.7 classDef mapping table, camelCased. */
export const Style = z.strictObject({
  fill: z.string().exactOptional(),
  stroke: z.string().exactOptional(),
  strokeWidth: z.number().exactOptional(),
  strokeDasharray: z.string().exactOptional(),
  color: z.string().exactOptional(),
  fontSize: z.number().exactOptional(),
});
export type Style = z.infer<typeof Style>;

export const Origin = z.enum(["generated", "raw", "human"]);
export type Origin = z.infer<typeof Origin>;

/** The three field groups the merge compares (§3.3). */
export const FieldGroup = z.enum(["geom", "style", "text"]);
export type FieldGroup = z.infer<typeof FieldGroup>;

/** Hashes of each field group as last written by the compiler: the merge base. */
export const Gen = z.strictObject({
  geom: z.string().min(1),
  style: z.string().min(1),
  text: z.string().min(1),
});
export type Gen = z.infer<typeof Gen>;

/** Soft = a human drag, hard = `@pin`. */
export const Pin = z.strictObject({
  kind: z.enum(["soft", "hard"]),
  at: Point,
  // TODO(phase 2): relative pins (`rightOf`, `gap`) from spec v0, if `@pin` keeps them.
});
export type Pin = z.infer<typeof Pin>;

/** Diagram families in scope (§17.1). Lint rules are gated by family (§14.3). */
export const Family = z.enum([
  "flowchart",
  "class",
  "state",
  "er",
  "requirement",
  "mindmap",
  "kanban",
  "sequence",
  "gantt",
  "timeline",
]);
export type Family = z.infer<typeof Family>;

const baseMeta = {
  origin: Origin,
  gen: Gen.exactOptional(),
  style: Style.exactOptional(),
  allow: z.array(Allow).exactOptional(),
};

/** Meta on labels and ports. */
export const ElementMeta = z.strictObject(baseMeta);
export type ElementMeta = z.infer<typeof ElementMeta>;

export const NodeMeta = z.strictObject({
  ...baseMeta,
  /** Mermaid classes (`:::svc`), `default` dropped (§16.2). */
  roles: z.array(z.string().min(1)).exactOptional(),
  /** Mermaid shape name (`cyl`, `rect`, ...). */
  shape: z.string().min(1).exactOptional(),
  pin: Pin.exactOptional(),
  /** Set on the root and on a compound hosting another family (§15.4). */
  family: Family.exactOptional(),
  // TODO(phase 4): compartments (class members/methods, §16.2) and range (sequence fragments, §14.3).
});
export type NodeMeta = z.infer<typeof NodeMeta>;

export const EdgeMeta = z.strictObject({
  ...baseMeta,
  roles: z.array(z.string().min(1)).exactOptional(),
  /** Mermaid edge pattern (§16.2). */
  // TODO(phase 2): narrow to Mermaid's pattern values when the adapter lands.
  kind: z.string().min(1).exactOptional(),
  // TODO(phase 2): heads (arrowTypeStart/End, §16.2) and labelAt.
});
export type EdgeMeta = z.infer<typeof EdgeMeta>;

const LayoutOptions = z.record(z.string(), z.string());

// ── Graph: compiled from text ────────────────────────────────────────────────
// TODO(phase 2): interactive seeding and FIXED_POS ports feed x/y into ELK's
// input; decide whether that is a Graph with optional x/y or a layout-internal type.

/** Derived id `<owner>#label`. */
export const GraphLabel = z.object({
  id: Id,
  text: z.string(),
  width: z.number().exactOptional(),
  height: z.number().exactOptional(),
  layoutOptions: LayoutOptions.exactOptional(),
  meta: ElementMeta,
});
export type GraphLabel = z.infer<typeof GraphLabel>;

/** Derived id `<node>@<port>`. */
export const GraphPort = z.object({
  id: Id,
  width: z.number().exactOptional(),
  height: z.number().exactOptional(),
  layoutOptions: LayoutOptions.exactOptional(),
  meta: ElementMeta,
});
export type GraphPort = z.infer<typeof GraphPort>;

/** One source and one target: hyperedges are rejected (§14.2). */
export const GraphEdge = z.object({
  id: Id,
  sources: z.tuple([Id]),
  targets: z.tuple([Id]),
  labels: z.array(GraphLabel).exactOptional(),
  layoutOptions: LayoutOptions.exactOptional(),
  meta: EdgeMeta,
});
export type GraphEdge = z.infer<typeof GraphEdge>;

const GraphNodeFields = z.object({
  id: Id,
  width: z.number().exactOptional(),
  height: z.number().exactOptional(),
  layoutOptions: LayoutOptions.exactOptional(),
  labels: z.array(GraphLabel).exactOptional(),
  ports: z.array(GraphPort).exactOptional(),
  meta: NodeMeta,
  edges: z.array(GraphEdge).exactOptional(),
});
// zod cannot infer a recursive type under exactOptionalPropertyTypes, so the
// one recursive link is written by hand; every other field is inferred.
export type GraphNode = z.infer<typeof GraphNodeFields> & {
  children?: GraphNode[];
};
export const GraphNode: z.ZodType<GraphNode> = GraphNodeFields.extend({
  get children() {
    return z.array(GraphNode).exactOptional();
  },
});

/** The root node. Zones are compound nodes. */
export const Graph = GraphNode;
export type Graph = GraphNode;

// ── LaidGraph: after layout ──────────────────────────────────────────────────
// Child coordinates are relative to the parent, as ELK returns them (§14.2).

const laid = {
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
};

export const LaidLabel = GraphLabel.extend(laid);
export type LaidLabel = z.infer<typeof LaidLabel>;

export const LaidPort = GraphPort.extend(laid);
export type LaidPort = z.infer<typeof LaidPort>;

export const EdgeSection = z.object({
  id: Id,
  startPoint: Point,
  endPoint: Point,
  bendPoints: z.array(Point).exactOptional(),
  incomingShape: Id.exactOptional(),
  outgoingShape: Id.exactOptional(),
  incomingSections: z.array(Id).exactOptional(),
  outgoingSections: z.array(Id).exactOptional(),
});
export type EdgeSection = z.infer<typeof EdgeSection>;

export const LaidEdge = GraphEdge.extend({
  labels: z.array(LaidLabel).exactOptional(),
  sections: z.array(EdgeSection),
  /** Written by elkjs: the node whose coordinate system the sections use. */
  container: Id.exactOptional(),
  junctionPoints: z.array(Point).exactOptional(),
});
export type LaidEdge = z.infer<typeof LaidEdge>;

const LaidNodeFields = z.object({
  id: Id,
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  layoutOptions: LayoutOptions.exactOptional(),
  labels: z.array(LaidLabel).exactOptional(),
  ports: z.array(LaidPort).exactOptional(),
  meta: NodeMeta,
  edges: z.array(LaidEdge).exactOptional(),
});
// zod cannot infer a recursive type under exactOptionalPropertyTypes, so the
// one recursive link is written by hand; every other field is inferred.
export type LaidNode = z.infer<typeof LaidNodeFields> & {
  children?: LaidNode[];
};
export const LaidNode: z.ZodType<LaidNode> = LaidNodeFields.extend({
  get children() {
    return z.array(LaidNode).exactOptional();
  },
});

export const LaidGraph = LaidNode;
export type LaidGraph = LaidNode;

// ── semantic(): the view the semantic diff and the printers run on ───────────

/** Masked by semantic(), so a layout alone is never a change (§14.2). */
export type LayoutField =
  "x" | "y" | "width" | "height" | "sections" | "layoutOptions";

export type SemanticLabel = Omit<GraphLabel, LayoutField>;
export type SemanticPort = Omit<GraphPort, LayoutField>;
export type SemanticEdge = Omit<GraphEdge, LayoutField | "labels"> & {
  labels?: SemanticLabel[];
};
export interface SemanticNode extends Omit<
  GraphNode,
  LayoutField | "labels" | "ports" | "children" | "edges"
> {
  labels?: SemanticLabel[];
  ports?: SemanticPort[];
  children?: SemanticNode[];
  edges?: SemanticEdge[];
}

export type Semantic = (tree: Graph | LaidGraph) => SemanticNode;
