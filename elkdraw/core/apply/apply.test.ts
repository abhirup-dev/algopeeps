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
