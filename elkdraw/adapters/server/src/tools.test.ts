// Phase 1 tools over REST, MCP and the CLI, with a fake renderer (no
// browser): the real sidecar path is tools.e2e.ts.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Box,
  type Element,
  parseJson,
  type SkeletonElement,
} from "@elkdraw/core";
import { type ExcalidrawScene, readScene } from "@elkdraw/backend-excalidraw";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { z } from "zod";
import { type Renderer, startServer } from "./index.ts";
import { describeText } from "./tools.ts";

const CLI = join(import.meta.dir, "../../cli/src/main.ts");

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "elkdraw-tools-"));
  cleanup.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

const num = (v: unknown, fallback: number) =>
  typeof v === "number" ? v : fallback;

/** Stands in for the sidecar: skeletons become plain Excalidraw-ish
 * elements, boxes are the stored ones, the PNG is a header only. */
function fakeRenderer(): Renderer {
  return {
    start: () => Promise.resolve(),
    close: () => Promise.resolve(),
    convert(skeletons: readonly SkeletonElement[]) {
      const out: Element[] = [];
      for (const s of skeletons) {
        const base = {
          strokeColor: "#000",
          backgroundColor: "transparent",
          strokeWidth: 1,
          strokeStyle: "solid",
          isDeleted: false,
          width: 100,
          height: 60,
          version: 1,
          ...s,
        };
        if (!("label" in s)) {
          out.push(base);
          continue;
        }
        const { label, ...rest } = { ...base, label: s.label };
        out.push({
          ...rest,
          boundElements: [{ id: `${s.id}-t`, type: "text" }],
        });
        out.push({
          ...rest,
          id: `${s.id}-t`,
          type: "text",
          text: label.text,
          fontSize: 20,
          containerId: s.id,
          x: s.x + 10,
          y: s.y + 10,
          width: 40,
          height: 25,
        });
      }
      return Promise.resolve(out);
    },
    measure(elements: readonly Element[]) {
      const boxes: Record<string, Box> = {};
      for (const e of elements)
        boxes[e.id] = {
          x: num(e["x"], 0),
          y: num(e["y"], 0),
          width: num(e["width"], 0),
          height: num(e["height"], 0),
        };
      return Promise.resolve(boxes);
    },
    snap: () => Promise.resolve(new Uint8Array([137, 80, 78, 71])),
  };
}

function start() {
  const appDir = tempDir();
  writeFileSync(join(appDir, "index.html"), "<p>elkdraw</p>");
  const server = startServer({
    port: 0,
    session: "t",
    open: false,
    appDir,
    dataDir: tempDir(),
    renderer: fakeRenderer,
  });
  cleanup.push(server.stop);
  return server;
}

async function post(url: string, tool: string, input: unknown) {
  const res = await fetch(`${url}/api/tools/${tool}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { status: res.status, body: await res.json() };
}

// Overlapping boxes: a node-overlap hit on the first apply.
const scene = {
  elements: [
    { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60 },
    { id: "b", type: "rectangle", x: 50, y: 20, width: 100, height: 60 },
  ],
};

test("cli apply and the MCP apply tool return identical replies", async () => {
  const viaCli = start();
  const cli = Bun.spawn(
    ["bun", CLI, "--url", viaCli.url, "apply", "--input", "-"],
    { stdin: new Blob([JSON.stringify(scene)]), stdout: "pipe" },
  );
  const cliReply = parseJson(
    z.record(z.string(), z.unknown()),
    await new Response(cli.stdout).text(),
  );
  expect(await cli.exited).toBe(0);

  const viaMcp = start();
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${viaMcp.url}/mcp`)),
  );
  cleanup.push(() => client.close());
  const mcp = await client.callTool({ name: "apply", arguments: scene });
  expect(mcp.isError).toBeFalsy();
  expect(mcp.structuredContent).toEqual(cliReply);
  expect(cliReply).toMatchObject({
    rev: 1,
    created: ["a", "b"],
    lints: [{ code: "node-overlap", ids: ["a", "b"] }],
  });
});

test("apply, validate, lint, look, diff, changes over REST", async () => {
  const { url } = start();
  const first = await post(url, "apply", scene);
  expect(first).toMatchObject({ status: 200, body: { rev: 1 } });

  // Re-applying the same file is a no-op; ifRev guards a stale write.
  expect((await post(url, "apply", scene)).body).toMatchObject({
    rev: 1,
    created: [],
    kept: 2,
  });
  const stale = await post(url, "apply", { ...scene, ifRev: 0 });
  expect(stale).toMatchObject({
    status: 400,
    body: { error: { code: "INVALID_INPUT" } },
  });

  const lint = await post(url, "lint", { ids: ["b"] });
  expect(lint.body).toMatchObject({ rev: 1, hits: [{ code: "node-overlap" }] });
  const near = await post(url, "lint", { scope: "near:a,r=10" });
  expect(near.body).toMatchObject({ hits: [{ code: "node-overlap" }] });

  const out = join(tempDir(), "look.png");
  const look = await post(url, "look", {
    target: "a,b",
    r: 20,
    marks: true,
    out,
  });
  expect(look.body).toMatchObject({
    path: out,
    bbox: { x: -20, y: -20, width: 190, height: 120 },
    scale: 1,
    boxes: { a: { x: 0, y: 0, width: 100, height: 60 } },
    marks: { a: { x: 70, y: 50 } },
  });
  expect(await Bun.file(out).exists()).toBe(true);
  expect((await post(url, "look", { target: "nope" })).status).toBe(400);

  // validate: references are checked, nothing is written.
  const bad = await post(url, "validate", {
    elements: [
      {
        id: "e",
        type: "arrow",
        x: 0,
        y: 0,
        start: { id: "a" },
        end: { id: "zz" },
      },
    ],
  });
  expect(bad).toMatchObject({ status: 400 });
  expect(JSON.stringify(bad.body)).toContain('e.end.id: no element \\"zz\\"');
  const ok = await post(url, "validate", {
    elements: [{ id: "c", type: "rectangle", x: 0, y: 0 }],
    place: [{ op: "rightOf", id: "c", of: "b", gap: 40 }],
  });
  expect(ok.body).toEqual({ ok: true, ids: ["c"] });

  // Fix: move b clear of a with a placement op.
  const fixed = await post(url, "apply", {
    ...scene,
    place: [{ op: "rightOf", id: "b", of: "a", gap: 60 }],
  });
  expect(fixed.body).toMatchObject({ rev: 2, updated: 1, lints: [] });

  const d = await post(url, "diff", {});
  expect(d.body).toMatchObject({
    changes: [{ op: "moved", ids: ["b"] }],
    lints: { added: [], fixed: [{ code: "node-overlap" }] },
    delta: "-1 node-overlap",
  });
  const changes = await post(url, "changes", {});
  expect(changes.body).toMatchObject({
    rev: 2,
    lines: [{ author: "agent", op: "applied" }],
  });
  // The cursor moved: nothing new since the last read.
  expect((await post(url, "changes", {})).body).toEqual({ rev: 2, lines: [] });
  expect((await post(url, "changes", { since: 9 })).status).toBe(400);
});

test("add fails on an existing id; bad input names the path", async () => {
  const { url } = start();
  expect((await post(url, "add", scene)).status).toBe(200);
  const again = await post(url, "add", scene);
  expect(JSON.stringify(again.body)).toContain("already exists");
  const unknown = await post(url, "apply", {
    elements: [{ id: "x", type: "rectangle", x: 0, y: 0, text: "hi" }],
  });
  expect(unknown.status).toBe(400);
  expect(JSON.stringify(unknown.body)).toContain(
    "elements[0].text: unknown key",
  );
  const place = await post(url, "apply", {
    elements: [{ id: "x", type: "rectangle", x: 0, y: 0 }],
    place: [{ op: "below", id: "x", of: "ghost", gap: 10 }],
  });
  expect(place).toMatchObject({
    status: 400,
    body: { error: { code: "INVALID_INPUT" } },
  });
});

test("describe(yct) is compact and under 4 KB", async () => {
  const file = join(
    import.meta.dir,
    "../../../test/fixtures/dogfood/yct/scene.excalidraw",
  );
  const excalidraw = (await Bun.file(file).json()) as ExcalidrawScene;
  const scene = await readScene(excalidraw);
  const text = describeText(scene);
  expect(Buffer.byteLength(text)).toBeLessThan(4096);
  // The bead's own example shape: "<id>: <from> -> <to> \"<label>\"".
  expect(text).toContain('a3: auth -> trip "3 create trip"');
});

test("get, describe, query, screenshot, snapshot, clear over REST", async () => {
  const { url } = start();
  await post(url, "apply", scene);

  const get = await post(url, "get", { id: "a" });
  expect(get.body).toMatchObject({
    rev: 1,
    element: { id: "a", type: "box", box: { x: 0, y: 0 } },
  });
  expect((await post(url, "get", { id: "nope" })).status).toBe(400);

  const describe = await post(url, "describe", {});
  expect(describe.body).toMatchObject({ rev: 1 });
  expect((describe.body as { text: string }).text).toContain("a: rectangle");

  const query = await post(url, "query", { type: "rectangle" });
  expect(query.body).toMatchObject({
    rev: 1,
    truncated: false,
    elements: [{ id: "a" }, { id: "b" }],
  });
  const limited = await post(url, "query", { type: "rectangle", limit: 1 });
  expect(limited.body).toMatchObject({ truncated: true });
  expect((limited.body as { elements: unknown[] }).elements).toHaveLength(1);

  const out = join(tempDir(), "screenshot.png");
  const screenshot = await post(url, "screenshot", { out });
  expect(screenshot.body).toMatchObject({ path: out, format: "png" });
  expect(await Bun.file(out).exists()).toBe(true);

  const save = await post(url, "snapshot", { action: "save", name: "s1" });
  expect(save.body).toMatchObject({
    rev: 1,
    snapshots: [{ name: "s1", rev: 1 }],
  });
  expect((await post(url, "snapshot", { action: "list" })).body).toEqual(
    save.body,
  );
  expect(
    (await post(url, "snapshot", { action: "restore", name: "nope" })).status,
  ).toBe(400);

  const clear = await post(url, "clear", { yes: true });
  expect(clear.body).toEqual({ rev: 2, deleted: 2 });
  expect((await post(url, "get", { id: "a" })).status).toBe(400);
});

test("snapshot restore round-trips a scene, as one apply-like write", async () => {
  const { url } = start();
  await post(url, "apply", scene); // rev 1: a, b
  await post(url, "snapshot", { action: "save", name: "before" });
  const before = await post(url, "describe", {});

  // Move b and delete... nothing to delete here, but change b's box.
  await post(url, "apply", {
    elements: [{ id: "b", type: "rectangle", x: 500, y: 500 }],
  });
  await post(url, "add", {
    elements: [{ id: "c", type: "rectangle", x: 0, y: 0 }],
  });
  const changed = await post(url, "describe", {});
  expect(changed.body).not.toEqual(before.body);

  const restore = await post(url, "snapshot", {
    action: "restore",
    name: "before",
  });
  expect((restore.body as { rev: number }).rev).toBeGreaterThan(3);
  const after = await post(url, "describe", {});
  // Same scene, in neutral form: rev moved on (restore is its own write).
  expect((after.body as { text: string }).text).toEqual(
    (before.body as { text: string }).text,
  );
  // Visible in the change feed, per the bead: restore is one apply-like write.
  const changes = await post(url, "changes", { since: 0 });
  const ops = (changes.body as { lines: { op: string }[] }).lines.map(
    (l) => l.op,
  );
  expect(ops).toContain("applied");
});

const cliOnly: { name: string; args: Record<string, unknown> }[] = [
  { name: "get", args: { id: "a" } },
  { name: "describe", args: {} },
  { name: "query", args: { type: "rectangle" } },
  { name: "clear", args: { yes: true } },
];

for (const { name, args } of cliOnly) {
  test(`cli and MCP ${name} replies are identical`, async () => {
    const viaCli = start();
    await post(viaCli.url, "apply", scene);
    const cli = Bun.spawn(
      ["bun", CLI, "--url", viaCli.url, name, "--input", "-"],
      { stdin: new Blob([JSON.stringify(args)]), stdout: "pipe" },
    );
    const cliReply = parseJson(
      z.record(z.string(), z.unknown()),
      await new Response(cli.stdout).text(),
    );
    expect(await cli.exited).toBe(0);

    const viaMcp = start();
    await post(viaMcp.url, "apply", scene);
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${viaMcp.url}/mcp`)),
    );
    try {
      const mcp = await client.callTool({ name, arguments: args });
      expect(mcp.isError).toBeFalsy();
      expect(mcp.structuredContent).toEqual(cliReply);
    } finally {
      await client.close();
    }
  });
}

test("cli and MCP screenshot replies are identical (same explicit out)", async () => {
  const cliOut = join(tempDir(), "cli-screenshot.png");
  const mcpOut = join(tempDir(), "mcp-screenshot.png");

  const viaCli = start();
  await post(viaCli.url, "apply", scene);
  const cli = Bun.spawn(
    ["bun", CLI, "--url", viaCli.url, "screenshot", "--input", "-"],
    { stdin: new Blob([JSON.stringify({ out: cliOut })]), stdout: "pipe" },
  );
  const cliReply = parseJson(
    z.record(z.string(), z.unknown()),
    await new Response(cli.stdout).text(),
  );
  expect(await cli.exited).toBe(0);

  const viaMcp = start();
  await post(viaMcp.url, "apply", scene);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${viaMcp.url}/mcp`)),
  );
  try {
    const mcp = await client.callTool({
      name: "screenshot",
      arguments: { out: mcpOut },
    });
    expect(mcp.isError).toBeFalsy();
    // `path` is the one field that must differ (each got its own explicit out).
    const { path: cliPath, ...cliRest } = cliReply;
    const mcpStruct = mcp.structuredContent as Record<string, unknown>;
    const { path: mcpPath, ...mcpRest } = mcpStruct;
    expect(cliPath).toBe(cliOut);
    expect(mcpPath).toBe(mcpOut);
    expect(mcpRest).toEqual(cliRest);
  } finally {
    await client.close();
  }
});

test("cli and MCP snapshot replies are identical (time masked)", async () => {
  const maskTime = (body: unknown) => {
    const b = body as { snapshots: { time: string }[] };
    return { ...b, snapshots: b.snapshots.map((s) => ({ ...s, time: "*" })) };
  };

  const viaCli = start();
  await post(viaCli.url, "apply", scene);
  const cli = Bun.spawn(
    ["bun", CLI, "--url", viaCli.url, "snapshot", "--input", "-"],
    {
      stdin: new Blob([JSON.stringify({ action: "save", name: "s1" })]),
      stdout: "pipe",
    },
  );
  const cliReply = parseJson(
    z.record(z.string(), z.unknown()),
    await new Response(cli.stdout).text(),
  );
  expect(await cli.exited).toBe(0);

  const viaMcp = start();
  await post(viaMcp.url, "apply", scene);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${viaMcp.url}/mcp`)),
  );
  try {
    const mcp = await client.callTool({
      name: "snapshot",
      arguments: { action: "save", name: "s1" },
    });
    expect(mcp.isError).toBeFalsy();
    expect(maskTime(mcp.structuredContent)).toEqual(maskTime(cliReply));
  } finally {
    await client.close();
  }
});
