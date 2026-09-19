// Shared types for the algopeeps canvas (canvas/CONTRACT.md v1).

export type Owner = "human" | "agent";

export type AgentKind =
  | "circle"
  | "counterexample"
  | "invariant"
  | "reply"
  | "comment"
  | "asset"
  | "free";

/** `customData` carried on every element (contract §2). */
export interface OwnerData {
  owner?: "agent"; // absent or "human" = human
  kind?: AgentKind;
  ref?: string;
  asset?: { kind: string; name: string };
  editedBy?: "human" | "agent"; // v1.2: the other party edited this element
  [k: string]: unknown;
}

/** Loose Excalidraw element, stored and returned verbatim by the server. */
export interface Element {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  isDeleted?: boolean;
  version?: number;
  versionNonce?: number;
  groupIds?: string[];
  boundElements?: Array<{ id: string; type: string }>;
  startBinding?: { elementId: string } & Record<string, unknown>;
  endBinding?: { elementId: string } & Record<string, unknown>;
  // pre-conversion binding form produced by normalize.ts
  start?: { id: string };
  end?: { id: string };
  containerId?: string;
  customData?: OwnerData;
  // convenience typed fields (everything else goes through the index signature)
  text?: string;
  label?: { text: string } & Record<string, unknown>;
  points?: [number, number][];
  strokeColor?: string;
  backgroundColor?: string;
  locked?: boolean;
  [k: string]: unknown;
}

export type AgentElementType =
  "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line" | "freedraw";

/** Agent-format input to `canvas_draw` (contract §4). Looser than an Element. */
export interface AgentElement {
  id?: string;
  type: AgentElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string; // on shapes → bound label; on type "text" → the text
  startElementId?: string;
  endElementId?: string;
  points?: Array<[number, number] | { x: number; y: number }>;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  fontSize?: number;
  fontFamily?: string | number;
  groupIds?: string[];
  customData?: Record<string, unknown>;
  [k: string]: unknown;
}

/** What the model reads back (contract §5). Numbers rounded to integers. */
export interface CompactElement {
  id: string;
  type: string;
  owner: Owner;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  from?: string; // arrows only: bound element ids
  to?: string;
  group?: string; // first groupId, if any
  kind?: AgentKind; // agent elements only
  ref?: string;
  editedBy?: "human" | "agent"; // this element was edited by the other party
  rev: number;
}

/** Contract §7. fitIds/fitAll are tool-level and resolved by the app. */
export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CanvasEventActor = "agent" | "human" | "system";

export type CanvasEventType =
  | "open"
  | "draw"
  | "annotate"
  | "asset"
  | "camera"
  | "human_edit"
  | "comment"
  | "snapshot"
  | "screenshot"
  | "keyframe";

/** One line of `events.jsonl` (contract §8). */
export interface CanvasEvent {
  ts: string;
  session: string;
  rev: number;
  actor: CanvasEventActor;
  type: CanvasEventType;
  ids?: string[];
  detail?: Record<string, unknown>;
  elements?: Element[]; // keyframe events carry the full scene
  threads?: Thread[]; // §11: changed threads (keyframes carry all)
}

/** One message in a comment thread (contract §11). */
export interface ThreadMessage {
  id: string;
  author: Owner;
  text: string;
  ts: string;
}

/** A comment thread anchored to scene elements (contract §12). */
export interface Thread {
  id: string; // "t_" + 6 chars
  targetIds: string[];
  anchorId: string; // compatibility alias for targetIds[0]
  anchor?: { x: number; y: number }; // last known union-bbox top-right
  status: "open" | "resolved";
  collapsed: boolean; // shared fold state, both views see the same
  rev: number; // last-changed session rev
  messages: ThreadMessage[];
}

const SESSION_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isSessionId(s: unknown): s is string {
  return typeof s === "string" && SESSION_RE.test(s);
}
