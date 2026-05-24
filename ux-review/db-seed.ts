/**
 * Bun-native DB seed script for UX review.
 *
 * This runs as a subprocess from global-setup.ts (which runs in Node.js under
 * Playwright). It must be executed with Bun because it imports bun:sqlite
 * transitively via server/db/bun-db.ts.
 *
 * Usage: bun run ux-review/db-seed.ts --seed-user-id=X --friend-user-id=Y
 */
import path from "node:path";
import { UX_DB_PATH, UX_BASE_URL } from "./constants";

const args = process.argv.slice(2);
function getArg(name: string): string {
  const val = args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (!val) throw new Error(`Missing required arg --${name}`);
  return val;
}

const seedUserId = getArg("seed-user-id");
const friendUserId = getArg("friend-user-id");

process.env.DB_PATH = path.resolve(UX_DB_PATH);
process.env.BETTER_AUTH_SECRET = "ux-review-better-auth-secret";
process.env.TMDB_API_KEY = "ux-review-placeholder";
process.env.BASE_URL = UX_BASE_URL;

const MOVIE_ID_1 = "movie-603";
const MOVIE_ID_2 = "movie-680";
const MOVIE_ID_3 = "movie-278";
const SHOW_ID = "tv-1399";
const KIOSK_TOKEN = "uxreviewkiosk00000000000000000000";
const SHARE_TOKEN = "uxreviewshare0000000000000000000";
const ACHIEVEMENT_KEY = "movies_10";

const { initBunDb } = await import("../server/db/bun-db");
initBunDb();

const { upsertTitles } = await import("../server/db/repository/titles");
const { upsertEpisodes } = await import("../server/db/repository/episodes");
const { trackTitle } = await import("../server/db/repository/tracked");
const { updateUserAdmin, setKioskToken, setWatchlistShareToken } =
  await import("../server/db/repository/users");
const { makeParsedTitle } = await import("../server/test-utils/fixtures");

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

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

await updateUserAdmin(seedUserId, true);

await trackTitle(MOVIE_ID_1, seedUserId);
await trackTitle(MOVIE_ID_2, seedUserId);
await trackTitle(SHOW_ID, seedUserId);
await trackTitle(MOVIE_ID_1, friendUserId);
await trackTitle(SHOW_ID, friendUserId);

await setKioskToken(seedUserId, KIOSK_TOKEN);
await setWatchlistShareToken(seedUserId, SHARE_TOKEN);

console.log(
  `[db-seed] Seeded: titles, episodes, tracking, admin, tokens (achievement key: ${ACHIEVEMENT_KEY})`,
);
