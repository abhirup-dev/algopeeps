import { expect, test } from "bun:test";

test("@elkdraw/server loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
