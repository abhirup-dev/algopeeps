import { expect, test } from "bun:test";
import type {
  Box,
  LintCode,
  NeutralScene,
  Point,
  SceneElement,
} from "../src/contracts/index.ts";
import { lint } from "./lint.ts";

// Small hand-built scenes. Text boxes are ink boxes, as the sidecar measures
// them: one 16 px line draws about 12-20 px tall.
const at = (x: number, y: number, width: number, height: number): Box => ({
  x,
  y,
  width,
  height,
});
const node = (
  id: string,
  b: Box,
  extra: Partial<Extract<SceneElement, { type: "box" }>> = {},
): SceneElement => ({ type: "box", id, box: b, ...extra });
const label = (text: string, b: Box, fontSize = 16) => ({
  text: { text, box: b },
  style: { fontSize },
});
const line = (
  id: string,
  points: Point[],
  extra: Partial<Extract<SceneElement, { type: "line" }>> = {},
): SceneElement => ({ type: "line", id, points, ...extra });
const p = (x: number, y: number): Point => ({ x, y });

const run = (...elements: SceneElement[]) => lint({ elements });
const codes = (scene: NeutralScene | SceneElement[]) =>
  (Array.isArray(scene) ? run(...scene) : lint(scene)).map((h) => [
    h.code,
    ...h.ids,
  ]);
const only = (code: LintCode, ...elements: SceneElement[]) =>
  run(...elements)
    .filter((h) => h.code === code)
    .map((h) => h.ids);

// Two nodes 100 px apart and a labelled arrow between them: every rule quiet.
const a = node("a", at(0, 0, 160, 60), label("A", at(75, 22, 10, 16)));
const b = node("b", at(360, 0, 160, 60), label("B", at(435, 22, 10, 16)));
const ab = line("ab", [p(165, 30), p(355, 30)], {
  from: "a",
  to: "b",
  text: { text: "call", box: at(245, 23, 30, 13) },
  style: { fontSize: 14 },
});

test("clean scene: no hits", () => {
  expect(run(a, b, ab)).toEqual([]);
});

test("text-overflow: a label wider than its shape", () => {
  const n = node(
    "n",
    at(0, 0, 80, 60),
    label("Payment gateway", at(-20, 22, 120, 16)),
  );
  const [hit] = run(n);
  expect(hit).toMatchObject({
    code: "text-overflow",
    ids: ["n#label", "n"],
    severity: "error",
    bbox: at(-20, 22, 120, 16),
  });
  expect(hit?.hint).toContain("Increase n width/height");
});

test("text-wrapped: rendered lines, not a width guess", () => {
  // "12" drawn as "1" over "2" (the bst defect): 34 px of ink at 16 px.
  const wrapped = node("t12", at(0, 0, 44, 44), label("12", at(18, 5, 8, 34)));
  expect(only("text-wrapped", wrapped)).toEqual([["t12#label"]]);
  // Two written lines drawing on two lines is fine; a long single line too.
  const two = node("n", at(0, 0, 200, 80), label("a\nb", at(90, 20, 20, 34)));
  const long = node(
    "m",
    at(300, 0, 300, 60),
    label("Analytics warehouse", at(310, 20, 157, 21.5)),
  );
  expect(only("text-wrapped", two, long)).toEqual([]);
  // Free text wraps too; the hint names the element to widen.
  const free: SceneElement = {
    type: "text",
    id: "note",
    text: { text: "a long note", box: at(700, 0, 60, 40) },
    style: { fontSize: 16 },
  };
  expect(run(free)[0]?.hint).toContain("Widen note");
});

test("label-on-node: an arrow label on another shape, endpoints included", () => {
  const short = line("ab", [p(165, 30), p(185, 30)], {
    from: "a",
    to: "c",
    text: { text: "4 quote", box: at(150, 23, 56, 13) },
  });
  const c = node("c", at(190, 0, 160, 60));
  expect(only("label-on-node", a, c, short)).toEqual([
    ["ab#label", "a"],
    ["ab#label", "c"],
  ]);
});

test("label-on-node: free text inside a node is an annotation, across it is not", () => {
  const inside: SceneElement = {
    type: "text",
    id: "t",
    text: { text: "x", box: at(10, 5, 20, 12) },
  };
  const across: SceneElement = {
    type: "text",
    id: "u",
    text: { text: "y", box: at(150, 40, 30, 12) },
  };
  expect(only("label-on-node", a, inside, across)).toEqual([["u", "a"]]);
});

test("label-on-node: a background label under the nodes it holds", () => {
  const zone = node(
    "z",
    at(0, 0, 600, 300),
    label("Core services", at(250, 140, 100, 16)),
  );
  const n = node("n", at(240, 120, 160, 60));
  expect(only("label-on-node", zone, n)).toEqual([["z#label", "n"]]);
});

test("label-on-label: two labels overlap", () => {
  const ab2 = line("cd", [p(245, 0), p(245, 200)], {
    text: { text: "9 charge", box: at(240, 20, 40, 13) },
  });
  expect(only("label-on-label", ab, ab2)).toEqual([["ab#label", "cd#label"]]);
});

test("label-on-border: a label across a zone's edge, its mask included", () => {
  const zone = node("z", at(0, 300, 1100, 330), {
    style: { strokeDasharray: "8 8" },
  });
  const n = node("n", at(100, 400, 160, 60));
  // The "8 notify" case: ink 4 px under the border, the 5 px mask on it.
  const arc = line("a8", [p(300, 352), p(400, 312), p(500, 352)], {
    text: { text: "8 notify", box: at(372, 304, 56, 17.5) },
  });
  // A zone title well inside its corner is fine.
  const title: SceneElement = {
    type: "text",
    id: "z-l",
    text: { text: "Core", box: at(15, 311, 50, 16) },
  };
  expect(only("label-on-border", zone, n, arc, title)).toEqual([
    ["a8#label", "z"],
  ]);
});

test("arrow-through-node: through an unrelated shape, corner grazes too", () => {
  const c = node("c", at(200, 20, 100, 60));
  expect(only("arrow-through-node", a, b, c, ab)).toEqual([["ab", "c"]]);
  const corner = node("d", at(250, -25, 60, 60)); // the line clips its bottom-left corner
  const diag = line("diag", [p(165, 60), p(355, 0)], { from: "a", to: "b" });
  expect(only("arrow-through-node", a, b, corner, diag)).toEqual([
    ["diag", "d"],
  ]);
});

test("arrow-through-node: zones, endpoints and ellipse corners are not hits", () => {
  const zone = node("z", at(-50, -50, 700, 200), {
    style: { strokeDasharray: "8 8" },
  });
  // A diagonal through the bounding-box corner of an ellipse misses the ellipse.
  const e = node("e", at(200, 40, 100, 100), { shape: "ellipse" });
  const past = line("past", [p(190, 60), p(230, 30)]);
  expect(only("arrow-through-node", zone, a, b, e, ab, past)).toEqual([]);
});

test("arrow-through-label: through another arrow's label, not a text it points at", () => {
  const cut = line("cut", [p(260, -40), p(260, 80)]);
  const pointer = line("ptr", [p(700, 100), p(700, 62)]);
  const idx: SceneElement = {
    type: "text",
    id: "i8",
    text: { text: "8", box: at(695, 45, 8, 12) },
  };
  expect(only("arrow-through-label", a, b, ab, cut, pointer, idx)).toEqual([
    ["cut", "ab#label"],
  ]);
});

test("label-on-own-arrowhead: a short arrow's label reaches its head", () => {
  const short = line("a1", [p(165, 30), p(265, 30)], {
    text: { text: "1 request", box: at(185, 23, 60, 13) },
  });
  expect(only("label-on-own-arrowhead", short)).toEqual([["a1#label", "a1"]]);
  expect(only("label-on-own-arrowhead", ab)).toEqual([]);
});

test("node-overlap: partial overlap only; abutting and nesting are fine", () => {
  const c = node("c", at(150, 40, 100, 60));
  const cell0 = node("c0", at(0, 200, 60, 60));
  const cell1 = node("c1", at(60, 200, 60, 60)); // shares a border
  const legend = node("legend", at(600, 0, 200, 200));
  const inLegend = node("store", at(620, 40, 70, 40), { shape: "ellipse" });
  expect(only("node-overlap", a, c, cell0, cell1, legend, inLegend)).toEqual([
    ["a", "c"],
  ]);
});

test("dangling-endpoint: missing target, or bound but far off; unbound is free", () => {
  const gone = line("g", [p(165, 30), p(355, 30)], { from: "a", to: "ghost" });
  const short = line("s", [p(165, 30), p(315, 30)], { from: "a", to: "b" }); // stops 45 px short
  const legend = line("lg", [p(0, 200), p(70, 200)]);
  expect(only("dangling-endpoint", a, b, gone, short, legend)).toEqual([
    ["g"],
    ["s", "b"],
  ]);
  // Ends a few px off an ellipse (Excalidraw's binding gap) are attached.
  const e = node("e", at(360, 100, 260, 80), { shape: "ellipse" });
  const toE = line("toE", [p(165, 30), p(560, 106)], { from: "a", to: "e" });
  expect(only("dangling-endpoint", a, e, toE)).toEqual([]);
});

test("outside-zone: native zones, both directions; leaves across a container", () => {
  const zone: SceneElement = { type: "zone", id: "z", box: at(0, 0, 400, 300) };
  const out = node("out", at(350, 250, 100, 100), { zone: "z" });
  const stray = node("stray", at(20, 20, 100, 60));
  const member = node("m", at(150, 20, 100, 60), { zone: "z" });
  expect(only("outside-zone", zone, out, stray, member)).toEqual([
    ["out", "z"],
    ["stray", "z"],
  ]);
  // A zone-like rectangle (it holds a node) with a node across its edge.
  const rect = node("r", at(0, 0, 400, 300));
  const held = node("h", at(20, 20, 100, 60));
  const across = node("x", at(350, 100, 100, 60));
  expect(only("outside-zone", rect, held, across)).toEqual([["x", "r"]]);
  expect(only("node-overlap", rect, held, across)).toEqual([]);
  // p1rh-01: an arrow clipped to a zone it only half belongs to names the
  // end that is outside, not "take it out of children".
  const far = node("far", at(500, 20, 100, 60));
  const cross = line("c", [p(250, 50), p(495, 50)], {
    from: "m",
    to: "far",
    zone: "z",
  });
  const [h] = run(zone, member, far, cross).filter(
    (x) => x.code === "outside-zone",
  );
  expect(h?.ids).toEqual(["c", "z"]);
  expect(h?.hint).toContain("its end far is outside z");
});

test("crossing: info; collinear runs count, shared ends do not", () => {
  const h = line("h", [p(0, 100), p(200, 100)]);
  const v = line("v", [p(100, 0), p(100, 200)]);
  const [x] = run(h, v);
  expect(x).toMatchObject({
    code: "crossing",
    ids: ["h", "v"],
    severity: "info",
  });
  // Two edges out of one node point: touching, not crossing.
  const e1 = line("e1", [p(300, 0), p(250, 100)]);
  const e2 = line("e2", [p(300, 0), p(350, 100)]);
  // Leaving from one point and sharing 17 px of run (yct-11) is a crossing.
  const s1 = line("s1", [p(500, 0), p(500, 17), p(600, 17)]);
  const s2 = line("s2", [p(500, 0), p(500, 100)]);
  expect(codes([e1, e2, s1, s2])).toEqual([["crossing", "s1", "s2"]]);
});

test("allow suppresses one rule on one element; the hit is still returned", () => {
  const h = line("h", [p(0, 100), p(200, 100)], {
    meta: { allow: [{ rule: "crossing", why: "async fan-out" }] },
  });
  const v = line("v", [p(100, 0), p(100, 200)]);
  const w = line("w", [p(150, 0), p(150, 200)], {
    meta: { allow: [{ rule: "node-overlap", why: "wrong rule" }] },
  });
  const hits = run(h, v, w);
  expect(hits.map((x) => [x.ids.join(","), x.suppressed])).toEqual([
    ["h,v", "async fan-out"],
    ["h,w", "async fan-out"],
  ]);
  // A label hit is suppressed by its owner's allow.
  const n = node("n", at(0, 0, 80, 60), {
    ...label("Payment gateway", at(-20, 22, 120, 16)),
    meta: { allow: [{ rule: "text-overflow", why: "clipped on purpose" }] },
  });
  expect(run(n)[0]?.suppressed).toBe("clipped on purpose");
});

test("arrow-through-label: a line within 0.75 fontSize of an arrow label", () => {
  // ab's label (14 px) ink ends at y 36: 8 px below is on it, 12 px is clear.
  const near = line("near", [p(200, 44), p(320, 44)]);
  const far = line("far", [p(200, 48), p(320, 48)]);
  expect(only("arrow-through-label", a, b, ab, near, far)).toEqual([
    ["near", "ab#label"],
  ]);
});

test("arrow-through-node: an unbound end deep inside a shape crosses its border", () => {
  // A legend box reset to 100x100: the swatch arrow starts 50 px inside.
  const box = node("lz", at(0, 200, 100, 100));
  const deep = line("deep", [p(50, 250), p(130, 250)]);
  const edge = line("edge", [p(101, 280), p(180, 280)]);
  expect(only("arrow-through-node", box, deep, edge)).toEqual([["deep", "lz"]]);
});

test("unlabelled-node: arrows bind to a shape with no label", () => {
  const blank = node("blank", at(360, 200, 100, 100));
  const swatch = node("swatch", at(0, 200, 60, 30));
  const noted = node("noted", at(600, 200, 100, 100));
  const note: SceneElement = {
    type: "text",
    id: "note",
    text: { text: "N", box: at(645, 240, 10, 16) },
  };
  const toBlank = line("x", [p(80, 30), p(410, 195)], {
    from: "a",
    to: "blank",
  });
  const toNoted = line("y", [p(80, 30), p(650, 195)], {
    from: "a",
    to: "noted",
  });
  expect(
    only("unlabelled-node", a, blank, swatch, noted, note, toBlank, toNoted),
  ).toEqual([["blank"]]);
});

test("arrowhead-overlap: two heads into one shape under a head length apart", () => {
  const into = (id: string, x: number) =>
    line(id, [p(x, -200), p(x, -5)], { to: "a" });
  expect(
    only(
      "arrowhead-overlap",
      a,
      into("h1", 60),
      into("h2", 78),
      into("h3", 120),
    ),
  ).toEqual([["h1", "h2", "a"]]);
});
