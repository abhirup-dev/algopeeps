// Rendered lint (design §5, §19.1 B1): fourteen rules over a NeutralScene whose
// text boxes are where the text drew (the sidecar's ink boxes, via readScene's
// `measure`). Pure and synchronous: no sidecar, no Excalidraw here.
//
// Boxes split into containers (a zone, or a box that fully contains another
// box: dashed zone rectangles, a legend) and leaves (nodes). Labels on leaves
// are `label-on-node`; labels across a container's edge are `label-on-border`;
// arrows run freely through containers.
//
// Bound text has no id in NeutralScene, so a label is named `<owner>#label`
// (apply's derived id for bound text). Allows are read from the owner's
// `meta.allow` (customData.allow); matched hits get `suppressed`, not dropped.
import { z } from "zod";
import {
  Allow,
  type Box,
  type LintCode,
  type LintHit,
  type NeutralScene,
  type Point,
  type SceneElement,
} from "../src/contracts/index.ts";

/** Overlaps thinner than this are touching (shared borders, AA fringe). */
const TOL = 2;
/** Excalidraw's default line height; NeutralScene does not carry it. */
const LINE_HEIGHT = 1.25;
/** A bound end farther than this from its shape's outline is not attached
 * (Excalidraw leaves ~5-10 px between a bound end and the shape). */
const BIND_GAP = 15;
/** Excalidraw's arrowhead length: 25 px, at most half the last segment. */
const HEAD = 25;
/** Excalidraw masks an arrow under its label's box grown by this. */
const MASK = 5;
/** Collinear overlap longer than this is a crossing; touching ends are not. */
const END = 4;
/** A foreign line this close to an arrow label (x its fontSize) reads as the
 * label's line (1.19: 12.5 px at 20 px flagged, 19.9 px clean). */
const NEAR = 0.75;

type Shape = "rect" | "ellipse" | "diamond";
interface Solid {
  id: string;
  box: Box;
  shape: Shape;
  zone: boolean;
  el: SceneElement;
}
interface Label {
  /** `<owner>#label` for bound text, the element id for free text. */
  id: string;
  owner: SceneElement;
  bound: boolean;
  box: Box;
  text: string;
  fontSize: number | undefined;
}
type Line = Extract<SceneElement, { type: "line" }>;

export const labelId = (owner: string) => `${owner}#label`;
const ownerId = (id: string) => id.replace(/#label$/, "");

const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;
const round = (n: number) => Math.round(n * 10) / 10;
const box = (x0: number, y0: number, x1: number, y1: number): Box => ({
  x: round(x0),
  y: round(y0),
  width: round(Math.max(0, x1 - x0)),
  height: round(Math.max(0, y1 - y0)),
});
const around = (p: Point, r = END): Box =>
  box(p.x - r, p.y - r, p.x + r, p.y + r);

/** The overlap of a and b if it is thicker than TOL both ways. */
function overlap(a: Box, b: Box): Box | undefined {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(right(a), right(b));
  const y1 = Math.min(bottom(a), bottom(b));
  return x1 - x0 > TOL && y1 - y0 > TOL ? box(x0, y0, x1, y1) : undefined;
}
const within = (a: Box, b: Box, tol = TOL) =>
  a.x >= b.x - tol &&
  a.y >= b.y - tol &&
  right(a) <= right(b) + tol &&
  bottom(a) <= bottom(b) + tol;
const bounds = (ps: readonly Point[]): Box =>
  box(
    Math.min(...ps.map((p) => p.x)),
    Math.min(...ps.map((p) => p.y)),
    Math.max(...ps.map((p) => p.x)),
    Math.max(...ps.map((p) => p.y)),
  );
const area = (b: Box) => b.width * b.height;

function shapeOf(shape: string | undefined): Shape {
  if (shape === "ellipse" || shape === "circle") return "ellipse";
  if (shape === "diamond" || shape === "rhombus") return "diamond";
  return "rect";
}

/** Signed distance from p to the shape's outline: negative inside. Exact for
 * rect and diamond; the ellipse outline is sampled (under 0.1 px off at
 * these sizes). */
function gap(s: Pick<Solid, "box" | "shape">, p: Point): number {
  const { x, y, width, height } = s.box;
  const ox = Math.max(x - p.x, p.x - x - width);
  const oy = Math.max(y - p.y, p.y - y - height);
  // Outside the bounding box: its distance is a lower bound, exact for rect.
  if (s.shape === "rect" || ox > TOL || oy > TOL) {
    return ox <= 0 && oy <= 0
      ? Math.max(ox, oy)
      : Math.hypot(Math.max(ox, 0), Math.max(oy, 0));
  }
  const a = width / 2;
  const b = height / 2;
  const cx = x + a;
  const cy = y + b;
  const u = Math.abs(p.x - cx) / (a || 1e-9);
  const v = Math.abs(p.y - cy) / (b || 1e-9);
  const k = s.shape === "ellipse" ? Math.hypot(u, v) : u + v;
  const outline =
    s.shape === "ellipse"
      ? Array.from({ length: 129 }, (_, i) => {
          const t = (i / 128) * 2 * Math.PI;
          return { x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) };
        })
      : [
          { x: cx, y },
          { x: x + width, y: cy },
          { x: cx, y: y + height },
          { x, y: cy },
          { x: cx, y },
        ];
  const d = Math.min(...segments(outline).map(([q, r]) => toSegment(p, q, r)));
  return k < 1 ? -d : d;
}

function toSegment(p: Point, q: Point, r: Point): number {
  const dx = r.x - q.x;
  const dy = r.y - q.y;
  const len = dx * dx + dy * dy || 1e-9;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / len),
  );
  return Math.hypot(p.x - q.x - t * dx, p.y - q.y - t * dy);
}

const segments = (ps: readonly Point[]) =>
  ps.slice(1).map((q, i) => [ps[i] ?? q, q] as const);

/** Points every 2 px along the polyline that are more than TOL/2 inside `s`. */
function inside(ps: readonly Point[], s: Pick<Solid, "box" | "shape">) {
  const hits: Point[] = [];
  for (const [p, q] of segments(ps)) {
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 2));
    for (let i = 0; i <= n; i++) {
      const t = {
        x: p.x + ((q.x - p.x) * i) / n,
        y: p.y + ((q.y - p.y) * i) / n,
      };
      if (gap(s, t) < -TOL / 2) hits.push(t);
    }
  }
  return hits;
}

/** Where two polylines cross: a proper intersection, or a collinear run
 * longer than END. Meeting at the ends (two edges out of one node) is not. */
function cross(a: readonly Point[], b: readonly Point[]): Point | undefined {
  const nearEnd = (p: Point, ps: readonly Point[]) =>
    [ps[0], ps.at(-1)].some(
      (e) => e !== undefined && Math.hypot(e.x - p.x, e.y - p.y) <= END,
    );
  for (const [p, q] of segments(a)) {
    for (const [r, s] of segments(b)) {
      const d = { x: q.x - p.x, y: q.y - p.y };
      const e = { x: s.x - r.x, y: s.y - r.y };
      const den = d.x * e.y - d.y * e.x;
      const w = { x: r.x - p.x, y: r.y - p.y };
      const len = Math.hypot(d.x, d.y) || 1e-9;
      if (Math.abs(den) < 1e-9 * len * (Math.hypot(e.x, e.y) || 1)) {
        // Parallel: collinear if r is on p-q's line.
        if (Math.abs(w.x * d.y - w.y * d.x) / len > 1) continue;
        const t0 = (w.x * d.x + w.y * d.y) / len;
        const t1 = ((s.x - p.x) * d.x + (s.y - p.y) * d.y) / len;
        const lo = Math.max(0, Math.min(t0, t1));
        const hi = Math.min(len, Math.max(t0, t1));
        if (hi - lo > END) {
          const m = (lo + hi) / 2 / len;
          return { x: p.x + d.x * m, y: p.y + d.y * m };
        }
        continue;
      }
      const t = (w.x * e.y - w.y * e.x) / den;
      const u = (w.x * d.y - w.y * d.x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const at = { x: p.x + d.x * t, y: p.y + d.y * t };
      if (nearEnd(at, a) && nearEnd(at, b)) continue;
      return at;
    }
  }
  return undefined;
}

function distance(b: Box, p: Point): number {
  const dx = Math.max(b.x - p.x, 0, p.x - right(b));
  const dy = Math.max(b.y - p.y, 0, p.y - bottom(b));
  return Math.hypot(dx, dy);
}

const Allows = z
  .strictObject({ allow: z.array(Allow) })
  .partial()
  .loose();
function allowsOf(el: SceneElement): Allow[] {
  const parsed = Allows.safeParse(el.meta);
  return parsed.success ? (parsed.data.allow ?? []) : [];
}

/** Every hit in `scene`, errors and info. Hits an element allows carry
 * `suppressed` (the allow's `why`) and are still returned. */
export function lint(scene: NeutralScene): LintHit[] {
  const els = scene.elements;
  const byId = new Map(els.map((e) => [e.id, e]));
  const solids: Solid[] = [];
  const lines: Line[] = [];
  const labels: Label[] = [];
  for (const el of els) {
    if (el.type === "line") lines.push(el);
    if (el.type === "box" || el.type === "zone") {
      solids.push({
        id: el.id,
        box: el.box,
        shape: shapeOf(el.type === "box" ? el.shape : undefined),
        zone: el.type === "zone",
        el,
      });
    }
    if (el.text) {
      labels.push({
        id: el.type === "text" ? el.id : labelId(el.id),
        owner: el,
        bound: el.type !== "text",
        box: el.text.box,
        text: el.text.text,
        fontSize: el.style?.fontSize,
      });
    }
  }
  const container = new Set(
    solids
      .filter(
        (s) =>
          s.zone ||
          solids.some(
            (o) =>
              o !== s && area(o.box) < area(s.box) && within(o.box, s.box, 0),
          ),
      )
      .map((s) => s.id),
  );
  const leaves = solids.filter((s) => !container.has(s.id));
  const containers = solids.filter((s) => container.has(s.id));

  const hits: LintHit[] = [];
  const hit = (code: LintCode, ids: string[], bbox: Box, hint: string) =>
    hits.push({
      code,
      ids,
      bbox,
      severity: code === "crossing" ? "info" : "error",
      hint,
    });

  for (const l of labels) {
    const own = l.owner;
    // text-overflow: a bound label that pokes out of its own shape.
    if (l.bound && own.type !== "line" && own.type !== "text") {
      if (!within(l.box, own.box)) {
        hit(
          "text-overflow",
          [l.id, own.id],
          l.box,
          `Increase ${own.id} width/height (its label draws ${String(Math.ceil(l.box.width))}x${String(Math.ceil(l.box.height))}), or shorten the label`,
        );
      }
    }
    // text-wrapped: more rendered lines than written. The ink of n lines is
    // (n-1) line heights plus at most ~1.3 font sizes; n+1 lines need ~1.75.
    if (l.fontSize !== undefined) {
      const written = l.text.split("\n").length;
      const max = (written - 1) * l.fontSize * LINE_HEIGHT + 1.5 * l.fontSize;
      if (l.box.height > max) {
        const fix = l.bound ? own.id : l.id;
        hit(
          "text-wrapped",
          [l.id],
          l.box,
          `Widen ${fix}, or put the line break in the text yourself and raise ${fix} height`,
        );
      }
    }
    // label-on-node: any label on a leaf that is not its owner. Free text
    // wholly inside a leaf is an annotation.
    for (const s of leaves) {
      if (s.id === own.id) continue;
      const o = overlap(l.box, s.box);
      if (!o || (!l.bound && within(l.box, s.box))) continue;
      hit(
        "label-on-node",
        [l.id, s.id],
        o,
        own.type === "line"
          ? `Lengthen ${own.id} (move its shapes apart), or shorten or drop the label`
          : `Move ${l.bound ? own.id : l.id} so its label clears ${s.id}, or shorten the label`,
      );
    }
    // label-on-border: a label across a container's edge. An arrow label's
    // mask counts: it erases the border it touches.
    const m = own.type === "line" ? MASK : 0;
    const masked = box(
      l.box.x - m,
      l.box.y - m,
      right(l.box) + m,
      bottom(l.box) + m,
    );
    for (const s of containers) {
      if (s.id === own.id) continue;
      const o = overlap(masked, s.box);
      if (!o || within(masked, s.box, 0)) continue;
      hit(
        "label-on-border",
        [l.id, s.id],
        o,
        `Move ${l.bound ? own.id : l.id} so its label is fully inside or outside ${s.id}, or grow ${s.id}`,
      );
    }
  }

  // label-on-label
  labels.forEach((a, i) => {
    for (const b of labels.slice(i + 1)) {
      const o = overlap(a.box, b.box);
      if (o) {
        hit(
          "label-on-label",
          [a.id, b.id],
          o,
          `Spread ${a.owner.id} and ${b.owner.id} apart, or drop one label`,
        );
      }
    }
  });

  // node-overlap between leaves; a leaf across a container's edge is outside-zone.
  solids.forEach((a, i) => {
    for (const b of solids.slice(i + 1)) {
      const o = overlap(a.box, b.box);
      if (!o || within(a.box, b.box, 0) || within(b.box, a.box, 0)) continue;
      const [ca, cb] = [container.has(a.id), container.has(b.id)];
      if (ca !== cb) {
        const [leaf, zone] = ca ? [b, a] : [a, b];
        // A native zone's own check (below) covers it.
        if (zone.zone) continue;
        hit(
          "outside-zone",
          [leaf.id, zone.id],
          o,
          `Move ${leaf.id} fully inside or outside ${zone.id}, or grow ${zone.id} (50px padding)`,
        );
      } else {
        hit(
          "node-overlap",
          [a.id, b.id],
          o,
          `Move ${a.id} or ${b.id}; keep ≥ 40px between shapes`,
        );
      }
    }
  });

  // outside-zone for native zones (frames): children drawn outside, and
  // boxes drawn inside a zone that does not list them.
  const zones = solids.filter((s) => s.zone);
  for (const el of els) {
    const drawn =
      el.type === "line"
        ? bounds(el.points)
        : el.type === "text"
          ? el.text.box
          : el.box;
    const zone = el.zone === undefined ? undefined : byId.get(el.zone);
    if (zone?.type === "zone" && !within(drawn, zone.box)) {
      hit(
        "outside-zone",
        [el.id, zone.id],
        drawn,
        `Grow or move ${zone.id} (50px padding), or take ${el.id} out of its children`,
      );
    }
    if (el.type !== "box") continue;
    const home = zones
      .filter((z) => z.id !== el.id && within(el.box, z.box, 0))
      .sort((p, q) => area(p.box) - area(q.box))[0];
    if (home && el.zone !== home.id) {
      hit(
        "outside-zone",
        [el.id, home.id],
        el.box,
        `Add ${el.id} to ${home.id} children, or move it out of ${home.id}`,
      );
    }
  }

  for (const line of lines) {
    const ps = line.points;
    const first = ps[0];
    const last = ps.at(-1);
    if (!first || !last) continue;
    // An end on the outline; an unbound end deep inside a shape is drawn
    // across its border (1.19: a legend box reset to 100x100).
    const touches = (s: Solid) =>
      [first, last].some((e) => {
        const g = gap(s, e);
        return g < TOL && g > -BIND_GAP;
      });

    // arrow-through-node: through a leaf that is not an endpoint's.
    for (const s of leaves) {
      if (s.id === line.from || s.id === line.to || touches(s)) continue;
      const inPts = inside(ps, s);
      if (inPts.length) {
        hit(
          "arrow-through-node",
          [line.id, s.id],
          bounds(inPts),
          `Move ${s.id} off the line, or move an endpoint of ${line.id} so the line is clear`,
        );
      }
    }

    // arrow-through-label: through another line's label or a free text it
    // does not point at. An arrow label also claims a NEAR margin.
    for (const l of labels) {
      if (l.owner.id === line.id) continue;
      if (l.owner.type !== "line" && l.owner.type !== "text") continue;
      if (distance(l.box, first) < 8 || distance(l.box, last) < 8) continue;
      const m = l.owner.type === "line" ? NEAR * (l.fontSize ?? 0) : 0;
      const b = box(
        l.box.x - m,
        l.box.y - m,
        right(l.box) + m,
        bottom(l.box) + m,
      );
      const inPts = inside(ps, { box: b, shape: "rect" });
      if (inPts.length) {
        hit(
          "arrow-through-label",
          [line.id, l.id],
          bounds(inPts),
          `Move ${l.owner.id} or the endpoints of ${line.id} so the line clears the label`,
        );
      }
    }

    // label-on-own-arrowhead: the label's mask reaches the head (assumed at
    // the last point: NeutralScene has no arrowhead flag).
    const prev = ps.at(-2) ?? first;
    const head = Math.min(
      HEAD,
      Math.hypot(last.x - prev.x, last.y - prev.y) / 2,
    );
    if (line.text && distance(line.text.box, last) < head + MASK) {
      hit(
        "label-on-own-arrowhead",
        [labelId(line.id), line.id],
        line.text.box,
        `Give ${line.id} 120px+ (move its shapes apart), or drop the label`,
      );
    }

    // dangling-endpoint: bound to nothing, or bound but not touching.
    // Unbound ends are free on purpose (legends, pointers at text).
    for (const [end, p] of [
      ["from", first],
      ["to", last],
    ] as const) {
      const id = line[end];
      if (id === undefined) continue;
      const target = byId.get(id);
      const key = end === "from" ? "start" : "end";
      if (!target) {
        hit(
          "dangling-endpoint",
          [line.id],
          around(p),
          `Set ${line.id} ${key} to an existing id (${id} is not on the canvas)`,
        );
        continue;
      }
      const s = solids.find((x) => x.id === id);
      if (s && Math.abs(gap(s, p)) > BIND_GAP) {
        hit(
          "dangling-endpoint",
          [line.id, id],
          around(p),
          `${line.id} ${key} is ${String(Math.round(Math.abs(gap(s, p))))}px off ${id}: drop its custom points or set ${key} to ${id} again so it snaps`,
        );
      }
    }
  }

  // unlabelled-node: arrows bind to a shape that shows no label (a legend
  // swatch has no arrows; free text inside it counts as its label).
  for (const s of leaves) {
    if (s.el.text || s.zone) continue;
    if (!lines.some((l) => l.from === s.id || l.to === s.id)) continue;
    if (labels.some((l) => !l.bound && within(l.box, s.box))) continue;
    hit(
      "unlabelled-node",
      [s.id],
      s.box,
      `Give ${s.id} its label: resend it in full (id, type, size, style, label)`,
    );
  }

  // arrowhead-overlap: two arrows into one shape whose heads (assumed at the
  // last point) land closer than a head's length.
  lines.forEach((a, i) => {
    for (const b of lines.slice(i + 1)) {
      const [p, q] = [a.points.at(-1), b.points.at(-1)];
      if (!p || !q || a.to === undefined || a.to !== b.to) continue;
      if (Math.hypot(p.x - q.x, p.y - q.y) >= HEAD) continue;
      hit(
        "arrowhead-overlap",
        [a.id, b.id, a.to],
        box(
          Math.min(p.x, q.x) - END,
          Math.min(p.y, q.y) - END,
          Math.max(p.x, q.x) + END,
          Math.max(p.y, q.y) + END,
        ),
        `Spread where ${a.id} and ${b.id} land on ${a.to} (≥ 40px apart), or move a source shape`,
      );
    }
  });

  // crossing (info)
  lines.forEach((a, i) => {
    for (const b of lines.slice(i + 1)) {
      const at = cross(a.points, b.points);
      if (at) {
        hit(
          "crossing",
          [a.id, b.id],
          around(at),
          "Reorder shapes if it's cheap; otherwise fine to leave",
        );
      }
    }
  });

  return hits.map((h) => {
    for (const id of h.ids) {
      const el = byId.get(ownerId(id));
      const allow = el && allowsOf(el).find((a) => a.rule === h.code);
      if (allow) return { ...h, suppressed: allow.why };
    }
    return h;
  });
}
