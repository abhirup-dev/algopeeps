import { expect, test } from "bun:test";
import type { Element } from "../src/contracts/index.ts";
import { place } from "../place/index.ts";
import type { SkeletonElement } from "../skeleton/schema.ts";
import { add, apply, type ApplyDeps, type Scene } from "./apply.ts";

const rand = () => Math.random().toString(36).slice(2);

// Mimics convertToExcalidrawElements where it matters here: random seed,
// versionNonce and label ids; labels as bound text; arrow bindings.
const convert: ApplyDeps["convert"] = (skeletons) => {
  const out: Element[] = [];
  for (const s of skeletons) {
    const { label, start, end, ...rest } = {
      label: undefined,
      start: undefined,
      end: undefined,
      ...s,
    };
    const el: Element = {
      ...rest,
      version: 1,
      versionNonce: Math.random(),
      seed: Math.random(),
      updated: Date.now(),
      boundElements: null,
      ...(start ? { startBinding: { elementId: start.id } } : {}),
      ...(end ? { endBinding: { elementId: end.id } } : {}),
    };
    out.push(el);
    if (label) {
      const id = rand();
      el["boundElements"] = [{ type: "text", id }];
      out.push({
        id,
        type: "text",
        version: 1,
        seed: Math.random(),
        text: label.text,
        originalText: label.text,
        containerId: s.id,
      });
    }
  }
  for (const e of out)
    for (const b of [e["startBinding"], e["endBinding"]]) {
      const target = out.find(
        (t) =>
          typeof b === "object" &&
          b !== null &&
          "elementId" in b &&
          t.id === b.elementId,
      );
      if (target)
        target["boundElements"] = [
          ...(Array.isArray(target["boundElements"])
            ? target["boundElements"]
            : []),
          { type: "arrow", id: e.id },
        ];
    }
  return { elements: out, measured: true };
};
const deps: ApplyDeps = { convert };

const box = (id: string, x = 0): SkeletonElement => ({
  type: "rectangle",
  id,
  x,
  y: 0,
  width: 120,
  height: 60,
  label: { text: id.toUpperCase() },
});
const file: SkeletonElement[] = [
  box("api"),
  box("db", 300),
  {
    type: "arrow",
    id: "api->db",
    x: 120,
    y: 30,
    start: { id: "api" },
    end: { id: "db" },
  },
];
const human: Element = { id: "Xy7Qh", type: "ellipse", version: 3, x: 900 };

/** Apply and hand the delta to a store-like scene. */
function step(scene: Scene, input: unknown, d = deps) {
  const r = apply(scene, input, d);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return { r, scene: { rev: r.reply.rev, elements: r.elements } };
}

const empty: Scene = { rev: 0, elements: [human] };

test("first apply creates; labels get derived ids", () => {
  const { r } = step(empty, { elements: file });
  expect(r.reply).toMatchObject({
    rev: 1,
    created: ["api", "db", "api->db"],
    updated: 0,
    kept: 0,
    deleted: [],
    lints: [],
  });
  expect(r.upserts.map((e) => e.id).sort()).toEqual(
    ["api", "api#label", "api->db", "db", "db#label"].sort(),
  );
  const api = r.upserts.find((e) => e.id === "api");
  expect(api?.["customData"]).toEqual({ origin: "generated" });
  expect(api?.["boundElements"]).toContainEqual({
    type: "text",
    id: "api#label",
  });
});

test("re-applying the same input is a no-op; clean reply under 300 bytes", () => {
  const { scene } = step(empty, { elements: file });
  const { r } = step(scene, { elements: file });
  expect(r.upserts).toEqual([]);
  expect(r.deletes).toEqual([]);
  expect(r.reply.rev).toBe(1);
  expect(r.reply.kept).toBe(3);
  expect(r.reply.updated).toBe(0);
  const bytes = Buffer.byteLength(JSON.stringify(r.reply));
  expect(bytes).toBeLessThan(300);
  const first = apply(empty, { elements: file }, deps);
  if (!first.ok) throw new Error("apply failed");
  expect(Buffer.byteLength(JSON.stringify(first.reply))).toBeLessThan(300);
});

test("an edit bumps version by one and keeps seed and human bindings", () => {
  const { scene } = step(empty, { elements: file });
  // A human arrow bound to db, as the canvas would store it.
  const elements = scene.elements.map((e) =>
    e.id === "db"
      ? {
          ...e,
          boundElements: [
            ...(Array.isArray(e["boundElements"]) ? e["boundElements"] : []),
            { type: "arrow", id: "Hum4n" },
          ],
        }
      : e,
  );
  elements.push({ id: "Hum4n", type: "arrow", version: 1 });
  const before = elements.find((e) => e.id === "db");
  const { r } = step(
    { rev: 1, elements },
    { elements: [file[0], box("db", 400), file[2]] },
  );
  expect(r.reply).toMatchObject({ rev: 2, created: [], updated: 1, kept: 2 });
  expect(r.upserts.map((e) => e.id)).toEqual(["db"]);
  const db = r.upserts[0];
  expect(db?.version).toBe((before?.version ?? 0) + 1);
  expect(db?.["seed"]).toBe(before?.["seed"]);
  expect(db?.["boundElements"]).toContainEqual({ type: "arrow", id: "Hum4n" });
});

test("dryRun writes nothing but reports what would change", () => {
  const r = apply(empty, { elements: file, dryRun: true }, deps);
  if (!r.ok) throw new Error("apply failed");
  expect(r.upserts).toEqual([]);
  expect(r.deletes).toEqual([]);
  expect(r.elements).toEqual([human]);
  expect(r.reply.rev).toBe(0);
  expect(r.reply.created).toEqual(["api", "db", "api->db"]);
});

test("prune deletes dropped generated ids and their labels, never human ones", () => {
  const { scene } = step(empty, { elements: file });
  const { r } = step(scene, { elements: [box("api")], prune: true });
  expect(r.reply.deleted.sort()).toEqual(["api->db", "db"]);
  expect(r.deletes.sort()).toEqual(["api->db", "db", "db#label"]);
  expect(r.elements.map((e) => e.id)).toContain("Xy7Qh");
  // api's binding to the pruned arrow is dropped, so api counts as updated.
  expect(r.reply).toMatchObject({ updated: 1, kept: 0 });
  expect(r.upserts.map((e) => e.id)).toEqual(["api"]);
});

test("delete patch takes bound arrows and labels; set relabels", () => {
  const { scene } = step(empty, { elements: file });
  const { r } = step(scene, {
    patches: [
      { op: "delete", id: "db" },
      { op: "set", id: "api", label: "Gateway" },
    ],
  });
  expect(r.reply.deleted.sort()).toEqual(["api->db", "db"]);
  expect(r.reply.updated).toBe(1);
  const label = r.upserts.find((e) => e.id === "api#label");
  expect(label?.["text"]).toBe("Gateway");
  expect(label?.version).toBe(2);
});

test("errors: ifRev, unknown patch id, add on an existing id, place without placer", () => {
  const { scene } = step(empty, { elements: file });
  const bad = (r: ReturnType<typeof apply>) => (r.ok ? [] : r.errors);
  expect(bad(apply(scene, { elements: file, ifRev: 0 }, deps))).toEqual([
    "ifRev: the canvas is at rev 1, not 0",
  ]);
  expect(
    bad(apply(scene, { patches: [{ op: "delete", id: "nope" }] }, deps)),
  ).toEqual(['patches[0].id: no element "nope"']);
  expect(bad(add(scene, { elements: [box("api")] }, deps))[0]).toContain(
    "already exists",
  );
  expect(
    bad(
      apply(
        scene,
        {
          elements: file,
          place: [{ op: "row", ids: ["api", "db"], at: [0, 0], gap: 20 }],
        },
        deps,
      ),
    )[0],
  ).toContain("task 1.9");
  expect(bad(apply(scene, {}, deps))[0]).toContain("one of elements");
  expect(bad(apply(scene, { elements: [box("a"), box("a")] }, deps))).toEqual([
    'elements[1].id: duplicate id "a"',
  ]);
});

test("place (task 1.9): a tree + below pointer through apply", () => {
  const withPlace: ApplyDeps = { ...deps, place };
  const { r } = step(
    empty,
    {
      place: [
        { op: "tree", id: "t", keys: [8, 4, 12], at: [0, 0] },
        {
          op: "below",
          id: "lo",
          of: "t-8",
          gap: 20,
        },
      ],
      elements: [{ type: "text", id: "lo", x: 0, y: 0, text: "lo" }],
    },
    withPlace,
  );
  expect(r.reply.created.sort()).toEqual(
    ["t-8", "t-4", "t-12", "t-8-4", "t-8-12", "lo"].sort(),
  );
  const byId = new Map(r.upserts.map((e) => [e.id, e]));
  const root = byId.get("t-8");
  const lo = byId.get("lo");
  expect(root?.["x"]).toBeTypeOf("number");
  expect(lo?.["y"]).toBeGreaterThan(Number(root?.["y"]));
});

// 1.15: the ride-hailing eval (eval/phase-1/ride-hailing/transcript.jsonl).
// Excalidraw's converter fills every field a skeleton leaves out, so an
// upsert that is not merged first comes back as a default box or arrow.
const withDefaults: ApplyDeps["convert"] = (skeletons, scene) => {
  const r = convert(skeletons, scene);
  const linear = (t: string) => t === "arrow" || t === "line";
  return {
    ...r,
    elements: r.elements.map((e) =>
      e["containerId"] !== undefined
        ? e
        : {
            width: 100,
            height: 100,
            strokeColor: "#1e1e1e",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeStyle: "solid",
            ...(linear(e.type)
              ? {
                  points: [
                    [0, 0],
                    [100, 0],
                  ],
                }
              : {}),
            ...(e.type === "text" ? { fontSize: 20 } : {}),
            ...e,
          },
    ),
  };
};
const rh: ApplyDeps = { convert: withDefaults, place };

/** Rev 2 of the transcript (line 87): the legend and two core services. */
const rideHailing = () =>
  step(
    { rev: 0, elements: [] },
    {
      elements: [
        {
          id: "pricing",
          type: "rectangle",
          x: 900,
          y: 400,
          width: 200,
          height: 70,
          fillStyle: "solid",
          backgroundColor: "#a5d8ff",
          strokeColor: "#1971c2",
          label: { text: "Pricing service" },
        },
        {
          id: "matching",
          type: "rectangle",
          x: 1300,
          y: 400,
          width: 200,
          height: 70,
          fillStyle: "solid",
          backgroundColor: "#a5d8ff",
          strokeColor: "#1971c2",
          label: { text: "Matching service" },
        },
        {
          id: "legend-zone",
          type: "rectangle",
          x: 40,
          y: 1090,
          width: 460,
          height: 210,
          strokeColor: "#868e96",
        },
        {
          id: "legend-h",
          type: "text",
          x: 60,
          y: 1098,
          text: "Legend",
          fontSize: 24,
          strokeColor: "#868e96",
        },
        {
          id: "lg-sync",
          type: "arrow",
          x: 100,
          y: 1150,
          points: [
            [0, 0],
            [120, 0],
          ],
          strokeColor: "#1971c2",
        },
        {
          id: "lg-async",
          type: "arrow",
          x: 100,
          y: 1200,
          points: [
            [0, 0],
            [120, 0],
          ],
          strokeColor: "#e8590c",
          strokeStyle: "dashed",
        },
      ],
    },
    rh,
  ).scene;

const byId = (s: Scene, id: string) => s.elements.find((e) => e.id === id);

test("p1rh-05: a partial upsert merges over the stored element (rev 3, rev 4)", () => {
  // Line 107: legend-zone re-sent with x/y only.
  let scene = step(
    rideHailing(),
    { elements: [{ id: "legend-zone", type: "rectangle", x: 40, y: 1170 }] },
    rh,
  ).scene;
  expect(byId(scene, "legend-zone")).toMatchObject({
    x: 40,
    y: 1170,
    width: 460,
    height: 210,
    strokeColor: "#868e96",
  });
  // Line 120: the legend moved down with x/y (and text) only.
  scene = step(
    scene,
    {
      elements: [
        { id: "legend-h", type: "text", x: 60, y: 1178, text: "Legend" },
        { id: "lg-sync", type: "arrow", x: 100, y: 1230 },
        { id: "lg-async", type: "arrow", x: 100, y: 1280 },
      ],
    },
    rh,
  ).scene;
  expect(byId(scene, "legend-h")).toMatchObject({
    y: 1178,
    fontSize: 24,
    strokeColor: "#868e96",
  });
  expect(byId(scene, "lg-sync")).toMatchObject({
    y: 1230,
    strokeColor: "#1971c2",
    points: [
      [0, 0],
      [120, 0],
    ],
  });
  expect(byId(scene, "lg-async")).toMatchObject({
    y: 1280,
    strokeColor: "#e8590c",
    strokeStyle: "dashed",
  });
  // A given field still wins, and a label merges one level deep.
  scene = step(
    scene,
    {
      elements: [
        {
          id: "pricing",
          type: "rectangle",
          x: 900,
          y: 400,
          strokeColor: "#e03131",
        },
      ],
    },
    rh,
  ).scene;
  expect(byId(scene, "pricing")).toMatchObject({
    width: 200,
    height: 70,
    strokeColor: "#e03131",
    backgroundColor: "#a5d8ff",
  });
  expect(byId(scene, "pricing#label")?.["text"]).toBe("Pricing service");
});

test("p1rh-06: a place-only op moves a stored element and keeps the rest (rev 6)", () => {
  const before = rideHailing();
  // Line 151: apply --place '[{"op":"leftOf","id":"pricing","of":"matching","gap":160}]'
  const { r, scene } = step(
    before,
    { place: [{ op: "leftOf", id: "pricing", of: "matching", gap: 160 }] },
    rh,
  );
  expect(r.reply).toMatchObject({ created: [], deleted: [], updated: 1 });
  expect(byId(scene, "pricing")).toMatchObject({
    x: 1300 - 160 - 200,
    y: 400,
    width: 200,
    height: 70,
    fillStyle: "solid",
    backgroundColor: "#a5d8ff",
    strokeColor: "#1971c2",
  });
  expect(byId(scene, "pricing#label")).toMatchObject({
    text: "Pricing service",
    containerId: "pricing",
  });
  expect(byId(scene, "pricing")?.["boundElements"]).toContainEqual({
    type: "text",
    id: "pricing#label",
  });
  // Text is movable too (it used to be "unknown id"), font kept.
  const moved = step(
    before,
    { place: [{ op: "below", id: "legend-h", of: "legend-zone", gap: 10 }] },
    rh,
  ).scene;
  expect(byId(moved, "legend-h")).toMatchObject({
    y: 1090 + 210 + 10,
    fontSize: 24,
    strokeColor: "#868e96",
    text: "Legend",
  });
});
