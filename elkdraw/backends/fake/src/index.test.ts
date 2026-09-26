import { expect, test } from "bun:test";
import {
  Capabilities,
  LaidGraph,
  NeutralScene,
  parseJson,
} from "@elkdraw/core";
import { fakeBackend } from "./index.ts";

const gen = { origin: "generated" } as const;

// Zone z holds zone y holds box b: nesting Excalidraw frames cannot express.
const graph = LaidGraph.parse({
  id: "root",
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  meta: gen,
  children: [
    {
      id: "a",
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      meta: { ...gen, shape: "rect" },
    },
    {
      id: "z",
      x: 100,
      y: 10,
      width: 150,
      height: 150,
      meta: gen,
      children: [
        {
          id: "y",
          x: 10,
          y: 10,
          width: 100,
          height: 100,
          meta: gen,
          children: [
            {
              id: "b",
              x: 5,
              y: 5,
              width: 40,
              height: 20,
              meta: gen,
              labels: [
                {
                  id: "b#label",
                  text: "B",
                  x: 2,
                  y: 2,
                  width: 7,
                  height: 15,
                  meta: gen,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  edges: [
    {
      id: "a-b",
      sources: ["a"],
      targets: ["b"],
      meta: gen,
      sections: [
        { id: "s", startPoint: { x: 50, y: 20 }, endPoint: { x: 115, y: 30 } },
      ],
    },
  ],
});

test("capabilities satisfy the contract", () => {
  expect(Capabilities.parse(fakeBackend.capabilities)).toEqual(
    fakeBackend.capabilities,
  );
});

test("emit nests zones deep, makes coordinates absolute, never binds", () => {
  const scene = fakeBackend.emit(graph);
  const byId = new Map(scene.elements.map((el) => [el.id, el]));
  expect(byId.get("y")).toMatchObject({
    type: "zone",
    zone: "z",
    box: { x: 110, y: 20 },
  });
  expect(byId.get("b")).toMatchObject({
    type: "box",
    zone: "y",
    box: { x: 115, y: 25 },
    text: { text: "B", box: { x: 117, y: 27 } },
  });
  expect(byId.get("a")).toMatchObject({ type: "box", shape: "rect" });
  expect(byId.get("a")).not.toHaveProperty("zone");
  const line = byId.get("a-b");
  expect(line?.type).toBe("line");
  expect(line).not.toHaveProperty("from");
  expect(line).not.toHaveProperty("to");
});

test("read and serialise round-trip the scene", async () => {
  const scene = fakeBackend.emit(graph);
  const read = await fakeBackend.read?.(scene);
  expect(read).toEqual(scene);
  expect(parseJson(NeutralScene, fakeBackend.serialise(scene))).toEqual(scene);
});

test("measure uses a fixed char width and wraps", async () => {
  const sizes = await fakeBackend.measure([
    { text: "abcd", fontFamily: "mono", fontSize: 10 },
    { text: "abcd", fontFamily: "mono", fontSize: 10, wrapWidth: 12 },
  ]);
  expect(sizes).toEqual([
    { width: 24, height: 12.5 },
    { width: 12, height: 25 },
  ]);
});

test("render is a stub that reports boxes", async () => {
  const scene = fakeBackend.emit(graph);
  const result = await fakeBackend.render?.(scene, ["b", "missing"]);
  expect(result?.png.length).toBe(0);
  expect(result?.boxes).toEqual({
    b: { x: 115, y: 25, width: 40, height: 20 },
  });
});
