// Snapshots live in __snapshots__/. `bun test` fails on a changed snapshot,
// and on a missing one when CI=true (GitHub Actions sets it). Update on
// purpose with `bun run --cwd test/parity update-snapshots`.
import { expect, test } from "bun:test";
import { fakeBackend } from "@elkdraw/backend-fake";
import { LaidGraph } from "@elkdraw/core";
import { sceneOf } from "./snapshot.ts";

const gen = { origin: "generated" } as const;
const node = (id: string, x: number) => ({
  id,
  x,
  y: 0,
  width: 40,
  height: 20,
  meta: gen,
});
const edge = (from: string, to: string, x1: number, x2: number) => ({
  id: `${from}-${to}`,
  sources: [from],
  targets: [to],
  meta: gen,
  sections: [
    {
      id: `${from}-${to}/s`,
      startPoint: { x: x1, y: 10 },
      endPoint: { x: x2, y: 10 },
    },
  ],
});

const threeNodes = LaidGraph.parse({
  id: "root",
  x: 0,
  y: 0,
  width: 200,
  height: 20,
  meta: gen,
  children: [node("a", 0), node("b", 80), node("c", 160)],
  edges: [edge("a", "b", 40, 80), edge("b", "c", 120, 160)],
});

test("fake: three nodes", () => {
  expect(sceneOf(fakeBackend, threeNodes)).toMatchSnapshot();
});
