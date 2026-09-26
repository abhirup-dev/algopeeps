import { expect, test } from "bun:test";

test("@elkdraw/mcp loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
