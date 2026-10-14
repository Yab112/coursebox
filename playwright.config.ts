import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3210);

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/fixtures.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Locally you can reuse an installed Chrome: PW_CHANNEL=chrome npm run test:e2e
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL || undefined }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      // Throwaway API + Postgres (Docker locally, E2E_DATABASE_URL in CI) with local file storage.
      command: "./server/scripts/e2e-api.sh",
      url: `http://localhost:${process.env.E2E_API_PORT ?? 4100}/health`,
      env: { E2E_WEB_ORIGIN: `http://localhost:${PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    {
      command: `npx next start -p ${PORT}`,
      port: PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
