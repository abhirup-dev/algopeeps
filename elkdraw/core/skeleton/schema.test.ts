import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseJson } from "../src/json.ts";
import { SkeletonInput, validateSkeleton } from "./schema.ts";

const read = async (rel: string) =>
  parseJson(z.unknown(), await Bun.file(new URL(rel, import.meta.url)).text());

// negative.jsonl: 20 elements, one per line, each with planted defects.
// Line n (0-based) is elements[n].
test("negative fixture: every planted defect is reported at its path", async () => {
  const text = await Bun.file(
    new URL("./negative.jsonl", import.meta.url),
  ).text();
  const elements = text
    .trim()
    .split("\n")
    .map((line) => parseJson(z.unknown(), line));
  expect(elements).toHaveLength(20);
  const result = validateSkeleton({ appState: {}, elements });
  if (result.ok) throw new Error("negative fixture validated");
  expect(result.errors.map((e) => e.slice(0, e.indexOf(": ")))).toEqual([
    "elements[0].fontSize", // fontSize on a rectangle
    "elements[1].elbowed", // not a skeleton field
    "elements[2].id", // semantic id required
    "elements[5].allow[0].rule", // not a lint code
    "elements[5].allow[0].why",
    "elements[6].allow[0].why", // empty reason
    "elements[7].start.id", // inline-created end: no semantic id
    "elements[7].start.type",
    "elements[8].type", // unknown element type
    "elements[9].id", // random, not semantic
    "elements[10].containerId", // bound text is `label`
    "elements[11].label.text",
    "elements[12].seed", // store-owned
    "elements[13].strokeStyle",
    "elements[14].x",
    "elements[15].children",
    "elements[16].text",
    "elements[17].points", // one point
    "elements[18].roundness.type",
    "elements[19].opacity",
    "appState", // unknown top-level key
    "elements[4].id", // duplicate of elements[3]
  ]);
  expect(result.errors).toContain("elements[0].fontSize: unknown key");
  expect(result.errors).toContain('elements[4].id: duplicate id "kafka"');
});

test("known yctimlin keys get a fix hint", () => {
  const result = validateSkeleton({
    elements: [
      {
        type: "rectangle",
        id: "a",
        x: 0,
        y: 0,
        text: "Trip",
      },
      {
        type: "arrow",
        id: "a-b",
        x: 0,
        y: 0,
        startElementId: "a",
        endElementId: "b",
      },
    ],
  });
  if (result.ok) throw new Error("expected unknown-key errors");
  expect(result.errors).toEqual([
    "elements[0].text: unknown key; use label.text",
    "elements[1].startElementId: unknown key; use start.id",
    "elements[1].endElementId: unknown key; use end.id",
  ]);
});

test("a terse skeleton validates", () => {
  const input: SkeletonInput = {
    elements: [
      {
        type: "rectangle",
        id: "ride/core/trip",
        x: 0,
        y: 0,
        label: { text: "Trip" },
      },
      { type: "ellipse", id: "ride/data/pg", x: 200, y: 0 },
      { type: "frame", id: "ride/core", children: ["ride/core/trip"] },
      {
        type: "arrow",
        id: "ride/core/trip->ride/data/pg",
        x: 100,
        y: 20,
        start: { id: "ride/core/trip" },
        end: { id: "ride/data/pg" },
        allow: [{ rule: "crossing", why: "fan-in" }],
      },
    ],
  };
  expect(validateSkeleton(input)).toEqual({ ok: true, value: input });
});

test("the schema converts to JSON Schema (tool input)", () => {
  expect(z.toJSONSchema(SkeletonInput, { io: "input" })).toBeDefined();
});

// The dogfood scenes are wire scenes (store state), not skeleton input. This
// projects each to the skeleton an agent would write for it: bound text folds
// into `label`, bindings into `start`/`end`, store-owned fields are dropped.
// Keys Excalidraw ignores are dropped by name and counted: the strict schema
// rejecting them is the point (design §3.2, "fontSize on an edge").
const STORE_OWNED = [
  "seed",
  "version",
  "versionNonce",
  "updated",
  "index",
  "isDeleted",
  "boundElements",
  "lastCommittedPoint",
  "containerId",
  "originalText",
  "startBinding",
  "endBinding",
];

const Scene = z.looseObject({
  elements: z.array(
    z.looseObject({ id: z.string(), type: z.string() }).catchall(z.unknown()),
  ),
});
type WireElement = z.infer<typeof Scene>["elements"][number];

function project(scene: z.infer<typeof Scene>) {
  const ignored = { fontSize: 0, elbowed: 0 };
  const bound = new Map<unknown, WireElement>();
  for (const e of scene.elements)
    if (e.type === "text" && e["containerId"]) bound.set(e["containerId"], e);
  const bindingId = (b: unknown) =>
    typeof b === "object" && b !== null && "elementId" in b
      ? { id: b.elementId }
      : undefined;

  const elements = scene.elements
    .filter((e) => !(e.type === "text" && e["containerId"]))
    .map((e) => {
      const out: Record<string, unknown> = { ...e };
      for (const key of STORE_OWNED) Reflect.deleteProperty(out, key);
      if (e.type === "text") {
        out["text"] = e["originalText"] ?? e["text"];
      } else {
        for (const key of ["fontSize", "elbowed"] as const)
          if (key in out) {
            ignored[key]++;
            Reflect.deleteProperty(out, key);
          }
      }
      const start = bindingId(e["startBinding"]);
      const end = bindingId(e["endBinding"]);
      if (start) out["start"] = start;
      if (end) out["end"] = end;
      const t = bound.get(e.id);
      if (t)
        out["label"] = {
          text: t["originalText"],
          fontSize: t["fontSize"],
          fontFamily: t["fontFamily"],
          textAlign: t["textAlign"],
          verticalAlign: t["verticalAlign"],
          strokeColor: t["strokeColor"],
        };
      return out;
    });
  return { input: { elements }, bound: bound.size, ignored };
}

describe("dogfood scenes validate as skeleton input", () => {
  const cases = [
    // scene, elements after folding bound text, ignored fontSize, elbowed
    ["yct", 76 - 26, 3, 20],
    ["batch", 77 - 26, 26, 21],
  ] as const;
  for (const [name, count, fontSize, elbowed] of cases)
    test(name, async () => {
      const raw = await read(
        `../../test/fixtures/dogfood/${name}/scene.excalidraw`,
      );
      const scene = Scene.parse(raw);
      expect(validateSkeleton({ elements: scene.elements }).ok).toBe(false);

      const { input, ignored } = project(scene);
      expect(input.elements).toHaveLength(count);
      expect(ignored).toEqual({ fontSize, elbowed });
      expect(validateSkeleton(input)).toMatchObject({ ok: true });
    });
});
