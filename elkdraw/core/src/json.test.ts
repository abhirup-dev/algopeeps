import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { parseJson, safeParseJson } from "./json.ts";

const Point = z.object({ x: z.number(), y: z.number() });

describe("parseJson", () => {
  test("returns the typed value", () => {
    const p = parseJson(Point, '{"x":1,"y":2}');
    expect(p.x + p.y).toBe(3);
  });

  test("throws SyntaxError on bad JSON", () => {
    expect(() => parseJson(Point, "{")).toThrow(SyntaxError);
  });

  test("throws ZodError on schema mismatch", () => {
    expect(() => parseJson(Point, '{"x":"1"}')).toThrow(z.ZodError);
  });
});

describe("safeParseJson", () => {
  test("ok on valid input", () => {
    expect(safeParseJson(Point, '{"x":1,"y":2}')).toEqual({
      ok: true,
      value: { x: 1, y: 2 },
    });
  });

  test("SyntaxError on bad JSON", () => {
    const r = safeParseJson(Point, "not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(SyntaxError);
  });

  test("ZodError on schema mismatch", () => {
    const r = safeParseJson(Point, "[]");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(z.ZodError);
  });
});
