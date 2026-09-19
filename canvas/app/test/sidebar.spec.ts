import { expect, test } from "@playwright/test";

test("threads sidebar shell filters, expands, and shows badges", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/dev.html?sidebar=1");
  await page.waitForFunction(
    () => (window as any).__excalidrawAPI != null,
    null,
    {
      timeout: 20_000,
    },
  );

  const sidebar = page.locator(".threads-sidebar");
  await expect(sidebar).toBeVisible();

  await sidebar.getByRole("tab", { name: /^All/ }).click();
  await expect(sidebar.locator(".threads-sidebar-row")).toHaveCount(3);

  await sidebar.locator(".threads-sidebar-row-main").first().click();
  await expect(sidebar.locator(".threads-sidebar-row").first()).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await sidebar.getByRole("tab", { name: /^Open/ }).click();
  await expect(sidebar.locator(".threads-sidebar-row")).toHaveCount(2);

  await expect(page.locator(".thread-badge:not(.is-static)")).toHaveCount(2);
  await expect(page.locator(".thread-badge:not(.is-static)").nth(0)).toHaveText(
    "1",
  );
  await expect(page.locator(".thread-badge:not(.is-static)").nth(1)).toHaveText(
    "2",
  );
});
