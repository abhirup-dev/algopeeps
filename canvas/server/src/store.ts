// Scene store: one in-memory session state per session slug, persisted as
// events.jsonl (CONTRACT §8). Every mutating event carries the changed
// `elements` (upserts) and `detail.deleted` ids so replay = last keyframe +
// following events. Written synchronously — fine for a local single-user
// server; ponytail: switch to an append queue if concurrent writers appear.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type AgentElement,
  type CanvasEvent,
  type Camera,
  type Element,
  type Owner,
  type Thread,
  newId,
  ownerOf,
  prepareElement,
  stampAgent,
} from "@algopeeps/canvas-shared";

export interface ScreenshotRequest {
  requestId: string;
  rev: number;
  resolve: (pngBase64: string) => void;
  delivered?: boolean; // included in one pull; stays pending until answered
}

export interface SessionState {
  session: string;
  elements: Map<string, Element>;
  revOf: Map<string, number>; // last-changed rev
  bornOf: Map<string, number>; // creation rev (added vs changed in canvas_changes)
  deleted: Map<string, { rev: number; owner: Owner }>;
  threads: Map<string, Thread>; // §11; rev lives on the Thread itself
  threadAct: Map<string, { opened?: number; replies: number[] }>; // HUMAN activity revs, for canvas_changes.threads
  rev: number;
  pendingCamera?: (Camera | { fitIds: string[] } | { fitAll: true }) & {
    rev: number;
  };
  screenshotRequest?: ScreenshotRequest; // delivered to the next pull, once
  cursor: number; // last read rev: default `since` for canvas_changes
  eventCount: number;
  file: string;
}

const KEYFRAME_EVERY = 50;

export class Store {
  private sessions = new Map<string, SessionState>();

  constructor(
    private baseDir = path.join(
      os.homedir(),
      ".local",
      "share",
      "algopeeps",
      "canvas",
    ),
  ) {}

  /** In-memory state, lazily rebuilt from disk on first touch. */
  session(id: string): SessionState {
    let st = this.sessions.get(id);
    if (!st) {
      st = {
        session: id,
        elements: new Map(),
        revOf: new Map(),
        bornOf: new Map(),
        deleted: new Map(),
        threads: new Map(),
        threadAct: new Map(),
        rev: 0,
        cursor: 0,
        eventCount: 0,
        file: path.join(this.baseDir, id, "events.jsonl"),
      };
      this.sessions.set(id, st);
      this.rebuildFromDisk(st);
    }
    return st;
  }

  // -- lifecycle ---------------------------------------------------------

  open(id: string): {
    session: string;
    rev: number;
    counts: Record<Owner, number>;
  } {
    const st = this.session(id);
    if (st.eventCount === 0) this.appendEvent(st, "system", "open"); // idempotent
    return { session: id, rev: st.rev, counts: this.ownerCounts(st) };
  }

  snapshot(id: string, name: string): number {
    const st = this.session(id);
    this.appendEvent(st, "agent", "keyframe", { name }); // contract: snapshot writes a keyframe
    return st.rev;
  }

  // -- agent writes ------------------------------------------------------

  /**
   * canvas_draw / canvas_annotate / canvas_asset path. v1.2 rule 2: agent
   * tools may update human-owned elements too — accepted with owner kept as
   * provenance and `editedBy:"agent"` stamped; the event carries
   * `detail.humanOwned: true`. The "don't edit the learner's work" rule is a
   * tutor instruction (canvas/AGENTS.md), not server enforcement.
   */
  draw(
    id: string,
    inputs: AgentElement[],
    opts: {
      kind?: Parameters<typeof stampAgent>[1];
      ref?: string;
      owner?: Owner;
      type?: CanvasEvent["type"];
    } = {},
  ): { rev: number; ids: string[] } {
    const st = this.session(id);
    if (inputs.length === 0) return { rev: st.rev, ids: [] };

    const rev = ++st.rev;
    const ids: string[] = [];
    let humanOwned = false;
    for (const input of inputs) {
      const el = prepareElement(input);
      const stored = st.elements.get(el.id);
      if (stored && ownerOf(stored) === "human") {
        humanOwned = true;
        el.customData = { ...el.customData, editedBy: "agent" };
      } else if (opts.owner !== "human") {
        stampAgent(el, opts.kind ?? "free", opts.ref);
      }
      this.upsert(st, el, rev);
      ids.push(el.id);
    }
    this.appendEvent(
      st,
      "agent",
      opts.type ?? "draw",
      humanOwned ? { humanOwned: true } : {},
      inputs.length ? { elements: this.pick(st, ids) } : undefined,
      ids,
    );
    return { rev, ids };
  }

  // -- comment threads (§11) ----------------------------------------------

  /** canvas_comment / canvas_thread_post (no threadId): targets + first message. */
  openThread(
    id: string,
    opts: { targetIds: string[]; text: string; author: Owner },
  ): { rev: number; threadId: string; anchorId: string; targetIds: string[] } {
    if (!opts.text?.trim()) throw new Error("refused: text required");
    const st = this.session(id);
    const targetIds = [...new Set(opts.targetIds)];
    const unknown = targetIds.filter((targetId) => !st.elements.has(targetId));
    if (!targetIds.length || unknown.length)
      throw new Error(
        `unknown target ids: ${unknown.length ? unknown.join(", ") : "none"}`,
      );

    const threadId = `t_${newId().slice(0, 6)}`;
    const rev = ++st.rev;
    const targets = targetIds.map((targetId) => {
      const target = st.elements.get(targetId)!;
      const threads = Array.isArray(target.customData?.threads)
        ? (target.customData.threads as string[])
        : [];
      const updated = {
        ...target,
        customData: {
          ...(target.customData ?? {}),
          threads: [...new Set([...threads, threadId])],
        },
      };
      this.upsert(st, updated, rev);
      return updated;
    });
    const thread: Thread = {
      id: threadId,
      targetIds,
      anchorId: targetIds[0],
      status: "open",
      collapsed: false,
      rev,
      messages: [
        {
          id: "m1",
          author: opts.author,
          text: opts.text,
          ts: new Date().toISOString(),
        },
      ],
    };
    st.threads.set(threadId, thread);
    if (opts.author === "human")
      st.threadAct.set(threadId, { opened: rev, replies: [] });
    this.appendThreadEvent(st, opts.author, thread, targets);
    return { rev, threadId, anchorId: thread.anchorId, targetIds };
  }

  /** canvas_reply / canvas_thread_post (with threadId). */
  replyThread(
    id: string,
    threadId: string,
    text: string,
    author: Owner,
  ): { rev: number; threadId: string; messageId: string } {
    if (!text?.trim()) throw new Error("refused: text required");
    const st = this.session(id);
    const thread = st.threads.get(threadId);
    if (!thread) throw new Error(`refused: unknown threadId: ${threadId}`);
    const rev = ++st.rev;
    const msg = {
      id: `m${thread.messages.length + 1}`,
      author,
      text,
      ts: new Date().toISOString(),
    };
    thread.messages.push(msg);
    thread.rev = rev;
    if (author === "human") {
      const act = st.threadAct.get(threadId);
      if (act) act.replies.push(rev);
      else st.threadAct.set(threadId, { replies: [rev] });
    }
    this.appendThreadEvent(st, author, thread);
    return { rev, threadId, messageId: msg.id };
  }

  /** canvas_resolve / canvas_thread_set: status flip and/or shared fold state. */
  setThread(
    id: string,
    threadId: string,
    patch: {
      collapsed?: boolean;
      resolved?: boolean;
      anchor?: { x: number; y: number };
    },
    actor: CanvasEvent["actor"],
  ): number {
    const st = this.session(id);
    const thread = st.threads.get(threadId);
    if (!thread) throw new Error(`refused: unknown threadId: ${threadId}`);
    const rev = ++st.rev;
    if (patch.collapsed !== undefined) thread.collapsed = patch.collapsed;
    if (patch.resolved !== undefined)
      thread.status = patch.resolved ? "resolved" : "open";
    if (patch.anchor !== undefined) thread.anchor = patch.anchor;
    thread.rev = rev;
    this.appendThreadEvent(st, actor, thread);
    return rev;
  }

  private appendThreadEvent(
    st: SessionState,
    actor: CanvasEvent["actor"],
    thread: Thread,
    elements?: Element[],
  ): void {
    this.appendEvent(
      st,
      actor,
      "comment",
      { threadId: thread.id, author: actor },
      { elements, threads: [thread] },
      [thread.id],
    );
  }

  // -- app writes (canvas_save) -------------------------------------------

  /**
   * Full-scene save from the app. Diffs by id; `rejected` lists only
   * malformed elements (missing id/type). Human changes/deletions of
   * agent-owned elements are accepted (v1.2 §2 rule 3): owner is kept as
   * provenance, `editedBy:"human"` is stamped, and the `human_edit` event
   * carries `detail.agentOwned: true` / `detail.deleted`. The seed-based
   * conversion-accept path is unchanged — a conversion is not a human edit.
   */
  save(id: string, incoming: Element[]): { rev: number; rejected: string[] } {
    const st = this.session(id);
    const rejected: string[] = [];
    const upserts: Element[] = [];
    const deleted: string[] = [];
    const converted: string[] = []; // conversion-accepts: bookkeeping, not human edits
    let agentOwned = false;
    const byId = new Map<string, Element>();

    incoming.forEach((el, i) => {
      if (!el.id || !el.type) {
        rejected.push(el.id ?? `#${i}`); // malformed (v1.2: rejected is only this)
        return;
      }
      byId.set(el.id, el);
      const stored = st.elements.get(el.id);
      if (!stored) {
        upserts.push(el); // new element drawn by the human
        return;
      }
      if (JSON.stringify(el) === JSON.stringify(stored)) return;
      if (ownerOf(stored) === "human") {
        upserts.push(el);
        return;
      }
      // conversion-accept: the stored copy is still an agent-format skeleton,
      // the incoming element is its converted real form — it must carry a
      // `seed` and (except arrows/text, whose bounds shift on conversion)
      // still sit where the agent drew it. Anything else on an agent-owned
      // id is a human edit: accept, keep owner, stamp editedBy (v1.2).
      const skeleton = (stored as { seed?: unknown }).seed === undefined;
      const hasSeed = (el as { seed?: unknown }).seed !== undefined;
      const moved =
        stored.type !== "arrow" &&
        stored.type !== "text" &&
        (Math.abs((el.x ?? 0) - (stored.x ?? 0)) > 0.5 ||
          Math.abs((el.y ?? 0) - (stored.y ?? 0)) > 0.5);
      if (skeleton && hasSeed && !moved) {
        converted.push(el.id);
        upserts.push({
          ...el,
          customData: stored.customData,
          strokeColor: stored.strokeColor,
          locked: false,
        });
      } else {
        agentOwned = true;
        upserts.push({
          ...el,
          locked: false,
          customData: {
            ...stored.customData,
            ...(el.customData ?? {}),
            owner: "agent",
            editedBy: "human",
          },
        });
      }
    });

    // ids absent from the payload are deleted, whatever their owner
    for (const [eid, el] of st.elements) {
      if (byId.has(eid)) continue;
      deleted.push(eid);
      if (ownerOf(el) === "agent") agentOwned = true;
    }

    let rev = st.rev;
    if (upserts.length || deleted.length) {
      rev = ++st.rev;
      for (const el of upserts) this.upsert(st, el, rev);
      for (const eid of deleted) {
        st.deleted.set(eid, { rev, owner: ownerOf(st.elements.get(eid)!) });
        st.elements.delete(eid);
        st.revOf.delete(eid);
        st.bornOf.delete(eid);
      }
      // §12: deleting every target detaches the thread; it remains open.
      const detachedThreads: Thread[] = [];
      for (const t of st.threads.values()) {
        const targetIds = t.targetIds?.length ? t.targetIds : [t.anchorId];
        if (
          targetIds.some((targetId) => deleted.includes(targetId)) &&
          targetIds.every((targetId) => !st.elements.has(targetId))
        ) {
          t.rev = rev;
          detachedThreads.push(t);
        }
      }
      this.appendEvent(
        st,
        "human",
        "human_edit",
        {
          ...(deleted.length ? { deleted } : {}),
          ...(agentOwned ? { agentOwned: true } : {}),
          // conversions are the app's skeleton→real round-trip, not edits:
          // named in detail so event consumers don't read them as human edits
          ...(converted.length ? { converted } : {}),
        },
        {
          elements: upserts.length ? upserts : undefined,
          threads: detachedThreads.length ? detachedThreads : undefined,
        },
        [...upserts.map((e) => e.id), ...deleted],
      );
    }
    return { rev, rejected };
  }

  // -- camera & screenshots ------------------------------------------------

  camera(
    id: string,
    cam: Camera | { fitIds: string[] } | { fitAll: true },
  ): number {
    const st = this.session(id);
    const rev = ++st.rev;
    st.pendingCamera = { ...cam, rev };
    this.appendEvent(st, "agent", "camera");
    return rev;
  }

  /** Resolves with the base64 png when canvas_screenshot_result arrives. */
  beginScreenshot(id: string): {
    requestId: string;
    rev: number;
    png: Promise<string>;
  } {
    const st = this.session(id);
    const rev = ++st.rev;
    const requestId = `${rev}-${Math.random().toString(36).slice(2, 10)}`;
    let resolve!: (png: string) => void;
    const png = new Promise<string>((r) => (resolve = r));
    st.screenshotRequest = { requestId, rev, resolve };
    this.appendEvent(st, "agent", "screenshot", { requestId });
    return { requestId, rev, png };
  }

  /** Drop a pending screenshot request (canvas_screenshot timed out). */
  cancelScreenshot(id: string): void {
    const st = this.session(id);
    st.screenshotRequest = undefined;
  }

  screenshotResult(id: string, requestId: string, pngBase64: string): boolean {
    const st = this.session(id);
    if (st.screenshotRequest?.requestId !== requestId) return false;
    st.screenshotRequest.resolve(pngBase64);
    st.screenshotRequest = undefined;
    return true;
  }

  // -- reads ---------------------------------------------------------------

  live(st: SessionState): Element[] {
    return [...st.elements.values()];
  }

  pick(st: SessionState, ids: string[]): Element[] {
    return ids.map((i) => st.elements.get(i)).filter((e): e is Element => !!e);
  }

  ownerCounts(st: SessionState): Record<Owner, number> {
    const counts = { human: 0, agent: 0 };
    for (const el of st.elements.values()) counts[ownerOf(el)]++;
    return counts;
  }

  /** Changes made by the human with rev > since: their own elements plus
   * agent elements they edited (`editedBy`) or deleted. Split added/changed/deleted. */
  changes(
    id: string,
    since: number,
  ): {
    rev: number;
    human: {
      added: { el: Element; rev: number }[];
      changed: { el: Element; rev: number }[];
      deleted: string[];
    };
    threads: { opened: string[]; replied: string[] };
  } {
    const st = this.session(id);
    const added: { el: Element; rev: number }[] = [];
    const changed: { el: Element; rev: number }[] = [];
    for (const el of st.elements.values()) {
      const rev = st.revOf.get(el.id)!;
      if (rev <= since) continue;
      const byHuman =
        ownerOf(el) === "human" || el.customData?.editedBy === "human";
      if (!byHuman) continue;
      ((st.bornOf.get(el.id) ?? 0) > since ? added : changed).push({ el, rev });
    }
    // every deletion came from canvas_save, i.e. was made by the human
    const deleted = [...st.deleted]
      .filter(([, d]) => d.rev > since)
      .map(([eid]) => eid);
    // §11: human-authored thread activity since the cursor (agent chatter is
    // the agent's own — it sees canvas_threads/since)
    const opened: string[] = [];
    const replied: string[] = [];
    for (const [tid, act] of st.threadAct) {
      if ((act.opened ?? 0) > since) opened.push(tid);
      if (act.replies.some((r) => r > since)) replied.push(tid);
    }
    return {
      rev: st.rev,
      human: { added, changed, deleted },
      threads: { opened, replied },
    };
  }

  advanceCursor(st: SessionState): void {
    st.cursor = st.rev;
  }

  // -- internals -------------------------------------------------------------

  private upsert(st: SessionState, el: Element, rev: number): void {
    if (!st.bornOf.has(el.id)) st.bornOf.set(el.id, rev);
    st.elements.set(el.id, el);
    st.revOf.set(el.id, rev);
    st.deleted.delete(el.id);
  }

  private appendEvent(
    st: SessionState,
    actor: CanvasEvent["actor"],
    type: CanvasEvent["type"],
    detail: Record<string, unknown> = {},
    payload: { elements?: Element[]; threads?: Thread[] } = {},
    ids?: string[],
  ): void {
    const ev: CanvasEvent = {
      ts: new Date().toISOString(),
      session: st.session,
      rev: st.rev,
      actor,
      type,
      ...(ids?.length ? { ids } : {}),
      detail,
      ...(payload.elements ? { elements: payload.elements } : {}),
      ...(payload.threads ? { threads: payload.threads } : {}),
    };
    fs.mkdirSync(path.dirname(st.file), { recursive: true });
    fs.appendFileSync(st.file, JSON.stringify(ev) + "\n");
    st.eventCount++;
    if (st.eventCount % KEYFRAME_EVERY === 0) this.appendKeyframe(st);
  }

  private appendKeyframe(st: SessionState): void {
    const ev: CanvasEvent = {
      ts: new Date().toISOString(),
      session: st.session,
      rev: st.rev,
      actor: "system",
      type: "keyframe",
      detail: {},
      elements: this.live(st),
      threads: [...st.threads.values()],
    };
    fs.appendFileSync(st.file, JSON.stringify(ev) + "\n");
    st.eventCount++;
  }

  private rebuildFromDisk(st: SessionState): void {
    if (!fs.existsSync(st.file)) return;
    const lines = fs.readFileSync(st.file, "utf8").split("\n").filter(Boolean);
    const events = lines.map((l) => JSON.parse(l) as CanvasEvent);
    let lastKf = -1;
    events.forEach((e, i) => {
      if (e.type === "keyframe") lastKf = i;
    });
    const start = lastKf === -1 ? 0 : lastKf;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      st.rev = Math.max(st.rev, ev.rev);
      if (i < start) continue; // superseded by the last keyframe
      if (ev.type === "keyframe") {
        for (const el of ev.elements ?? []) this.upsert(st, el, ev.rev);
        st.threads = new Map(
          (ev.threads ?? []).map((t) => {
            const thread = this.normalizeThread(t);
            return [thread.id, thread];
          }),
        );
        // ponytail: activity revs before the keyframe are unrecoverable (not
        // part of the Thread wire shape) — synthesize at the keyframe rev;
        // canvas_changes.threads is advisory, same caveat as bornOf
        st.threadAct = new Map(
          [...st.threads.values()].map((t) => {
            const act: SessionState["threadAct"] extends Map<string, infer A>
              ? A
              : never = { replies: [] };
            if (t.messages[0]?.author === "human") act.opened = ev.rev;
            else if (t.messages.some((m, i) => i > 0 && m.author === "human"))
              act.replies.push(ev.rev);
            return [t.id, act];
          }),
        );
        continue;
      }
      for (const el of ev.elements ?? []) this.upsert(st, el, ev.rev);
      for (const raw of ev.threads ?? []) {
        const t = this.normalizeThread(raw);
        st.threads.set(t.id, t);
        if (ev.detail?.author !== "human") continue;
        const act = st.threadAct.get(t.id) ?? { replies: [] };
        if (t.messages.length === 1)
          act.opened = ev.rev; // the human open
        else act.replies.push(ev.rev); // human reply on any thread
        st.threadAct.set(t.id, act);
      }
      for (const eid of (ev.detail?.deleted as string[] | undefined) ?? []) {
        st.deleted.set(eid, { rev: ev.rev, owner: "human" });
        st.elements.delete(eid);
        st.revOf.delete(eid);
        st.bornOf.delete(eid);
      }
    }
    st.eventCount = lines.length;
  }

  private normalizeThread(thread: Thread): Thread {
    const targetIds = thread.targetIds?.length
      ? thread.targetIds
      : [thread.anchorId];
    return { ...thread, targetIds, anchorId: targetIds[0] };
  }
}
