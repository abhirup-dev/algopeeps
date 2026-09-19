import assert from "node:assert/strict";
import { test } from "node:test";
import { toCompact } from "../src/compact.js";
import type { Element } from "../src/types.js";

await test("toCompact: shape with own bound label, agent kind/ref, group", () => {
  const el: Element = {
    id: "s1",
    type: "rectangle",
    x: 100.4,
    y: 50.6,
    width: 56.2,
    height: 56,
    label: { text: "nums[0]" },
    groupIds: ["g1", "g2"],
    customData: { owner: "agent", kind: "circle", ref: "h7" },
  };
  assert.deepEqual(toCompact(el, 42), {
    id: "s1",
    type: "rectangle",
    owner: "agent",
    x: 100,
    y: 51,
    w: 56,
    h: 56,
    text: "nums[0]",
    group: "g1",
    kind: "circle",
    ref: "h7",
    rev: 42,
  });
});

await test("toCompact: bound label via containerId lookup in byId", () => {
  const shape: Element = {
    id: "s2",
    type: "ellipse",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  };
  const label: Element = {
    id: "l1",
    type: "text",
    x: 2,
    y: 2,
    text: "hello",
    containerId: "s2",
  };
  const c = toCompact(shape, 1, new Map([[label.id, label]]));
  assert.equal(c.text, "hello");
  assert.equal(c.owner, "human");
});

await test("toCompact: bound arrow in both binding forms", () => {
  const converted: Element = {
    id: "a1",
    type: "arrow",
    x: 0,
    y: 0,
    startBinding: { elementId: "s0" },
    endBinding: { elementId: "s2" },
  };
  const c1 = toCompact(converted, 7);
  assert.equal(c1.from, "s0");
  assert.equal(c1.to, "s2");

  const normalised: Element = {
    id: "a2",
    type: "arrow",
    x: 0,
    y: 0,
    start: { id: "p" },
    end: { id: "q" },
  };
  const c2 = toCompact(normalised, 7);
  assert.equal(c2.from, "p");
  assert.equal(c2.to, "q");

  // from/to only on arrows
  const rect: Element = {
    id: "r",
    type: "rectangle",
    x: 0,
    y: 0,
    start: { id: "p" },
  };
  assert.equal(toCompact(rect, 1).from, undefined);
});
