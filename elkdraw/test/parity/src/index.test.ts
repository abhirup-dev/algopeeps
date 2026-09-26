import { expect, test } from "bun:test";

test("@elkdraw/parity loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
