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
const MOVIE_ID_2 = "movie-680";
const MOVIE_ID_3 = "movie-278";
const SHOW_ID = "tv-1399";
const SEASON_NUMBER = 1;
const EPISODE_NUMBER = 1;
const KIOSK_TOKEN = "uxreviewkiosk00000000000000000000";
const SHARE_TOKEN = "uxreviewshare0000000000000000000";
const ACHIEVEMENT_KEY = "movies_10";

export default async function globalSetup() {
  // Set env before any server module import so CONFIG.DB_PATH resolves correctly.
  process.env.DB_PATH = path.resolve(UX_DB_PATH);
  process.env.BETTER_AUTH_SECRET = "ux-review-better-auth-secret";
  process.env.TMDB_API_KEY = "ux-review-placeholder";
  process.env.BASE_URL = UX_BASE_URL;
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = "1000";

  // Open a second connection to the already-migrated DB (server holds the first).
  // SQLite WAL mode allows concurrent readers + one writer — writes here are
  // committed before any test reads them.
  const { initBunDb } = await import("../server/db/bun-db");
  await initBunDb();

  const { upsertTitles } = await import("../server/db/repository/titles");
  const { upsertEpisodes } = await import("../server/db/repository/episodes");
  const { trackTitle } = await import("../server/db/repository/tracked");
  const { updateUserAdmin, setKioskToken, setWatchlistShareToken } =
    await import("../server/db/repository/users");
  const { makeParsedTitle } = await import("../server/test-utils/fixtures");

  // ── Seed media ──────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  await upsertTitles([
    makeParsedTitle({
      id: MOVIE_ID_1,
      objectType: "MOVIE",
      title: "Seed Movie One",
      tmdbId: "603",
      releaseYear: 2020,
      releaseDate: "2020-03-16",
      runtimeMinutes: 136,
      shortDescription: "A seeded movie for UX review.",
      genres: ["Action", "Science Fiction"],
      posterUrl: null,
    }),
    makeParsedTitle({
      id: MOVIE_ID_2,
      objectType: "MOVIE",
      title: "Seed Movie Two",
      tmdbId: "680",
      releaseYear: 1994,
      releaseDate: "1994-10-14",
      runtimeMinutes: 154,
      shortDescription: "Another seeded movie.",
      genres: ["Crime", "Drama"],
      posterUrl: null,
    }),
    makeParsedTitle({
      id: MOVIE_ID_3,
      objectType: "MOVIE",
      title: "Seed Movie Three",
      tmdbId: "278",
      releaseYear: 1994,
      releaseDate: "1994-09-23",
      runtimeMinutes: 142,
      shortDescription: "Third seeded movie.",
      genres: ["Drama", "Crime"],
      posterUrl: null,
    }),
    makeParsedTitle({
      id: SHOW_ID,
      objectType: "SHOW",
      title: "Seed Show",
      tmdbId: "1399",
      releaseYear: 2011,
      releaseDate: "2011-04-17",
      runtimeMinutes: 60,
      shortDescription: "A seeded show for UX review.",
      genres: ["Drama", "Fantasy"],
      posterUrl: null,
    }),
  ]);

  // Two seasons, 3 episodes each. air_date ≤ today so kiosk / up-next surfaces them.
  const episodes = [];
  for (let ep = 1; ep <= 3; ep++) {
    episodes.push({
      title_id: SHOW_ID,
      season_number: 1,
      episode_number: ep,
      name: `Season 1 Episode ${ep}`,
      overview: `Overview of S01E0${ep}`,
      air_date: yesterday,
      still_path: null,
    });
    episodes.push({
      title_id: SHOW_ID,
      season_number: 2,
      episode_number: ep,
      name: `Season 2 Episode ${ep}`,
      overview: `Overview of S02E0${ep}`,
      air_date: today,
      still_path: null,
    });
  }
  await upsertEpisodes(episodes);

  // ── Create users via HTTP (proper better-auth accounts) ─────────────────────
  const req = await playwrightRequest.newContext({ baseURL: UX_BASE_URL });

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

  // Promote seed user to admin so /admin/users and settings admin tab render.
  await updateUserAdmin(seedUserId, true);

  // ── Seed watchlists ──────────────────────────────────────────────────────────
  await trackTitle(MOVIE_ID_1, seedUserId);
  await trackTitle(MOVIE_ID_2, seedUserId);
  await trackTitle(SHOW_ID, seedUserId);
  // Friend tracks overlapping title for the /u/:user/overlap/:friend route.
  await trackTitle(MOVIE_ID_1, friendUserId);
  await trackTitle(SHOW_ID, friendUserId);

  // ── Set sharing tokens ───────────────────────────────────────────────────────
  await setKioskToken(seedUserId, KIOSK_TOKEN);
  await setWatchlistShareToken(seedUserId, SHARE_TOKEN);

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
