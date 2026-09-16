import { defineConfig, devices } from "@playwright/test";

// Dedicated production build, isolated DB, and ports: never reuse a developer server.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "identity-isolation.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:4327",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run e2e/fixtures/identity-server.ts",
    url: "http://localhost:4327/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
