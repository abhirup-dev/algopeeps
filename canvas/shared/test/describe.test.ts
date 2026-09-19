import assert from "node:assert/strict";
import { test } from "node:test";
import { describeScene } from "../src/describe.js";
import type { Element } from "../src/types.js";

await test("describe tags owners and adds kind/ref", () => {
  const human: Element = {
    id: "h1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  };
  const agent: Element = {
    id: "a1",
    type: "text",
    x: 5,
    y: 5,
    text: "invariant holds",
    customData: { owner: "agent", kind: "invariant", ref: "h1" },
  };
  const out = describeScene([human, agent]);
  const lines = out.split("\n");
  assert.ok(
    lines.some((l) => l.includes("[h1]") && l.trimEnd().endsWith("[human]")),
    `human line not tagged:\n${out}`,
  );
  assert.ok(
    lines.some(
      (l) =>
        l.includes("[a1]") &&
        l.includes("kind: invariant") &&
        l.includes("ref: h1") &&
        l.trimEnd().endsWith("[agent]"),
    ),
    `agent line missing kind/ref/tag:\n${out}`,
  );
});

await test("describe reports connections in both binding forms", () => {
  const arrow: Element = {
    id: "ar1",
    type: "arrow",
    x: 0,
    y: 0,
    start: { id: "from1" },
    end: { id: "to1" },
  };
  const out = describeScene([arrow]);
  assert.ok(out.includes("from1 --> to1"));
});
