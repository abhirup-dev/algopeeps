import { expect, test } from "bun:test";

test("@elkdraw/sidecar loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
