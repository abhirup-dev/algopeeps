import { expect, test } from "bun:test";

test("@elkdraw/backend-excalidraw loads", async () => {
  expect(await import("./index.ts")).toBeDefined();
});
