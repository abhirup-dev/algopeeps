// Scene diff and change feed (design §12.4). diff(A, B) compares two
// NeutralScenes by id and returns FeedLine-shaped changes (no author/time: a
// pure diff has neither) plus the lint delta. changes() walks the event log in
// author runs and stamps each run's diff with its author and time.
//
// Moves count for boxes, zones and free text only. A line with a bound end is
// never "moved": its points follow its endpoints, so moving Kafka would
// otherwise report every arrow on Kafka too. Resizes and reshaped arrows have
// no FeedLine op and are not reported.
import stringify from "safe-stable-stringify";
import type {
  FeedLine,
  LintHit,
  NeutralScene,
  SceneElement,
} from "../src/contracts/index.ts";
import { lint } from "../lint/lint.ts";

/** A shift below this (px, either axis) is jitter, not a move. Matches lint's TOL. */
export const MOVE_MIN = 2;

export type Change = Omit<FeedLine, "author" | "time">;

export interface Diff {
  changes: Change[];
  lints: { added: LintHit[]; fixed: LintHit[] };
  /** e.g. `+2 crossing, -1 label-on-label`; `lint unchanged` when equal. */
  delta: string;
}

const OPS: FeedLine["op"][] = [
  "added",
  "removed",
  "moved",
  "relabelled",
  "restyled",
  "reconnected",
  "applied",
];

/** Where an element sits, or undefined when it has no movable anchor. */
function anchor(el: SceneElement): { x: number; y: number } | undefined {
  switch (el.type) {
    case "box":
    case "zone":
      return el.box;
    case "text":
      return el.text.box;
    case "line":
      return el.from === undefined && el.to === undefined
        ? el.points[0]
        : undefined;
  }
}

const styleKey = (el: SceneElement) =>
  stringify({
    type: el.type,
    style: el.style,
    shape: "shape" in el ? el.shape : undefined,
  });

export function changes(a: NeutralScene, b: NeutralScene): Change[] {
  const before = new Map(a.elements.map((el) => [el.id, el]));
  const after = new Map(b.elements.map((el) => [el.id, el]));
  const added = b.elements
    .filter((el) => !before.has(el.id))
    .map((el) => el.id);
  const removed = a.elements
    .filter((el) => !after.has(el.id))
    .map((el) => el.id);
  const moves = new Map<string, Change>();
  const out: Change[] = [];
  const restyled: string[] = [];
  const reconnected: string[] = [];
  for (const [id, x] of before) {
    const y = after.get(id);
    if (!y) continue;
    const p = anchor(x);
    const q = anchor(y);
    if (p && q) {
      const dx = Math.round(q.x - p.x);
      const dy = Math.round(q.y - p.y);
      if (Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) >= MOVE_MIN) {
        // One line per shared shift: a zone dragged with its children is one move.
        const by = `${String(dx)},${String(dy)}`;
        const line = moves.get(by);
        if (line) line.ids.push(id);
        else moves.set(by, { op: "moved", ids: [id], detail: { dx, dy } });
      }
    }
    const oldLabel = x.text?.text;
    const newLabel = y.text?.text;
    if (oldLabel !== newLabel) {
      const detail: Change["detail"] = {};
      if (oldLabel !== undefined) detail.oldLabel = oldLabel;
      if (newLabel !== undefined) detail.newLabel = newLabel;
      out.push({ op: "relabelled", ids: [id], detail });
    }
    if (styleKey(x) !== styleKey(y)) restyled.push(id);
    if (
      x.type === "line" &&
      y.type === "line" &&
      (x.from !== y.from || x.to !== y.to)
    )
      reconnected.push(id);
  }
  out.push(...moves.values());
  for (const [op, ids] of [
    ["added", added],
    ["removed", removed],
    ["restyled", restyled],
    ["reconnected", reconnected],
  ] as const)
    if (ids.length > 0) out.push({ op, ids: [...ids].sort() });
  for (const line of out) line.ids.sort();
  const rank = (c: Change) => OPS.indexOf(c.op);
  return out.sort(
    (p, q) =>
      rank(p) - rank(q) || (p.ids[0] ?? "").localeCompare(q.ids[0] ?? ""),
  );
}

const key = (h: LintHit) => `${h.code}|${h.ids.join(",")}`;

/** Hits in `b` not in `a` (added) and in `a` not in `b` (fixed), matched on
 * code + ids (not bbox: a moved defect is the same defect). Multiset, so a
 * repeated key counts each time. */
export function lintDelta(a: readonly LintHit[], b: readonly LintHit[]) {
  const minus = (xs: readonly LintHit[], ys: readonly LintHit[]) => {
    const left = new Map<string, number>();
    for (const h of ys) left.set(key(h), (left.get(key(h)) ?? 0) + 1);
    return xs.filter((h) => {
      const n = left.get(key(h)) ?? 0;
      left.set(key(h), n - 1);
      return n <= 0;
    });
  };
  return { added: minus(b, a), fixed: minus(a, b) };
}

/** `+2 crossing, -1 label-on-label`. Suppressed hits are left out: they were
 * accepted with a reason. */
export function deltaText(lints: Diff["lints"]): string {
  const count = (hits: LintHit[]) => {
    const n = new Map<string, number>();
    for (const h of hits)
      if (h.suppressed === undefined) n.set(h.code, (n.get(h.code) ?? 0) + 1);
    return [...n].sort(([p], [q]) => p.localeCompare(q));
  };
  const parts = [
    ...count(lints.added).map(([code, n]) => `+${String(n)} ${code}`),
    ...count(lints.fixed).map(([code, n]) => `-${String(n)} ${code}`),
  ];
  return parts.length > 0 ? parts.join(", ") : "lint unchanged";
}

export function diff(a: NeutralScene, b: NeutralScene): Diff {
  const lints = lintDelta(lint(a), lint(b));
  return { changes: changes(a, b), lints, delta: deltaText(lints) };
}

/** One accepted delta in the event log. */
export interface LogEntry {
  rev: number;
  author: FeedLine["author"];
  time: string;
}

/**
 * The change feed since `since`: consecutive deltas by one author are one run,
 * diffed start to end (a drag's many deltas become one move) and stamped with
 * the run's author and last time. Human runs are itemised; an agent run is one
 * `applied` line naming what it touched (the agent knows what it sent).
 * `log` holds the deltas after `since`, in rev order.
 */
export async function feed(
  since: number,
  log: readonly LogEntry[],
  sceneAt: (rev: number) => NeutralScene | Promise<NeutralScene>,
): Promise<FeedLine[]> {
  const out: FeedLine[] = [];
  let before = await sceneAt(since);
  for (let i = 0; i < log.length;) {
    const author = log[i]?.author;
    let j = i;
    while (j + 1 < log.length && log[j + 1]?.author === author) j++;
    const last = log[j];
    if (!last || !author) break;
    const after = await sceneAt(last.rev);
    const found = changes(before, after);
    const stamp = { author, time: last.time };
    if (author === "agent") {
      const ids = [...new Set(found.flatMap((c) => c.ids))].sort();
      if (ids.length > 0) out.push({ ...stamp, op: "applied", ids });
    } else out.push(...found.map((c) => ({ ...stamp, ...c })));
    before = after;
    i = j + 1;
  }
  return out;
}
