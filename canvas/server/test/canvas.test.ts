// WP-B contract scenarios (canvas/briefs/WP-B-server.md): one server, one
// session, sequential tests building on each other.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { Store } from "../src/store.js";
import { startServer } from "../src/main.js";
import { RESOURCE_URI } from "../src/server.js";

const SESSION = "wp-b-test";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-server-test-"));

const text = (r: CallToolResult) =>
  r.content.map((c) => (c.type === "text" ? c.text : "")).join("");

async function connect(port: number) {
  const client = new Client(
    { name: "wp-b-test", version: "0.0.0" },
    { capabilities: {} },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
  );
  return client;
}

async function callJson(
  client: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${text(r)}`);
  return JSON.parse(text(r));
}

let client!: Client;
let closeServer!: () => void;
let assetIds: string[] = [];
let readBeforeRestart: unknown;

// node:test runs tests in a file serially in declaration order; the tests
// below build on this one.
await test("0. setup: server on ephemeral port", async () => {
  const s = await startServer(0, new Store(dir));
  closeServer = s.close;
  client = await connect(s.port);
});

await test("1. open → asset → read shows agent ownership, colour, no lock", async () => {
  const open = await client.callTool({
    name: "canvas_open",
    arguments: { session: SESSION },
  });
  assert.ok(!open.isError, text(open));
  assert.match(
    text(open),
    new RegExp(`${SESSION}, rev \\d+, \\d+ agent, \\d+ human`),
  );

  const asset = await callJson(client, "canvas_asset", {
    session: SESSION,
    kind: "array",
    name: "nums",
    x: 100,
    y: 100,
    values: [2, 7, 11, 15],
    showIndex: true,
    pointers: [{ label: "i", index: 0 }],
  });
  assetIds = asset.ids;
  assert.ok(asset.groupId);
  assert.ok(asset.ids.length >= 4);

  const read = await callJson(client, "canvas_read", { session: SESSION });
  assert.ok(read.elements.length >= asset.ids.length);
  for (const id of asset.ids) {
    const c = read.elements.find((e: { id: string }) => e.id === id);
    assert.equal(c.owner, "agent", `${id} owner`);
  }

  // full elements (colour/lock) only visible to the app via canvas_pull
  const pull = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: 0,
  });
  for (const id of asset.ids) {
    const el = pull.upserts.find((e: { id: string }) => e.id === id);
    assert.ok(el, `${id} in pull`);
    assert.equal(el.strokeColor, "#9c36b5", `${id} colour stamped`);
    assert.notEqual(el.locked, true, `${id} must not be locked (v1.2 §2)`);
    assert.equal(el.customData?.asset?.kind, "array");
    assert.equal(el.customData?.asset?.name, "nums");
  }

  const resource = await client.readResource({ uri: RESOURCE_URI });
  const html = resource.contents[0] as { text?: string };
  assert.match(html.text ?? "", /<html/i);
});

await test("2. save: human edits accepted, agent edits by human tagged + logged (v1.2)", async () => {
  // simulate the app: a new human element + conversion of agent skeletons
  const pull0 = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: 0,
  });
  const humanBox = {
    id: "h1",
    type: "rectangle",
    x: 0,
    y: 300,
    width: 100,
    height: 50,
    version: 1,
    versionNonce: 11,
  };
  const converted = pull0.upserts.map(
    (el: Record<string, unknown>, i: number) => ({
      ...el,
      seed: 1000 + i,
      version: 2,
      versionNonce: 2000 + i,
    }),
  );
  const save1 = await callJson(client, "canvas_save", {
    session: SESSION,
    elements: [humanBox, ...converted],
  });
  assert.deepEqual(save1.rejected, []);

  // move the human box AND move an agent element (seed-bearing, so no
  // conversion-accept): both accepted, the agent one tagged editedBy human
  const agentId = assetIds[0]!;
  const movedAgent = {
    ...converted.find((e: { id: string }) => e.id === agentId)!,
    x: 999,
    version: 3,
    versionNonce: 3,
  };
  const save2 = await callJson(client, "canvas_save", {
    session: SESSION,
    elements: [
      { ...humanBox, x: 40, version: 2, versionNonce: 22 },
      ...converted.filter((e: { id: string }) => e.id !== agentId),
      movedAgent,
    ],
  });
  assert.deepEqual(save2.rejected, []);

  const rdA = await callJson(client, "canvas_read", {
    session: SESSION,
    owner: "agent",
  });
  const vic = rdA.elements.find((e: { id: string }) => e.id === agentId);
  assert.equal(vic?.x, 999, "moved agent element not applied");
  assert.equal(vic?.owner, "agent", "owner kept as provenance");
  assert.equal(vic?.editedBy, "human", "human edit tagged");

  const changes = await callJson(client, "canvas_changes", {
    session: SESSION,
    since: pull0.rev, // before save1/save2 — rdA above advanced the cursor
  });
  const added = changes.human.added.map((e: { id: string }) => e.id);
  const changed = changes.human.changed.map((e: { id: string }) => e.id);
  assert.ok(added.includes("h1"), "h1 reported in changes.added");
  assert.ok(
    changed.includes(agentId),
    `human-edited agent element in changes.changed: ${JSON.stringify(changed)}`,
  );

  const events = fs
    .readFileSync(path.join(dir, SESSION, "events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  // save1's human_edit also names the id (conversion-accept); the human-edit
  // event is the LAST one naming it
  const he = events
    .filter((e) => e.type === "human_edit" && e.ids?.includes(agentId))
    .at(-1);
  assert.ok(he, "human_edit event names the agent id");
  assert.equal(he.detail?.agentOwned, true, "detail.agentOwned flag");
});

await test("3. pull since:0 everything; since:rev only the delta", async () => {
  const full = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: 0,
  });
  assert.equal(full.upserts.length, assetIds.length + 1); // asset members + h1

  const revBefore = await callJson(client, "canvas_read", { session: SESSION });
  await callJson(client, "canvas_save", {
    session: SESSION,
    elements: full.upserts.map((el: { id: string }) =>
      el.id === "h1" ? { ...el, x: 80, version: 3, versionNonce: 33 } : el,
    ),
  });
  const delta = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: revBefore.rev,
  });
  assert.deepEqual(
    delta.upserts.map((e: { id: string }) => e.id),
    ["h1"],
  );
});

await test("4. camera delivered once by rev", async () => {
  const before = await callJson(client, "canvas_read", { session: SESSION });
  const cam = await callJson(client, "canvas_camera", {
    session: SESSION,
    fitAll: true,
  });
  assert.ok(cam.rev > before.rev);
  const p1 = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: before.rev,
  });
  assert.ok(p1.camera, "next pull carries camera");
  assert.equal(p1.camera.rev, cam.rev);
  const p2 = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: p1.rev,
  });
  assert.equal(p2.camera, undefined, "subsequent pull does not");
});

await test("4b. annotate reply: plain text below, no prefix, ≥ 240 px wide", async () => {
  const rep = await callJson(client, "canvas_annotate", {
    session: SESSION,
    kind: "reply",
    ref: "h1",
    text: "yes, swap those two",
  });
  assert.ok(rep.ids.length === 1);
  const rd = await callJson(client, "canvas_read", {
    session: SESSION,
    owner: "agent",
  });
  const r = rd.elements.find((e: { id: string }) => e.id === rep.ids[0]);
  assert.ok(r, "reply element in read");
  assert.equal(r.kind, "reply");
  assert.equal(r.ref, "h1");
  assert.equal(r.text, "yes, swap those two", "no ✗/⟂ prefix");
  assert.equal(r.x, 80, "left-aligned to ref (h1 at x=80)");
  assert.equal(r.y, 300 + 50 + 24, "24 px below ref's bbox");
  assert.equal(r.w, 240, "width = max(ref width, 240)");
});

await test("5. events.jsonl persists; store rebuilds from disk", async () => {
  readBeforeRestart = await callJson(client, "canvas_read", {
    session: SESSION,
  });
  const file = path.join(dir, SESSION, "events.jsonl");
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  assert.ok(lines.length >= 5, `events: ${lines.length}`);

  await client.close();
  closeServer();

  const s2 = await startServer(0, new Store(dir)); // fresh store → rebuild from disk
  const c2 = await connect(s2.port);
  const readAfter = await callJson(c2, "canvas_read", { session: SESSION });
  await c2.close();
  s2.close();
  assert.deepEqual(readAfter, readBeforeRestart);
});

await test("6. moved unconverted agent element is accepted as a human edit (WP-J)", () => {
  const store = new Store(dir);
  const s = "wp-j-unit";
  store.open(s);
  const d = store.draw(s, [
    { type: "rectangle", x: 10, y: 10, width: 56, height: 56, text: "1" },
  ]);
  const stored = store.live(store.session(s)).find((e) => e.id === d.ids[0])!;
  assert.equal(
    (stored as { seed?: unknown }).seed,
    undefined,
    "stored is an unconverted skeleton",
  );
  const r = store.save(s, [
    { ...stored, x: 60, seed: 1, version: 2, versionNonce: 9 },
  ]);
  assert.deepEqual(r.rejected, []);
  const after = store.live(store.session(s)).find((e) => e.id === d.ids[0])!;
  assert.equal(after.x, 60, "human move applied");
  assert.equal(after.customData?.owner, "agent", "owner kept as provenance");
  assert.equal(after.customData?.editedBy, "human", "editedBy stamped");
  const he = fs
    .readFileSync(path.join(dir, s, "events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .find((e) => e.type === "human_edit");
  assert.ok(he?.ids?.includes(d.ids[0]!), "human_edit event logged");
  assert.equal(he.detail?.agentOwned, true);
});

await test("7. agent tool may edit a human id: accepted, owner kept, editedBy agent (v1.2 rule 2)", () => {
  const store = new Store(dir);
  const s = "wp-j-agent-edit";
  store.open(s);
  store.save(s, [
    { id: "h", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
  ]);
  const d = store.draw(s, [
    { id: "h", type: "rectangle", x: 5, y: 5, width: 10, height: 10 },
  ]);
  assert.deepEqual(d.ids, ["h"]);
  const el = store.live(store.session(s)).find((e) => e.id === "h")!;
  assert.equal(el.x, 5, "agent edit applied");
  assert.equal(el.customData?.owner, undefined, "owner stays human");
  assert.equal(el.customData?.editedBy, "agent", "editedBy stamped");
  assert.notEqual(el.strokeColor, "#9c36b5", "not restamped agent purple");
  const ev = fs
    .readFileSync(path.join(dir, s, "events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .find((e) => e.type === "draw");
  assert.ok(ev, "draw event logged");
  assert.equal(ev.detail?.humanOwned, true, "detail.humanOwned flag");
});

await test("8. omitted agent id in canvas_save is a deletion, not a rejection", () => {
  const store = new Store(dir);
  const s = "wp-j-delete";
  store.open(s);
  const d = store.draw(s, [
    { type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
    { type: "rectangle", x: 40, y: 0, width: 10, height: 10 },
  ]);
  const [keep, drop] = d.ids as [string, string];
  const r = store.save(
    s,
    store.live(store.session(s)).filter((e) => e.id !== drop),
  );
  assert.deepEqual(r.rejected, []);
  assert.ok(
    !store.live(store.session(s)).some((e) => e.id === drop),
    "agent element deleted",
  );
  assert.ok(
    store.live(store.session(s)).some((e) => e.id === keep),
    "kept",
  );
  const ch = store.changes(s, 0);
  assert.ok(ch.human.deleted.includes(drop), "deletion in changes.deleted");
});

// -- WP-O: id-anchored comment threads (§12) -------------------------------

let threadId = "";

await test("9. threads: two targets are tagged and replies round-trip", async () => {
  const s3 = await startServer(0, new Store(dir));
  closeServer = s3.close;
  client = await connect(s3.port);

  const before = await callJson(client, "canvas_read", { session: SESSION });
  const agentTarget = assetIds[0]!;
  const post = await callJson(client, "canvas_thread_post", {
    session: SESSION,
    targetIds: ["h1", agentTarget],
    text: "why do these move together?",
  });
  threadId = post.threadId;
  assert.deepEqual(post.targetIds, ["h1", agentTarget]);
  assert.equal(post.anchorId, "h1");

  const pull = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: before.rev,
  });
  for (const targetId of ["h1", agentTarget]) {
    const target = pull.upserts.find((e: { id: string }) => e.id === targetId);
    assert.ok(target, `${targetId} bumped in pull`);
    assert.ok(target.customData?.threads.includes(threadId));
  }
  assert.ok(
    !pull.upserts.some(
      (e: { customData?: { kind?: string } }) =>
        e.customData?.kind === "comment",
    ),
  );

  const list = await callJson(client, "canvas_threads", { session: SESSION });
  const t = list.threads.find((x: { id: string }) => x.id === threadId);
  assert.deepEqual(t.targetIds, ["h1", agentTarget]);
  assert.equal(t.detached, false);
  assert.ok(t.near.length <= 8);

  const rep = await callJson(client, "canvas_reply", {
    session: SESSION,
    threadId,
    text: "they share one invariant",
  });
  assert.equal(rep.messageId, "m2");
  await callJson(client, "canvas_thread_post", {
    session: SESSION,
    threadId,
    text: "got it",
  });
  const after = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: list.rev,
  });
  const changed = after.threads.find((x: { id: string }) => x.id === threadId);
  assert.equal(changed.messages.length, 3);
});

await test("10. deleting every target detaches without resolving", async () => {
  const full = await callJson(client, "canvas_pull", {
    session: SESSION,
    since: 0,
  });
  const targetIds = new Set(["h1", assetIds[0]!]);
  const save = await callJson(client, "canvas_save", {
    session: SESSION,
    elements: full.upserts.filter((e: { id: string }) => !targetIds.has(e.id)),
  });
  await callJson(client, "canvas_thread_set", {
    session: SESSION,
    threadId,
    anchor: { x: 240, y: 300 },
  });
  const all = await callJson(client, "canvas_threads", {
    session: SESSION,
    status: "all",
    since: save.rev - 1,
  });
  const t = all.threads.find((x: { id: string }) => x.id === threadId);
  assert.equal(t.status, "open");
  assert.equal(t.detached, true);
  assert.deepEqual(t.anchor, { x: 240, y: 300 });
});

await test("11. unknown target id is rejected", async () => {
  const response = await client.callTool({
    name: "canvas_comment",
    arguments: {
      session: SESSION,
      targetIds: ["missing-target"],
      text: "where is this?",
    },
  });
  assert.equal(response.isError, true);
  assert.match(
    response.content.find((c) => c.type === "text")?.text ?? "",
    /unknown target ids/,
  );
});

await test("12. legacy anchorId-only threads replay as targetIds", async () => {
  await client.close();
  closeServer();
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-legacy-"));
  const session = "legacy-thread";
  fs.mkdirSync(path.join(legacyDir, session), { recursive: true });
  fs.writeFileSync(
    path.join(legacyDir, session, "events.jsonl"),
    `${JSON.stringify({
      ts: new Date().toISOString(),
      session,
      rev: 1,
      actor: "system",
      type: "keyframe",
      detail: {},
      elements: [
        {
          id: "old-target",
          type: "rectangle",
          x: 1,
          y: 2,
          width: 3,
          height: 4,
        },
      ],
      threads: [
        {
          id: "t_legacy",
          anchorId: "old-target",
          status: "open",
          collapsed: false,
          rev: 1,
          messages: [],
        },
      ],
    })}\n`,
  );
  const s2 = await startServer(0, new Store(legacyDir));
  const c2 = await connect(s2.port);
  const all = await callJson(c2, "canvas_threads", { session, status: "all" });
  assert.deepEqual(all.threads[0].targetIds, ["old-target"]);
  assert.equal(all.threads[0].anchorId, "old-target");
  await c2.close();
  s2.close();
});

await test("13. text annotate + conversion save: accepted, event tagged, not a human edit", () => {
  const store = new Store(dir);
  const s = "wp-l-conversion";
  store.open(s);
  const d = store.draw(
    s,
    [
      {
        type: "text",
        x: 100,
        y: 100,
        width: 240,
        height: 25,
        text: "✗ note",
        fontSize: 20,
      },
    ],
    { kind: "counterexample", ref: "r", type: "annotate" },
  );
  const id = d.ids[0]!;
  const stored = store.live(store.session(s)).find((e) => e.id === id)!;
  assert.equal((stored as { seed?: unknown }).seed, undefined, "skeleton");
  // the app's converted form: seed + measured width, x/y unchanged
  const r = store.save(s, [
    {
      ...stored,
      seed: 42,
      width: 176.48,
      version: 3,
      versionNonce: 7,
      lineHeight: 1.25,
    },
  ]);
  assert.deepEqual(r.rejected, []);
  const after = store.live(store.session(s)).find((e) => e.id === id)!;
  assert.equal(
    after.customData?.editedBy,
    undefined,
    "conversion is not a human edit",
  );
  assert.equal(after.width, 176.48, "converted width stored");
  const ev = fs
    .readFileSync(path.join(dir, s, "events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .find((e) => e.type === "human_edit" && e.ids?.includes(id));
  assert.ok(ev, "conversion save logged (replay needs it)");
  assert.deepEqual(ev.detail?.converted, [id], "tagged detail.converted");
  assert.notEqual(ev.detail?.agentOwned, true, "not flagged agentOwned");
});
