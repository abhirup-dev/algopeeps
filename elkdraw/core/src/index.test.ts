import { expect, test } from "bun:test";

test("@elkdraw/core loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
