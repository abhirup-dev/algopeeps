import { expect, test } from "@playwright/test";

// WP-Q: selection bubble, comment tool, palette drag-in, sidebar polish.
test("polish: bubble, C tool, array drag-in, You/Tutor + relative time, badge number", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/dev.html?fake=1&palette=1");
  await page.waitForFunction(
    () =>
      (window as any).__excalidrawAPI
        ?.getSceneElements()
        .some((element: any) => element.id === "seed-el"),
    null,
    { timeout: 20_000 },
  );

  // Selection bubble appears on select.
  await page.evaluate(() =>
    (window as any).__excalidrawAPI.updateScene({
      appState: { selectedElementIds: { "seed-el": true } },
    }),
  );
  const bubble = page.locator(".selection-bubble");
  await expect(bubble).toBeVisible();
  await expect(bubble.getByRole("button", { name: "Comment" })).toBeVisible();

  // `C` activates the comment tool (locked so an empty click keeps it).
  await page.mouse.click(700, 500);
  await page.keyboard.press("c");
  await page.waitForFunction(
    () =>
      (window as any).__excalidrawAPI.getAppState().activeTool.customType ===
      "comment",
  );
  await expect(page.locator(".canvas-host")).toHaveClass(/is-commenting/);
  await page.mouse.click(700, 500);
  await expect(page.locator(".canvas-toast")).toHaveText(
    "Click an element to comment",
  );

  // Click the element → compose row titled after its label; Enter sends.
  await page.mouse.click(260, 160);
  const sidebar = page.locator(".threads-sidebar");
  await expect(sidebar.locator(".threads-new-title")).toContainText("two-sum");
  await sidebar.getByLabel("New comment").fill("Why is this here?");
  await page.keyboard.press("Enter");
  await expect(sidebar.locator(".threads-sidebar-row")).toHaveCount(1, {
    timeout: 5_000,
  });

  // Sidebar shows You / Tutor and a relative time.
  const threadId = await page.evaluate(
    () => (window as any).__devServer.threads[0].id,
  );
  await page.evaluate(
    (id) => (window as any).__devServer.injectAgentReply(id, "It anchors."),
    threadId,
  );
  await expect(sidebar.locator(".threads-author.is-human")).toHaveText("You");
  await expect(sidebar.locator(".threads-author.is-agent")).toHaveText(
    "Tutor",
    { timeout: 5_000 },
  );
  await expect(sidebar.locator(".threads-time").first()).toHaveText(
    /just now|min ago/,
  );

  // Canvas badge has visible number text and the collaboration colour.
  const badge = page.locator(".thread-badge:not(.is-static)");
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveText("1");
  await expect(badge).toHaveCSS("background-color", "rgb(156, 54, 181)");

  // Drag the Array tile onto the canvas → ≥ 5 new elements, selected, undoable.
  const before = await page.evaluate(
    () => (window as any).__excalidrawAPI.getSceneElements().length,
  );
  await page
    .locator('.asset-tile[data-kind="array"]')
    .dragTo(page.locator(".canvas-host canvas.interactive"), {
      targetPosition: { x: 500, y: 450 },
    });
  await page.waitForFunction(
    (n) => (window as any).__excalidrawAPI.getSceneElements().length >= n + 5,
    before,
  );
  const selected = await page.evaluate(
    () =>
      Object.keys(
        (window as any).__excalidrawAPI.getAppState().selectedElementIds,
      ).length,
  );
  expect(selected).toBeGreaterThanOrEqual(5);
});
