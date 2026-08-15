import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../../test-utils/fixtures";
import { upsertTitles, createUser, upsertEpisodes } from "../repository";
import { logWatch } from "./watch-history";
import { getYearInReview } from "./year-in-review";
import { getRawDb } from "../bun-db";
import { initCache } from "../../cache";
import { MemoryCache } from "../../cache/memory";

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  setupTestDb();
  initCache(new MemoryCache(100, 60_000));
  userId = await createUser("wrappeduser", "hash");
  otherUserId = await createUser("otheruser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

async function insertShow(
  id: string,
  title: string,
  runtimeMinutes: number | null = 45,
  genres: string[] = ["Drama"],
  offers: ReturnType<typeof makeParsedOffer>[] = [],
) {
  await upsertTitles([
    makeParsedTitle({
      id,
      objectType: "SHOW",
      title,
      runtimeMinutes,
      genres,
      offers,
    }),
  ]);
}

async function insertMovie(
  id: string,
  title: string,
  runtimeMinutes: number | null = 120,
  genres: string[] = ["Action"],
  offers: ReturnType<typeof makeParsedOffer>[] = [],
) {
  await upsertTitles([
    makeParsedTitle({
      id,
      objectType: "MOVIE",
      title,
      runtimeMinutes,
      genres,
      offers,
    }),
  ]);
}

async function insertEpisode(
  showId: string,
  season: number,
  episode: number,
  airDate: string,
): Promise<number> {
  await upsertEpisodes([
    {
      title_id: showId,
      season_number: season,
      episode_number: episode,
      name: `S${season}E${episode}`,
      overview: null,
      air_date: airDate,
      still_path: null,
    },
  ]);
  const db = getRawDb();
  const row = db
    .prepare(
      `SELECT id FROM episodes WHERE title_id = ? AND season_number = ? AND episode_number = ?`,
    )
    .get(showId, season, episode) as { id: number } | undefined;
  if (!row) throw new Error("Episode not found after insert");
  return row.id;
}

function watchMovie(titleId: string, watchedAt: string, uid = userId) {
  const db = getRawDb();
  db.prepare(
    "INSERT INTO watched_titles (title_id, user_id, watched_at) VALUES (?, ?, ?)",
  ).run(titleId, uid, watchedAt);
}

function watchEp(episodeId: number, watchedAt: string, uid = userId) {
  const db = getRawDb();
  db.prepare(
    "INSERT INTO watched_episodes (episode_id, user_id, watched_at) VALUES (?, ?, ?)",
  ).run(episodeId, uid, watchedAt);
}

describe("getYearInReview", () => {
  it("returns zeros and nulls when the user has no watches that year", async () => {
    const review = await getYearInReview(userId, 2025);
    expect(review.year).toBe(2025);
    expect(review.movies_watched).toBe(0);
    expect(review.episodes_watched).toBe(0);
    expect(review.watch_time_minutes).toBe(0);
    expect(review.watch_time_minutes_movies).toBe(0);
    expect(review.watch_time_minutes_shows).toBe(0);
    expect(review.top_genres).toEqual([]);
    expect(review.top_providers).toEqual([]);
    expect(review.top_shows).toEqual([]);
    expect(review.longest_binge).toBeNull();
    expect(review.most_rewatched).toBeNull();
    expect(review.first_watch).toBeNull();
    expect(review.last_watch).toBeNull();
    expect(review.years).toEqual([]);
  });

  it("counts movies and episodes only inside the requested year", async () => {
    await insertMovie("movie-in", "In Year", 100);
    await insertMovie("movie-out", "Out Year", 90);
    await insertShow("show-1", "The Show", 40);
    const epIn = await insertEpisode("show-1", 1, 1, "2025-03-01");
    const epOut = await insertEpisode("show-1", 1, 2, "2024-03-01");

    watchMovie("movie-in", "2025-06-15 12:00:00");
    watchMovie("movie-out", "2024-06-15 12:00:00");
    watchEp(epIn, "2025-03-02 20:00:00");
    watchEp(epOut, "2024-03-02 20:00:00");

    const review = await getYearInReview(userId, 2025);
    expect(review.movies_watched).toBe(1);
    expect(review.episodes_watched).toBe(1);
    expect(review.watch_time_minutes_movies).toBe(100);
    expect(review.watch_time_minutes_shows).toBe(40);
    expect(review.watch_time_minutes).toBe(140);
    expect(review.years).toEqual([2025, 2024]);
  });

  it("does not include another user's watches", async () => {
    await insertMovie("movie-mine", "Mine", 80);
    await insertMovie("movie-theirs", "Theirs", 90);
    watchMovie("movie-mine", "2025-01-10 00:00:00", userId);
    watchMovie("movie-theirs", "2025-01-10 00:00:00", otherUserId);

    const review = await getYearInReview(userId, 2025);
    expect(review.movies_watched).toBe(1);
    expect(review.first_watch?.title_id).toBe("movie-mine");
  });

  it("ranks top genres from titles watched that year", async () => {
    await insertMovie("m1", "A", 90, ["Action", "Thriller"]);
    await insertMovie("m2", "B", 90, ["Action"]);
    await insertShow("s1", "C", 45, ["Drama"]);
    const ep = await insertEpisode("s1", 1, 1, "2025-01-01");
    watchMovie("m1", "2025-02-01 00:00:00");
    watchMovie("m2", "2025-02-02 00:00:00");
    watchEp(ep, "2025-02-03 00:00:00");

    const review = await getYearInReview(userId, 2025);
    expect(review.top_genres[0]).toEqual({ genre: "Action", count: 2 });
    expect(review.top_genres.map((g) => g.genre)).toContain("Drama");
  });

  it("ranks top providers from flatrate offers on watched titles", async () => {
    const netflix = makeParsedOffer({
      titleId: "m-net",
      providerId: 8,
      providerName: "Netflix",
    });
    const hulu = makeParsedOffer({
      titleId: "m-hulu",
      providerId: 15,
      providerName: "Hulu",
    });
    await insertMovie("m-net", "Netflix Movie", 100, ["Action"], [netflix]);
    await insertMovie(
      "m-both",
      "Both",
      100,
      ["Action"],
      [
        { ...netflix, titleId: "m-both" },
        { ...hulu, titleId: "m-both" },
      ],
    );
    watchMovie("m-net", "2025-04-01 00:00:00");
    watchMovie("m-both", "2025-04-02 00:00:00");

    const review = await getYearInReview(userId, 2025);
    expect(review.top_providers[0]).toMatchObject({
      name: "Netflix",
      count: 2,
    });
    expect(
      review.top_providers.some((p) => p.name === "Hulu" && p.count === 1),
    ).toBe(true);
  });

  it("ranks top shows by episode count", async () => {
    await insertShow("show-a", "Show A", 40);
    await insertShow("show-b", "Show B", 40);
    const a1 = await insertEpisode("show-a", 1, 1, "2025-01-01");
    const a2 = await insertEpisode("show-a", 1, 2, "2025-01-02");
    const a3 = await insertEpisode("show-a", 1, 3, "2025-01-03");
    const b1 = await insertEpisode("show-b", 1, 1, "2025-01-01");
    watchEp(a1, "2025-05-01 00:00:00");
    watchEp(a2, "2025-05-01 01:00:00");
    watchEp(a3, "2025-05-02 00:00:00");
    watchEp(b1, "2025-05-03 00:00:00");

    const review = await getYearInReview(userId, 2025);
    expect(review.top_shows[0]).toMatchObject({
      title_id: "show-a",
      title: "Show A",
      count: 3,
    });
    expect(review.top_shows[1]).toMatchObject({
      title_id: "show-b",
      count: 1,
    });
  });

  it("finds the longest binge as consecutive days on the same show", async () => {
    await insertShow("binge-show", "Binge Show", 40);
    const eps = [];
    for (let i = 1; i <= 4; i++) {
      eps.push(await insertEpisode("binge-show", 1, i, `2025-01-0${i}`));
    }
    watchEp(eps[0], "2025-07-01 20:00:00");
    watchEp(eps[1], "2025-07-02 20:00:00");
    watchEp(eps[2], "2025-07-03 20:00:00");
    watchEp(eps[3], "2025-07-10 20:00:00");

    const review = await getYearInReview(userId, 2025);
    expect(review.longest_binge).toMatchObject({
      title_id: "binge-show",
      title: "Binge Show",
      days: 3,
      episodes: 3,
    });
  });

  it("finds the most rewatched title from watch_history", async () => {
    await insertMovie("rewatch-me", "Rewatch Me", 90);
    await insertMovie("once", "Once", 90);
    watchMovie("rewatch-me", "2025-01-01 00:00:00");
    watchMovie("once", "2025-01-02 00:00:00");
    await logWatch(userId, "rewatch-me", undefined, "2025-01-01 00:00:00");
    await logWatch(userId, "rewatch-me", undefined, "2025-06-01 00:00:00");
    await logWatch(userId, "rewatch-me", undefined, "2025-09-01 00:00:00");
    await logWatch(userId, "once", undefined, "2025-01-02 00:00:00");

    const review = await getYearInReview(userId, 2025);
    expect(review.most_rewatched).toMatchObject({
      title_id: "rewatch-me",
      title: "Rewatch Me",
      plays: 3,
    });
  });

  it("returns first and last watch of the year", async () => {
    await insertMovie("first", "First Film", 90);
    await insertMovie("last", "Last Film", 90);
    watchMovie("first", "2025-01-05 08:00:00");
    watchMovie("last", "2025-12-20 22:00:00");

    const review = await getYearInReview(userId, 2025);
    expect(review.first_watch).toMatchObject({
      title_id: "first",
      title: "First Film",
    });
    expect(review.last_watch).toMatchObject({
      title_id: "last",
      title: "Last Film",
    });
  });

  it("serves a cached payload on the second call", async () => {
    await insertMovie("cached", "Cached", 90);
    watchMovie("cached", "2024-03-01 00:00:00");

    const first = await getYearInReview(userId, 2024);
    expect(first.movies_watched).toBe(1);

    // Insert after cache fill — past-year cache should ignore it
    await insertMovie("after-cache", "After", 90);
    watchMovie("after-cache", "2024-04-01 00:00:00");

    const second = await getYearInReview(userId, 2024);
    expect(second.movies_watched).toBe(1);
    expect(second.movies_watched).toBe(first.movies_watched);
  });
});
