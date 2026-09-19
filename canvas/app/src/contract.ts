// Contract types live in @algopeeps/canvas-shared (canvas/CONTRACT.md §1–§7).
// Re-exported here so imports elsewhere in app/ don't change. App-only wire
// shapes (pull/save results, host context, the tool-level Camera union) stay
// local.

export type {
  Owner,
  AgentElement,
  Element,
  OwnerData,
} from "@algopeeps/canvas-shared";

// Names app/ was written against.
export type { Element as SceneElement } from "@algopeeps/canvas-shared";
export type { OwnerData as CustomData } from "@algopeeps/canvas-shared";

import type {
  Camera as CameraRect,
  Element as SceneElement,
} from "@algopeeps/canvas-shared";

/** §3/§7 — tool-level camera; fitIds/fitAll variants are resolved by the app. */
export type Camera = CameraRect | { fitIds: string[] } | { fitAll: true };

/** §11 comment thread (wire shape). `anchor` is the canvas_threads extra;
 * pull may carry it — used as fallback when the anchor element is missing. */
export interface ThreadMessage {
  id: string;
  author: "human" | "agent";
  text: string;
  ts: string;
}

export interface Thread {
  id: string;
  anchorId?: string;
  status: "open" | "resolved";
  collapsed: boolean;
  rev: number;
  messages: ThreadMessage[];
  anchor?: { x: number; y: number };
}

/** §3 canvas_pull result (§11: gains threads/threadDeletes) */
export interface PullResult {
  rev: number;
  upserts: SceneElement[]; // full elements, or agent-format skeletons (no seed) pending conversion
  deletes: string[];
  camera?: Camera & { rev: number };
  screenshot?: { requestId: string };
  threads?: Thread[]; // threads with rev > since
  threadDeletes?: string[];
}

/** §3 canvas_save result */
export interface SaveResult {
  rev: number;
  rejected: string[];
}

/** ext-apps host context subset the app cares about (loose on purpose). */
export interface HostContext {
  containerDimensions?: {
    height?: number;
    maxHeight?: number;
    width?: number;
    maxWidth?: number;
  };
  displayMode?: "inline" | "fullscreen" | "pip";
  [key: string]: unknown;
}
