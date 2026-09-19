// All contract tools (CONTRACT §3) wired to a shared Store instance.
// Stateless: main.ts builds a fresh McpServer per HTTP request around one
// process-global store, so tool state (scenes, pending screenshots) survives
// across requests.
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  McpServer,
  type CallToolResult,
  type ReadResourceResult,
} from "@modelcontextprotocol/server";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import {
  bboxOf,
  boxesIntersect,
  describeScene,
  generate as generateAsset,
  isSessionId,
  ownerOf,
  toCompact,
  type AgentElement,
  type Camera,
  type Element,
  type Thread,
} from "@algopeeps/canvas-shared";
import type { Store } from "./store.js";

export const RESOURCE_URI = "ui://algopeeps/canvas.html";
const APP_HTML = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "app",
  "dist",
  "canvas.html",
);
const GUIDE = path.resolve(import.meta.dirname, "guide.md");

const session = z.string().refine(isSessionId, "invalid session slug");
const agentType = z.enum([
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "freedraw",
]);
const agentElement = z.looseObject({
  type: agentType,
  x: z.number(),
  y: z.number(),
});
const bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const json = (obj: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(obj) }],
});
const err = (msg: string): CallToolResult => ({
  content: [{ type: "text", text: msg }],
  isError: true,
});

export function createServer(store: Store): McpServer {
  const server = new McpServer({ name: "algopeeps-canvas", version: "0.1.0" });
  const st = (id: string) => store.session(id);
  const threadView = (id: string, thread: Thread, includeNear = false) => {
    const s = st(id);
    const targetIds = thread.targetIds?.length
      ? thread.targetIds
      : [thread.anchorId];
    const targets = targetIds
      .map((targetId) => s.elements.get(targetId))
      .filter((target): target is Element => Boolean(target));
    const detached = targets.length === 0;
    if (detached)
      return {
        ...thread,
        targetIds,
        anchorId: targetIds[0],
        detached: true,
        ...(includeNear ? { near: [] } : {}),
      };
    const boxes = targets.map(bboxOf);
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const near = includeNear
      ? store
          .live(s)
          .filter((element) => !targetIds.includes(element.id))
          .map((element) => ({ element, box: bboxOf(element) }))
          .map(({ element, box }) => ({
            element,
            distance: Math.max(
              Math.max(box.x - cx, 0, cx - (box.x + box.width)),
              Math.max(box.y - cy, 0, cy - (box.y + box.height)),
            ),
          }))
          .filter(({ distance }) => distance <= 160)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 8)
          .map(({ element }) =>
            toCompact(element, s.revOf.get(element.id)!, s.elements),
          )
      : undefined;
    return {
      ...thread,
      targetIds,
      anchorId: targetIds[0],
      anchor: { x: right, y: top },
      detached: false,
      ...(near ? { near } : {}),
    };
  };

  // -- model-visible tools --------------------------------------------------

  registerAppTool(
    server,
    "canvas_open",
    {
      title: "Open canvas",
      description:
        "Open (or switch to) a whiteboard session. Idempotent — reopening never resets it. " +
        "The first call per conversation also opens the interactive view.",
      // ponytail: default so a bare host bookmark (?tool=canvas_open&call=true) opens the demo board
      inputSchema: z.object({ session: session.default("demo") }),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    ({ session: id }): CallToolResult => {
      const { rev, counts } = store.open(id);
      return {
        content: [
          {
            type: "text",
            text: `${id}, rev ${rev}, ${counts.agent} agent, ${counts.human} human`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "canvas_guide",
    {
      description:
        "Element cheat-sheet: agent format, colours, camera rules, worked examples. Call before drawing.",
    },
    async (): Promise<CallToolResult> => ({
      content: [{ type: "text", text: await fs.readFile(GUIDE, "utf8") }],
    }),
  );

  server.registerTool(
    "canvas_read",
    {
      description:
        "Read elements as compact summaries. Filter by owner, ids, and/or bbox.",
      inputSchema: z.object({
        session,
        owner: z.enum(["human", "agent"]).optional(),
        ids: z.array(z.string()).optional(),
        bbox: bbox.optional(),
      }),
    },
    ({ session: id, owner, ids, bbox: bb }): CallToolResult => {
      const s = st(id);
      let els = store.live(s);
      if (owner) els = els.filter((e) => ownerOf(e) === owner);
      if (ids) {
        const want = new Set(ids);
        els = els.filter((e) => want.has(e.id));
      }
      if (bb) {
        const box = {
          x: bb[0],
          y: bb[1],
          width: bb[2] - bb[0],
          height: bb[3] - bb[1],
        };
        els = els.filter((e) => boxesIntersect(bboxOf(e), box));
      }
      const compact = els.map((e) =>
        toCompact(e, s.revOf.get(e.id)!, s.elements),
      );
      store.advanceCursor(s);
      return json({ rev: s.rev, elements: compact });
    },
  );

  server.registerTool(
    "canvas_describe",
    {
      description:
        "Human-readable scene description with [agent]/[human] ownership per element.",
      inputSchema: z.object({ session }),
    },
    ({ session: id }): CallToolResult => {
      const s = st(id);
      const text = describeScene(store.live(s));
      store.advanceCursor(s);
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "canvas_changes",
    {
      description:
        "Changes made by the human since a rev: their own elements added/changed/deleted plus your elements they edited (`editedBy`). `since` defaults to the rev of your previous read in this session.",
      inputSchema: z.object({ session, since: z.number().optional() }),
    },
    ({ session: id, since }): CallToolResult => {
      const s = st(id);
      const { rev, human, threads } = store.changes(id, since ?? s.cursor);
      const byId = s.elements;
      store.advanceCursor(s);
      return json({
        rev,
        human: {
          added: human.added.map(({ el, rev: r }) => toCompact(el, r, byId)),
          changed: human.changed.map(({ el, rev: r }) =>
            toCompact(el, r, byId),
          ),
          deleted: human.deleted,
        },
        threads,
      });
    },
  );

  server.registerTool(
    "canvas_draw",
    {
      description:
        "Draw elements in agent format (see canvas_guide). Existing agent ids are updated in place; human ids are refused.",
      inputSchema: z.object({ session, elements: z.array(agentElement) }),
    },
    ({ session: id, elements }): CallToolResult => {
      try {
        return json(store.draw(id, elements));
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  server.registerTool(
    "canvas_annotate",
    {
      description:
        "Annotate an existing element: circle (ellipse around it), counterexample (✗ text below), invariant (⟂ text above), or reply (plain text below — answer a note the human wrote).",
      inputSchema: z.object({
        session,
        kind: z.enum(["circle", "counterexample", "invariant", "reply"]),
        ref: z.string(),
        text: z.string().optional(),
      }),
    },
    ({ session: id, kind, ref, text }): CallToolResult => {
      const s = st(id);
      const target = s.elements.get(ref);
      if (!target) return err(`refused: unknown ref: ${ref}`);
      const b = bboxOf(target);
      let el: AgentElement;
      if (kind === "circle") {
        el = {
          type: "ellipse",
          x: b.x - 12,
          y: b.y - 12,
          width: b.width + 24,
          height: b.height + 24,
        };
      } else if (kind === "reply") {
        if (!text) return err(`refused: text required for ${kind}`);
        el = {
          type: "text",
          x: b.x,
          y: b.y + b.height + 24,
          width: Math.max(b.width, 240),
          height: 25,
          text,
          fontSize: 20,
        };
      } else {
        if (!text) return err(`refused: text required for ${kind}`);
        const label = kind === "counterexample" ? `✗ ${text}` : `⟂ ${text}`;
        const y =
          kind === "counterexample" ? b.y + b.height + 24 : b.y - 24 - 25;
        el = {
          type: "text",
          x: b.x,
          y,
          width: Math.max(20, label.length * 11),
          height: 25,
          text: label,
          fontSize: 20,
        };
      }
      try {
        return json(store.draw(id, [el], { kind, ref, type: "annotate" }));
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  server.registerTool(
    "canvas_asset",
    {
      description:
        "Stamp a data-structure template (array, linked_list, binary_tree, stack_frames, state_table, hash_map). See canvas_guide for params.",
      inputSchema: z.looseObject({
        session,
        kind: z.string(),
        x: z.number(),
        y: z.number(),
        name: z.string(),
        owner: z.enum(["agent", "human"]).optional(),
      }),
    },
    ({ session: id, kind, ...params }): CallToolResult => {
      try {
        const { elements, groupId } = generateAsset(kind, params);
        const { rev, ids } = store.draw(id, elements, {
          type: "asset",
          kind: "asset",
          owner: params.owner,
        });
        return json({ rev, ids, groupId });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  server.registerTool(
    "canvas_camera",
    {
      description:
        "Move the view once: a rect {x,y,width,height}, fitIds, or fitAll. The human keeps control afterwards.",
      inputSchema: z.object({
        session,
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        fitIds: z.array(z.string()).optional(),
        fitAll: z.boolean().optional(),
      }),
    },
    (input): CallToolResult => {
      const id = input.session;
      // Contract §7: fits are resolved by the app (scrollToContent), so the
      // directive is stored and forwarded verbatim; only rect is built here.
      let cam: Camera | { fitIds: string[] } | { fitAll: true };
      if (input.fitAll) {
        cam = { fitAll: true };
      } else if (input.fitIds) {
        const s = st(id);
        const missing = input.fitIds.filter((i) => !s.elements.has(i));
        if (missing.length) {
          return err(`refused: unknown ids: [${missing.join(", ")}]`);
        }
        cam = { fitIds: input.fitIds };
      } else if (
        [input.x, input.y, input.width, input.height].every(
          (n) => typeof n === "number",
        )
      ) {
        cam = {
          x: input.x!,
          y: input.y!,
          width: input.width!,
          height: input.height!,
        };
      } else {
        return err(
          "refused: camera needs {x,y,width,height} or fitIds or fitAll",
        );
      }
      return json({ rev: store.camera(id, cam) });
    },
  );

  server.registerTool(
    "canvas_screenshot",
    {
      description:
        "Screenshot the current view as PNG (needs a connected app view).",
      inputSchema: z.object({ session }),
    },
    async ({ session: id }): Promise<CallToolResult> => {
      const { png } = store.beginScreenshot(id);
      const timeout = new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 10_000);
        t.unref?.();
      });
      try {
        const pngBase64 = await Promise.race([png, timeout]);
        return {
          content: [{ type: "image", data: pngBase64, mimeType: "image/png" }],
        };
      } catch {
        store.cancelScreenshot(id);
        return err("no view connected");
      }
    },
  );

  server.registerTool(
    "canvas_snapshot",
    {
      description:
        "Write a named snapshot keyframe to the session's event log.",
      inputSchema: z.object({ session, name: z.string() }),
    },
    ({ session: id, name }): CallToolResult =>
      json({ rev: store.snapshot(id, name) }),
  );

  server.registerTool(
    "canvas_threads",
    {
      description:
        "Comment threads anchored to targetIds. Each carries detached, anchor {x,y}, and `near`: up to 8 elements within 160 px of the live targets' union bbox. Default status open; `since` filters by rev.",
      inputSchema: z.object({
        session,
        status: z.enum(["open", "resolved", "all"]).optional(),
        since: z.number().optional(),
      }),
    },
    ({ session: id, status = "open", since }): CallToolResult => {
      const s = st(id);
      const threads = [...s.threads.values()]
        .filter((t) => (status === "all" ? true : t.status === status))
        .filter((t) => since === undefined || t.rev > since)
        .map((t) => threadView(id, t, true));
      return json({ rev: s.rev, threads });
    },
  );

  server.registerTool(
    "canvas_comment",
    {
      description:
        "Open a comment thread anchored to one or more existing targetIds. First message is yours. Either party replies via canvas_reply.",
      inputSchema: z.object({
        session,
        targetIds: z.array(z.string()).min(1),
        text: z.string(),
      }),
    },
    ({ session: id, targetIds, text }): CallToolResult => {
      try {
        return json(store.openThread(id, { targetIds, text, author: "agent" }));
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  server.registerTool(
    "canvas_reply",
    {
      description: "Append your message to a comment thread.",
      inputSchema: z.object({
        session,
        threadId: z.string(),
        text: z.string(),
      }),
    },
    ({ session: id, threadId, text }): CallToolResult => {
      try {
        return json(store.replyThread(id, threadId, text, "agent"));
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  server.registerTool(
    "canvas_resolve",
    {
      description:
        "Mark a thread resolved (or reopened with resolved:false). Resolved threads leave the default canvas_threads view; they are never deleted.",
      inputSchema: z.object({
        session,
        threadId: z.string(),
        resolved: z.boolean().optional(),
      }),
    },
    ({ session: id, threadId, resolved }): CallToolResult => {
      try {
        return json({
          rev: store.setThread(
            id,
            threadId,
            { resolved: resolved ?? true },
            "agent",
          ),
        });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  // -- app-only tools --------------------------------------------------------

  const appOnly = { _meta: { ui: { visibility: ["app"] as const } } };

  registerAppTool(
    server,
    "canvas_pull",
    {
      description:
        "App poll: everything since a rev (upserts, deletes, pending camera/screenshot).",
      inputSchema: z.object({ session, since: z.number() }),
      ...appOnly,
    },
    ({ session: id, since }): CallToolResult => {
      const s = st(id);
      const upserts = store
        .live(s)
        .filter((e) => (s.revOf.get(e.id) ?? 0) > since)
        .map((e) => {
          // one-off v1.2 migration: agent elements stored under v1.1 arrive
          // unlocked; persisted so the app's next save diff sees no change
          if (ownerOf(e) !== "agent" || !e.locked) return e;
          const unlocked = { ...e, locked: false };
          s.elements.set(e.id, unlocked);
          return unlocked;
        });
      const deletes = [...s.deleted]
        .filter(([, d]) => d.rev > since)
        .map(([eid]) => eid);
      // §12: threads share the session rev. They are never dropped.
      const threads = [...s.threads.values()]
        .filter((t) => t.rev > since)
        .map((t) => threadView(id, t));
      const out: Record<string, unknown> = {
        rev: s.rev,
        upserts,
        deletes,
        threads,
        threadDeletes: [],
      };
      if (s.pendingCamera && s.pendingCamera.rev > since) {
        const { rev, ...cam } = s.pendingCamera;
        out.camera = { ...cam, rev };
      }
      // delivered exactly once, but kept pending until canvas_screenshot_result
      // (or timeout) — clearing on delivery would orphan the resolver
      if (
        s.screenshotRequest &&
        !s.screenshotRequest.delivered &&
        s.screenshotRequest.rev > since
      ) {
        out.screenshot = { requestId: s.screenshotRequest.requestId };
        s.screenshotRequest.delivered = true;
      }
      return json(out);
    },
  );

  registerAppTool(
    server,
    "canvas_save",
    {
      description:
        "App save: full non-deleted scene. Server diffs by id; rejected lists only malformed elements.",
      inputSchema: z.object({
        session,
        elements: z.array(z.looseObject({})),
      }),
      ...appOnly,
    },
    ({ session: id, elements }): CallToolResult => {
      try {
        return json(store.save(id, elements as Element[]));
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  registerAppTool(
    server,
    "canvas_screenshot_result",
    {
      description: "App answers a screenshot request with a base64 PNG.",
      inputSchema: z.object({
        session,
        requestId: z.string(),
        pngBase64: z.string(),
      }),
      ...appOnly,
    },
    ({ session: id, requestId, pngBase64 }): CallToolResult =>
      store.screenshotResult(id, requestId, pngBase64)
        ? json({ ok: true })
        : err("refused: no pending screenshot request"),
  );

  registerAppTool(
    server,
    "canvas_thread_post",
    {
      description:
        "Human path for threads: with threadId → reply; else open on targetIds.",
      inputSchema: z.object({
        session,
        threadId: z.string().optional(),
        targetIds: z.array(z.string()).min(1).optional(),
        text: z.string(),
      }),
      ...appOnly,
    },
    ({ session: id, threadId, targetIds, text }): CallToolResult => {
      try {
        return json(
          threadId
            ? store.replyThread(id, threadId, text, "human")
            : store.openThread(id, {
                targetIds: targetIds ?? [],
                text,
                author: "human",
              }),
        );
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  registerAppTool(
    server,
    "canvas_thread_set",
    {
      description:
        "Thread UI state: collapsed is shared (both views fold the same). resolved mirrors canvas_resolve.",
      inputSchema: z.object({
        session,
        threadId: z.string(),
        collapsed: z.boolean().optional(),
        resolved: z.boolean().optional(),
        anchor: z.object({ x: z.number(), y: z.number() }).optional(),
      }),
      ...appOnly,
    },
    ({
      session: id,
      threadId,
      collapsed,
      resolved,
      anchor,
    }): CallToolResult => {
      try {
        return json({
          rev: store.setThread(
            id,
            threadId,
            { collapsed, resolved, anchor },
            "human",
          ),
        });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  // -- app UI resource ---------------------------------------------------------

  registerAppResource(
    server,
    "canvas-app",
    RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "Algopeeps canvas interactive view",
    },
    async (): Promise<ReadResourceResult> => {
      let html: string;
      try {
        html = await fs.readFile(APP_HTML, "utf8"); // read per request: rebuilt apps are picked up live
      } catch {
        throw new Error(
          "canvas app not built — run bun run --cwd canvas/app build",
        );
      }
      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            // esm.sh too: Excalidraw 0.18 resolves its font URLs in a blob
            // worker where window.EXCALIDRAW_ASSET_PATH (unpkg pin) is not
            // visible, so it falls back to its hardcoded esm.sh CDN.
            _meta: {
              ui: {
                csp: {
                  resourceDomains: ["https://unpkg.com", "https://esm.sh"],
                  connectDomains: [],
                },
              },
            },
          },
        ],
      };
    },
  );

  return server;
}
