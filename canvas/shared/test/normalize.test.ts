import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareElement } from "../src/normalize.js";

await test("normalize: text→label on shapes, text stays on type text", () => {
  const rect = prepareElement({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: "lbl",
  });
  assert.equal(rect.label?.text, "lbl");
  assert.equal(rect.text, undefined);

  const txt = prepareElement({ type: "text", x: 0, y: 0, text: "keep" });
  assert.equal(txt.text, "keep");
  assert.equal(txt.label, undefined);
});

await test("normalize: startElementId/endElementId → start/end ids, default points, generated id", () => {
  const arrow = prepareElement({
    type: "arrow",
    x: 5,
    y: 6,
    startElementId: "a0",
    endElementId: "a2",
  });
  assert.deepEqual(arrow.start, { id: "a0" });
  assert.deepEqual(arrow.end, { id: "a2" });
  assert.deepEqual(arrow.points, [
    [0, 0],
    [100, 0],
  ]);
  assert.match(arrow.id, /^[0-9A-Za-z]{12}$/);
});

await test("normalize: keeps custom ids, normalises fontFamily and points", () => {
  const withId = prepareElement({ id: "a1", type: "rectangle", x: 0, y: 0 });
  assert.equal(withId.id, "a1");

  const font = prepareElement({
    type: "text",
    x: 0,
    y: 0,
    text: "k",
    fontFamily: "helvetica",
  });
  assert.equal(font.fontFamily, 2);

  const pts = prepareElement({
    type: "line",
    x: 0,
    y: 0,
    points: [{ x: 1, y: 2 }, [3, 4]],
  });
  assert.deepEqual(pts.points, [
    [1, 2],
    [3, 4],
  ]);
});
