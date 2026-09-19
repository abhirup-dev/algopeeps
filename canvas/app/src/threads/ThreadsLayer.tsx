// CONTRACT §11, app half: comment threads as a DOM overlay above the
// Excalidraw canvas. Placement derives from each thread's anchor element in
// the current scene (fallback: the thread's anchor {x,y}) through
// appState.scroll/zoom — viewport = (scene + scroll) * zoom — recomputed
// rAF-coalesced on every scene/scroll change. No polling.

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type Ref,
} from "react";
import type { ExAPI, Host } from "../CanvasApp";
import { parseToolJson } from "../CanvasApp";
import type { Thread } from "../contract";
import "./threads.css";

/** Imperative surface CanvasApp drives: pull merges, reposition pings, and
 * the 💬 Comment button's arm() from renderTopRightUI. */
export interface ThreadsHandle {
  syncPull(threads: Thread[], deletes: string[]): void;
  reposition(): void;
  arm(): void;
}

const HIDE_RESOLVED_MS = 10_000;
const DRAFT_KEY = "__draft";

interface ScenePoint {
  x: number;
  y: number;
}

/** Anchor scene point: the anchor element's top-right (per §11 the server
 * creates a 28×28 comment ellipse when anchoring by point, so every thread
 * usually has one), else the thread's anchor {x,y}. */
function anchorPoint(
  api: ExAPI,
  anchorId: string | undefined,
  fallback: ScenePoint | undefined,
): ScenePoint | null {
  if (anchorId && api) {
    const el = api
      .getSceneElements()
      ?.find(
        (e: { id: string; isDeleted?: boolean }) =>
          e.id === anchorId && !e.isDeleted,
      );
    if (el) return { x: el.x + el.width, y: el.y };
  }
  return fallback ?? null;
}

const nowIso = () => new Date().toISOString();
const localMessage = (text: string) => ({
  id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  author: "human" as const,
  text,
  ts: nowIso(),
});

function ThreadCard({
  thread,
  style,
  onCollapse,
  onResolve,
  onSend,
}: {
  thread: Thread;
  style: CSSProperties;
  onCollapse: () => void;
  onResolve: () => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };
  return (
    <div
      className="thread-card"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="thread-head">
        <span>{thread.status === "resolved" ? "resolved" : "thread"}</span>
        <button
          className="thread-collapse"
          title="Collapse"
          onClick={onCollapse}
        >
          ⌃
        </button>
      </div>
      <div className="thread-msgs">
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className={`thread-msg${m.author === "agent" ? " agent" : ""}`}
          >
            <span className="thread-author">{m.author}</span>
            <span className="thread-text">{m.text}</span>
          </div>
        ))}
      </div>
      <textarea
        className="thread-input"
        rows={2}
        placeholder="Reply…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e: ReactKeyboardEvent) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="thread-actions">
        <button className="thread-resolve" onClick={onResolve}>
          Resolve
        </button>
        <button className="thread-send" disabled={!text.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}

function DraftCard({
  style,
  onCancel,
  onSend,
}: {
  style: CSSProperties;
  onCancel: () => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    // focus the new card's box — the click that opened it landed on the overlay
    const el = document.querySelector<HTMLTextAreaElement>(
      ".thread-card .thread-input",
    );
    el?.focus();
  }, []);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
  };
  return (
    <div
      className="thread-card"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="thread-head">
        <span>new comment — Esc to cancel</span>
        <button className="thread-collapse" title="Cancel" onClick={onCancel}>
          ✕
        </button>
      </div>
      <textarea
        className="thread-input"
        rows={3}
        placeholder="Comment on the canvas…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e: ReactKeyboardEvent) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="thread-actions">
        <button className="thread-send" disabled={!text.trim()} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}

export default function ThreadsLayer({
  api,
  host,
  session,
  ref,
}: {
  api: { current: ExAPI };
  host: Host;
  session: string | null;
  ref?: Ref<ThreadsHandle>;
}) {
  const [threads, setThreads] = useState<Map<string, Thread>>(new Map());
  const [placements, setPlacements] = useState<Map<string, CSSProperties>>(
    new Map(),
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [armed, setArmed] = useState(false);
  const [draft, setDraft] = useState<
    (ScenePoint & { anchorId?: string }) | null
  >(null);

  // Refs mirroring state for use inside rAF callbacks and stable callbacks.
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** readCount is UI-local memory only (brief): messages seen, per thread. */
  const readRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);
  const armAnchorRef = useRef<string | undefined>(undefined);
  const hideTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // ---- placement (rAF-coalesced) ----
  const reposition = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const a = api.current;
      if (!a) return;
      const st = a.getAppState();
      if (!st) return;
      const zoom = st.zoom?.value ?? 1;
      const next = new Map<string, CSSProperties>();
      const place = (key: string, p: ScenePoint | null) => {
        if (!p) return;
        next.set(key, {
          left: (p.x + st.scrollX) * zoom + 8, // just right of the anchor
          top: (p.y + st.scrollY) * zoom,
        });
      };
      for (const t of threadsRef.current.values())
        place(t.id, anchorPoint(a, t.anchorId, t.anchor));
      const d = draftRef.current;
      if (d) place(DRAFT_KEY, anchorPoint(a, d.anchorId, d));
      setPlacements(next);
    });
  }, [api]);
  useEffect(() => {
    reposition();
  }, [threads, draft, reposition]);

  // ---- resolved-hide (10 s) ----
  const hideSoon = useCallback((id: string) => {
    if (hideTimersRef.current.has(id)) return;
    hideTimersRef.current.set(
      id,
      setTimeout(() => {
        hideTimersRef.current.delete(id);
        setHidden((h) => new Set(h).add(id));
      }, HIDE_RESOLVED_MS),
    );
  }, []);
  const unhide = useCallback((id: string) => {
    const t = hideTimersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      hideTimersRef.current.delete(id);
    }
    setHidden((h) => {
      if (!h.has(id)) return h;
      const n = new Set(h);
      n.delete(id);
      return n;
    });
  }, []);
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      for (const t of hideTimersRef.current.values()) clearTimeout(t);
    },
    [],
  );

  // Fresh session, fresh threads (canvas_open may switch sessions).
  useEffect(() => {
    setThreads(new Map());
    setHidden(new Set());
    setDraft(null);
    setArmed(false);
    readRef.current.clear();
    for (const t of hideTimersRef.current.values()) clearTimeout(t);
    hideTimersRef.current.clear();
  }, [session]);

  // Open card = read (in-memory readCount only, never synced).
  useEffect(() => {
    for (const t of threads.values())
      if (!t.collapsed && t.status === "open")
        readRef.current.set(t.id, t.messages.length);
  });

  // ---- server calls ----
  const callTool = useCallback(
    async <T,>(
      name: string,
      args: Record<string, unknown>,
    ): Promise<T | null> => {
      const s = sessionRef.current;
      if (!s) return null;
      try {
        return parseToolJson<T>(
          await host.callServerTool({
            name,
            arguments: { session: s, ...args },
          }),
        );
      } catch (e) {
        console.warn(`canvas: ${name} failed`, e);
        return null;
      }
    },
    [host],
  );

  const patchLocal = (id: string, patch: Partial<Thread>) =>
    setThreads((cur) => {
      const old = cur.get(id);
      if (!old) return cur;
      const next = new Map(cur);
      next.set(id, { ...old, ...patch });
      return next;
    });

  /** Optimistic UI-state flip; collapsed/resolved are shared via
   * canvas_thread_set so both views agree (§11). */
  const setUi = useCallback(
    (t: Thread, patch: { collapsed?: boolean; resolved?: boolean }) => {
      const status =
        patch.resolved === undefined
          ? undefined
          : patch.resolved
            ? "resolved"
            : "open";
      patchLocal(t.id, {
        ...(patch.collapsed !== undefined
          ? { collapsed: patch.collapsed }
          : {}),
        ...(status ? { status } : {}),
      });
      if (patch.resolved) hideSoon(t.id);
      if (patch.resolved === false) unhide(t.id);
      void callTool("canvas_thread_set", { threadId: t.id, ...patch });
    },
    [callTool, hideSoon, unhide],
  );

  const reply = useCallback(
    (t: Thread, text: string) => {
      patchLocal(t.id, { messages: [...t.messages, localMessage(text)] });
      void callTool("canvas_thread_post", { threadId: t.id, text });
    },
    [callTool],
  );

  const sendDraft = useCallback(
    async (text: string) => {
      const d = draftRef.current;
      if (!d) return;
      setDraft(null);
      const r = await callTool<{
        rev: number;
        threadId: string;
        anchorId?: string;
      }>(
        "canvas_thread_post",
        d.anchorId ? { anchorId: d.anchorId, text } : { x: d.x, y: d.y, text },
      );
      if (!r) return;
      setThreads((cur) =>
        new Map(cur).set(r.threadId, {
          id: r.threadId,
          anchorId: r.anchorId,
          status: "open",
          collapsed: false,
          rev: r.rev,
          messages: [localMessage(text)],
          anchor: { x: d.x, y: d.y },
        }),
      );
    },
    [callTool],
  );

  // ---- compose arming (💬 Comment) ----
  const arm = useCallback(() => {
    const sel = api.current?.getAppState?.()?.selectedElementIds;
    const ids = sel ? Object.keys(sel) : [];
    armAnchorRef.current = ids.length === 1 ? ids[0] : undefined;
    setArmed((v) => !v);
  }, [api]);

  const onOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!armed) return;
      const a = api.current;
      const st = a?.getAppState?.();
      if (!st) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const zoom = st.zoom?.value ?? 1;
      // viewport → scene (inverse of placement math)
      setDraft({
        x: (e.clientX - rect.left) / zoom - st.scrollX,
        y: (e.clientY - rect.top) / zoom - st.scrollY,
        anchorId: armAnchorRef.current,
      });
      setArmed(false);
    },
    [armed, api],
  );

  useEffect(() => {
    if (!armed && !draft) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setArmed(false);
        setDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, draft]);

  // ---- pull merge ----
  const syncPull = useCallback(
    (incoming: Thread[], deletes: string[]) => {
      const prev = threadsRef.current;
      for (const t of incoming) {
        const was = prev.get(t.id)?.status;
        if (was === "open" && t.status === "resolved") hideSoon(t.id);
        if (was === "resolved" && t.status === "open") unhide(t.id);
      }
      setThreads((cur) => {
        const next = new Map(cur);
        for (const id of deletes) {
          next.delete(id);
          unhide(id);
        }
        for (const t of incoming) {
          const old = next.get(t.id);
          if (!old || t.rev >= old.rev) next.set(t.id, t);
        }
        return next;
      });
    },
    [hideSoon, unhide],
  );

  useImperativeHandle(ref, () => ({ syncPull, reposition, arm }), [
    syncPull,
    reposition,
    arm,
  ]);

  return (
    <div
      className={`threads-overlay${armed ? " threads-armed" : ""}`}
      onClick={onOverlayClick}
    >
      {[...threads.values()].map((t) => {
        const p = placements.get(t.id);
        if (!p || hidden.has(t.id)) return null;
        const unread =
          t.status === "open" &&
          t.messages[t.messages.length - 1]?.author === "agent" &&
          t.messages.length > (readRef.current.get(t.id) ?? 0);
        return t.collapsed || t.status === "resolved" ? (
          <button
            key={t.id}
            className={`thread-pill${unread ? " unread" : ""}${t.status === "resolved" ? " resolved" : ""}`}
            style={p}
            onClick={(e) => {
              e.stopPropagation();
              setUi(t, { collapsed: false });
            }}
          >
            💬 {t.messages.length}
          </button>
        ) : (
          <ThreadCard
            key={t.id}
            thread={t}
            style={p}
            onCollapse={() => setUi(t, { collapsed: true })}
            onResolve={() => setUi(t, { resolved: true })}
            onSend={(text) => reply(t, text)}
          />
        );
      })}
      {draft && placements.get(DRAFT_KEY) && (
        <DraftCard
          style={placements.get(DRAFT_KEY)!}
          onCancel={() => setDraft(null)}
          onSend={(text) => void sendDraft(text)}
        />
      )}
    </div>
  );
}
