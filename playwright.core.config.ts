import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "core-journey.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4337",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "bun run e2e/fixtures/core-server.ts",
    url: "http://localhost:4337/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
