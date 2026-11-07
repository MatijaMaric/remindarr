import { defineConfig, devices } from "@playwright/test";

// Run via `bun run test:e2e:remediation` to build the production UI first.
// All API requests are mocked in the spec; no backend or account is required.
// Projects cover desktop engines at phone width plus phone emulation (touch,
// mobile UA, device pixel ratio). Emulation is not device certification.
const phone = { viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: "./e2e",
  testMatch: "remediation-layout.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5179",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...phone } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], ...phone } },
    { name: "webkit", use: { ...devices["Desktop Safari"], ...phone } },
    { name: "mobile-chrome", use: devices["Pixel 7"] },
    { name: "mobile-safari", use: devices["iPhone 13"] },
  ],
  webServer: {
    command:
      "node frontend/node_modules/vite/bin/vite.js preview frontend --host 127.0.0.1 --port 5179",
    url: "http://127.0.0.1:5179",
    reuseExistingServer: !process.env.CI,
  },
});
