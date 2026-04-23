import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { MOCK_OIDC_URL, E2E_DB_DIR, E2E_DB_PATH } from "./e2e/fixtures/constants";

// Playwright starts the webServer BEFORE globalSetup, so the DB directory
// must exist by the time the backend's startup validation runs. This config
// file is re-loaded in every worker process too — so we only wipe state the
// first time it loads in a given CLI invocation, guarded by an env sentinel.
const absDbDir = path.resolve(E2E_DB_DIR);
if (!process.env.__PW_E2E_DB_READY) {
  if (fs.existsSync(absDbDir)) {
    try {
      fs.rmSync(absDbDir, { recursive: true, force: true });
    } catch {
      // If a stale process still holds the SQLite file open, fall back to
      // leaving it in place — the backend is fine re-opening an existing DB.
    }
  }
  fs.mkdirSync(absDbDir, { recursive: true });
  process.env.__PW_E2E_DB_READY = "1";
} else {
  fs.mkdirSync(absDbDir, { recursive: true });
}

// Environment the backend webServer needs so OIDC + deterministic paths work.
const backendEnv: Record<string, string> = {
  // Point the backend at the mock OIDC server we boot in globalSetup.
  OIDC_ISSUER_URL: MOCK_OIDC_URL,
  OIDC_CLIENT_ID: "test",
  OIDC_CLIENT_SECRET: "test-secret",
  OIDC_REDIRECT_URI: "http://localhost:5173/api/auth/oauth2/callback/pocketid",
  OIDC_ADMIN_CLAIM: "",
  OIDC_ADMIN_VALUE: "",

  // Pinned DB location so globalSetup can wipe it and tests can read the
  // bootstrap admin password file sibling to it.
  DB_PATH: E2E_DB_PATH,

  // Browser hits the Vite proxy, which forwards to the backend. BASE_URL
  // must match the frontend origin so better-auth's issued URLs (OIDC
  // redirect_uri, passkey RP ID/origin) line up.
  BASE_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "e2e-better-auth-secret-pinned",

  // Startup validation requires these — placeholder values are fine for
  // the flows we exercise (feed, passkey, OIDC, webhook notifications).
  // Tests never call TMDB.
  TMDB_API_KEY: "e2e-placeholder-tmdb-key",

  // Raise the auth rate-limit so high-volume flows (passkey enrol +
  // challenge + assertion + sign-out + session check) don't 429.
  AUTH_RATE_LIMIT_PER_MINUTE: "1000",

  // Turn off external noise and verbose logs.
  LOG_LEVEL: "warn",
  SYNC_TITLES_CRON: "",
  SYNC_EPISODES_CRON: "",
  BACKUP_CRON: "",
  SYNC_DEEP_LINKS_CRON: "",
  SYNC_PLEX_CRON: "",
  SYNC_PLEX_LIBRARY_CRON: "",
};

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/fixtures/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // E2E specs talk to a real backend with rate limiting and persistent
  // state, so retries cause more flake than they save. Keep retries off.
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  globalSetup: "./e2e/fixtures/global-setup.ts",
  globalTeardown: "./e2e/fixtures/global-teardown.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: [
    {
      command: "bun run dev:server",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: backendEnv,
    },
    {
      command: "cd frontend && bun run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
