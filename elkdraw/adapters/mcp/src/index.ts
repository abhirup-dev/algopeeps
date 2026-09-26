import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  type ToolDef,
  type ToolErrorBody,
  type ToolInput,
  type ToolName,
  type ToolOutput,
  tools,
} from "./tools.ts";

export * from "./tools.ts";
export { baseUrl, restHandlers } from "./rest.ts";

export type Handlers = {
  [K in ToolName]: (input: ToolInput<K>) => Promise<ToolOutput<K>>;
};

/** Thrown by handlers and `dispatch`. `body` is the REST error; `message` is its JSON. */
export class ToolError extends Error {
  readonly body: ToolErrorBody;
  constructor(body: ToolErrorBody) {
    super(JSON.stringify(body));
    this.name = "ToolError";
    this.body = body;
  }
}

export const inputJsonSchema = (def: ToolDef): Record<string, unknown> => ({
  ...z.toJSONSchema(def.input, { io: "input" }),
});

const byName = new Map(tools.map((def) => [def.name, def]));

function defOf(name: ToolName): ToolDef {
  const def = byName.get(name);
  if (def === undefined) throw new Error(`unregistered tool ${name}`);
  return def;
}

/**
 * One handler per tool from a single untyped function. Its results are
 * checked against each tool's output schema when the tool runs.
 */
export function handlersFrom(
  call: (name: ToolName, input: unknown) => Promise<unknown>,
): Handlers {
  const h =
    <K extends ToolName>(name: K) =>
    (input: ToolInput<K>) =>
      call(name, input) as Promise<ToolOutput<K>>;
  return {
    status: h("status"),
    add: h("add"),
    apply: h("apply"),
    get: h("get"),
    describe: h("describe"),
    query: h("query"),
    screenshot: h("screenshot"),
    export: h("export"),
    snapshot: h("snapshot"),
    clear: h("clear"),
    lint: h("lint"),
    look: h("look"),
    diff: h("diff"),
    changes: h("changes"),
    wait: h("wait"),
  };
}

/** Every tool rejects with NOT_IMPLEMENTED, echoing its input JSON Schema. */
export const stubHandlers: Handlers = handlersFrom((name) =>
  Promise.reject(
    new ToolError({
      code: "NOT_IMPLEMENTED",
      message: `${name} is not implemented yet`,
      tool: name,
      inputSchema: inputJsonSchema(defOf(name)),
    }),
  ),
);

/** Handlers keyed by name, with the per-tool input types erased. */
type Erased = Record<ToolName, (input: never) => Promise<unknown>>;

async function run(
  def: ToolDef,
  input: unknown,
  handlers: Partial<Handlers>,
): Promise<Record<string, unknown>> {
  const erased: Partial<Erased> = handlers;
  const stubs: Erased = stubHandlers;
  const handler = erased[def.name] ?? stubs[def.name];
  // `input` was parsed by def.input, the schema the handler is typed against.
  return def.output.parse(await handler(input as never));
}

/** Validate `input` for tool `name` and run it. Used by the server's REST route. */
export async function dispatch(
  name: string,
  input: unknown,
  handlers: Partial<Handlers> = {},
): Promise<unknown> {
  const def = byName.get(name as ToolName);
  if (def === undefined) {
    throw new ToolError({
      code: "UNKNOWN_TOOL",
      message: `No tool named ${name}`,
      tool: name,
    });
  }
  const parsed = def.input.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ToolError({
      code: "INVALID_INPUT",
      message: z.prettifyError(parsed.error),
      tool: name,
      inputSchema: inputJsonSchema(def),
    });
  }
  return run(def, parsed.data, handlers);
}

/** The MCP server; unimplemented tools fall back to `stubHandlers`. */
export function createMcpServer(handlers: Partial<Handlers> = {}): McpServer {
  const server = new McpServer({ name: "elkdraw", version: "0.0.0" });
  for (const def of tools) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.input,
        outputSchema: def.output,
      },
      async (input) => {
        const output = await run(def, input, handlers);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );
  }
  return server;
}
