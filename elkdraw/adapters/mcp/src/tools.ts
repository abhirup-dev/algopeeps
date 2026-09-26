// The ELK draw tool surface: one zod input and output schema per tool. The MCP
// server, the REST route and the CLI all read these; there is no second
// definition. Names follow yctimlin's CLI verbs where one exists (SURFACE.md).
import {
  ApplyReply,
  AstPatch,
  Box,
  FeedLine,
  Id,
  LintHit,
  Point,
  SceneElement,
} from "@elkdraw/core";
import { z } from "zod";

const Rev = z.int().nonnegative();
const Out = z.string().min(1).describe("Write the file here; prints its path");
const MaxPx = z.int().positive().describe("Longest image side in pixels");
const Scope = z
  .string()
  .min(1)
  .describe("all | viewport | frame:<id> | near:<id>,r=<px>");
const Ids = z.array(Id).min(1).describe("Element ids");

// TODO(phase 1): the strict skeleton schema from core (§3.2); loose until then.
const Skeleton = z.looseObject({
  type: z.string().min(1),
  id: Id.optional(),
});

/** `GET /api/status` (SURFACE.md). */
export const ServerStatus = z.strictObject({
  port: z.int().positive(),
  url: z.string().min(1),
  branch: z.string(),
  session: z.string(),
  rev: Rev,
  clients: z.int().nonnegative(),
});
export type ServerStatus = z.infer<typeof ServerStatus>;

interface Def {
  description: string;
  input: z.ZodObject;
  output: z.ZodObject;
}

export const defs = {
  status: {
    description:
      "Which server this is: port, canvas url, branch, session, rev, browser clients.",
    input: z.strictObject({}),
    output: ServerStatus,
  },
  add: {
    description:
      "Create elements from Excalidraw skeletons. Replies with ids and lints, never elements.",
    input: z.strictObject({
      elements: z.array(Skeleton).min(1).describe("Element skeletons"),
    }),
    output: ApplyReply,
  },
  apply: {
    description:
      "Apply a .mmd source or AST patches to the canvas. Human edits are kept (overrides, conflicts).",
    input: z
      .strictObject({
        text: z.string().min(1).optional().describe("Mermaid (.mmd) source"),
        patches: z.array(AstPatch).min(1).optional().describe("AST patches"),
        dryRun: z.boolean().optional().describe("Report only; write nothing"),
        force: z
          .boolean()
          .optional()
          .describe("Overwrite conflicting human edits"),
        ifRev: Rev.optional().describe("Fail unless the canvas is at this rev"),
      })
      .refine((i) => i.text !== undefined || i.patches !== undefined, {
        message: "Give text or patches",
      }),
    output: ApplyReply,
  },
  get: {
    description: "One element by id, in the neutral scene form.",
    input: z.strictObject({ id: Id.describe("Element id") }),
    output: z.strictObject({ rev: Rev, element: SceneElement }),
  },
  describe: {
    description:
      "Plain-text scene description: ids, labels, positions, connections.",
    input: z.strictObject({ scope: Scope.optional() }),
    output: z.strictObject({ rev: Rev, text: z.string() }),
  },
  query: {
    description: "Find elements by type, ids or bounding box.",
    input: z.strictObject({
      type: z.string().min(1).optional().describe("Element type"),
      ids: Ids.optional(),
      bbox: Box.optional().describe("Elements inside this box"),
      limit: z.int().positive().optional().describe("Max elements returned"),
    }),
    output: z.strictObject({
      rev: Rev,
      elements: z.array(SceneElement),
      truncated: z.boolean(),
    }),
  },
  screenshot: {
    description:
      "Render the whole canvas headlessly. For a crop around ids use look.",
    input: z.strictObject({
      format: z.enum(["png", "svg"]).optional().describe("Default png"),
      out: Out.optional(),
      maxPx: MaxPx.optional(),
    }),
    output: z.strictObject({
      path: z.string(),
      format: z.enum(["png", "svg"]),
      width: z.number(),
      height: z.number(),
    }),
  },
  export: {
    description:
      "Export the scene as .excalidraw JSON, Obsidian markdown, .mmd, SVG or PNG.",
    input: z.strictObject({
      format: z
        .enum(["excalidraw", "obsidian", "mmd", "svg", "png"])
        .describe("Output format"),
      out: Out.optional(),
    }),
    output: z.strictObject({
      format: z.string(),
      path: z.string().optional(),
      content: z.string().optional().describe("Inline when no out was given"),
    }),
  },
  snapshot: {
    description: "Save, list or restore named canvas snapshots.",
    input: z
      .strictObject({
        action: z.enum(["save", "list", "restore"]),
        name: z.string().min(1).optional().describe("Snapshot name"),
      })
      .refine((i) => i.action === "list" || i.name !== undefined, {
        message: "save and restore need a name",
      }),
    output: z.strictObject({
      rev: Rev,
      snapshots: z.array(
        z.strictObject({ name: z.string(), rev: Rev, time: z.iso.datetime() }),
      ),
    }),
  },
  clear: {
    description: "Delete every element on the canvas. Take a snapshot first.",
    input: z.strictObject({
      yes: z.literal(true).describe("Confirm; clear is not undoable"),
    }),
    output: z.strictObject({ rev: Rev, deleted: z.int().nonnegative() }),
  },
  lint: {
    description:
      "Rendered lint: overflow, overlaps, arrows through nodes, crossings. Suppressed hits are returned too.",
    input: z.strictObject({ scope: Scope.optional(), ids: Ids.optional() }),
    output: z.strictObject({ rev: Rev, hits: z.array(LintHit) }),
  },
  look: {
    description:
      "Crop around a target and return a PNG path, its bbox and scale, and optional id marks.",
    input: z.strictObject({
      target: z
        .string()
        .min(1)
        .describe("<id> | <id>,<id> | viewport | frame:<id> | x,y,w,h"),
      r: z.number().nonnegative().optional().describe("Margin in scene px"),
      marks: z.boolean().optional().describe("Draw id marks on the crop"),
      maxPx: MaxPx.optional(),
      out: Out.optional(),
    }),
    output: z.strictObject({
      path: z.string(),
      bbox: Box,
      scale: z.number().positive(),
      marks: z.record(Id, Point),
    }),
  },
  diff: {
    description:
      "Semantic diff between two revs or .mmd files, with the lint delta.",
    input: z.strictObject({
      from: z
        .string()
        .min(1)
        .optional()
        .describe("Rev or .mmd path; default the last agent turn"),
      to: z
        .string()
        .min(1)
        .optional()
        .describe("Rev or .mmd path; default now"),
    }),
    // TODO(phase 3): semantic change records once the semantic diff exists (§12).
    output: z.strictObject({
      changes: z.array(FeedLine),
      lints: z.strictObject({
        added: z.array(LintHit),
        fixed: z.array(LintHit),
      }),
    }),
  },
  changes: {
    description: "The change feed since a rev: who changed what.",
    input: z.strictObject({
      since: Rev.optional().describe("Rev; default the agent's cursor"),
    }),
    output: z.strictObject({ rev: Rev, lines: z.array(FeedLine) }),
  },
  wait: {
    description:
      "Block until the human changes the canvas or finishes a review, or the timeout passes.",
    input: z.strictObject({
      for: z.enum(["change", "review"]).optional().describe("Default change"),
      since: Rev.optional().describe("Rev; default now"),
      timeoutMs: z.int().positive().optional().describe("Default 300000"),
    }),
    output: z.strictObject({
      rev: Rev,
      reason: z.enum(["change", "review", "timeout"]),
    }),
  },
} satisfies Record<string, Def>;

type Defs = typeof defs;
export type ToolName = keyof Defs;
export type ToolInput<K extends ToolName> = z.infer<Defs[K]["input"]>;
export type ToolOutput<K extends ToolName> = z.infer<Defs[K]["output"]>;

export interface ToolDef extends Def {
  name: ToolName;
}

export const tools: readonly ToolDef[] = Object.entries(defs).map(
  ([name, def]) => ({ name: name as ToolName, ...def }),
);

export const ToolErrorCode = z.enum([
  "NOT_IMPLEMENTED",
  "INVALID_INPUT",
  "UNKNOWN_TOOL",
  "UNREACHABLE",
  "INTERNAL",
]);
export type ToolErrorCode = z.infer<typeof ToolErrorCode>;

/** HTTP status for each error code on `POST /api/tools/<name>`. */
export const httpStatus: Record<ToolErrorCode, number> = {
  INVALID_INPUT: 400,
  UNKNOWN_TOOL: 404,
  NOT_IMPLEMENTED: 501,
  /** Only raised client-side (stdio forwarding); never sent by the server. */
  UNREACHABLE: 503,
  INTERNAL: 500,
};

/** The `error` member of a failed `POST /api/tools/<name>` (SURFACE.md). */
export const ToolErrorBody = z.strictObject({
  code: ToolErrorCode,
  message: z.string(),
  tool: z.string(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});
export type ToolErrorBody = z.infer<typeof ToolErrorBody>;
