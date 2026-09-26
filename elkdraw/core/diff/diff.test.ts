import { expect, test } from "bun:test";
import type {
  Box,
  NeutralScene,
  Point,
  SceneElement,
} from "../src/contracts/index.ts";
import { changes, diff, feed, type LogEntry } from "./diff.ts";

const at = (x: number, y: number, width: number, height: number): Box => ({
  x,
  y,
  width,
  height,
});
const p = (x: number, y: number): Point => ({ x, y });
const node = (
  id: string,
  x: number,
  label = id.toUpperCase(),
): Extract<SceneElement, { type: "box" }> => ({
  type: "box",
  id,
  box: at(x, 0, 160, 60),
  text: { text: label, box: at(x + 75, 22, 10, 16) },
  style: { fontSize: 16 },
});
const arrow = (
  id: string,
  from: string,
  to: string,
  x0: number,
  x1: number,
): SceneElement => ({
  type: "line",
  id,
  points: [p(x0, 30), p(x1, 30)],
  from,
  to,
});
const scene = (...elements: SceneElement[]): NeutralScene => ({ elements });

const a = node("a", 0);
const b = node("b", 360);
const ab = arrow("ab", "a", "b", 165, 355);

test("equal scenes: no changes, lint unchanged", () => {
  expect(diff(scene(a, b, ab), scene(a, b, ab))).toEqual({
    changes: [],
    lints: { added: [], fixed: [] },
    delta: "lint unchanged",
  });
});

test("moved is thresholded at 2 px; bound arrows following a move are not reported", () => {
  const jitter = { ...a, box: at(1.5, -1.2, 160, 60) };
  expect(changes(scene(a, b, ab), scene(jitter, b, ab))).toEqual([]);
  const b2 = node("b", 480);
  const ab2 = arrow("ab", "a", "b", 165, 475);
  expect(changes(scene(a, b, ab), scene(a, b2, ab2))).toEqual([
    { op: "moved", ids: ["b"], detail: { dx: 120, dy: 0 } },
  ]);
});

test("one line per shared shift; free lines move, relabel/restyle/reconnect", () => {
  const c = node("c", 720);
  const free: SceneElement = {
    type: "line",
    id: "f",
    points: [p(0, 200), p(50, 200)],
  };
  const before = scene(a, b, c, ab, free);
  const after = scene(
    { ...node("a", 10), box: at(10, 5, 160, 60) },
    { ...node("b", 370), box: at(370, 5, 160, 60) },
    {
      ...c,
      text: { text: "Cache", box: at(795, 22, 10, 16) },
      style: { fontSize: 20 },
    },
    arrow("ab", "a", "c", 165, 715),
    { ...free, points: [p(0, 300), p(50, 300)] },
  );
  expect(changes(before, after)).toEqual([
    { op: "moved", ids: ["a", "b"], detail: { dx: 10, dy: 5 } },
    { op: "moved", ids: ["f"], detail: { dx: 0, dy: 100 } },
    {
      op: "relabelled",
      ids: ["c"],
      detail: { oldLabel: "C", newLabel: "Cache" },
    },
    { op: "restyled", ids: ["c"] },
    { op: "reconnected", ids: ["ab"] },
  ]);
});

test("lint delta on a fixture pair: +1 crossing, +1 node-overlap, -1 dangling-endpoint", () => {
  // A: a dangling arrow (its end is 100 px short of b). B: the arrow reaches
  // b, a second arrow crosses it, and an unlabelled node sits on b's corner.
  const short = arrow("ab", "a", "b", 165, 255);
  const cross: SceneElement = {
    type: "line",
    id: "v",
    points: [p(260, -60), p(260, 120)],
  };
  const d: SceneElement = { type: "box", id: "d", box: at(400, 40, 80, 60) };
  const r = diff(scene(a, b, short), scene(a, b, ab, cross, d));
  expect(r.lints.added.map((h) => [h.code, ...h.ids]).sort()).toEqual(
    [
      ["crossing", "ab", "v"],
      ["node-overlap", "b", "d"],
    ].sort(),
  );
  expect(r.lints.fixed.map((h) => [h.code, ...h.ids])).toEqual([
    ["dangling-endpoint", "ab", "b"],
  ]);
  expect(r.delta).toBe("+1 crossing, +1 node-overlap, -1 dangling-endpoint");
});

test("feed: author runs are diffed end to end; an agent run is one applied line", async () => {
  const b2 = node("b", 480);
  const b3 = node("b", 600);
  const scenes = [
    scene(a, b),
    scene(a, b, ab),
    scene(a, b2, ab),
    scene(a, b3, ab),
  ];
  const log: LogEntry[] = [
    { rev: 1, author: "agent", time: "2026-09-26T10:00:00.000Z" },
    { rev: 2, author: "human", time: "2026-09-26T10:01:00.000Z" },
    { rev: 3, author: "human", time: "2026-09-26T10:01:01.000Z" },
  ];
  const sceneAt = (rev: number) => scenes[rev] ?? scene();
  expect(await feed(0, log, sceneAt)).toEqual([
    { author: "agent", time: log[0]?.time ?? "", op: "applied", ids: ["ab"] },
    {
      author: "human",
      time: log[2]?.time ?? "",
      op: "moved",
      ids: ["b"],
      detail: { dx: 240, dy: 0 },
    },
  ]);
  expect(await feed(3, [], sceneAt)).toEqual([]);
});
