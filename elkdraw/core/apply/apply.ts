// `apply` and `add` for skeleton input (design §3.3): upsert by id onto the
// current scene, pure and synchronous, so the server can check `ifRev` and
// write with no await between. Returns the delta for Store.apply, the next
// scene and the terse reply; elements are never echoed. An existing id is
// patched, not replaced: fields the input leaves out keep their stored value.
//
// Agent elements carry `customData.origin = "generated"`; everything else is
// human and is never pruned. Bound label text gets the derived id
// `<container>#label`, so a re-apply matches it instead of adding a new one.
import stringify from "safe-stable-stringify";
import { z } from "zod";
import {
  type ApplyReply,
  DeletePatch,
  type Element,
  type LintHit,
  SetPatch,
} from "../src/contracts/index.ts";
import { mergeStored, PlaceOp } from "../place/index.ts";
import {
  SkeletonElement,
  skeletonErrors,
  validateSkeleton,
} from "../skeleton/schema.ts";

// Re-exported so `@elkdraw/core/engine` (core/src/engine/index.ts) keeps
// PlaceOp at its existing seam; the schema and runner live in core/place.
export { PlaceOp };

/** P1 patches: `delete` (bound arrows and labels go too) and `set` label. */
export const ApplyPatch = z.discriminatedUnion("op", [
  DeletePatch,
  SetPatch.pick({ op: true, id: true }).extend({ label: z.string().min(1) }),
]);
export type ApplyPatch = z.infer<typeof ApplyPatch>;

export const ApplyInput = z
  .strictObject({
    elements: z.array(SkeletonElement).exactOptional(),
    place: z.array(PlaceOp).exactOptional(),
    patches: z.array(ApplyPatch).exactOptional(),
    /** Delete generated elements the input no longer lists. */
    prune: z.boolean().exactOptional(),
    dryRun: z.boolean().exactOptional(),
    /** Fail unless the canvas is at this rev. */
    ifRev: z.int().nonnegative().exactOptional(),
  })
  .refine(
    (i) => [i.elements, i.patches, i.place].some((a) => a?.length),
    "one of elements, place, patches is required",
  );
export type ApplyInput = z.infer<typeof ApplyInput>;

export interface Scene {
  rev: number;
  elements: readonly Element[];
}

export interface ApplyDeps {
  /** Skeleton -> Excalidraw wire elements (convertToExcalidrawElements, which
   * needs a DOM and canvas, so core cannot run it). `scene` is there so arrows
   * can bind to elements outside the batch. */
  convert(
    elements: SkeletonElement[],
    scene: readonly Element[],
  ): { elements: Element[]; measured: boolean };
  /** Placement ops (task 1.9). Absent: a non-empty `place` is an error. */
  place?(
    elements: SkeletonElement[],
    ops: readonly PlaceOp[],
    scene: readonly Element[],
  ): SkeletonElement[];
  /** Rendered lint (task 1.5). Absent: no hits. */
  lint?(elements: readonly Element[]): LintHit[];
}

export type ApplyResult =
  | {
      ok: true;
      reply: ApplyReply;
      /** For Store.apply. Empty on dryRun. */
      upserts: Element[];
      deletes: string[];
      /** The scene after the delta (the current scene on dryRun). */
      elements: Element[];
    }
  | { ok: false; errors: string[] };

/** The `apply` tool. Never throws on bad input. */
export function apply(
  scene: Scene,
  input: unknown,
  deps: ApplyDeps,
): ApplyResult {
  const parsed = ApplyInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, errors: skeletonErrors(parsed.error) };
  return run(scene, parsed.data, deps, false);
}

/** The `add` tool: create only; an existing id is an error. */
export function add(
  scene: Scene,
  input: unknown,
  deps: ApplyDeps,
): ApplyResult {
  const parsed = validateSkeleton(input);
  if (!parsed.ok) return parsed;
  return run(scene, parsed.value, deps, true);
}

const nested = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)[key]
    : undefined;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const container = (e: Element) => str(e["containerId"]);
/** The input element a wire element belongs to: its container, or itself. */
const owner = (e: Element) => container(e) ?? e.id;
const generated = (e: Element) =>
  nested(e["customData"], "origin") === "generated";
const bound = (e: Element): { id: string }[] =>
  Array.isArray(e["boundElements"])
    ? e["boundElements"].filter(
        (b): b is { id: string } => typeof nested(b, "id") === "string",
      )
    : [];
const bindsTo = (e: Element, id: string) =>
  nested(e["startBinding"], "elementId") === id ||
  nested(e["endBinding"], "elementId") === id;

/** Equal apart from store- and renderer-owned fields. */
const same = (a: Element, b: Element) => {
  const norm = (e: Element) =>
    stringify({
      ...e,
      version: 0,
      versionNonce: 0,
      seed: 0,
      updated: 0,
      index: 0,
      boundElements: bound(e)
        .map((x) => stringify(x))
        .sort(),
    });
  return norm(a) === norm(b);
};

/** `allow` compiles into customData, and the origin mark is forced. */
function compile(s: SkeletonElement): SkeletonElement {
  const out = {
    ...s,
    customData: {
      ...s.customData,
      ...(s.allow ? { allow: s.allow } : {}),
      origin: "generated",
    },
  };
  delete out.allow;
  return out;
}

/** Give bound text the derived id `<container>#label`; converters pick random ones. */
function deriveLabelIds(elements: Element[], inputIds: Set<string>): Element[] {
  const renamed = new Map<string, string>();
  for (const e of elements) {
    const c = container(e);
    if (c !== undefined && !inputIds.has(e.id)) renamed.set(e.id, `${c}#label`);
  }
  if (renamed.size === 0) return elements;
  return elements.map((e) => {
    const id = renamed.get(e.id);
    const out: Element = id
      ? {
          ...e,
          id,
          customData: { ...(e["customData"] ?? {}), origin: "generated" },
        }
      : { ...e };
    if (Array.isArray(e["boundElements"]))
      out["boundElements"] = bound(e).map((b) => ({
        ...b,
        id: renamed.get(b.id) ?? b.id,
      }));
    return out;
  });
}

function run(
  scene: Scene,
  input: ApplyInput,
  deps: ApplyDeps,
  createOnly: boolean,
): ApplyResult {
  const fail = (...errors: string[]): ApplyResult => ({ ok: false, errors });
  if (input.ifRev !== undefined && input.ifRev !== scene.rev)
    return fail(
      `ifRev: the canvas is at rev ${String(scene.rev)}, not ${String(input.ifRev)}`,
    );

  const live = new Map<string, Element>();
  const stored = new Map<string, Element>();
  for (const e of scene.elements) {
    stored.set(e.id, e);
    if (e["isDeleted"] !== true) live.set(e.id, e);
  }

  const errors: string[] = [];
  const given = input.elements ?? [];
  const seen = new Set<string>();
  given.forEach((s, i) => {
    if (seen.has(s.id))
      errors.push(`elements[${String(i)}].id: duplicate id "${s.id}"`);
    if (createOnly && live.has(s.id))
      errors.push(
        `elements[${String(i)}].id: "${s.id}" already exists; use apply to update it`,
      );
    seen.add(s.id);
  });
  if (errors.length) return fail(...errors);

  // An upsert of an existing id patches it: given fields over the stored
  // ones, so size, style, label and customData survive a partial resend.
  let skeletons = given.map((s) => {
    const prev = live.get(s.id);
    return prev ? mergeStored(s, prev, scene.elements) : s;
  });
  if (input.place?.length) {
    if (!deps.place)
      return fail("place: placement ops are not available yet (task 1.9)");
    skeletons = deps.place(skeletons, input.place, scene.elements);
  }
  const inputIds = new Set(skeletons.map((s) => s.id));
  const converted = skeletons.length
    ? deps.convert(skeletons.map(compile), scene.elements)
    : { elements: [], measured: true };
  const produced = deriveLabelIds(converted.elements, inputIds);
  const producedIds = new Set(produced.map((e) => e.id));

  // Working state: `work` is the next scene; upserts/deleted are the delta.
  const work = new Map(live);
  const upserts = new Map<string, Element>();
  const deleted = new Set<string>();
  const put = (e: Element) => {
    work.set(e.id, e);
    upserts.set(e.id, e);
  };
  const drop = (id: string) => {
    if (!work.delete(id)) return;
    upserts.delete(id);
    if (live.has(id)) deleted.add(id);
  };
  const dropWithLabels = (id: string) => {
    drop(id);
    for (const e of [...work.values()]) if (container(e) === id) drop(e.id);
  };

  for (const e of produced) {
    const prev = live.get(e.id);
    if (!prev) {
      const old = stored.get(e.id)?.version;
      put(old === undefined ? e : { ...e, version: old + 1 });
      continue;
    }
    // Keep bindings the input does not own (e.g. a human arrow on this box),
    // the rough-stroke seed and the z-order.
    const extra = bound(prev).filter((b) => !producedIds.has(b.id));
    put({
      ...e,
      ...(extra.length ? { boundElements: [...bound(e), ...extra] } : {}),
      seed: prev["seed"],
      index: prev["index"],
      version: prev.version + 1,
    });
  }

  // A stored label whose container was re-sent without it is gone.
  for (const e of live.values()) {
    const c = container(e);
    if (c !== undefined && inputIds.has(c) && !producedIds.has(e.id))
      drop(e.id);
  }
  // Prune needs a file to compare with: patches alone never prune.
  if (input.prune && skeletons.length)
    for (const e of live.values())
      if (generated(e) && !producedIds.has(e.id)) drop(e.id);

  (input.patches ?? []).forEach((p, i) => {
    const at = `patches[${String(i)}].id`;
    if (!work.has(p.id)) {
      errors.push(`${at}: no element "${p.id}"`);
      return;
    }
    if (p.op === "delete") {
      dropWithLabels(p.id);
      for (const e of [...work.values()])
        if (bindsTo(e, p.id)) dropWithLabels(e.id);
      return;
    }
    const self = work.get(p.id);
    const text =
      self?.type === "text"
        ? self
        : [...work.values()].find((e) => container(e) === p.id);
    if (!text) {
      errors.push(`${at}: "${p.id}" has no label; send it in elements`);
      return;
    }
    // ponytail: width/height are not re-measured; the canvas refits bound
    // text on load. Measure through deps if free text looks clipped.
    if (text["text"] !== p.label)
      put({
        ...text,
        text: p.label,
        originalText: p.label,
        version: (live.get(text.id)?.version ?? text.version - 1) + 1,
      });
  });
  if (errors.length) return fail(...errors);

  // Drop bindings to deleted elements, then anything that ended up unchanged.
  for (const e of [...upserts.values()]) {
    const refs = bound(e);
    const kept = refs.filter((b) => work.has(b.id) || upserts.has(b.id));
    const next = kept.length < refs.length ? { ...e, boundElements: kept } : e;
    const prev = live.get(e.id);
    if (prev && same(prev, next)) upserts.delete(e.id);
    else put(next);
  }

  const created = [...inputIds].filter((id) => !live.has(id) && work.has(id));
  const touched = new Set(
    [...upserts.values()].filter((e) => live.has(owner(e))).map(owner),
  );
  const changed = upserts.size > 0 || deleted.size > 0;
  const next = [
    ...scene.elements.flatMap((e) =>
      deleted.has(e.id) ? [] : [upserts.get(e.id) ?? e],
    ),
    ...[...upserts.values()].filter((e) => !stored.has(e.id)),
  ];
  const reply: ApplyReply = {
    rev: changed && !input.dryRun ? scene.rev + 1 : scene.rev,
    created,
    updated: touched.size,
    kept: [...inputIds].filter((id) => live.has(id) && !touched.has(id)).length,
    // Labels go with their element; list the element only.
    deleted: [...deleted].filter((id) => {
      const e = live.get(id);
      return e === undefined || container(e) === undefined;
    }),
    overrides: [],
    conflicts: [],
    moved: [],
    lints: deps.lint?.(next) ?? [],
    measured: converted.measured,
  };
  if (input.dryRun)
    return {
      ok: true,
      reply,
      upserts: [],
      deletes: [],
      elements: [...scene.elements],
    };
  return {
    ok: true,
    reply,
    upserts: [...upserts.values()],
    deletes: [...deleted],
    elements: next,
  };
}
