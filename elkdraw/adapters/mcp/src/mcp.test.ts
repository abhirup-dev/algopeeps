import { afterAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  InMemoryTransport,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import {
  createMcpServer,
  dispatch,
  stubHandlers,
  ToolError,
  tools,
} from "./index.ts";

const names = tools.map((t) => t.name).sort();

async function checkClient(client: Client): Promise<void> {
  const listed = await client.listTools();
  expect(listed.tools.map((t) => t.name).sort()).toEqual(names);
  for (const tool of listed.tools) {
    expect(tool.description).toBeString();
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.outputSchema?.["type"]).toBe("object");
  }
  const stub = await client.callTool({ name: "lint", arguments: {} });
  expect(stub.isError).toBe(true);
  expect(JSON.stringify(stub.content)).toContain("NOT_IMPLEMENTED");
}

describe("mcp", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup) await fn();
  });

  test("stdio lists every tool with schemas", async () => {
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("stdio.ts", import.meta.url))],
      }),
    );
    cleanup.push(() => client.close());
    await checkClient(client);
  });

  test("streamable HTTP lists every tool with schemas", async () => {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await createMcpServer().connect(transport);
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) => transport.handleRequest(req),
    });
    cleanup.push(() => server.stop(true));
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${server.url.href}mcp`)),
    );
    cleanup.push(() => client.close());
    await checkClient(client);
  });

  test("a supplied handler replaces the stub", async () => {
    const client = new Client({ name: "test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer({
      changes: ({ since }) => Promise.resolve({ rev: since ?? 0, lines: [] }),
    }).connect(b);
    await client.connect(a);
    cleanup.push(() => client.close());
    const res = await client.callTool({
      name: "changes",
      arguments: { since: 4 },
    });
    expect(res.structuredContent).toEqual({ rev: 4, lines: [] });
  });
});

describe("dispatch", () => {
  const codeOf = async (p: Promise<unknown>) => {
    const error: unknown = await p.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ToolError);
    return error instanceof ToolError ? error.body : undefined;
  };

  test("stub echoes the input JSON Schema", async () => {
    const body = await codeOf(dispatch("look", { target: "n1" }));
    expect(body?.code).toBe("NOT_IMPLEMENTED");
    expect(body?.inputSchema?.["required"]).toEqual(["target"]);
    expect(await codeOf(stubHandlers.clear({ yes: true }))).toMatchObject({
      code: "NOT_IMPLEMENTED",
      tool: "clear",
    });
  });

  test("validates input and names", async () => {
    expect((await codeOf(dispatch("look", {})))?.code).toBe("INVALID_INPUT");
    expect((await codeOf(dispatch("apply", {})))?.code).toBe("INVALID_INPUT");
    expect((await codeOf(dispatch("nope", {})))?.code).toBe("UNKNOWN_TOOL");
  });

  test("runs a handler and validates its output", async () => {
    const handlers = { lint: () => Promise.resolve({ rev: 2, hits: [] }) };
    expect(await dispatch("lint", undefined, handlers)).toEqual({
      rev: 2,
      hits: [],
    });
  });
});
