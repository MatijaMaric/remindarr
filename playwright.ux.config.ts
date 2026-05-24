import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  UX_DB_DIR,
  UX_DB_PATH,
  UX_PORT,
  UX_BASE_URL,
} from "./ux-review/constants";

// Wipe and recreate the isolated UX-review DB dir before the server boots.
// Same sentinel pattern as playwright.config.ts to handle multi-worker reloads.
const absDbDir = path.resolve(UX_DB_DIR);
if (!process.env.__PW_UX_DB_READY) {
  if (fs.existsSync(absDbDir)) {
    try {
      fs.rmSync(absDbDir, { recursive: true, force: true });
    } catch {
      // SQLite file held open — leave it; the backend re-opens cleanly.
    }
  }
  fs.mkdirSync(absDbDir, { recursive: true });
  process.env.__PW_UX_DB_READY = "1";
} else {
  fs.mkdirSync(absDbDir, { recursive: true });
}

const serverEnv: Record<string, string> = {
  DB_PATH: path.resolve(UX_DB_PATH),
  PORT: String(UX_PORT),
  BASE_URL: UX_BASE_URL,
  BETTER_AUTH_SECRET: "ux-review-better-auth-secret",
  TMDB_API_KEY: "ux-review-placeholder",
  AUTH_RATE_LIMIT_PER_MINUTE: "1000",
  LOG_LEVEL: "warn",
  // Disable all cron jobs — this instance is for UI review only.
  SYNC_TITLES_CRON: "",
  SYNC_EPISODES_CRON: "",
  BACKUP_CRON: "",
  SYNC_DEEP_LINKS_CRON: "",
  SYNC_PLEX_CRON: "",
  SYNC_PLEX_LIBRARY_CRON: "",
};

export default defineConfig({
  testDir: "./ux-review",
  testIgnore: ["**/fixtures/**"],
  // Sequential capture — stable viewport rendering, no race between screenshots.
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "html",
  // 6 viewports × up to 30 s each + axe analysis headroom.
  timeout: 300_000,
  globalSetup: "./ux-review/global-setup.ts",
  use: {
    baseURL: UX_BASE_URL,
    // storageState is applied per-test via test.use() in capture.spec.ts
    // so the file doesn't need to exist at config-parse time.
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "ux-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Production server serves both API and pre-built frontend/dist.
    // Run `bun run build` first (the ux:capture script does this automatically).
    command: "bun run server/index.ts",
    url: `${UX_BASE_URL}/api/health`,
    // Never reuse an existing server — need a clean isolated DB each run.
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
    env: serverEnv,
  },
});
