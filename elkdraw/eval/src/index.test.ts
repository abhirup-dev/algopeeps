import { expect, test } from "bun:test";

test("@elkdraw/eval loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
