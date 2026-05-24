import { execFileSync } from "node:child_process";
import { request as playwrightRequest } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  UX_DB_PATH,
  UX_MANIFEST_PATH,
  UX_AUTH_STATE_PATH,
  UX_BASE_URL,
} from "./constants";
import type { UxManifest } from "./constants";

const SEED_USERNAME = "ux_seed";
const SEED_PASSWORD = "UxSeed_pw1!";
const SEED_EMAIL = "ux_seed@example.com";
const FRIEND_USERNAME = "ux_friend";
const FRIEND_PASSWORD = "UxFriend_pw1!";
const FRIEND_EMAIL = "ux_friend@example.com";

const MOVIE_ID_1 = "movie-603";
const SHOW_ID = "tv-1399";
const SEASON_NUMBER = 1;
const EPISODE_NUMBER = 1;
const KIOSK_TOKEN = "uxreviewkiosk00000000000000000000";
const SHARE_TOKEN = "uxreviewshare0000000000000000000";
const ACHIEVEMENT_KEY = "movies_10";

export default async function globalSetup() {
  const req = await playwrightRequest.newContext({
    baseURL: UX_BASE_URL,
    extraHTTPHeaders: { Origin: UX_BASE_URL },
  });

  async function signUp(
    username: string,
    email: string,
    password: string,
  ): Promise<string> {
    const res = await req.post("/api/auth/sign-up/email", {
      data: { username, email, password, name: username },
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok()) {
      throw new Error(
        `sign-up failed for ${username}: ${res.status()} ${await res.text()}`,
      );
    }
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const nested = body?.user as Record<string, unknown> | undefined;
    const nested2 = (body?.data as Record<string, unknown> | undefined)
      ?.user as Record<string, unknown> | undefined;
    const userId = (nested?.id ?? nested2?.id) as string | undefined;
    if (!userId)
      throw new Error(`No user id in sign-up response for ${username}`);
    return userId;
  }

  const seedUserId = await signUp(SEED_USERNAME, SEED_EMAIL, SEED_PASSWORD);
  const friendUserId = await signUp(
    FRIEND_USERNAME,
    FRIEND_EMAIL,
    FRIEND_PASSWORD,
  );

  // Seed media, tracking, admin flag, and tokens via a Bun subprocess.
  // global-setup runs in Node.js under Playwright; bun-db.ts uses bun:sqlite
  // which Node.js cannot load, so we delegate all direct DB work to Bun.
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
        ...process.env,
        DB_PATH: path.resolve(UX_DB_PATH),
        BETTER_AUTH_SECRET: "ux-review-better-auth-secret",
        TMDB_API_KEY: "ux-review-placeholder",
        BASE_URL: UX_BASE_URL,
      },
      stdio: "inherit",
    },
  );

  // ── Log in and save storageState for authenticated capture tests ─────────────
  const loginRes = await req.post("/api/auth/sign-in/username", {
    data: { username: SEED_USERNAME, password: SEED_PASSWORD },
    headers: { "Content-Type": "application/json" },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `Login failed: ${loginRes.status()} ${await loginRes.text()}`,
    );
  }
  fs.mkdirSync(path.dirname(UX_AUTH_STATE_PATH), { recursive: true });
  await req.storageState({ path: UX_AUTH_STATE_PATH });
  await req.dispose();

  // ── Write manifest for capture spec ─────────────────────────────────────────
  const manifest: UxManifest = {
    username: SEED_USERNAME,
    password: SEED_PASSWORD,
    friendUsername: FRIEND_USERNAME,
    movieId: MOVIE_ID_1,
    showId: SHOW_ID,
    seasonNumber: SEASON_NUMBER,
    episodeNumber: EPISODE_NUMBER,
    personId: 1,
    kioskToken: KIOSK_TOKEN,
    shareToken: SHARE_TOKEN,
    achievementKey: ACHIEVEMENT_KEY,
  };
  fs.writeFileSync(UX_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}
