// The schemas published as JSON Schema (core/schemas/<name>.json).
// Regenerate with `bun run --cwd elkdraw/core schemas`.
import { z } from "zod";
import { Capabilities, NeutralScene } from "./backend.ts";
import { Graph, LaidGraph } from "./ir.ts";
import { Allow, LintHit } from "./lint.ts";
import { AstPatch } from "./patch.ts";
import { ApplyReply, FeedLine } from "./reply.ts";

export const published = {
  Graph,
  LaidGraph,
  NeutralScene,
  Capabilities,
  AstPatch,
  Allow,
  LintHit,
  ApplyReply,
  FeedLine,
};

export function jsonSchemas(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(published).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema),
    ]),
  );
}
