import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  Footer,
  Sidebar,
  convertToExcalidrawElements,
  exportToBlob,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./canvas-app.css";
import Badges, {
  type BadgeTarget,
  type BadgesHandle,
  type Selection,
} from "./sidebar/Badges";
import ThreadsSidebar, {
  FilterTabs,
  isVisibleIn,
  type SidebarItem,
  type ThreadFilter,
} from "./sidebar/ThreadsSidebar";
import AssetPalette from "./palette/AssetPalette";
import { ASSET_MIME, buildAsset, type PaletteKind } from "./palette/assets";
import { registerAssetLibrary } from "./palette/library";
import type {
  AgentElement,
  Camera,
  HostContext,
  PullResult,
  SaveResult,
  SceneElement,
  Thread,
} from "./contract";

/** The ext-apps `App` surface this component uses (structurally satisfied by
 * the real App instance and by the dev-harness fake). */
export interface Host {
  callServerTool(req: { name: string; arguments?: unknown }): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- host-defined tool-result JSON; parseToolJson narrows it
  updateModelContext?(p: any): Promise<unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any -- host-defined context payload, passed through verbatim
  requestDisplayMode?(p: {
    mode: "inline" | "fullscreen";
  }): Promise<{ mode: string }>;
  getHostContext?(): any; // eslint-disable-line @typescript-eslint/no-explicit-any -- host-defined context shape, narrowed by the HostContext merge
  ontoolinput?: ((input: any) => unknown) | null; // eslint-disable-line @typescript-eslint/no-explicit-any -- toolinput payload shape is host/tool-defined
  onhostcontextchanged?: ((ctx: any) => void) | null; // eslint-disable-line @typescript-eslint/no-explicit-any -- partial host context, spread into state
}

const POLL_MS = 700;
const SAVE_DEBOUNCE_MS = 1500;

/** Loose imperative API — avoids coupling to deep @excalidraw type subpaths. */
export type ExAPI = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- deliberate loose alias for the Excalidraw imperative API (see doc above)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped tool result; JSON.parse<T> narrows
export function parseToolJson<T>(r: any): T | null {
  const text = r?.content?.find((c: any) => c.type === "text")?.text; // eslint-disable-line @typescript-eslint/no-explicit-any -- wire-JSON content block
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** §4 agent format → convertToExcalidrawElements skeletons. The server already
 * normalises text→label and startElementId→start; we tolerate raw input too. */
type Skeletonish = AgentElement | SceneElement;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- convertToExcalidrawElements accepts untyped skeletons
export function toSkeletons(els: readonly Skeletonish[]): any[] {
  return els.map((el) => {
    const s: any = { ...el }; // eslint-disable-line @typescript-eslint/no-explicit-any -- skeleton under construction: keys are deleted and added
    const shape = ["rectangle", "ellipse", "diamond", "arrow", "line"].includes(
      el.type,
    );
    if (shape && typeof el.text === "string") {
      s.label = { text: el.text };
      delete s.text; // only shapes convert text → bound label (contract §4)
    }
    if (el.startElementId) s.start = { id: el.startElementId };
    if (el.endElementId) s.end = { id: el.endElementId };
    delete s.startElementId;
    delete s.endElementId;
    return s;
  });
}

function convertSafe(els: readonly Skeletonish[]): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw elements at the loose ExAPI boundary
  ok: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- agent-format skeletons that failed conversion
  dropped: any[];
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
  const one = (batch: readonly Skeletonish[]): any[] => {
    try {
      return convertToExcalidrawElements(toSkeletons(batch), {
        regenerateIds: false,
      });
    } catch {
      // ponytail: batch convert failed (usually one bad arrow binding); retry
      // per-element and drop only the offenders. Split batches if it matters.
      return batch.flatMap((el) => {
        try {
          return convertToExcalidrawElements(toSkeletons([el]), {
            regenerateIds: false,
          });
        } catch {
          return [];
        }
      });
    }
  };
  const ok = one(els);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
  const okIds = new Set<string>(ok.map((el: any) => el.id));
  const dropped = els.filter((el) => !okIds.has(String(el.id)));
  return { ok, dropped };
}

/** Compact human-edit diff for updateModelContext (edit-context pattern). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
function computeDiff(baseline: Map<string, any>, live: readonly any[]): string {
  const added: string[] = [];
  const moved: string[] = [];
  const currentIds = new Set<string>();
  for (const el of live) {
    currentIds.add(el.id);
    const orig = baseline.get(el.id);
    if (!orig) {
      added.push(
        `${el.type} "${el.text ?? el.label?.text ?? ""}" at (${Math.round(el.x)},${Math.round(el.y)})`,
      );
    } else if (
      Math.round(orig.x) !== Math.round(el.x) ||
      Math.round(orig.y) !== Math.round(el.y) ||
      Math.round(orig.width) !== Math.round(el.width) ||
      Math.round(orig.height) !== Math.round(el.height)
    ) {
      moved.push(
        `${el.id} → (${Math.round(el.x)},${Math.round(el.y)}) ${Math.round(el.width)}x${Math.round(el.height)}`,
      );
    }
  }
  const removed = [...baseline.keys()].filter((id) => !currentIds.has(id));
  const parts: string[] = [];
  if (added.length) parts.push(`Added: ${added.join("; ")}`);
  if (removed.length) parts.push(`Removed: ${removed.join(", ")}`);
  if (moved.length) parts.push(`Moved/resized: ${moved.join("; ")}`);
  return parts.join(". ");
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
const snapshotOf = (els: readonly any[]) =>
  JSON.stringify(
    els.map((el) => `${el.id}:${el.version ?? 0}:${el.versionNonce ?? 0}`),
  );

type SidebarThread = Thread & {
  targetIds?: string[];
  detached?: boolean;
};

function targetBox(
  targetIds: string[],
  elements: readonly SceneElement[],
): BadgeTarget | null {
  const targets = elements.filter(
    (element) => !element.isDeleted && targetIds.includes(element.id),
  );
  if (!targets.length) return null;
  const x = Math.min(...targets.map((element) => element.x ?? 0));
  const y = Math.min(...targets.map((element) => element.y ?? 0));
  const right = Math.max(
    ...targets.map((element) => (element.x ?? 0) + (element.width ?? 0)),
  );
  const bottom = Math.max(
    ...targets.map((element) => (element.y ?? 0) + (element.height ?? 0)),
  );
  return { x, y, w: right - x, h: bottom - y };
}

const threadTargetIds = (thread: SidebarThread) =>
  thread.targetIds ?? (thread.anchorId ? [thread.anchorId] : []);

/** Row title: the target's bound/own text (≤ 40 chars), else `type · id4`. */
function titleFor(
  target: SceneElement | undefined,
  elements: readonly SceneElement[],
): string | null {
  if (!target) return null;
  let text: string | undefined =
    target.type === "text" ? target.text : undefined;
  if (!text) {
    const bound = target.boundElements?.find((b) => b.type === "text");
    text = bound ? elements.find((el) => el.id === bound.id)?.text : undefined;
  }
  text ??= target.text ?? target.label?.text;
  text = text?.replace(/\s+/g, " ").trim();
  if (text) return text.length > 40 ? `${text.slice(0, 39)}…` : text;
  return `${target.type} · ${target.id.slice(0, 4)}`;
}

/** Top-most element whose bbox contains the scene point (bound text → container). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose ExAPI scene elements
function hitTest(elements: readonly any[], x: number, y: number): any {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.isDeleted || el.locked) continue;
    if (
      x >= el.x &&
      x <= el.x + el.width &&
      y >= el.y &&
      y <= el.y + el.height
    ) {
      return el.containerId
        ? (elements.find((c) => c.id === el.containerId) ?? el)
        : el;
    }
  }
  return null;
}

const TOAST_MS = 2000;

export default function CanvasApp({
  app,
  devApi = false,
  lastToolInput,
  sidebarItems = [],
  sidebarTargets = {},
  sidebarInitiallyOpen = false,
}: {
  app: Host;
  devApi?: boolean;
  lastToolInput?: { current: any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- toolinput payload ref from the host handshake
  sidebarItems?: SidebarItem[];
  sidebarTargets?: Record<string, BadgeTarget>;
  sidebarInitiallyOpen?: boolean;
}) {
  const [session, setSession] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"inline" | "fullscreen">(
    "inline",
  );
  const [hostCtx, setHostCtx] = useState<HostContext>({});

  const [api, setApi] = useState<ExAPI>(null);
  const [selectionIds, setSelectionIds] = useState<string[]>([]);
  const [threadMap, setThreadMap] = useState<Map<string, SidebarThread>>(
    new Map(),
  );
  const [sceneElements, setSceneElementsState] = useState<SceneElement[]>([]);
  const [readAt, setReadAt] = useState<Map<string, number>>(new Map());
  const [sidebarDocked, setSidebarDocked] = useState(
    () => localStorage.getItem("canvas.threads.docked") === "true",
  );
  const [filter, setFilter] = useState<ThreadFilter>("open");
  const [commentTool, setCommentTool] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ req: number; targetIds: string[] }>({
    req: 0,
    targetIds: [],
  });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiRef = useRef<ExAPI>(null);
  const sessionRef = useRef<string | null>(null);
  const sinceRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- agent-format skeletons awaiting conversion retry
  const retryRef = useRef<Map<string, { el: any; tries: number }>>(new Map());
  const cameraRevRef = useRef(0);
  const suppressRef = useRef(0);
  const pullingRef = useRef(false);
  const baselineRef = useRef<Map<string, any>>(new Map()); // eslint-disable-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
  const lastSavedRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const badgesRef = useRef<BadgesHandle | null>(null);
  const autoOpenedRef = useRef<Set<string>>(new Set());
  const lastTargetRef = useRef<Record<string, BadgeTarget>>({});

  apiRef.current = api;

  const suppress = (fn: () => void) => {
    suppressRef.current += 1;
    try {
      fn();
    } finally {
      setTimeout(() => {
        suppressRef.current = Math.max(0, suppressRef.current - 1);
      }, 0);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
  const setBaseline = (els: readonly any[]) => {
    baselineRef.current = new Map(
      els.filter((el) => !el.isDeleted).map((el) => [el.id, el]),
    );
  };

  // ---- canvas_save (human edits + post-conversion persistence) ----
  const saveScene = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
    async (live: readonly any[], force: boolean) => {
      if (!sessionRef.current) return;
      const snap = snapshotOf(live);
      if (!force && snap === lastSavedRef.current) return;
      lastSavedRef.current = snap;
      try {
        const r = await app.callServerTool({
          name: "canvas_save",
          arguments: { session: sessionRef.current, elements: live },
        });
        const data = parseToolJson<SaveResult>(r);
        if (data?.rejected?.length) {
          // Agent-owned ids changed on our side were dropped; server copy wins.
          sinceRef.current = 0;
          void pullRef.current?.();
        }
        // Compact diff for the model (hosts may not support it).
        const diff = computeDiff(baselineRef.current, live);
        setBaseline(live);
        if (diff) {
          try {
            await app.updateModelContext?.({
              content: [{ type: "text", text: `Human edited canvas. ${diff}` }],
            });
          } catch {
            /* unsupported host */
          }
        }
      } catch (e) {
        lastSavedRef.current = ""; // allow retry on next change
        console.warn("canvas: save failed", e);
      }
    },
    [app],
  );

  const onChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw onChange hands us untyped scene elements
    (elements: readonly any[], appState: any) => {
      badgesRef.current?.reposition();
      const liveScene = elements.filter((element) => !element.isDeleted);
      setSceneElementsState((current) =>
        snapshotOf(current) === snapshotOf(liveScene)
          ? current
          : (liveScene as SceneElement[]),
      );
      const nextSelectionIds = Object.keys(
        appState.selectedElementIds ?? {},
      ).filter((id) => appState.selectedElementIds[id]);
      setSelectionIds((current) =>
        current.length === nextSelectionIds.length &&
        current.every((id, index) => id === nextSelectionIds[index])
          ? current
          : nextSelectionIds,
      );
      setCommentTool(
        appState.activeTool?.type === "custom" &&
          appState.activeTool?.customType === "comment",
      );
      setInteracting(
        Boolean(
          appState.isResizing ||
          appState.isRotating ||
          appState.newElement ||
          appState.selectionElement ||
          appState.editingTextElement ||
          appState.cursorButton === "down",
        ),
      );
      for (const thread of threadMap.values()) {
        const targetIds =
          thread.targetIds ?? (thread.anchorId ? [thread.anchorId] : []);
        const box = targetBox(targetIds, elements);
        if (box) lastTargetRef.current[thread.id] = box;
        else if (lastTargetRef.current[thread.id] && sessionRef.current) {
          const last = lastTargetRef.current[thread.id];
          void app.callServerTool({
            name: "canvas_thread_set",
            arguments: {
              session: sessionRef.current,
              threadId: thread.id,
              anchor: { x: last.x + last.w, y: last.y },
            },
          });
        }
      }
      if (suppressRef.current > 0) return; // programmatic update, not a human edit
      const live = elements.filter((el) => !el.isDeleted);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(
        () => void saveScene(live, false),
        SAVE_DEBOUNCE_MS,
      );
    },
    [app, saveScene, threadMap],
  );

  // ---- camera ----
  const applyCamera = useCallback((cam: Camera) => {
    const a = apiRef.current;
    if (!a) return;
    if ("fitAll" in cam) {
      a.scrollToContent(a.getSceneElements(), {
        fitToContent: true,
        animate: false,
      });
      return;
    }
    if ("fitIds" in cam) {
      const els = a
        .getSceneElements()
        .filter((el: any) => cam.fitIds.includes(el.id)); // eslint-disable-line @typescript-eslint/no-explicit-any -- scene elements at the loose ExAPI surface
      if (els.length)
        a.scrollToContent(els, { fitToContent: true, animate: false });
      return;
    }
    const { x, y, width, height } = cam;
    const cw = wrapperRef.current?.clientWidth ?? 800;
    const ch = wrapperRef.current?.clientHeight ?? 600;
    const zoom = Math.min(cw / width, ch / height, 2); // clamp: Excalidraw's static canvas stops painting above ~6x zoom
    suppress(() =>
      a.updateScene({
        appState: {
          scrollX: cw / 2 - (x + width / 2) * zoom,
          scrollY: ch / 2 - (y + height / 2) * zoom,
          zoom: { value: zoom },
        },
      }),
    );
  }, []);

  // ---- canvas_pull poll loop ----
  const pull = useCallback(async () => {
    const a = apiRef.current;
    if (!a || !sessionRef.current || pullingRef.current) return;
    pullingRef.current = true;
    try {
      const r = await app.callServerTool({
        name: "canvas_pull",
        arguments: { session: sessionRef.current, since: sinceRef.current },
      });
      if (r?.isError) return;
      const data = parseToolJson<PullResult>(r);
      if (!data) return;

      if (data.upserts.length || data.deletes.length) {
        const skeletons = data.upserts.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- seed presence is the CONTRACT §4 discriminator; not on the Element type
          (el) => typeof (el as any).seed !== "number",
        );
        const full = data.upserts.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- seed presence is the CONTRACT §4 discriminator; not on the Element type
          (el) => typeof (el as any).seed === "number",
        );
        // Excalidraw's text conversion intermittently throws for a few polls
        // after mount; retry dropped skeletons on later polls instead of
        // losing them forever (bounded).
        for (const [id, r] of retryRef.current) {
          if (!skeletons.some((el) => el.id === id) && r.tries < 5)
            skeletons.push(r.el);
          else retryRef.current.delete(id);
        }
        const { ok: converted, dropped } = skeletons.length
          ? convertSafe(skeletons)
          : { ok: [], dropped: [] };
        for (const el of dropped) {
          const tries = (retryRef.current.get(el.id)?.tries ?? 0) + 1;
          if (tries >= 5)
            console.warn(
              "canvas: dropped unconvertible agent element",
              el.id,
              el.type,
            );
          else retryRef.current.set(el.id, { el, tries });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
        const byId = new Map<string, any>(
          [...full, ...converted].map((el) => [el.id, el]),
        );
        const seen = new Set<string>();
        const delSet = new Set(data.deletes);
        const out: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any -- Excalidraw scene elements (loose ExAPI surface)
        for (const el of a.getSceneElementsIncludingDeleted()) {
          if (
            delSet.has(el.id) ||
            (el.containerId && delSet.has(el.containerId))
          )
            continue;
          const up = byId.get(el.id);
          if (up) {
            out.push(up);
            seen.add(el.id);
          } else {
            out.push(el);
          }
        }
        for (const el of byId.values()) if (!seen.has(el.id)) out.push(el);

        suppress(() =>
          a.updateScene({
            elements: out,
            captureUpdate: CaptureUpdateAction.NEVER,
          }),
        );
        setBaseline(out);

        // Converted agent elements must be saved back so the server stores
        // real elements (CONTRACT §4).
        if (converted.length) {
          const live = out.filter((el) => !el.isDeleted);
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(
            () => void saveScene(live, true),
            0,
          );
        }
      }

      sinceRef.current = data.rev;

      if (data.camera && data.camera.rev > cameraRevRef.current) {
        cameraRevRef.current = data.camera.rev;
        applyCamera(data.camera);
      }

      if (data.threads?.length || data.threadDeletes?.length) {
        setThreadMap((current) => {
          const next = new Map(current);
          for (const id of data.threadDeletes ?? []) next.delete(id);
          for (const incoming of data.threads ?? []) {
            const previous = next.get(incoming.id);
            next.set(incoming.id, incoming);
            const last = incoming.messages.at(-1);
            if (
              previous &&
              incoming.messages.length > previous.messages.length &&
              last?.author === "agent" &&
              !autoOpenedRef.current.has(incoming.id) &&
              apiRef.current?.getAppState().openSidebar?.name !== "threads"
            ) {
              autoOpenedRef.current.add(incoming.id);
              apiRef.current?.toggleSidebar({
                name: "threads",
                tab: "open",
                force: true,
              });
            }
          }
          return next;
        });
      }

      if (data.screenshot) {
        const { requestId } = data.screenshot;
        try {
          const blob = await exportToBlob({
            elements: a.getSceneElements(),
            appState: {
              exportBackground: true,
              viewBackgroundColor: "#ffffff",
            },
            mimeType: "image/png",
          });
          const pngBase64 = await blobToBase64(blob);
          await app.callServerTool({
            name: "canvas_screenshot_result",
            arguments: { session: sessionRef.current, requestId, pngBase64 },
          });
        } catch (e) {
          console.warn("canvas: screenshot failed", e);
        }
      }
    } catch (e) {
      console.warn("canvas: pull failed", e);
    } finally {
      pullingRef.current = false;
    }
  }, [app, applyCamera, saveScene]);

  const pullRef = useRef<(() => Promise<void>) | null>(null);
  pullRef.current = pull;

  // ---- host wiring ----
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- toolinput payload shape is host/tool-defined
    const onToolInput = (input: any) => {
      // basic-host sends toolinput without a tool name — canvas_open is our
      // only UI tool, so an unnamed {arguments:{session}} is an open
      const isOpen =
        input?.name === "canvas_open" ||
        (input?.name === undefined && typeof input?.arguments === "object");
      // ponytail: mirrors the server default so `{}` from a host bookmark opens "demo"
      const next =
        typeof input?.arguments?.session === "string"
          ? (input.arguments.session as string)
          : "demo";
      if (isOpen) {
        sinceRef.current = 0;
        cameraRevRef.current = 0;
        lastSavedRef.current = "";
        if (sessionRef.current !== next) {
          sessionRef.current = next;
          setSession(next);
          setThreadMap(new Map());
          setSceneElementsState([]);
          setReadAt(new Map());
          autoOpenedRef.current.clear();
          lastTargetRef.current = {};
          const a = apiRef.current;
          if (a) suppress(() => a.updateScene({ elements: [] })); // fresh session, fresh scene
          setBaseline([]);
        }
      }
    };
    // the canvas_open toolinput fired before mount (handshake timing) — replay it
    if (lastToolInput?.current) onToolInput(lastToolInput.current);
    app.ontoolinput = onToolInput;
    app.onhostcontextchanged = (ctx) => {
      setHostCtx((prev) => ({ ...prev, ...ctx }));
      if (ctx.displayMode)
        setDisplayMode(ctx.displayMode === "pip" ? "inline" : ctx.displayMode);
    };
    const init = app.getHostContext?.();
    if (init) setHostCtx(init);
    return () => {
      app.ontoolinput = null;
      app.onhostcontextchanged = null;
    };
  }, [app, lastToolInput]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dev-harness diagnostic handle, dev builds only
    if (devApi && api) (window as any).__excalidrawAPI = api;
    if (api) void registerAssetLibrary(api);
    if (api && sidebarInitiallyOpen) {
      const timer = setTimeout(
        () => api.toggleSidebar({ name: "threads", tab: "open", force: true }),
        100,
      );
      return () => clearTimeout(timer);
    }
  }, [devApi, api, sidebarInitiallyOpen]);

  useEffect(() => {
    if (!session || !api) return;
    void pull();
    const t = setInterval(() => void pull(), POLL_MS);
    return () => clearInterval(t);
  }, [session, api, pull]);

  // ---- display mode / sizing ----
  const toggleFullscreen = useCallback(async () => {
    const mode = displayMode === "fullscreen" ? "inline" : "fullscreen";
    try {
      const r = await app.requestDisplayMode?.({ mode });
      if (r?.mode)
        setDisplayMode(r.mode === "pip" ? "inline" : (r.mode as any)); // eslint-disable-line @typescript-eslint/no-explicit-any -- host may return display modes beyond our two; others map to inline above
    } catch (e) {
      console.warn("canvas: requestDisplayMode failed", e);
    }
  }, [app, displayMode]);

  const computedTargets = useMemo(() => {
    if (sidebarItems.length) return sidebarTargets;
    const targets: Record<string, BadgeTarget> = {};
    for (const thread of threadMap.values()) {
      const targetIds =
        thread.targetIds ?? (thread.anchorId ? [thread.anchorId] : []);
      const box = targetBox(targetIds, sceneElements);
      if (box) {
        targets[thread.id] = box;
        lastTargetRef.current[thread.id] = box;
      } else if (thread.anchor) {
        targets[thread.id] = {
          x: thread.anchor.x,
          y: thread.anchor.y,
          w: 0,
          h: 0,
        };
      }
    }
    return targets;
  }, [sceneElements, sidebarItems.length, sidebarTargets, threadMap]);

  const computedSidebarItems = useMemo<SidebarItem[]>(() => {
    if (sidebarItems.length) return sidebarItems;
    return [...threadMap.values()]
      .sort(
        (a, b) => a.messages[0]?.ts.localeCompare(b.messages[0]?.ts ?? "") ?? 0,
      )
      .map((thread, index) => {
        const targetIds = threadTargetIds(thread);
        const targets = sceneElements.filter((element) =>
          targetIds.includes(element.id),
        );
        const last = thread.messages.at(-1);
        const lastTs = last ? Date.parse(last.ts) || 0 : 0;
        return {
          id: thread.id,
          index: index + 1,
          title: titleFor(targets[0], sceneElements) ?? `Thread ${index + 1}`,
          subtitle:
            targetIds.length > 1 ? `${targetIds.length} elements` : undefined,
          status: thread.detached ? "detached" : thread.status,
          collapsed: thread.collapsed,
          unread:
            last?.author === "agent" && lastTs > (readAt.get(thread.id) ?? 0),
          lines: thread.messages.map((message) => ({
            author: message.author,
            text: message.text,
            ts: message.ts,
          })),
        };
      });
  }, [readAt, sceneElements, sidebarItems, threadMap]);

  const setThreadState = useCallback(
    async (
      threadId: string,
      patch: { collapsed?: boolean; resolved?: boolean },
    ) => {
      if (!sessionRef.current) return;
      setThreadMap((current) => {
        const next = new Map(current);
        const thread = next.get(threadId);
        if (thread)
          next.set(threadId, {
            ...thread,
            ...(patch.collapsed !== undefined
              ? { collapsed: patch.collapsed }
              : {}),
            ...(patch.resolved !== undefined
              ? { status: patch.resolved ? "resolved" : "open" }
              : {}),
          });
        return next;
      });
      await app.callServerTool({
        name: "canvas_thread_set",
        arguments: { session: sessionRef.current, threadId, ...patch },
      });
    },
    [app],
  );

  const postComment = useCallback(
    async (text: string) => {
      const targetIds = compose.targetIds.length
        ? compose.targetIds
        : selectionIds;
      if (!sessionRef.current || !targetIds.length) return;
      setCompose({ req: 0, targetIds: [] });
      await app.callServerTool({
        name: "canvas_thread_post",
        arguments: { session: sessionRef.current, targetIds, text },
      });
      void pullRef.current?.();
    },
    [app, compose.targetIds, selectionIds],
  );

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const openSidebar = useCallback(() => {
    const a = apiRef.current;
    if (a && a.getAppState().openSidebar?.name !== "threads")
      a.toggleSidebar({ name: "threads", tab: "open", force: true });
  }, []);

  /** Open the compose row for the given targets (selects them for feedback). */
  const startComment = useCallback(
    (targetIds: string[]) => {
      const a = apiRef.current;
      if (!a || !targetIds.length) return;
      a.updateScene({
        appState: {
          selectedElementIds: Object.fromEntries(
            targetIds.map((id) => [id, true]),
          ),
        },
      });
      a.setActiveTool({ type: "selection" });
      setFilter("open");
      openSidebar();
      setCompose((current) => ({ req: current.req + 1, targetIds }));
    },
    [openSidebar],
  );

  const setCommentToolActive = useCallback((on: boolean) => {
    apiRef.current?.setActiveTool(
      on
        ? { type: "custom", customType: "comment", locked: true } // locked: survive Excalidraw's pointer-up reset
        : { type: "selection" },
    );
  }, []);

  // Comment tool: next pointer-down on an element starts a thread there.
  useEffect(() => {
    if (!api) return;
    const unsubscribe = api.onPointerDown(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw pointerDownState at the loose ExAPI surface
      (activeTool: any, pointerDownState: any) => {
        if (
          activeTool?.type !== "custom" ||
          activeTool?.customType !== "comment"
        )
          return;
        const { x, y } = pointerDownState.origin;
        const hit = hitTest(api.getSceneElements(), x, y);
        // Defer: Excalidraw's own pointer-down handling runs after this
        // callback and closes an undocked sidebar; open ours afterwards.
        if (hit) setTimeout(() => startComment([hit.id]), 0);
        else showToast("Click an element to comment");
      },
    );
    return () => void unsubscribe?.();
  }, [api, showToast, startComment]);

  const stampAsset = useCallback(
    (kind: Exclude<PaletteKind, "comment">, sceneX: number, sceneY: number) => {
      const a = apiRef.current;
      if (!a) return;
      let fresh: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any -- Excalidraw elements at the loose ExAPI surface
      try {
        fresh = buildAsset(kind, sceneX, sceneY);
      } catch (e) {
        console.warn("canvas: asset generation failed", e);
        showToast("Could not build that asset");
        return;
      }
      if (!fresh.length) return;
      const groupId = fresh[0].groupIds?.[0];
      a.updateScene({
        elements: [...a.getSceneElementsIncludingDeleted(), ...fresh],
        appState: {
          selectedElementIds: Object.fromEntries(
            fresh.map((el) => [el.id, true]),
          ),
          ...(groupId ? { selectedGroupIds: { [groupId]: true } } : {}),
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY, // human action: undoable
      });
    },
    [showToast],
  );

  const sceneAt = useCallback((clientX: number, clientY: number) => {
    const a = apiRef.current;
    if (!a) return null;
    return viewportCoordsToSceneCoords({ clientX, clientY }, a.getAppState());
  }, []);

  const onPalettePick = useCallback(
    (kind: PaletteKind) => {
      if (kind === "comment") {
        setCommentToolActive(!commentTool);
        return;
      }
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const p = sceneAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (p) stampAsset(kind, Math.round(p.x), Math.round(p.y));
    },
    [commentTool, sceneAt, setCommentToolActive, stampAsset],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const kind = event.dataTransfer.getData(ASSET_MIME) as PaletteKind | "";
      if (!kind) return;
      event.preventDefault();
      event.stopPropagation();
      const p = sceneAt(event.clientX, event.clientY);
      const a = apiRef.current;
      if (!p || !a) return;
      if (kind === "comment") {
        const hit = hitTest(a.getSceneElements(), p.x, p.y);
        if (hit) startComment([hit.id]);
        else showToast("Drop 💬 onto an element to comment");
        return;
      }
      stampAsset(kind, Math.round(p.x), Math.round(p.y));
    },
    [sceneAt, showToast, stampAsset, startComment],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const t = event.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable
      )
        return;
      if (event.key === "Escape" && commentTool) {
        setCommentToolActive(false);
      } else if (
        (event.key === "c" || event.key === "C") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        setCommentToolActive(!commentTool);
      }
    },
    [commentTool, setCommentToolActive],
  );

  const postReply = useCallback(
    async (threadId: string, text: string) => {
      if (!sessionRef.current) return;
      await app.callServerTool({
        name: "canvas_thread_post",
        arguments: { session: sessionRef.current, threadId, text },
      });
      void pullRef.current?.();
    },
    [app],
  );

  const focusThread = useCallback(
    (threadId: string) => {
      const thread = threadMap.get(threadId);
      const a = apiRef.current;
      if (!thread || !a) return;
      const targetIds =
        thread.targetIds ?? (thread.anchorId ? [thread.anchorId] : []);
      const targets = a
        .getSceneElements()
        .filter((element: any) => targetIds.includes(element.id)); // eslint-disable-line @typescript-eslint/no-explicit-any -- loose ExAPI scene elements
      if (targets.length) {
        a.scrollToContent(targets, { fitToContent: true, animate: true });
        a.updateScene({
          appState: {
            selectedElementIds: Object.fromEntries(
              targets.map((element: any) => [element.id, true]), // eslint-disable-line @typescript-eslint/no-explicit-any -- loose ExAPI scene elements
            ),
          },
        });
      }
      setReadAt((current) => {
        const next = new Map(current);
        next.set(threadId, Date.now());
        return next;
      });
      if (a.getAppState().openSidebar?.name !== "threads")
        a.toggleSidebar({ name: "threads", tab: "open", force: true });
    },
    [threadMap],
  );

  const selection = useMemo<Selection | null>(() => {
    if (!selectionIds.length) return null;
    const box = targetBox(selectionIds, sceneElements);
    if (!box) return null;
    const threadIds = [...threadMap.values()]
      .filter((thread) =>
        threadTargetIds(thread).some((id) => selectionIds.includes(id)),
      )
      .map((thread) => thread.id);
    return { box, threadIds };
  }, [sceneElements, selectionIds, threadMap]);

  const composeTitle = useMemo(() => {
    const ids = compose.targetIds.length ? compose.targetIds : selectionIds;
    if (!ids.length) return undefined;
    const first = titleFor(
      sceneElements.find((el) => el.id === ids[0]),
      sceneElements,
    );
    return ids.length > 1 ? `${ids.length} elements` : (first ?? undefined);
  }, [compose.targetIds, sceneElements, selectionIds]);

  const counts = useMemo(
    () => ({
      open: computedSidebarItems.filter((item) => isVisibleIn(item, "open"))
        .length,
      all: computedSidebarItems.length,
    }),
    [computedSidebarItems],
  );

  const cd = hostCtx.containerDimensions;
  const frameStyle: CSSProperties =
    displayMode === "fullscreen"
      ? { height: "100vh" }
      : cd?.height
        ? { height: cd.height }
        : cd?.maxHeight
          ? { aspectRatio: "4 / 3", maxHeight: cd.maxHeight }
          : { aspectRatio: "4 / 3" };

  return (
    <div
      ref={wrapperRef}
      className={`canvas-host${commentTool ? " is-commenting" : ""}`}
      data-theme="light"
      style={{
        position: "relative",
        width: "100%",
        boxSizing: "border-box",
        ...frameStyle,
      }}
      onKeyDownCapture={onKeyDown}
      onDragOverCapture={(event) => {
        if (event.dataTransfer.types.includes(ASSET_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDropCapture={onDrop}
    >
      <Excalidraw
        excalidrawAPI={(a: ExAPI) => setApi(a)}
        onChange={
          onChange as any // eslint-disable-line @typescript-eslint/no-explicit-any -- Excalidraw's private onChange element types vs our loose ExAPI elements
        }
        initialData={{
          appState: {
            viewBackgroundColor: "#ffffff",
            openSidebar: sidebarInitiallyOpen
              ? { name: "threads", tab: "open" }
              : null,
          },
        }}
        theme="light"
        onScrollChange={() => badgesRef.current?.reposition()}
        renderTopRightUI={() => (
          <div className="canvas-topright">
            <button
              type="button"
              className={commentTool ? "is-active" : undefined}
              aria-pressed={commentTool}
              title="Comment tool (C)"
              aria-label="Comment tool"
              onClick={() => setCommentToolActive(!commentTool)}
            >
              <span aria-hidden>💬</span>
            </button>
            <button
              type="button"
              title="Toggle threads sidebar"
              onClick={() => apiRef.current?.toggleSidebar({ name: "threads" })}
            >
              Threads
              {counts.open > 0 && (
                <span className="canvas-segmented-count">{counts.open}</span>
              )}
            </button>
            <button
              type="button"
              className="is-icon"
              title={
                displayMode === "fullscreen" ? "Exit fullscreen" : "Fullscreen"
              }
              aria-label="Toggle fullscreen"
              onClick={() => void toggleFullscreen()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {displayMode === "fullscreen" ? (
                  <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                ) : (
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                )}
              </svg>
            </button>
          </div>
        )}
      >
        <Footer>
          <div className="canvas-footer">
            <FilterTabs filter={filter} counts={counts} onChange={setFilter} />
          </div>
        </Footer>
        <Sidebar
          name="threads"
          docked={sidebarDocked}
          onDock={(docked) => {
            setSidebarDocked(docked);
            localStorage.setItem("canvas.threads.docked", String(docked));
          }}
          className="threads-sidebar"
        >
          <Sidebar.Header>
            <span className="threads-sidebar-title">Threads</span>
            <FilterTabs filter={filter} counts={counts} onChange={setFilter} />
          </Sidebar.Header>
          <ThreadsSidebar
            items={computedSidebarItems}
            filter={filter}
            composeRequest={compose.req}
            composeTitle={composeTitle}
            onComment={(text) => void postComment(text)}
            onCancelCompose={() => setCompose({ req: 0, targetIds: [] })}
            onReply={(id, text) => void postReply(id, text)}
            onResolve={(id) => void setThreadState(id, { resolved: true })}
            onReopen={(id) => void setThreadState(id, { resolved: false })}
            onCollapse={(id, collapsed) =>
              void setThreadState(id, { collapsed })
            }
            onFocus={focusThread}
          />
        </Sidebar>
      </Excalidraw>
      <AssetPalette
        commentActive={commentTool}
        shifted={selectionIds.length > 0}
        onPick={onPalettePick}
      />
      {toast && (
        <div className="canvas-toast" role="status">
          {toast}
        </div>
      )}
      {!session && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "sans-serif",
            color: "#666",
            background: "rgba(255,255,255,0.7)",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          Waiting for canvas_open…
        </div>
      )}
      <Badges
        ref={badgesRef}
        api={apiRef}
        items={computedSidebarItems}
        targets={computedTargets}
        selection={selection}
        selectionHidden={interacting || commentTool}
        onFocus={focusThread}
        onComment={() => startComment(selectionIds)}
      />
    </div>
  );
}
