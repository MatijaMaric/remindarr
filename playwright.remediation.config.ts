import { defineConfig } from "@playwright/test";

// Run via `bun run test:e2e:remediation` to build the production UI first.
// All API requests are mocked in the spec; no backend or account is required.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "remediation-layout.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5179",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command:
      "node frontend/node_modules/vite/bin/vite.js preview frontend --host 127.0.0.1 --port 5179",
    url: "http://127.0.0.1:5179",
    reuseExistingServer: !process.env.CI,
  },
});
