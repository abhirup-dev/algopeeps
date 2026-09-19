import { expect, test } from "@playwright/test";

test("selection comment creates sidebar thread, badge, unread reply, and focuses target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/dev.html?fake=1");
  await page.waitForFunction(
    () =>
      (window as any).__excalidrawAPI
        ?.getSceneElements()
        .some((element: any) => element.id === "seed-el"),
    null,
    { timeout: 20_000 },
  );

  await page.evaluate(() =>
    (window as any).__excalidrawAPI.updateScene({
      appState: { selectedElementIds: { "seed-el": true } },
    }),
  );

  const sidebar = page.locator(".threads-sidebar");
  await expect(sidebar).toBeVisible();
  // WP-Q: the selection bubble replaces the footer button.
  await page
    .locator(".selection-bubble")
    .getByRole("button", { name: "Comment" })
    .click();
  await sidebar.getByLabel("New comment").fill("Why is this selected?");
  await sidebar.getByRole("button", { name: "Send" }).click();

  await expect(sidebar.locator(".threads-sidebar-row")).toHaveCount(1, {
    timeout: 5_000,
  });
  await expect(page.locator(".thread-badge:not(.is-static)")).toHaveCount(1);

  const threadId = await page.evaluate(
    () => (window as any).__devServer.threads[0].id,
  );
  await page.evaluate((id) => {
    const api = (window as any).__excalidrawAPI;
    api.toggleSidebar({ name: "threads", force: false });
    (window as any).__devServer.injectAgentReply(
      id,
      "It marks the active target.",
    );
  }, threadId);
  await expect(sidebar).toBeVisible({ timeout: 5_000 });
  await expect(sidebar.locator(".threads-sidebar-row")).toHaveClass(
    /is-unread/,
  );

  await page.evaluate(() =>
    (window as any).__excalidrawAPI.updateScene({
      appState: { scrollX: -1000, scrollY: -600 },
    }),
  );
  const before = await page.evaluate(
    () => (window as any).__excalidrawAPI.getAppState().scrollX,
  );
  await sidebar.locator(".threads-sidebar-row-main").click();
  await page.waitForFunction(
    (value) => (window as any).__excalidrawAPI.getAppState().scrollX !== value,
    before,
  );
});
