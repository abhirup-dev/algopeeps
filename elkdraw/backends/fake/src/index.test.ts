import { expect, test } from "bun:test";

test("@elkdraw/backend-fake loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
