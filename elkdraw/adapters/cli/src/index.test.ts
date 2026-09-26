import { expect, test } from "bun:test";

test("@elkdraw/cli loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
