#!/usr/bin/env npx tsx
// WP-E — black-box smoke of the running canvas server (canvas/CONTRACT.md §3).
// Needs the server up: `bun --cwd canvas/server run dev` (port 3100, or
// CANVAS_URL=... for a different one). Server absent → exits 2. Any failed
// step → exit 1. One PASS/FAIL line per step.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const SERVER_URL = new URL(process.env.CANVAS_URL ?? "http://127.0.0.1:3100/mcp");
// Same usage as @modelcontextprotocol/ext-apps (getUiCapability/EXTENSION_ID):
// the client advertises the MCP-Apps extension in initialize.
const EXTENSION_ID = "io.modelcontextprotocol/ui";
const APP_MIME = "text/html;profile=mcp-app";

const MODEL_TOOLS = [
  "canvas_open", "canvas_guide", "canvas_read", "canvas_describe", "canvas_changes",
  "canvas_draw", "canvas_annotate", "canvas_asset", "canvas_camera",
  "canvas_screenshot", "canvas_snapshot",
  "canvas_threads", "canvas_comment", "canvas_reply", "canvas_resolve",
];
const APP_TOOLS = [
  "canvas_pull", "canvas_save", "canvas_screenshot_result",
  "canvas_thread_post", "canvas_thread_set",
];

let failed = 0;
const oneLine = (e: unknown) => String(e instanceof Error ? e.message : e).split("\n")[0];

async function step(n: number, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`${n} PASS ${name}`);
  } catch (e) {
    failed++;
    console.log(`${n} FAIL ${name} — ${oneLine(e)}`);
  }
}

const textOf = (res: any): string => {
  const c = res?.content?.find((x: any) => x.type === "text");
  assert(c, "result has no text content");
  return c.text;
};
const jsonOf = (res: any): any => JSON.parse(textOf(res));
const call = async (client: Client, name: string, args: Record<string, unknown>) =>
  jsonOf(await client.callTool({ name, arguments: args }));
const uiOf = (t: any) => t?._meta?.ui; // legacy `_meta["ui/resourceUri"]` normalised by ext-apps helpers

async function connect(): Promise<Client> {
  const client = new Client(
    { name: "wp-e-smoke", version: "0.1.0" },
    { capabilities: { extensions: { [EXTENSION_ID]: {} } } as any },
  );
  await client.connect(new StreamableHTTPClientTransport(SERVER_URL), { timeout: 3000 });
  return client;
}

let client: Client;
try {
  client = await connect();
} catch {
  console.log("server not running — start with bun --cwd canvas/server run dev (or set CANVAS_URL)");
  process.exit(2);
}
console.log(`1 PASS server reachable at ${SERVER_URL} (initialize ok, ${EXTENSION_ID} advertised)`);

const session = `smoke-${Date.now().toString(36)}`;
const humanId = "h-smoke-1";
let rev = 0; // last known rev, tracked across steps

await step(2, "tools/list + resources/read match §3", async () => {
  const tools = new Map((await client.listTools()).tools.map((t: any) => [t.name, t]));
  for (const name of [...MODEL_TOOLS, ...APP_TOOLS]) assert(tools.has(name), `missing tool ${name}`);
  for (const name of APP_TOOLS) {
    const vis = uiOf(tools.get(name))?.visibility;
    assert(Array.isArray(vis) && vis.includes("app"), `${name} missing _meta.ui.visibility ["app"]`);
  }
  assert.equal(uiOf(tools.get("canvas_open"))?.resourceUri, "ui://algopeeps/canvas.html",
    "canvas_open resourceUri");
  const r = await client.readResource({ uri: "ui://algopeeps/canvas.html" });
  assert.equal(r.contents[0]?.mimeType, APP_MIME);
  assert(r.contents[0]?.text?.length > 0, "app html empty");
});

await step(3, "open + asset + read + describe", async () => {
  const open = textOf(await client.callTool({ name: "canvas_open", arguments: { session } }));
  assert(open.includes(session), "canvas_open summary line lacks session");
  const asset = await call(client, "canvas_asset", {
    session, kind: "array", name: "nums", values: [2, 7, 11, 15],
    pointers: [{ label: "i", index: 0 }, { label: "j", index: 1 }], x: 100, y: 100,
  });
  rev = asset.rev;
  const rd = await call(client, "canvas_read", { session });
  assert(rd.elements.length > 0, "no elements after asset");
  for (const el of rd.elements) assert.equal(el.owner, "agent", `element ${el.id} not agent`);
  const desc = textOf(await client.callTool({ name: "canvas_describe", arguments: { session } }));
  assert(desc.includes("[agent]"), "describe lacks [agent] tag");
});

let humanEl: any; let movedId: string; let revAfterSave = 0;
await step(4, "app simulation: save with moved agent + new human element", async () => {
  const pulled = await call(client, "canvas_pull", { session, since: 0 });
  const scene: any[] = pulled.upserts;
  assert(scene.length > 0, "pull returned empty scene");
  movedId = scene[0].id;
  const origX = scene[0].x ?? 0;
  // a real app edit: move +50 x, bump version/nonce (§3 canvas_save diff keys)
  const moved = {
    ...scene[0], x: origX + 50,
    version: ((scene[0].version as number) ?? 1) + 1, versionNonce: 777,
  };
  humanEl = {
    id: humanId, type: "rectangle", x: 400, y: 100, width: 120, height: 80,
    seed: 7, version: 1, versionNonce: 42, isDeleted: false, groupIds: [],
    strokeColor: "#000000", backgroundColor: "transparent",
  };
  const save = await call(client, "canvas_save", {
    session, elements: [...scene.filter((e) => e.id !== movedId), moved, humanEl],
  });
  assert.deepEqual(save.rejected, [],
    `expected no rejections (v1.2 rule 3), got ${JSON.stringify(save.rejected)}`);
  revAfterSave = save.rev;
  // accepted: moved, owner kept, editedBy human (v1.2 §2 rule 3)
  const rdA = await call(client, "canvas_read", { session, owner: "agent" });
  const vic = rdA.elements.find((e: any) => e.id === movedId);
  assert(vic && vic.x === origX + 50,
    `agent element ${movedId} not moved (x=${vic?.x}, expected ${origX + 50})`);
  assert(vic?.editedBy === "human", `moved agent element lacks editedBy:"human"`);
  const rdH = await call(client, "canvas_read", { session, owner: "human" });
  assert(rdH.elements.some((e: any) => e.id === humanId), "human rect not in canvas_read");
  const ch = await call(client, "canvas_changes", { session, since: rev });
  const added = ch.human.added.map((e: any) => e.id);
  assert(added.includes(humanId), `human rect not in changes.added: ${JSON.stringify(added)}`);
  const changed = ch.human.changed.map((e: any) => e.id);
  assert(changed.includes(movedId),
    `moved agent element not in changes.changed: ${JSON.stringify(changed)}`);
});

let revAfterCamera = 0;
await step(5, "camera is pulled exactly once", async () => {
  const cam = await call(client, "canvas_camera", { session, fitAll: true });
  revAfterCamera = cam.rev;
  const p1 = await call(client, "canvas_pull", { session, since: revAfterSave });
  assert(p1.camera, `pull since ${revAfterSave} lacks camera`);
  const p2 = await call(client, "canvas_pull", { session, since: revAfterCamera });
  assert(!p2.camera, `pull since ${revAfterCamera} still carries camera`);
});

await step(6, "annotate: circle + counterexample", async () => {
  await call(client, "canvas_annotate", { session, kind: "circle", ref: humanId });
  await call(client, "canvas_annotate", { session, kind: "counterexample", ref: humanId, text: "[3,3], target 6" });
  const rd = await call(client, "canvas_read", { session, owner: "agent" });
  const circ = rd.elements.find((e: any) => e.kind === "circle" && e.ref === humanId);
  assert(circ && circ.type === "ellipse", "no agent ellipse circle around human rect");
  const ce = rd.elements.find((e: any) => e.kind === "counterexample" && e.ref === humanId);
  assert(ce?.text?.includes("✗"), "counterexample text lacks ✗ prefix");
});

await step(7, "snapshot + events.jsonl", async () => {
  await call(client, "canvas_snapshot", { session, name: "end" });
  const path = join(homedir(), ".local/share/algopeeps/canvas", session, "events.jsonl");
  const lines = readFileSync(path, "utf8").trim().split("\n");
  assert(lines.length >= 7, `only ${lines.length} events`); // v1.1: snapshot = one keyframe line, no separate snapshot event
  const kf = lines.map((l) => JSON.parse(l) as any)
    .find((e) => e.type === "keyframe" && e.detail?.name === "end");
  assert(kf, "no keyframe event with detail.name 'end'");
});

await step(8, "threads: human open → agent reply → pull round trip", async () => {
  const post = await call(client, "canvas_thread_post", {
    session, targetIds: [humanId], text: "why is j at index 1?",
  });
  assert.match(post.threadId, /^t_[A-Za-z0-9]{6}$/, "thread id shape");
  assert.deepEqual(post.targetIds, [humanId]);
  assert.equal(post.anchorId, humanId);

  const list = await call(client, "canvas_threads", { session });
  const t = list.threads.find((x: any) => x.id === post.threadId);
  assert(t && t.messages.length === 1 && t.messages[0].author === "human",
    "human-open thread visible to the agent");
  assert.deepEqual(t.targetIds, [humanId]);
  assert.equal(t.detached, false);
  assert(t.anchor && t.anchor.x === 520 && t.anchor.y === 100, "union bbox top-right anchor");
  assert(t.near?.length <= 8, "near capped at 8");

  const rep = await call(client, "canvas_reply", {
    session, threadId: post.threadId, text: "j scans right of i",
  });
  assert.equal(rep.messageId, "m2");

  const pull = await call(client, "canvas_pull", { session, since: list.rev });
  const pt = pull.threads?.find((x: any) => x.id === post.threadId);
  assert(pt && pt.messages.length === 2,
    `pull thread has ${pt?.messages?.length} messages, want 2`);
  assert(Array.isArray(pull.threadDeletes), "threadDeletes present");

  const set = await call(client, "canvas_thread_set", {
    session, threadId: post.threadId, collapsed: true,
  });
  assert(set.rev > rep.rev, "thread_set bumps rev");
});

await step(9, "smoke complete", async () => {
  assert.equal(failed, 0, `${failed} earlier step(s) failed`);
});

console.log(failed ? `WP-E smoke: ${failed} step(s) FAILED (session ${session})` : `WP-E smoke: all steps passed (session ${session})`);
process.exit(failed ? 1 : 0);
