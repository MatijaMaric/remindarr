/**
 * Bun-native DB seed script for UX review.
 *
 * This runs as a subprocess from global-setup.ts (which runs in Node.js under
 * Playwright). It must be executed with Bun because it imports bun:sqlite
 * transitively via server/db/bun-db.ts.
 *
 * Usage: bun run ux-review/db-seed.ts --seed-user-id=X --friend-user-id=Y [--extra-user-ids=A,B]
 *
 * Catalog metadata (posters, backdrops, genres, scores, offers) comes from
 * fixtures/catalog.json — real public TMDB data so screenshots look like the
 * live app. Episodes, watch history, ratings and recommendations are generated
 * deterministically relative to "today" so the calendar and home rows are
 * always populated.
 */
import fs from "node:fs";
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
const extraUserIds = (
  args.find((a) => a.startsWith("--extra-user-ids="))?.split("=")[1] ?? ""
)
  .split(",")
  .filter(Boolean);

process.env.DB_PATH ??= path.resolve(UX_DB_PATH);
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
const {
  upsertEpisodes,
  watchEpisode,
  setWatchedEpisodeWatchedAt,
  getEpisodeIdsBySE,
} = await import("../server/db/repository/episodes");
const { trackTitle, updateTrackedStatus } =
  await import("../server/db/repository/tracked");
const { updateUserAdmin, setKioskToken, setWatchlistShareToken } =
  await import("../server/db/repository/users");
const { updateProfilePublic, updateUserBio } =
  await import("../server/db/repository/profile");
const { follow } = await import("../server/db/repository/follows");
const { upsertUserAchievement } =
  await import("../server/db/repository/achievements");
const { watchTitle, setWatchedTitleWatchedAt } =
  await import("../server/db/repository/watched-titles");
const { logWatchBulk } = await import("../server/db/repository/watch-history");
const { rateTitle, rateEpisode } =
  await import("../server/db/repository/ratings");
const { createRecommendation } =
  await import("../server/db/repository/recommendations");
const { pinTitle } = await import("../server/db/repository/pinned");
const { setTags } = await import("../server/db/repository/tags");
const { recomputeStreakFromHistory } =
  await import("../server/db/repository/streaks");
const { makeParsedTitle, makeParsedOffer } =
  await import("../server/test-utils/fixtures");

type ParsedTitle = ReturnType<typeof makeParsedTitle>;
type ParsedOffer = ReturnType<typeof makeParsedOffer>;
type CatalogTitle = Omit<ParsedTitle, "offers"> & {
  offers: Pick<
    ParsedOffer,
    | "providerId"
    | "providerName"
    | "providerTechnicalName"
    | "providerIconUrl"
    | "monetizationType"
    | "url"
  >[];
};
type EpisodeRow = Parameters<typeof upsertEpisodes>[0][number];
type WatchRow = Parameters<typeof logWatchBulk>[0][number];
type Status = Parameters<typeof updateTrackedStatus>[2];
type Rating = Parameters<typeof rateTitle>[2];

const DAY = 86_400_000;
const now = Date.now();
const isoDate = (offsetDays: number) =>
  new Date(now + offsetDays * DAY).toISOString().slice(0, 10);
const isoTime = (offsetDays: number, hour = 20) =>
  `${isoDate(offsetDays)}T${String(hour).padStart(2, "0")}:00:00.000Z`;
const today = isoDate(0);
const yesterday = isoDate(-1);

// ── Catalog ──────────────────────────────────────────────────────────────────
const catalog = (
  JSON.parse(
    fs.readFileSync(
      path.join(import.meta.dir, "fixtures/catalog.json"),
      "utf8",
    ),
  ) as CatalogTitle[]
).filter((t) => t.id !== SHOW_ID); // tv-1399 is defined below with a fixed shape

// Recent releases move into the future so "Coming up" rows and the calendar's
// movie entries always have something to show.
const UPCOMING_MOVIE_OFFSETS: Record<string, number> = {
  "movie-1318447": 3, // Apex
  "movie-1007757": 9, // Swapped
  "movie-1380291": 17, // Jack Ryan: Ghost War
  "movie-1630423": 26, // My Dearest Assassin
};

function toParsed(t: CatalogTitle): ParsedTitle {
  const upcoming = UPCOMING_MOVIE_OFFSETS[t.id];
  const releaseDate = upcoming == null ? t.releaseDate : isoDate(upcoming);
  return makeParsedTitle({
    ...t,
    releaseDate,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : t.releaseYear,
    offers: t.offers.map((o) => makeParsedOffer({ ...o, titleId: t.id })),
  });
}

await upsertTitles([
  makeParsedTitle({
    id: MOVIE_ID_1,
    objectType: "MOVIE",
    title: "The Matrix",
    tmdbId: "603",
    imdbId: "tt0133093",
    releaseYear: 1999,
    releaseDate: "1999-03-31",
    runtimeMinutes: 136,
    shortDescription:
      "A hacker learns the world he lives in is a simulation and joins a rebellion against the machines that built it.",
    genres: ["Action", "Science Fiction"],
    posterUrl:
      "https://image.tmdb.org/t/p/w342/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    scores: { imdbScore: 8.7, imdbVotes: 2_100_000, tmdbScore: 8.2 },
    offers: [makeParsedOffer({ titleId: MOVIE_ID_1 })],
  }),
  makeParsedTitle({
    id: MOVIE_ID_2,
    objectType: "MOVIE",
    title: "Pulp Fiction",
    tmdbId: "680",
    imdbId: "tt0110912",
    releaseYear: 1994,
    releaseDate: "1994-10-14",
    runtimeMinutes: 154,
    shortDescription:
      "Hitmen, a boxer and a gangster's wife cross paths in four intertwined tales of Los Angeles crime.",
    genres: ["Crime", "Thriller"],
    posterUrl:
      "https://image.tmdb.org/t/p/w342/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
    scores: { imdbScore: 8.9, imdbVotes: 2_200_000, tmdbScore: 8.5 },
  }),
  makeParsedTitle({
    id: MOVIE_ID_3,
    objectType: "MOVIE",
    title: "The Shawshank Redemption",
    tmdbId: "278",
    imdbId: "tt0111161",
    releaseYear: 1994,
    releaseDate: "1994-09-23",
    runtimeMinutes: 142,
    shortDescription:
      "Two imprisoned men bond over decades, finding solace and eventual redemption through acts of common decency.",
    genres: ["Drama", "Crime"],
    posterUrl:
      "https://image.tmdb.org/t/p/w342/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
    scores: { imdbScore: 9.3, imdbVotes: 2_900_000, tmdbScore: 8.7 },
  }),
  makeParsedTitle({
    id: SHOW_ID,
    objectType: "SHOW",
    title: "Game of Thrones",
    tmdbId: "1399",
    imdbId: "tt0944947",
    releaseYear: 2011,
    releaseDate: "2011-04-17",
    runtimeMinutes: 60,
    shortDescription:
      "Noble families fight for control of the Iron Throne while an ancient threat gathers beyond the Wall.",
    genres: ["Drama", "Sci-Fi & Fantasy", "Action & Adventure"],
    posterUrl:
      "https://image.tmdb.org/t/p/w342/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    scores: { imdbScore: 9.2, imdbVotes: 2_300_000, tmdbScore: 8.5 },
  }),
  ...catalog.map(toParsed),
]);

const movieIds = [
  MOVIE_ID_1,
  MOVIE_ID_2,
  MOVIE_ID_3,
  ...catalog.filter((t) => t.objectType === "MOVIE").map((t) => t.id),
];
const releasedMovieIds = movieIds.filter(
  (id) => UPCOMING_MOVIE_OFFSETS[id] == null,
);
const showIds = [
  SHOW_ID,
  ...catalog.filter((t) => t.objectType === "SHOW").map((t) => t.id),
];

// ── Episodes ─────────────────────────────────────────────────────────────────
// tv-1399 keeps the original fixed shape (S1 aired yesterday, S2 airs today)
// because capture.spec.ts deep-links to S1E1. Every other show gets 2–3
// seasons of 8 episodes: older seasons a year or more back, the current
// season airing weekly around today, each show on a different weekday.
const EPISODE_NAMES = [
  "Crossroads",
  "Fault Lines",
  "Homecoming",
  "Point of No Return",
  "Undertow",
  "Blind Spot",
  "Second Chances",
  "Open Water",
  "Smoke and Mirrors",
  "Lights Out",
  "Last Call",
  "The Long Night",
  "Aftermath",
  "Ghosts",
  "Reckoning",
];
const EPISODES_PER_SEASON = 8;

const episodes: EpisodeRow[] = [];
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

// currentEp is the episode of the current season airing this week
// (1 = premiere this week, 8 = finale this week).
const showPlan = showIds.slice(1).map((id, i) => ({
  id,
  index: i,
  seasons: 2 + (i % 2),
  currentEp: 1 + ((i * 3) % EPISODES_PER_SEASON),
  weekdayShift: (i % 7) - 3,
}));
type ShowPlan = (typeof showPlan)[number];

function airOffset(plan: ShowPlan, season: number, episode: number): number {
  if (season === plan.seasons)
    return (episode - plan.currentEp) * 7 + plan.weekdayShift;
  return -365 * (plan.seasons - season) - (EPISODES_PER_SEASON - episode) * 7;
}

for (const plan of showPlan) {
  for (let s = 1; s <= plan.seasons; s++) {
    for (let e = 1; e <= EPISODES_PER_SEASON; e++) {
      episodes.push({
        title_id: plan.id,
        season_number: s,
        episode_number: e,
        name:
          s === 1 && e === 1
            ? "Pilot"
            : EPISODE_NAMES[
                (plan.index * 5 + s * 3 + e) % EPISODE_NAMES.length
              ],
        overview: `Season ${s}, episode ${e}. Old alliances are tested as the stakes rise.`,
        air_date: isoDate(airOffset(plan, s, e)),
        still_path: null,
        runtime_minutes: 42 + ((plan.index + e) % 4) * 6,
      });
    }
  }
}
await upsertEpisodes(episodes);

// ── Seed user: tracking and statuses ─────────────────────────────────────────
await updateUserAdmin(seedUserId, true);
await updateUserBio(
  seedUserId,
  "Mostly crime dramas and anything with a good heist. Currently catching up on The Boys.",
);

// Track most of the catalog; leave a few untracked so title pages also show
// the "Track" state.
const seedTracked = new Set([
  ...movieIds.filter((id) => id !== MOVIE_ID_3).slice(0, 9),
  ...showIds.slice(0, 11),
]);
for (const id of seedTracked) await trackTitle(id, seedUserId);

// Keyed by showPlan index.
const SHOW_STATUS: Record<number, Status> = {
  0: "watching",
  1: "watching",
  2: "on_hold",
  3: "watching",
  4: "dropped",
  5: "watching",
  6: "plan_to_watch",
  7: "watching",
  8: "completed",
  9: "watching",
};
for (const plan of showPlan) {
  const status = SHOW_STATUS[plan.index];
  if (status && seedTracked.has(plan.id))
    await updateTrackedStatus(plan.id, seedUserId, status);
}

// ── Watch history ────────────────────────────────────────────────────────────
const historyRows: WatchRow[] = [];

async function watchEpisodes(
  userId: string,
  plan: ShowPlan,
  watched: { season: number; episode: number; offset: number }[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const [n, w] of watched.entries()) {
    const [id] = await getEpisodeIdsBySE(plan.id, [w]);
    if (id == null) continue;
    const watchedAt = isoTime(w.offset, 18 + (n % 5));
    await watchEpisode(id, userId);
    await setWatchedEpisodeWatchedAt(id, userId, watchedAt);
    historyRows.push({ userId, titleId: plan.id, episodeId: id, watchedAt });
    ids.push(id);
  }
  return ids;
}

// Seed user: earlier seasons binged months ago, current season watched up to
// two episodes behind, so "Up next" and "Unwatched" always have content.
const seedWatchedEpisodeIds: number[] = [];
for (const plan of showPlan) {
  const status = SHOW_STATUS[plan.index];
  if (!seedTracked.has(plan.id) || !status || status === "plan_to_watch")
    continue;
  const watched: { season: number; episode: number; offset: number }[] = [];
  for (let s = 1; s <= plan.seasons; s++) {
    const isCurrent = s === plan.seasons;
    const upTo = !isCurrent
      ? EPISODES_PER_SEASON
      : status === "completed"
        ? plan.currentEp
        : status === "watching"
          ? Math.max(0, plan.currentEp - 2)
          : 0;
    for (let e = 1; e <= upTo; e++) {
      const offset = isCurrent
        ? Math.min(-1, airOffset(plan, s, e) + 1)
        : -330 + plan.index * 19 + s * 9 + e * 2;
      watched.push({ season: s, episode: e, offset });
    }
  }
  seedWatchedEpisodeIds.push(
    ...(await watchEpisodes(seedUserId, plan, watched)),
  );
}

// Movies: watched across the last ten months.
const seedWatchedMovies = [MOVIE_ID_1, MOVIE_ID_2, ...releasedMovieIds.slice(3)]
  .filter((id) => seedTracked.has(id))
  .slice(0, 5);
for (const [n, id] of seedWatchedMovies.entries()) {
  const watchedAt = isoTime(-(12 + n * 58), 21);
  await watchTitle(id, seedUserId);
  await setWatchedTitleWatchedAt(id, seedUserId, watchedAt);
  historyRows.push({ userId: seedUserId, titleId: id, watchedAt });
}

// ── Friends ──────────────────────────────────────────────────────────────────
const friends = [friendUserId, ...extraUserIds];
const FRIEND_BIOS = [
  "Sci-fi first, questions later.",
  "K-dramas and variety shows. Running Man forever.",
  "Procedurals on repeat. Law & Order is comfort food.",
  "Will watch anything with a heist in it.",
];

for (const [n, uid] of friends.entries()) {
  await updateProfilePublic(uid, "public");
  await updateUserBio(uid, FRIEND_BIOS[n % FRIEND_BIOS.length]);

  // Each friend tracks a different, overlapping slice of the catalog.
  for (const [k, id] of [...movieIds, ...showIds].entries()) {
    if ((k + n) % 3 !== 0) await trackTitle(id, uid);
  }

  // A few movies each, at different times, for the leaderboard and feed.
  const movies = releasedMovieIds
    .filter((_, k) => (k + n) % 2 === 0)
    .slice(0, 3 + n);
  for (const [k, id] of movies.entries()) {
    const watchedAt = isoTime(-(1 + k * 6 + n * 2), 17 + n);
    await watchTitle(id, uid);
    await setWatchedTitleWatchedAt(id, uid, watchedAt);
    historyRows.push({ userId: uid, titleId: id, watchedAt });
  }

  // Recent episodes of two shows each.
  for (const plan of showPlan.slice(n * 2, n * 2 + 2)) {
    const upTo = Math.max(1, plan.currentEp - 1);
    await watchEpisodes(
      uid,
      plan,
      Array.from({ length: upTo }, (_, e) => ({
        season: plan.seasons,
        episode: e + 1,
        offset: Math.min(-1, airOffset(plan, plan.seasons, e + 1) + 1),
      })),
    );
  }

  await follow(seedUserId, uid);
  await follow(uid, seedUserId);
}
// Friends follow each other too so their profiles show social counts.
for (const a of friends) {
  for (const b of friends) if (a !== b) await follow(a, b);
}

await logWatchBulk(historyRows);

// ── Ratings, recommendations, pins, tags ─────────────────────────────────────
const RATINGS: Rating[] = [
  "LOVE",
  "LIKE",
  "LOVE",
  "LIKE",
  "DISLIKE",
  "LOVE",
  "HATE",
  "LIKE",
];
for (const [n, id] of [
  ...seedWatchedMovies,
  ...showIds.slice(0, 4),
].entries()) {
  await rateTitle(seedUserId, id, RATINGS[n % RATINGS.length]);
}
for (const [n, uid] of friends.entries()) {
  for (const [k, id] of [
    MOVIE_ID_1,
    SHOW_ID,
    ...showIds.slice(1, 4),
  ].entries()) {
    await rateTitle(uid, id, RATINGS[(k + n * 3) % RATINGS.length]);
  }
}
for (const [n, id] of seedWatchedEpisodeIds.slice(-12).entries()) {
  await rateEpisode(
    seedUserId,
    id,
    RATINGS[n % RATINGS.length],
    n % 4 === 0 ? "That last scene. Did not see it coming." : undefined,
  );
}

const RECOMMENDATIONS: [number, string, string][] = [
  [0, MOVIE_ID_3, "If you haven't seen this yet, drop everything."],
  [1, showIds[1] ?? SHOW_ID, "Season finale was unreal."],
  [2, releasedMovieIds[4] ?? MOVIE_ID_2, "Perfect Friday night pick."],
  [3, showIds[6] ?? SHOW_ID, "Slow first episode, stick with it."],
  [0, showIds[12] ?? SHOW_ID, "Funniest thing I've watched all year."],
];
for (const [fromIdx, titleId, message] of RECOMMENDATIONS) {
  await createRecommendation(
    friends[fromIdx % friends.length],
    titleId,
    message,
    seedUserId,
  );
}
await createRecommendation(seedUserId, MOVIE_ID_1, "Still holds up.");

await pinTitle(seedUserId, showIds[1] ?? SHOW_ID);
await pinTitle(seedUserId, MOVIE_ID_1);
await setTags(seedUserId, showIds[1] ?? SHOW_ID, ["weekend", "with friends"]);
await setTags(seedUserId, MOVIE_ID_2, ["rewatch"]);

await recomputeStreakFromHistory(seedUserId);

await setKioskToken(seedUserId, KIOSK_TOKEN);
await setWatchlistShareToken(seedUserId, SHARE_TOKEN);

// #918: Seed profile is public so overlap and achievement pages work.
await updateProfilePublic(seedUserId, "public");

// #903/#904: Seed an earned achievement for ux_seed so the achievements page
// and achievement detail page have content to render.
await upsertUserAchievement(
  seedUserId,
  ACHIEVEMENT_KEY,
  10,
  new Date(Date.now() - 7 * 86_400_000).toISOString(),
);

console.log(
  `[db-seed] Seeded ${movieIds.length} movies, ${showIds.length} shows, ${episodes.length} episodes, ${historyRows.length} watches, ${friends.length} friends (achievement: ${ACHIEVEMENT_KEY})`,
);
