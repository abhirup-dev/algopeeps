import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: {
    command: "bun run dev",
    url: "http://127.0.0.1:5173/dev.html",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
