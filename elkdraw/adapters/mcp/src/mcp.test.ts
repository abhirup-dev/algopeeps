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
import { parseJson } from "@elkdraw/core";
import { z } from "zod";
import {
  baseUrl,
  createMcpServer,
  dispatch,
  httpStatus,
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
  const stub = await client.callTool({
    name: "clear",
    arguments: { yes: true },
  });
  expect(stub.isError).toBe(true);
  expect(JSON.stringify(stub.content)).toContain("NOT_IMPLEMENTED");
}

describe("mcp", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterAll(async () => {
    for (const fn of cleanup) await fn();
  });

  // A stand-in for the elkdraw server's REST route: dispatch + the SURFACE.md
  // error mapping, with a real `lint` so forwarding of results is visible.
  function fakeServer() {
    const handlers = {
      lint: () => Promise.resolve({ rev: 7, hits: [] }),
    };
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        const name = new URL(req.url).pathname.replace("/api/tools/", "");
        try {
          const input = parseJson(z.unknown(), await req.text());
          return Response.json(await dispatch(name, input, handlers));
        } catch (error) {
          if (!(error instanceof ToolError)) throw error;
          return Response.json(
            { error: error.body },
            { status: httpStatus[error.body.code] },
          );
        }
      },
    });
    cleanup.push(() => server.stop(true));
    return server.url.href;
  }

  async function stdioClient(url: string): Promise<Client> {
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("stdio.ts", import.meta.url))],
        env: { ...process.env, ELKDRAW_URL: url },
      }),
    );
    cleanup.push(() => client.close());
    return client;
  }

  test("stdio lists every tool and forwards calls over REST", async () => {
    const client = await stdioClient(fakeServer());
    await checkClient(client);
    const lint = await client.callTool({ name: "lint", arguments: {} });
    expect(lint.structuredContent).toEqual({ rev: 7, hits: [] });
  });

  test("stdio reports an unreachable server", async () => {
    const dead = Bun.serve({ port: 0, fetch: () => new Response() });
    const url = dead.url.href;
    await dead.stop(true);
    const client = await stdioClient(url);
    const res = await client.callTool({ name: "status", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("UNREACHABLE");
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

test("base URL: $ELKDRAW_URL, else $PORT, else 3940", () => {
  expect(baseUrl({ ELKDRAW_URL: "http://h:1/", PORT: "2" })).toBe("http://h:1");
  expect(baseUrl({ PORT: "2" })).toBe("http://127.0.0.1:2");
  expect(baseUrl({ ELKDRAW_URL: "", PORT: "" })).toBe("http://127.0.0.1:3940");
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
