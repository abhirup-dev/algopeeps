import { test } from "@playwright/test";

test("fake canvas_pull upsert renders in the scene", async ({ page }) => {
  await page.goto("/dev.html");

  await page.waitForFunction(
    () => (window as any).__excalidrawAPI != null,
    null,
    {
      timeout: 20_000,
    },
  );

  // Simulate an agent-side draw arriving via the next canvas_pull poll.
  await page.evaluate(() =>
    (window as any).__devServer.injectAgent([
      {
        id: "a1",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 160,
        height: 60,
        strokeColor: "#9c36b5",
        text: "nums[0]",
        customData: { owner: "agent" },
      },
    ]),
  );

  await page.waitForFunction(
    () =>
      (window as any).__excalidrawAPI
        .getSceneElements()
        .some((el: any) => el.id === "a1" && !el.isDeleted),
    null,
    { timeout: 10_000 },
  );

  // Agent format must convert: bound label text element appears, and the
  // converted (seed-bearing) elements get saved back to the server (§4).
  await page.waitForFunction(
    () =>
      (window as any).__excalidrawAPI
        .getSceneElements()
        .some((el: any) => el.containerId === "a1" && el.text === "nums[0]"),
    null,
    { timeout: 10_000 },
  );
  await page.waitForFunction(
    () => {
      const stored = (window as any).__devServer.elements;
      return (
        Array.isArray(stored) &&
        stored.some((el: any) => el.id === "a1" && typeof el.seed === "number")
      );
    },
    null,
    { timeout: 10_000 },
  );
});
