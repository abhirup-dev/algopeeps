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
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { z } from "zod";
import { type Renderer, startServer } from "./index.ts";

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
