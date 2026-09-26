import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import type { ElkNode } from "elkjs";
import { z } from "zod";
import { parseJson } from "../json.ts";
import type {
  BackendAdapter,
  Capabilities,
  Graph,
  LaidGraph,
} from "./index.ts";
import { AstPatch, jsonSchemas, published } from "./index.ts";

type Examples = {
  [K in keyof typeof published]: z.infer<(typeof published)[K]>;
};

const gen = { geom: "g1", style: "s1", text: "t1" };

const graph: Graph = {
  id: "ride",
  meta: { origin: "generated", family: "flowchart" },
  children: [
    {
      id: "gateway",
      width: 120,
      height: 60,
      labels: [
        { id: "gateway#label", text: "Gateway", meta: { origin: "generated" } },
      ],
      meta: { origin: "generated", roles: ["svc"], shape: "rect", gen },
    },
    {
      id: "core",
      meta: { origin: "generated" },
      children: [
        {
          id: "trip",
          meta: {
            origin: "generated",
            pin: { kind: "soft", at: { x: 400, y: 80 } },
            allow: [{ rule: "crossing", why: "unavoidable fan-in" }],
          },
        },
      ],
    },
  ],
  edges: [
    {
      id: "gateway->trip",
      sources: ["gateway"],
      targets: ["trip"],
      meta: { origin: "generated", kind: "solid" },
    },
  ],
};

const laidGraph: LaidGraph = {
  id: "ride",
  x: 0,
  y: 0,
  width: 300,
  height: 100,
  meta: { origin: "generated" },
  children: [
    {
      id: "gateway",
      x: 12,
      y: 20,
      width: 120,
      height: 60,
      meta: { origin: "generated" },
    },
  ],
  edges: [
    {
      id: "gateway->trip",
      sources: ["gateway"],
      targets: ["trip"],
      container: "ride",
      sections: [
        {
          id: "gateway->trip_s0",
          startPoint: { x: 132, y: 50 },
          endPoint: { x: 200, y: 50 },
          incomingShape: "gateway",
          outgoingShape: "trip",
        },
      ],
      meta: { origin: "generated" },
    },
  ],
};

const capabilities: Capabilities = {
  nesting: "flat",
  bindings: "native",
  opaqueMeta: true,
  edgeLabels: "bound",
  readBack: true,
  shapes: ["rect", "cyl", "diamond"],
  freeform: true,
};

const examples: Examples = {
  Graph: graph,
  LaidGraph: laidGraph,
  NeutralScene: {
    elements: [
      {
        type: "box",
        id: "gateway",
        box: { x: 12, y: 20, width: 120, height: 60 },
        shape: "rect",
        text: { text: "Gateway", box: { x: 40, y: 40, width: 64, height: 20 } },
        meta: { gen },
      },
      {
        type: "line",
        id: "gateway->trip",
        points: [
          { x: 132, y: 50 },
          { x: 200, y: 50 },
        ],
        from: "gateway",
        to: "trip",
      },
      {
        type: "text",
        id: "Xq3v",
        text: {
          text: "why is Redis here?",
          box: { x: 0, y: 200, width: 150, height: 20 },
        },
      },
    ],
  },
  Capabilities: capabilities,
  AstPatch: {
    op: "create",
    element: "edge",
    id: "trip->pg",
    from: "trip",
    to: "pg",
  },
  Allow: { rule: "crossing", why: "unavoidable fan-in" },
  LintHit: {
    code: "label-on-node",
    ids: ["gateway->trip#label", "trip"],
    bbox: { x: 120, y: 40, width: 60, height: 20 },
    severity: "error",
    hint: "labelAt",
  },
  ApplyReply: {
    rev: 3,
    created: ["surge"],
    updated: 2,
    kept: 20,
    deleted: [],
    overrides: [{ id: "trip", groups: ["style"] }],
    conflicts: [],
    moved: [{ id: "pricing", dx: 140, dy: 0 }],
    lints: [],
    measured: true,
  },
  FeedLine: {
    author: "human",
    time: "2026-09-26T14:02:00Z",
    op: "relabelled",
    ids: ["core:trip"],
    detail: { oldLabel: "Trip", newLabel: "Trips svc" },
  },
};

describe("contracts", () => {
  for (const name of Object.keys(published) as (keyof typeof published)[]) {
    test(`${name} example validates`, () => {
      expect(published[name].parse(examples[name])).toEqual(examples[name]);
    });
  }

  test("patches reject unknown keys", () => {
    expect(
      AstPatch.safeParse({ op: "delete", id: "a", cascade: true }).success,
    ).toBe(false);
  });

  test("the tree is what elkjs consumes and returns", () => {
    const input: ElkNode = graph;
    const output: ElkNode = laidGraph;
    expect([input.id, output.id]).toEqual(["ride", "ride"]);
  });

  test("an adapter implements the seam", () => {
    const fake: BackendAdapter<string> = {
      id: "fake",
      capabilities,
      emit: (g) => g.id,
      measure: (texts) =>
        Promise.resolve(texts.map(() => ({ width: 0, height: 0 }))),
      serialise: (scene) => scene,
    };
    expect(fake.emit(laidGraph)).toBe("ride");
  });
});

describe("core/schemas", () => {
  const dir = new URL("../../schemas/", import.meta.url);

  test("are up to date (run `bun run --cwd elkdraw/core schemas`)", () => {
    const onDisk = Object.fromEntries(
      readdirSync(dir).map((file) => [
        file.replace(/\.json$/, ""),
        parseJson(z.unknown(), readFileSync(new URL(file, dir), "utf8")),
      ]),
    );
    expect(onDisk).toEqual(jsonSchemas());
  });
});
