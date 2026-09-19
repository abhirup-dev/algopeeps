import { createRoot } from "react-dom/client";
import CanvasApp from "./CanvasApp";
import type { Host } from "./CanvasApp";
import type { PullResult, Thread } from "./contract";
import { SAMPLE_ITEMS } from "./sidebar/sample";

// Dev harness: an in-memory scene standing in for canvas/server, so the editor
// runs with `pnpm dev` + dev.html and no MCP host. The fake stores elements
// verbatim; agent-format skeletons stay raw until the app converts and
// canvas_saves them back — mirroring the real contract.
//
// ?fake=1 additionally enables the §11 threads half (WP-L is built in
// parallel; this fake stands in for it): canvas_thread_post /
// canvas_thread_set / canvas_pull's threads+threadDeletes, seeded with one
// open thread anchored to a seeded element.

const params = new URLSearchParams(location.search);
const FAKE_THREADS = params.has("fake");
const SIDEBAR_DEMO = params.has("sidebar");
const PALETTE_DEMO = params.has("palette");

if (PALETTE_DEMO) localStorage.setItem("canvas.palette.open", "true");

if (SIDEBAR_DEMO) localStorage.setItem("canvas.threads.docked", "true");

class FakeServer {
  rev = 1;
  elements: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any -- dev fake stores wire elements verbatim
  elementRev = new Map<string, number>();
  threads: Thread[] = [];
  threadRev = new Map<string, number>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev fake stores wire elements verbatim
  store(el: any) {
    const i = this.elements.findIndex((e) => e.id === el.id);
    if (i >= 0) this.elements[i] = el;
    else this.elements.push(el);
    this.elementRev.set(el.id, ++this.rev);
  }

  /** Simulate an agent-side change arriving between polls (test hook). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev fake stores wire elements verbatim
  injectAgent(els: any[]) {
    for (const el of els) this.store(el);
  }

  addThread(t: Thread) {
    this.threads.push(t);
    this.threadRev.set(t.id, ++this.rev);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped tool args in the dev fake
  threadPost(args: any) {
    const { threadId, targetIds, text } = args;
    const ts = new Date().toISOString();
    if (typeof threadId === "string") {
      const t = this.threads.find((th) => th.id === threadId);
      if (t) {
        t.messages.push({ id: `m${++this.rev}`, author: "human", text, ts });
        this.threadRev.set(t.id, ++this.rev);
      }
      return { rev: this.rev, threadId };
    }
    const tid = `t-${++this.rev}`;
    const ids = Array.isArray(targetIds) ? targetIds : [];
    for (const id of ids) {
      const target = this.elements.find((element) => element.id === id);
      if (target)
        this.store({
          ...target,
          customData: {
            ...(target.customData ?? {}),
            threads: [...new Set([...(target.customData?.threads ?? []), tid])],
          },
        });
    }
    this.addThread({
      id: tid,
      anchorId: ids[0],
      targetIds: ids,
      detached: false,
      status: "open",
      collapsed: false,
      rev: 0,
      messages: [{ id: `m${++this.rev}`, author: "human", text, ts }],
    } as Thread & { targetIds: string[]; detached: boolean });
    return { rev: this.rev, threadId: tid, anchorId: ids[0], targetIds: ids };
  }

  injectAgentReply(threadId: string, text: string) {
    const thread = this.threads.find((candidate) => candidate.id === threadId);
    if (!thread) return;
    thread.messages.push({
      id: `m${++this.rev}`,
      author: "agent",
      text,
      ts: new Date().toISOString(),
    });
    thread.rev = this.rev;
    this.threadRev.set(thread.id, this.rev);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped tool args in the dev fake
  threadSet(args: any) {
    const { threadId, collapsed, resolved, anchor } = args;
    const t = this.threads.find((th) => th.id === threadId);
    if (t) {
      if (typeof collapsed === "boolean") t.collapsed = collapsed;
      if (typeof resolved === "boolean")
        t.status = resolved ? "resolved" : "open";
      if (anchor) t.anchor = anchor;
      t.rev = ++this.rev;
      this.threadRev.set(t.id, this.rev);
    }
    return { rev: this.rev };
  }

  pull(since: number): PullResult {
    const r: PullResult = {
      rev: this.rev,
      upserts: this.elements.filter(
        (e) => (this.elementRev.get(e.id) ?? 0) > since,
      ),
      deletes: [],
    };
    if (FAKE_THREADS) {
      r.threads = this.threads.filter(
        (t) => (this.threadRev.get(t.id) ?? 0) > since,
      );
      r.threadDeletes = [];
    }
    return r;
  }
}

const server = new FakeServer();
(window as any).__devServer = server; // eslint-disable-line @typescript-eslint/no-explicit-any -- dev-only global for the dev.html harness

if (FAKE_THREADS) {
  server.injectAgent([
    {
      id: "seed-el",
      type: "rectangle",
      x: 160,
      y: 120,
      width: 200,
      height: 80,
      strokeColor: "#9c36b5",
      text: "two-sum",
      customData: { owner: "agent" },
    },
  ]);
}

const ok = (result: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(result) }],
});

const fakeHost: Host = {
  // eslint-disable-next-line @typescript-eslint/require-await -- fake implements the async Host API synchronously
  async callServerTool({ name, arguments: args }) {
    switch (name) {
      case "canvas_pull":
        return ok(server.pull((args as any).since)); // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped tool args in the dev fake
      case "canvas_save": {
        for (const el of (args as any).elements) server.store(el); // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped tool args in the dev fake
        return ok({ rev: server.rev, rejected: [] });
      }
      case "canvas_thread_post":
        return ok(server.threadPost(args));
      case "canvas_thread_set":
        return ok(server.threadSet(args));
      default:
        return ok({ ok: true });
    }
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- fake implements the async Host API synchronously
  async updateModelContext(p) {
    console.log("[updateModelContext]", p);
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- fake implements the async Host API synchronously
  async requestDisplayMode({ mode }) {
    return { mode };
  },
  getHostContext() {
    // Fill the window like a real host would, so screenshots see the footer.
    return { containerDimensions: { height: window.innerHeight } };
  },
};

// Auto-open a dev session so the editor is live immediately.
setTimeout(
  () =>
    fakeHost.ontoolinput?.({
      name: "canvas_open",
      arguments: { session: "dev" },
    }),
  50,
);

createRoot(document.getElementById("root")!).render(
  <CanvasApp
    app={fakeHost}
    devApi
    sidebarItems={SIDEBAR_DEMO ? SAMPLE_ITEMS : []}
    sidebarTargets={
      SIDEBAR_DEMO
        ? {
            "sample-1": { x: 140, y: 110, w: 180, h: 70 },
            "sample-2": { x: 390, y: 220, w: 120, h: 60 },
          }
        : {}
    }
    sidebarInitiallyOpen={SIDEBAR_DEMO || FAKE_THREADS}
  />,
);
