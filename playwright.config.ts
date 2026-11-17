import { defineConfig, devices } from "@playwright/test";

const url = process.env.APP_URL ?? "http://127.0.0.1:3000";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: url, channel: process.env.PLAYWRIGHT_CHANNEL, trace: "retain-on-failure", colorScheme: "light" },
  webServer: { command: "npm run dev", url: `${url}/api/health`, reuseExistingServer: !process.env.CI, timeout: 90_000 },
});
