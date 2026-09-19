import { expect, test } from "@playwright/test";

// Skipped in WP-O: the legacy ThreadsLayer overlay is intentionally unmounted.
test.skip("threads: pill → card → reply round-trips via the fake", async ({
  page,
}) => {
  await page.goto("/dev.html?fake=1");

  await page.waitForFunction(
    () => (window as any).__excalidrawAPI != null,
    null,
    { timeout: 20_000 },
  );

  // Seeded thread arrives via canvas_pull as a collapsed pill.
  const pill = page.locator(".thread-pill");
  await expect(pill).toBeVisible({ timeout: 10_000 });
  await expect(pill).toContainText("1");

  // Pill → card, showing the seeded agent message.
  await pill.click();
  const card = page.locator(".thread-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".thread-msg")).toHaveCount(1);
  await expect(card.locator(".thread-text").first()).toContainText(
    "sorted first",
  );

  // Reply → optimistic second message + real canvas_thread_post to the fake.
  await card.locator("textarea").fill("yes — sort it first");
  await card.locator(".thread-send").click();
  await expect(card.locator(".thread-msg")).toHaveCount(2);
  await expect(card.locator(".thread-text").nth(1)).toContainText(
    "sort it first",
  );
  await page.waitForFunction(
    () => {
      const t = (window as any).__devServer.threads.find(
        (x: any) => x.id === "t-seed",
      );
      return (
        t &&
        t.messages.length === 2 &&
        t.messages[1].author === "human" &&
        t.collapsed === false // canvas_thread_set shared the expansion
      );
    },
    null,
    { timeout: 5_000 },
  );
});
