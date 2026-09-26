import { expect, test } from "bun:test";

test("@elkdraw/app loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
