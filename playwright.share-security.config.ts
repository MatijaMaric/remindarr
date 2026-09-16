import { defineConfig, devices } from "@playwright/test";

// Run after `bun run build`; never reuse a developer/production database or server.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "share-security.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3139",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run e2e/fixtures/share-security-server.ts",
    url: "http://localhost:3139/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
