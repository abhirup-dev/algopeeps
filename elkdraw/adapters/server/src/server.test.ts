import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Element, ServerMessage, parseJson } from "@elkdraw/core";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpServer, ToolErrorBody, tools } from "@elkdraw/mcp";
import { z } from "zod";
import { type RunningServer, Store, startServer } from "./index.ts";

const Status = z.object({
  port: z.number(),
  url: z.string(),
  branch: z.string(),
  session: z.string(),
  rev: z.number(),
  clients: z.number(),
});

const ErrorReply = z.object({ error: ToolErrorBody });

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "elkdraw-server-"));
  cleanup.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function start(dataDir: string): RunningServer {
  const appDir = tempDir();
  writeFileSync(join(appDir, "index.html"), "<p>elkdraw</p>");
  const server = startServer({
    port: 0,
    session: "t",
    open: false,
    appDir,
    dataDir,
  });
  cleanup.push(server.stop);
  return server;
}

async function status(url: string) {
  const res = await fetch(`${url}/api/status`);
  return parseJson(Status, await res.text());
}

/** A WebSocket client that queues server messages. */
async function connect(url: string) {
  const ws = new WebSocket(`${url.replace("http", "ws")}/ws`);
  const queue: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.onmessage = (event: MessageEvent) => {
    queue.push(parseJson(ServerMessage, String(event.data)));
    waiters.splice(0).forEach((wake) => {
      wake();
    });
  };
  await new Promise((ok) => (ws.onopen = ok));
  cleanup.push(() => {
    ws.close();
  });
  return {
    ws,
    async next<T extends ServerMessage["type"]>(type: T) {
      for (;;) {
        const i = queue.findIndex((m) => m.type === type);
        if (i >= 0)
          return queue.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
        await new Promise<void>((wake) => waiters.push(wake));
      }
    },
  };
}

const rect = (id: string, version = 1): Element => ({
  id,
  type: "rectangle",
  version,
  x: 0,
});

async function freePort(): Promise<number> {
  const banned = [3000, 3010, 3020, 3100, 8080, 8081];
  for (;;) {
    const probe = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = probe.port ?? 0;
    await probe.stop(true);
    if (!banned.includes(port)) return port;
  }
}

test("main.ts honours PORT", async () => {
  const port = await freePort();
  const main = Bun.spawn(
    ["bun", join(import.meta.dir, "main.ts"), "--no-open"],
    {
      env: { ...process.env, PORT: String(port), ELKDRAW_DATA_DIR: tempDir() },
      stdout: "pipe",
    },
  );
  cleanup.push(() => {
    main.kill();
  });
  const reader = main.stdout.getReader();
  const line = new TextDecoder().decode((await reader.read()).value);
  expect(line).toContain(`:${String(port)}`);
  const url = `http://127.0.0.1:${String(port)}`;
  expect((await status(url)).port).toBe(port);
  expect((await fetch(`${url}/api/shutdown`, { method: "POST" })).ok).toBe(
    true,
  );
  expect(await main.exited).toBe(0);
});

test("status reports clients and rev; A's delta reaches B", async () => {
  const { url } = start(tempDir());
  const a = await connect(url);
  const b = await connect(url);
  expect(await a.next("hello")).toMatchObject({ session: "t" });
  expect(await b.next("snapshot")).toMatchObject({ rev: 0, elements: [] });
  expect(await status(url)).toMatchObject({ session: "t", rev: 0, clients: 2 });

  const delta = {
    type: "delta",
    rev: 0,
    upserts: [rect("r1")],
    deletes: [],
    author: "human",
  };
  a.ws.send(JSON.stringify(delta));
  expect(await a.next("ack")).toEqual({ type: "ack", rev: 1 });
  expect(await b.next("delta")).toMatchObject({
    rev: 1,
    upserts: [rect("r1")],
    deletes: [],
  });
  expect((await status(url)).rev).toBe(1);

  // A stale version loses and bumps nothing.
  a.ws.send(JSON.stringify({ ...delta, upserts: [rect("r1", 0)] }));
  expect(await a.next("ack")).toEqual({ type: "ack", rev: 1 });
});

test("restart replays the scene from events.jsonl", async () => {
  const dataDir = tempDir();
  const first = start(dataDir);
  const a = await connect(first.url);
  a.ws.send(
    JSON.stringify({
      type: "delta",
      rev: 0,
      upserts: [rect("r1"), rect("r2")],
      deletes: [],
      author: "human",
    }),
  );
  await a.next("ack");
  a.ws.send(
    JSON.stringify({
      type: "delta",
      rev: 1,
      upserts: [rect("r1", 2)],
      deletes: ["r2"],
      author: "human",
    }),
  );
  await a.next("ack");
  await first.stop();

  const line = readFileSync(join(dataDir, "t", "events.jsonl"), "utf8").split(
    "\n",
  )[0];
  expect(line).toStartWith(
    '{"author":"human","deletes":[],"ids":["r1","r2"],"op":"delta","rev":1,',
  );

  const second = start(dataDir);
  const b = await connect(second.url);
  expect(await b.next("snapshot")).toEqual({
    type: "snapshot",
    rev: 2,
    elements: [rect("r1", 2)],
  });
});

test("store keyframes, replays from the last one, and cuts a torn line", () => {
  const dir = tempDir();
  const store = new Store(dir, 2);
  store.apply("agent", [rect("a")], []);
  store.apply("agent", [rect("b")], []);
  store.apply("human", [], ["a"]);
  const lines = readFileSync(store.file, "utf8").trimEnd().split("\n");
  expect(lines.map((l) => /"op":"(\w+)"/.exec(l)?.[1])).toEqual([
    "delta",
    "delta",
    "keyframe",
    "delta",
  ]);
  writeFileSync(store.file, `${lines.join("\n")}\n{"op":"del`);
  const again = new Store(dir, 2);
  expect(again.rev).toBe(3);
  expect(again.scene()).toEqual([rect("b")]);
  again.apply("agent", [rect("c")], []);
  expect(new Store(dir, 2).scene()).toEqual([rect("b"), rect("c")]);
});

test("/mcp lists the @elkdraw/mcp tools; REST maps errors to SURFACE.md codes", async () => {
  const { url } = start(tempDir());
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`)),
  );
  cleanup.push(() => client.close());
  const { tools: listed } = await client.listTools();
  expect(listed.map((t) => t.name).sort()).toEqual(
    tools.map((t) => t.name).sort(),
  );
  const viaMcp = await client.callTool({ name: "status", arguments: {} });
  expect(viaMcp.structuredContent).toMatchObject({ session: "t", rev: 0 });

  const post = (name: string, body?: string) =>
    fetch(`${url}/api/tools/${name}`, {
      method: "POST",
      ...(body === undefined ? {} : { body }),
    });
  const res = await post("status");
  expect(await res.json()).toMatchObject({ session: "t", rev: 0 });
  const codes = await Promise.all(
    [
      post("nope"),
      post("look", "{}"),
      post("look", "{not json"),
      post("lint", "{}"),
    ].map(async (p) => {
      const r = await p;
      return [r.status, parseJson(ErrorReply, await r.text()).error.code];
    }),
  );
  expect(codes).toEqual([
    [404, "UNKNOWN_TOOL"],
    [400, "INVALID_INPUT"],
    [400, "INVALID_INPUT"],
    [501, "NOT_IMPLEMENTED"],
  ]);
});

test("a handler that throws a non-ToolError is a 500 INTERNAL", async () => {
  const appDir = tempDir();
  const server = startServer({
    port: 0,
    session: "t",
    open: false,
    appDir,
    dataDir: tempDir(),
    tools: () => ({
      createMcpServer: () => createMcpServer(),
      dispatch: () => Promise.reject(new Error("boom")),
    }),
  });
  cleanup.push(server.stop);
  const r = await fetch(`${server.url}/api/tools/lint`, { method: "POST" });
  expect(r.status).toBe(500);
  expect(parseJson(ErrorReply, await r.text()).error).toMatchObject({
    code: "INTERNAL",
    message: "boom",
  });
});

test("rejects a foreign Host or Origin (DNS rebinding)", async () => {
  const { url } = start(tempDir());
  const host = await fetch(`${url}/api/status`, {
    headers: { host: "evil.test" },
  });
  expect(host.status).toBe(403);
  const origin = await fetch(`${url}/api/status`, {
    headers: { origin: "http://evil.test" },
  });
  expect(origin.status).toBe(403);
});
