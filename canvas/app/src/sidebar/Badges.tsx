import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ExAPI } from "../CanvasApp";
import type { SidebarItem } from "./ThreadsSidebar";

export type BadgeTarget = { x: number; y: number; w: number; h: number };

export type Selection = { box: BadgeTarget; threadIds: string[] };

type Pos = { left: number; top: number };

export default function Badges({
  api,
  items,
  targets,
  selection,
  selectionHidden = false,
  onFocus,
  onComment,
  ref,
}: {
  api: { current: ExAPI };
  items: SidebarItem[];
  targets: Record<string, BadgeTarget>;
  /** Current selection bbox (scene coords) + threads already on it. */
  selection?: Selection | null;
  /** True while dragging/resizing/rotating: bubble hidden, badges keep tracking. */
  selectionHidden?: boolean;
  onFocus: (id: string) => void;
  onComment?: () => void;
  ref?: { current: BadgesHandle | null };
}) {
  const frame = useRef<number | null>(null);
  const itemsRef = useRef(items);
  const targetsRef = useRef(targets);
  const selectionRef = useRef(selection);
  itemsRef.current = items;
  targetsRef.current = targets;
  selectionRef.current = selection;
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [bubblePos, setBubblePos] = useState<Pos | null>(null);

  const reposition = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const state = api.current?.getAppState?.();
      if (!state) return;
      const zoom = state.zoom.value;
      const next: Record<string, Pos> = {};
      for (const item of itemsRef.current) {
        const target = targetsRef.current[item.id];
        if (!target) continue;
        next[item.id] = {
          left: (target.x + target.w + state.scrollX) * zoom - 11,
          top: (target.y + state.scrollY) * zoom - 11,
        };
      }
      setPositions(next);
      const sel = selectionRef.current;
      setBubblePos(
        sel
          ? {
              left: (sel.box.x + sel.box.w / 2 + state.scrollX) * zoom,
              top: (sel.box.y + state.scrollY) * zoom - 8,
            }
          : null,
      );
    });
  }, [api]);

  useImperativeHandle(ref, () => ({ reposition }), [reposition]);

  useEffect(() => {
    reposition();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null; // else every later reposition() early-returns
    };
  }, [reposition, selection, targets, items]);

  const bubbleThreads = selection?.threadIds ?? [];

  return (
    <div className="thread-badges" aria-label="Thread badges">
      {items.map((item) => {
        const position = positions[item.id];
        if (!position) return null;
        return (
          <button
            key={item.id}
            type="button"
            className={`thread-badge is-${item.status}${item.unread ? " is-unread" : ""}`}
            style={position}
            title={item.title}
            aria-label={`Focus thread ${item.index}`}
            onClick={() => onFocus(item.id)}
          >
            {item.index}
          </button>
        );
      })}
      {selection && bubblePos && !selectionHidden && (
        <div className="selection-bubble" style={bubblePos} role="toolbar">
          <button type="button" onClick={onComment} aria-label="Comment">
            <span aria-hidden>💬</span> Comment
          </button>
          {bubbleThreads.length > 0 && (
            <button
              type="button"
              onClick={() => onFocus(bubbleThreads[0])}
              aria-label={`${bubbleThreads.length} threads on selection`}
            >
              <span aria-hidden>🧵</span> {bubbleThreads.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type BadgesHandle = { reposition: () => void };
