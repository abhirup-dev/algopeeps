// Phase 1 tool bodies (apply, add, validate, lint, look, diff, changes) over
// the pure engines in @elkdraw/core/engine, the store and the sidecar.
// adapters/mcp is core-only, so the bodies live here and plug in as handlers.
//
// Rendered geometry needs the sidecar (async), while core's apply is pure and
// sync: apply runs twice, once to learn what to convert, once with the
// converted elements; lint runs after the write, on measured boxes.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type Box,
  type Element,
  type LintHit,
  type NeutralScene,
  place,
  type SceneElement,
  type SkeletonElement,
  skeletonErrors,
} from "@elkdraw/core";
import {
  add,
  apply,
  ApplyInput,
  type ApplyDeps,
  type ApplyResult,
  clampScale,
  diff,
  feed,
  lint,
  look,
  type LookResult,
  pad,
  type Scene,
  targetBox,
} from "@elkdraw/core/engine";
import { type ExcalidrawScene, readScene } from "@elkdraw/backend-excalidraw";
import {
  type Handlers,
  type ToolInput,
  type ToolName,
  ToolError,
} from "@elkdraw/mcp";
import type { ToolContext } from "./server.ts";

const invalid = (tool: ToolName, errors: readonly string[]) =>
  new ToolError({ code: "INVALID_INPUT", message: errors.join("\n"), tool });

/** Wire elements as the Excalidraw backend's input (it re-reads each field). */
const asScene = (elements: readonly Element[]): ExcalidrawScene => ({
  elements: elements as unknown as ExcalidrawScene["elements"],
});

/** One job at a time: the sidecar page holds one scene (measure then snap),
 * and apply must see the store unchanged between its two passes.
 * ponytail: one global queue; per-resource locks if tools get slow. */
function queue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** `box` is fully contained inside `region`. */
const within = (box: Box, region: Box) =>
  box.x >= region.x &&
  box.y >= region.y &&
  box.x + box.width <= region.x + region.width &&
  box.y + box.height <= region.y + region.height;

/** `x#label` belongs to `x`. */
const ownerOf = (id: string) => id.replace(/#label$/, "");

const SCOPE = /^(?:frame:(.+)|near:(.+),r=(\d+(?:\.\d+)?))$/;

/** `lint`'s and `describe`'s shared `scope` grammar: `all`, `frame:<id>` or
 * `near:<id>,r=<px>`, resolved against whatever boxes the caller has (rendered
 * for lint, stored for describe). Returns a predicate, or undefined for "all". */
function scopeMatch(
  tool: ToolName,
  scope: string | undefined,
  boxOf: (id: string) => Box | undefined,
): ((box: Box) => boolean) | undefined {
  if (!scope || scope === "all") return undefined;
  const m = SCOPE.exec(scope);
  const id = m?.[1] ?? m?.[2];
  const box = id === undefined ? undefined : boxOf(id);
  if (!box)
    throw invalid(tool, [
      `scope: "${scope}" is not all, frame:<id> or near:<id>,r=<px> with an existing id`,
    ]);
  const region = pad(box, Number(m?.[3] ?? 0));
  return (b: Box) => intersects(b, region);
}

/** A `SceneElement`'s own box: stored, not rendered (`describe`, `query`). */
function elementBox(e: SceneElement): Box {
  switch (e.type) {
    case "box":
    case "zone":
      return e.box;
    case "text":
      return e.text.box;
    case "line": {
      const xs = e.points.map((p) => p.x);
      const ys = e.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }
  }
}

const fmtBox = (b: Box) =>
  `(${String(Math.round(b.x))},${String(Math.round(b.y))},${String(Math.round(b.width))},${String(Math.round(b.height))})`;

/** One line per element: id, kind, label, rounded box; arrows read
 * `id: from -> to "label"`. Pure over `NeutralScene` (no I/O), so it is unit
 * tested directly against the yct fixture. */
export function describeText(scene: NeutralScene): string {
  const label = (e: SceneElement) =>
    e.text ? ` ${JSON.stringify(e.text.text)}` : "";
  const lineOf = (e: SceneElement): string => {
    if (e.type === "line" && e.from && e.to)
      return `${e.id}: ${e.from} -> ${e.to}${label(e)}`;
    if (e.type === "line")
      return `${e.id}: line${label(e)} ${fmtBox(elementBox(e))}`;
    if (e.type === "text") return `${e.id}: text${label(e)}`;
    if (e.type === "zone") return `${e.id}: zone${label(e)} ${fmtBox(e.box)}`;
    return `${e.id}: ${e.shape ?? "box"}${label(e)} ${fmtBox(e.box)}`;
  };
  const zones = scene.elements.filter((e) => e.type === "zone");
  const byZone = new Map<string, SceneElement[]>();
  const loose: SceneElement[] = [];
  for (const e of scene.elements) {
    if (e.type === "zone") continue;
    if (e.zone === undefined) {
      loose.push(e);
      continue;
    }
    const bucket = byZone.get(e.zone) ?? [];
    bucket.push(e);
    byZone.set(e.zone, bucket);
  }
  const lines: string[] = loose.map(lineOf);
  for (const z of zones) {
    lines.push(lineOf(z));
    for (const e of byZone.get(z.id) ?? []) lines.push(`  ${lineOf(e)}`);
  }
  return lines.join("\n");
}

/** How many times apply retries when a human edit lands mid-conversion. */
const APPLY_ATTEMPTS = 3;

export function phase1Handlers(ctx: ToolContext): Partial<Handlers> {
  const serial = queue();
  /** Rev the `changes` feed last reported up to (the agent's cursor). */
  let cursor = 0;

  const measured = async (elements: readonly Element[]) => {
    const boxes = await (await ctx.renderer()).measure(elements);
    return {
      boxes,
      scene: await readScene(asScene(elements), () => Promise.resolve(boxes)),
    };
  };
  const lintOf = async (elements: readonly Element[]): Promise<LintHit[]> =>
    lint((await measured(elements)).scene);

  const placer =
    (tool: ToolName): NonNullable<ApplyDeps["place"]> =>
    (elements, ops, scene) => {
      try {
        return place(elements, ops, scene);
      } catch (error) {
        throw invalid(tool, [
          error instanceof Error ? error.message : String(error),
        ]);
      }
    };

  async function write(tool: "apply" | "add", input: unknown) {
    const renderer = await ctx.renderer();
    const run = tool === "add" ? add : apply;
    for (let attempt = 1; ; attempt++) {
      const scene: Scene = ctx.scene();
      let next: readonly Element[] = [];
      const base = {
        place: placer(tool),
        // The seam is sync; capture the next scene and lint it measured below.
        lint: (elements: readonly Element[]) => {
          next = elements;
          return [];
        },
      };
      let asked: Parameters<ApplyDeps["convert"]> | undefined;
      let result: ApplyResult = run(scene, input, {
        ...base,
        convert: (...args) => {
          asked = args;
          return { elements: [], measured: true };
        },
      });
      // Pass 1 errors are final only if they came before conversion.
      if (asked) {
        const converted = await renderer.convert(...asked);
        if (ctx.scene().rev !== scene.rev) {
          if (attempt < APPLY_ATTEMPTS) continue;
          throw new Error(`${tool}: the canvas kept changing; try again`);
        }
        result = run(scene, input, {
          ...base,
          convert: () => ({ elements: converted, measured: true }),
        });
      }
      if (!result.ok) throw invalid(tool, result.errors);
      const { reply, upserts, deletes } = result;
      if (upserts.length || deletes.length)
        reply.rev = ctx.apply("agent", upserts, deletes);
      reply.lints = await lintOf(next);
      return reply;
    }
  }

  function validate(input: ToolInput<"validate">) {
    const parsed = ApplyInput.safeParse(input);
    if (!parsed.success)
      throw invalid("validate", skeletonErrors(parsed.error));
    const { elements = [], place: ops = [], patches = [] } = parsed.data;
    const scene = ctx.scene().elements.filter((e) => e["isDeleted"] !== true);
    const placed: SkeletonElement[] = ops.length
      ? placer("validate")(elements, ops, scene)
      : elements;
    const known = new Set([...scene, ...placed].map((e) => e.id));
    const errors: string[] = [];
    const need = (id: string, where: string) => {
      if (!known.has(id)) errors.push(`${where}: no element "${id}"`);
    };
    for (const e of placed) {
      if (e.type === "arrow" || e.type === "line") {
        if (e.start) need(e.start.id, `${e.id}.start.id`);
        if (e.end) need(e.end.id, `${e.id}.end.id`);
      }
      if (e.type === "frame")
        e.children.forEach((c, i) => {
          need(c, `${e.id}.children[${String(i)}]`);
        });
    }
    patches.forEach((p, i) => {
      need(p.id, `patches[${String(i)}].id`);
    });
    if (errors.length) throw invalid("validate", errors);
    return { ok: true as const, ids: placed.map((e) => e.id) };
  }

  async function lintTool({ scope, ids }: ToolInput<"lint">) {
    const { rev, elements } = ctx.scene();
    const { boxes, scene } = await measured(elements);
    let hits = lint(scene);
    if (ids) {
      const want = new Set(ids);
      hits = hits.filter((h) =>
        h.ids.some((id) => want.has(id) || want.has(ownerOf(id))),
      );
    }
    const match = scopeMatch("lint", scope, (id) => boxes[id]);
    if (match) hits = hits.filter((h) => match(h.bbox));
    return { rev, hits };
  }

  async function lookTool(input: ToolInput<"look">) {
    const { rev, elements } = ctx.scene();
    const renderer = await ctx.renderer();
    const boxes = await renderer.measure(elements);
    const nums = input.target.split(",").map(Number);
    let crop: LookResult;
    let targetBoxes: Record<string, Box> = {};
    if (nums.length === 4 && nums.every(Number.isFinite)) {
      const [x = 0, y = 0, width = 0, height = 0] = nums;
      const bbox = pad({ x, y, width, height }, input.r ?? 0);
      crop = { bbox, scale: clampScale(bbox, input.maxPx), marks: {} };
    } else {
      const ids = input.target.startsWith("frame:")
        ? [input.target.slice("frame:".length)]
        : input.target.split(",");
      const missing = ids.filter((id) => !boxes[id]);
      if (missing.length)
        throw invalid(
          "look",
          missing.map((id) => `target: no element "${id}" on the canvas`),
        );
      crop = look(boxes, ids, {
        r: input.r ?? 0,
        ...(input.maxPx === undefined ? {} : { maxPx: input.maxPx }),
        marks: input.marks ?? false,
      });
      targetBoxes = Object.fromEntries(
        ids.flatMap((id) => {
          const b = boxes[id];
          return b ? [[id, b]] : [];
        }),
      );
    }
    const png = await renderer.snap(crop.bbox, crop.scale);
    const path =
      input.out ??
      join(
        tmpdir(),
        "elkdraw",
        `${ctx.status().session}-look-r${String(rev)}-${String(Date.now())}.png`,
      );
    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, png);
    return { path, ...crop, boxes: targetBoxes };
  }

  /** `sceneAt` that turns a bad rev into INVALID_INPUT. */
  const storedAt = (tool: ToolName, rev: number): Element[] => {
    try {
      return ctx.sceneAt(rev);
    } catch (error) {
      if (error instanceof RangeError) throw invalid(tool, [error.message]);
      throw error;
    }
  };

  async function changesTool({ since }: ToolInput<"changes">) {
    const from = since ?? cursor;
    // Moves and relabels need no rendering: stored boxes are enough.
    const sceneAt = (rev: number): Promise<NeutralScene> =>
      readScene(asScene(storedAt("changes", rev)));
    storedAt("changes", from);
    const rev = ctx.scene().rev;
    const lines = await feed(from, ctx.log(from), sceneAt);
    cursor = rev;
    return { rev, lines };
  }

  async function diffTool(input: ToolInput<"diff">) {
    const lastAgent = ctx
      .log(0)
      .filter((l) => l.author === "agent")
      .at(-1);
    const from = input.from ?? Math.max(0, (lastAgent?.rev ?? 1) - 1);
    const to = input.to ?? ctx.scene().rev;
    const a = (await measured(storedAt("diff", from))).scene;
    const b = (await measured(storedAt("diff", to))).scene;
    return diff(a, b);
  }

  /** Stored (unmeasured) scene, for the read-only tools that never need the
   * sidecar: `get`, `describe`, `query`. */
  const storedScene = async (): Promise<{
    rev: number;
    scene: NeutralScene;
  }> => {
    const { rev, elements } = ctx.scene();
    return { rev, scene: await readScene(asScene(elements)) };
  };

  async function getTool({ id }: ToolInput<"get">) {
    const { rev, scene } = await storedScene();
    const element = scene.elements.find((e) => e.id === id);
    if (!element)
      throw invalid("get", [`id: no element "${id}" on the canvas`]);
    return { rev, element };
  }

  async function describeTool({ scope }: ToolInput<"describe">) {
    const { rev, scene } = await storedScene();
    const byId = new Map(scene.elements.map((e) => [e.id, e]));
    const match = scopeMatch("describe", scope, (id) => {
      const e = byId.get(id);
      return e && elementBox(e);
    });
    const elements = match
      ? scene.elements.filter((e) => match(elementBox(e)))
      : scene.elements;
    return { rev, text: describeText({ elements }) };
  }

  async function queryTool({ type, ids, bbox, limit }: ToolInput<"query">) {
    const { rev, scene } = await storedScene();
    let elements = scene.elements;
    if (type)
      elements = elements.filter(
        (e) => e.type === type || (e.type === "box" && e.shape === type),
      );
    if (ids) {
      const want = new Set(ids);
      elements = elements.filter((e) => want.has(e.id));
    }
    if (bbox) elements = elements.filter((e) => within(elementBox(e), bbox));
    const truncated = limit !== undefined && elements.length > limit;
    if (limit !== undefined) elements = elements.slice(0, limit);
    return { rev, elements, truncated };
  }

  async function screenshotTool(input: ToolInput<"screenshot">) {
    if (input.format === "svg")
      throw invalid("screenshot", [
        "format: svg is not supported yet; use png (the sidecar only rasters)",
      ]);
    const { rev, elements } = ctx.scene();
    const renderer = await ctx.renderer();
    const boxes = await renderer.measure(elements);
    const ids = elements.map((e) => e.id).filter((id) => boxes[id]);
    if (ids.length === 0) throw invalid("screenshot", ["the canvas is empty"]);
    const bbox = targetBox(boxes, ids);
    const scale = clampScale(bbox, input.maxPx);
    const png = await renderer.snap(bbox, scale);
    const path =
      input.out ??
      join(
        tmpdir(),
        "elkdraw",
        `${ctx.status().session}-screenshot-r${String(rev)}-${String(Date.now())}.png`,
      );
    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, png);
    return {
      path,
      format: "png" as const,
      width: Math.round(bbox.width * scale),
      height: Math.round(bbox.height * scale),
    };
  }

  function clearTool(_input: ToolInput<"clear">) {
    const { elements } = ctx.scene();
    const ids = elements.map((e) => e.id);
    const rev = ids.length ? ctx.apply("agent", [], ids) : ctx.scene().rev;
    return { rev, deleted: ids.length };
  }

  /** Named snapshots, by rev: not on-disk (the store's file format stays
   * untouched), so they do not survive a server restart.
   * ponytail: in-memory only; a snapshots.json file if that matters later. */
  const snapshots = new Map<string, { rev: number; time: string }>();

  function snapshotTool({ action, name }: ToolInput<"snapshot">) {
    if (action === "save") {
      snapshots.set(name ?? "", {
        rev: ctx.scene().rev,
        time: new Date().toISOString(),
      });
    } else if (action === "restore") {
      const snap = name === undefined ? undefined : snapshots.get(name);
      if (!snap)
        throw invalid("snapshot", [`name: no snapshot "${String(name)}"`]);
      const before = new Map(ctx.scene().elements.map((e) => [e.id, e]));
      const target = storedAt("snapshot", snap.rev);
      const targetIds = new Set(target.map((e) => e.id));
      const upserts: Element[] = [];
      for (const el of target) {
        const cur = before.get(el.id);
        if (cur?.version === el.version) continue;
        upserts.push({
          ...el,
          version: Math.max(cur?.version ?? -1, el.version) + 1,
        });
      }
      const deletes = [...before.keys()].filter((id) => !targetIds.has(id));
      if (upserts.length || deletes.length)
        ctx.apply("agent", upserts, deletes);
    }
    return {
      rev: ctx.scene().rev,
      snapshots: [...snapshots.entries()].map(([n, s]) => ({
        name: n,
        rev: s.rev,
        time: s.time,
      })),
    };
  }

  return {
    apply: (input) => serial(() => write("apply", input)),
    add: (input) => serial(() => write("add", input)),
    validate: (input) => serial(() => Promise.resolve(validate(input))),
    lint: (input) => serial(() => lintTool(input)),
    look: (input) => serial(() => lookTool(input)),
    changes: (input) => serial(() => changesTool(input)),
    diff: (input) => serial(() => diffTool(input)),
    get: (input) => serial(() => getTool(input)),
    describe: (input) => serial(() => describeTool(input)),
    query: (input) => serial(() => queryTool(input)),
    screenshot: (input) => serial(() => screenshotTool(input)),
    snapshot: (input) => serial(() => Promise.resolve(snapshotTool(input))),
    clear: (input) => serial(() => Promise.resolve(clearTool(input))),
  };
}
