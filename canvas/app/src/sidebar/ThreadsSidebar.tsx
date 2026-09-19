import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import "./sidebar.css";

export type SidebarItem = {
  id: string;
  index: number;
  title: string;
  subtitle?: string;
  status: "open" | "resolved" | "detached";
  collapsed?: boolean;
  unread?: boolean;
  lines: { author: "human" | "agent"; text: string; ts: string }[];
};

export type ThreadFilter = "open" | "all";

export const isVisibleIn = (item: SidebarItem, filter: ThreadFilter) =>
  filter === "all" || item.status !== "resolved";

/** `just now`, `2 min ago`, `14:12` after an hour; raw input if unparseable. */
export function relativeTime(ts: string, now = Date.now()): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts;
  const s = Math.max(0, (now - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date(now).toDateString()
    ? hm
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${hm}`;
}

const AUTHOR_LABEL = { human: "You", agent: "Tutor" } as const;

/** Segmented Open/All control; shared by the sidebar header and the footer. */
export function FilterTabs({
  filter,
  counts,
  onChange,
}: {
  filter: ThreadFilter;
  counts: { open: number; all: number };
  onChange: (filter: ThreadFilter) => void;
}) {
  return (
    <div className="canvas-segmented" role="tablist" aria-label="Thread filter">
      {(["open", "all"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={filter === value}
          onClick={() => onChange(value)}
        >
          {value === "open" ? "Open" : "All"}
          {counts[value] > 0 && (
            <span className="canvas-segmented-count">{counts[value]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** 1–5 row auto-growing textarea. Enter sends, Shift+Enter inserts a newline. */
function GrowTextarea({
  value,
  onChange,
  onSend,
  placeholder,
  ariaLabel,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  ariaLabel: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    const line = 20;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, line + 16), line * 5 + 16)}px`;
  }, [value]);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };
  return (
    <textarea
      ref={ref}
      rows={1}
      className="threads-textarea"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

function Author({ author }: { author: "human" | "agent" }) {
  return (
    <span className={`threads-author is-${author}`}>
      <span className="threads-author-dot" aria-hidden />
      {AUTHOR_LABEL[author]}
    </span>
  );
}

function Time({ ts }: { ts: string }) {
  const iso = Number.isNaN(Date.parse(ts)) ? undefined : ts;
  return (
    <time className="threads-time" dateTime={iso} title={iso ?? ts}>
      {relativeTime(ts)}
    </time>
  );
}

function ThreadsSidebar({
  items,
  filter,
  composeRequest = 0,
  composeTitle,
  onComment,
  onCancelCompose,
  onFocus,
  onReply,
  onResolve,
  onReopen,
  onCollapse,
}: {
  items: SidebarItem[];
  filter: ThreadFilter;
  /** Bump to open (and focus) the compose row; 0 = closed. */
  composeRequest?: number;
  /** Title of the element(s) the compose row targets. */
  composeTitle?: string;
  onComment: (text: string) => void;
  onCancelCompose?: () => void;
  onFocus: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onCollapse: (id: string, collapsed: boolean) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [collapseOverrides, setCollapseOverrides] = useState<
    Record<string, boolean>
  >({});
  const visible = items.filter((item) => isVisibleIn(item, filter));

  useEffect(() => {
    if (composeRequest > 0) setComposing(true);
  }, [composeRequest]);

  const closeCompose = () => {
    setComposing(false);
    setDraft("");
    onCancelCompose?.();
  };
  const sendComment = () => {
    const text = draft.trim();
    if (!text) return;
    onComment(text);
    setComposing(false);
    setDraft("");
  };
  const sendReply = (id: string) => {
    const text = (replies[id] ?? "").trim();
    if (!text) return;
    onReply(id, text);
    setReplies((current) => ({ ...current, [id]: "" }));
  };

  let body: ReactNode;
  if (!visible.length && !composing) {
    body = (
      <div className="threads-empty">
        <span className="threads-empty-icon" aria-hidden>
          💬
        </span>
        {items.length ? (
          <p>No open threads.</p>
        ) : (
          <p>
            No threads yet. Select something and press <kbd>C</kbd>, or drag 💬
            from the palette.
          </p>
        )}
      </div>
    );
  } else {
    body = visible.map((item) => {
      const collapsed = collapseOverrides[item.id] ?? item.collapsed ?? true;
      const isExpanded = !collapsed;
      const last = item.lines.at(-1);
      const replyDraft = replies[item.id] ?? "";
      return (
        <article
          key={item.id}
          className={`threads-sidebar-row is-${item.status}${item.unread ? " is-unread" : ""}${isExpanded ? " is-expanded" : ""}`}
          aria-expanded={isExpanded}
        >
          <div className="threads-row-head">
            <button
              type="button"
              className="threads-sidebar-row-main"
              aria-expanded={isExpanded}
              onClick={() => {
                onFocus(item.id);
                setCollapseOverrides((current) => ({
                  ...current,
                  [item.id]: isExpanded,
                }));
                onCollapse(item.id, isExpanded);
              }}
            >
              <span
                className={`thread-badge is-static is-${item.status}${item.unread ? " is-unread" : ""}`}
                aria-hidden
              >
                {item.index}
              </span>
              <span className="threads-row-title">{item.title}</span>
              <span className={`threads-status is-${item.status}`}>
                {item.status}
              </span>
            </button>
            {item.status === "resolved" ? (
              <button
                type="button"
                className="threads-ghost"
                onClick={() => onReopen(item.id)}
              >
                Reopen
              </button>
            ) : (
              <button
                type="button"
                className="threads-ghost is-icon"
                title="Resolve"
                aria-label={`Resolve thread ${item.index}`}
                onClick={() => onResolve(item.id)}
              >
                ✓
              </button>
            )}
          </div>
          {item.subtitle && (
            <div className="threads-row-subtitle">{item.subtitle}</div>
          )}
          {!isExpanded && last && (
            <div className="threads-row-preview">
              <Author author={last.author} />
              <span className="threads-row-preview-text">{last.text}</span>
            </div>
          )}
          {isExpanded && (
            <div className="threads-row-body">
              {item.lines.map((line, index) => (
                <div
                  className={`threads-line is-${line.author}`}
                  key={`${line.ts}-${index}`}
                >
                  <div className="threads-line-meta">
                    <Author author={line.author} />
                    <Time ts={line.ts} />
                  </div>
                  <p className="threads-line-text">{line.text}</p>
                </div>
              ))}
              <div className="threads-compose">
                <GrowTextarea
                  value={replyDraft}
                  onChange={(value) =>
                    setReplies((current) => ({ ...current, [item.id]: value }))
                  }
                  onSend={() => sendReply(item.id)}
                  placeholder="Reply…"
                  ariaLabel={`Reply to thread ${item.index}`}
                />
                <button
                  type="button"
                  className="threads-primary"
                  disabled={!replyDraft.trim()}
                  onClick={() => sendReply(item.id)}
                >
                  Reply
                </button>
              </div>
            </div>
          )}
        </article>
      );
    });
  }

  return (
    <div className="threads-sidebar-layout">
      {composing && (
        <section className="threads-new" aria-label="Compose comment">
          <div className="threads-new-head">
            <span className="threads-new-title">
              Comment on <strong>{composeTitle ?? "selection"}</strong>
            </span>
            <button
              type="button"
              className="threads-ghost is-icon"
              title="Cancel"
              aria-label="Cancel comment"
              onClick={closeCompose}
            >
              ×
            </button>
          </div>
          <div className="threads-compose">
            <GrowTextarea
              value={draft}
              onChange={setDraft}
              onSend={sendComment}
              placeholder="Ask or note something…"
              ariaLabel="New comment"
              autoFocus
            />
            <button
              type="button"
              className="threads-primary"
              disabled={!draft.trim()}
              onClick={sendComment}
            >
              Send
            </button>
          </div>
        </section>
      )}
      <div className="threads-sidebar-list" aria-label={`${filter} threads`}>
        {body}
      </div>
    </div>
  );
}

export default ThreadsSidebar;
