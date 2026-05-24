/**
 * Lighthouse CI orchestration script.
 *
 * Boots an isolated seeded production server, captures a better-auth session
 * cookie, then runs lhci autorun four times (mobile/desktop × public/auth page
 * groups). All assertions are warn-level so every run exits 0.
 *
 * Usage:
 *   bun run scripts/lighthouse-ci.ts
 *   TMDB_API_KEY=<key> bun run lighthouse:ci   # via package.json script
 */

import { execFileSync, spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  LIGHTHOUSE_PORT,
  LIGHTHOUSE_BASE_URL,
  LIGHTHOUSE_DB_DIR,
  LIGHTHOUSE_DB_PATH,
  LIGHTHOUSE_OUTPUT_DIR,
  PAGE_GROUPS,
  FORM_FACTORS,
  buildCookieHeader,
  waitForHealth,
} from "./lighthouse-ci.helpers";

const SEED_USERNAME = "lhci_seed";
const SEED_PASSWORD = "LhciSeed_pw1!";
const SEED_EMAIL = "lhci_seed@example.com";
const FRIEND_USERNAME = "lhci_friend";
const FRIEND_PASSWORD = "LhciFriend_pw1!";
const FRIEND_EMAIL = "lhci_friend@example.com";

const serverEnv: NodeJS.ProcessEnv = {
  ...process.env,
  DB_PATH: path.resolve(LIGHTHOUSE_DB_PATH),
  PORT: String(LIGHTHOUSE_PORT),
  BASE_URL: LIGHTHOUSE_BASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "lighthouse-ci-secret",
  TMDB_API_KEY: process.env.TMDB_API_KEY ?? "",
  AUTH_RATE_LIMIT_PER_MINUTE: "1000",
  GLOBAL_RATE_LIMIT_PER_MINUTE: "2000",
  LOG_LEVEL: "warn",
  SYNC_TITLES_CRON: "",
  SYNC_EPISODES_CRON: "",
  BACKUP_CRON: "",
  SYNC_DEEP_LINKS_CRON: "",
  SYNC_PLEX_CRON: "",
  SYNC_PLEX_LIBRARY_CRON: "",
};

async function signUp(
  username: string,
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${LIGHTHOUSE_BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: LIGHTHOUSE_BASE_URL,
    },
    body: JSON.stringify({ username, email, password, name: username }),
  });
  if (!res.ok) {
    throw new Error(
      `sign-up failed for ${username}: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as Record<string, unknown>;
  const nested = body?.user as Record<string, unknown> | undefined;
  const nested2 = (body?.data as Record<string, unknown> | undefined)?.user as
    | Record<string, unknown>
    | undefined;
  const userId = (nested?.id ?? nested2?.id) as string | undefined;
  if (!userId)
    throw new Error(`No user id in sign-up response for ${username}`);
  return userId;
}

async function main() {
  // 1. Wipe and recreate isolated DB dir.
  const absDbDir = path.resolve(LIGHTHOUSE_DB_DIR);
  if (fs.existsSync(absDbDir)) {
    fs.rmSync(absDbDir, { recursive: true, force: true });
  }
  fs.mkdirSync(absDbDir, { recursive: true });

  // 2. Spawn the production server (API + static SPA from frontend/dist).
  const server = spawn("bun", ["run", "server/index.ts"], {
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  server.stdout?.on("data", () => {});
  server.stderr?.on("data", () => {});

  let exitCode = 0;
  try {
    // 3. Wait for /api/health before proceeding.
    await waitForHealth(`${LIGHTHOUSE_BASE_URL}/api/health`);
    console.log("[lhci] Server ready on", LIGHTHOUSE_BASE_URL);

    // 4. Sign up seed and friend users via the API.
    const seedUserId = await signUp(SEED_USERNAME, SEED_EMAIL, SEED_PASSWORD);
    const friendUserId = await signUp(
      FRIEND_USERNAME,
      FRIEND_EMAIL,
      FRIEND_PASSWORD,
    );

    // 5. Seed titles, episodes, tracking, etc. via a Bun subprocess that writes
    //    directly to SQLite (reuses ux-review/db-seed.ts; must run under Bun
    //    because it imports bun:sqlite transitively via server/db/bun-db.ts).
    execFileSync(
      "bun",
      [
        "run",
        path.resolve("ux-review/db-seed.ts"),
        `--seed-user-id=${seedUserId}`,
        `--friend-user-id=${friendUserId}`,
      ],
      {
        env: {
          ...serverEnv,
          DB_PATH: path.resolve(LIGHTHOUSE_DB_PATH),
          BETTER_AUTH_SECRET: "lighthouse-ci-secret",
          TMDB_API_KEY: process.env.TMDB_API_KEY ?? "lighthouse-ci-placeholder",
          BASE_URL: LIGHTHOUSE_BASE_URL,
        },
        stdio: "inherit",
      },
    );

    // 6. Login and capture the better-auth session cookie.
    const loginRes = await fetch(
      `${LIGHTHOUSE_BASE_URL}/api/auth/sign-in/username`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: LIGHTHOUSE_BASE_URL,
        },
        body: JSON.stringify({
          username: SEED_USERNAME,
          password: SEED_PASSWORD,
        }),
      },
    );
    if (!loginRes.ok) {
      throw new Error(
        `Login failed: ${loginRes.status} ${await loginRes.text()}`,
      );
    }
    const cookie = buildCookieHeader(loginRes.headers.getSetCookie());
    console.log("[lhci] Authenticated. Cookie length:", cookie.length, "chars");

    // 7. Run lhci for each form-factor × page-group combination.
    const configPath = path.resolve("lighthouserc.cjs");
    let warnCount = 0;

    for (const formFactor of FORM_FACTORS) {
      for (const [group, urls] of Object.entries(PAGE_GROUPS) as [
        string,
        readonly string[],
      ][]) {
        const outputDir = path.resolve(
          LIGHTHOUSE_OUTPUT_DIR,
          formFactor,
          group,
        );
        fs.mkdirSync(outputDir, { recursive: true });

        const runEnv: NodeJS.ProcessEnv = {
          ...process.env,
          LHCI_PRESET: formFactor,
          LHCI_URLS: urls.join(","),
          LHCI_OUTPUT_DIR: outputDir,
          ...(group === "auth" ? { LHCI_COOKIE: cookie } : {}),
        };

        console.log(`[lhci] ${formFactor}/${group}: ${urls.join(", ")}`);
        const result = spawnSync(
          "bunx",
          ["lhci", "autorun", `--config=${configPath}`],
          {
            env: runEnv,
            stdio: "inherit",
          },
        );

        if (result.status !== 0) {
          warnCount++;
          console.warn(
            `[lhci] ${formFactor}/${group} reported threshold warnings (exit ${result.status})`,
          );
        }
      }
    }

    if (warnCount > 0) {
      console.warn(
        `\n[lhci] ${warnCount} run(s) have threshold warnings. Reports: ${LIGHTHOUSE_OUTPUT_DIR}/`,
      );
      console.warn(
        "[lhci] To enforce as hard gate: change 'warn' → 'error' in lighthouserc.cjs",
      );
    } else {
      console.log(
        `\n[lhci] All runs passed thresholds. Reports: ${LIGHTHOUSE_OUTPUT_DIR}/`,
      );
    }
  } catch (err) {
    console.error("[lhci] Fatal error:", err);
    exitCode = 1;
  } finally {
    server.kill();
  }

  process.exit(exitCode);
}

main();
