// Scene sync: version-based diffing and a reconnecting WebSocket client.
import {
  type ClientMessage,
  ServerMessage,
  safeParseJson,
} from "@elkdraw/core";

interface Versioned {
  readonly id: string;
  readonly version: number;
  readonly isDeleted?: boolean;
}

/** id -> version of the elements the server already has. */
export type Baseline = Map<string, number>;

export function baselineOf(elements: readonly Versioned[]): Baseline {
  return new Map(
    elements.filter((el) => !el.isDeleted).map((el) => [el.id, el.version]),
  );
}

/** What changed locally since the baseline. Remote updates are folded into the
 * baseline when applied, so they never echo back. */
export function diff<T extends Versioned>(
  baseline: Baseline,
  elements: readonly T[],
): { upserts: T[]; deletes: string[] } {
  const upserts: T[] = [];
  const live = new Set<string>();
  for (const el of elements) {
    if (el.isDeleted) continue;
    live.add(el.id);
    if (baseline.get(el.id) !== el.version) upserts.push(el);
  }
  const deletes = [...baseline.keys()].filter((id) => !live.has(id));
  return { upserts, deletes };
}

/** Current scene with a remote delta applied: upserts replace by id (or are
 * appended), deletes are dropped. */
export function merge<T extends Versioned>(
  current: readonly T[],
  upserts: readonly T[],
  deletes: readonly string[],
): T[] {
  const byId = new Map(upserts.map((el) => [el.id, el]));
  const gone = new Set(deletes);
  const out: T[] = [];
  for (const el of current) {
    if (gone.has(el.id)) continue;
    out.push(byId.get(el.id) ?? el);
    byId.delete(el.id);
  }
  return [...out, ...byId.values()];
}

export type ConnectionState = "connecting" | "open" | "closed";

export interface SyncHandlers {
  onState: (state: ConnectionState) => void;
  onMessage: (msg: ServerMessage) => void;
  onBadMessage: (error: Error) => void;
}

const RETRY_MS = 1000;

/** Connects and reconnects until closed. send() drops messages while the
 * socket is down; callers re-diff against their baseline, so nothing is lost
 * except edits made offline that the next snapshot overwrites.
 * ponytail: offline edits lost on reconnect; rebase them on the snapshot if it matters. */
export function connect(url: string, handlers: SyncHandlers) {
  let ws: WebSocket | undefined;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    handlers.onState("connecting");
    const socket = new WebSocket(url);
    ws = socket;
    socket.onopen = () => {
      handlers.onState("open");
    };
    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      const parsed = safeParseJson(ServerMessage, event.data);
      if (parsed.ok) handlers.onMessage(parsed.value);
      else handlers.onBadMessage(parsed.error);
    };
    socket.onclose = () => {
      handlers.onState("closed");
      if (!stopped) retry = setTimeout(open, RETRY_MS);
    };
  };
  open();

  return {
    /** True if the message went out. */
    send(msg: ClientMessage): boolean {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },
    close() {
      stopped = true;
      clearTimeout(retry);
      ws?.close();
    },
  };
}

/** Same-origin /ws, unless overridden by ?ws=<url> or VITE_ELKDRAW_WS (dev,
 * where Vite serves the page and the server runs elsewhere). */
export function wsUrl(location: Location, envOverride?: string): string {
  const fromQuery = new URLSearchParams(location.search).get("ws");
  if (fromQuery) return fromQuery;
  if (envOverride) return envOverride;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/ws`;
}
