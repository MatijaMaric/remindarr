import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import {
  upsertTitles,
  createUser,
  trackTitle,
  upsertEpisodes,
  watchEpisode,
  watchEpisodesBulk,
  updateTrackedStatus,
  watchTitle,
} from "../repository";
import {
  getTrackedTitles,
  getReleasedUnwatchedTrackedMovies,
  getUpcomingTrackedMoviesOpen,
  MAX_TRACKED_LOAD,
} from "./tracked";
import { getWatchedTitleIds } from "./watched-titles";
import { getRawDb } from "../bun-db";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

// Helper: insert episodes for a title and return their DB ids
async function insertEpisodes(
  titleId: string,
  eps: { season: number; episode: number; airDate: string | null }[],
): Promise<number[]> {
  await upsertEpisodes(
    eps.map((e) => ({
      title_id: titleId,
      season_number: e.season,
      episode_number: e.episode,
      name: `S${e.season}E${e.episode}`,
      overview: null,
      air_date: e.airDate,
      still_path: null,
    })),
  );

  // Retrieve inserted episode ids
  const db = getRawDb();
  const rows = db
    .prepare(
      `SELECT id, season_number, episode_number FROM episodes WHERE title_id = ? ORDER BY season_number, episode_number`,
    )
    .all(titleId) as {
    id: number;
    season_number: number;
    episode_number: number;
  }[];
  return rows.map((r) => r.id);
}

describe("getTrackedTitles show_status", () => {
  it("returns 'completed' when all episodes released and watched", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "show-1",
        objectType: "SHOW",
        title: "Completed Show",
      }),
    ]);
    await trackTitle("show-1", userId);

    // All episodes have past air dates
    const epIds = await insertEpisodes("show-1", [
      { season: 1, episode: 1, airDate: "2020-01-01" },
      { season: 1, episode: 2, airDate: "2020-01-08" },
      { season: 1, episode: 3, airDate: "2020-01-15" },
    ]);

    // Watch all episodes
    await watchEpisodesBulk(epIds, userId);

    const titles = await getTrackedTitles(userId);
    const show = titles.find((t) => t.id === "show-1");
    expect(show).toBeDefined();
    expect(show!.show_status).toBe("completed");
    expect(show!.released_episodes_count).toBe(3);
    expect(show!.latest_released_air_date).toBe("2020-01-15");
    expect(show!.next_episode_air_date).toBeNull();
  });

  it("returns 'caught_up' when all released episodes watched but more coming", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "show-2",
        objectType: "SHOW",
        title: "Caught Up Show",
      }),
    ]);
    await trackTitle("show-2", userId);

    // 2 released episodes + 1 future episode
    const epIds = await insertEpisodes("show-2", [
      { season: 1, episode: 1, airDate: "2020-01-01" },
      { season: 1, episode: 2, airDate: "2020-01-08" },
      { season: 1, episode: 3, airDate: "2099-12-31" },
    ]);

    // Watch only the released ones
    await watchEpisodesBulk([epIds[0], epIds[1]], userId);

    const titles = await getTrackedTitles(userId);
    const show = titles.find((t) => t.id === "show-2");
    expect(show).toBeDefined();
    expect(show!.show_status).toBe("caught_up");
    expect(show!.released_episodes_count).toBe(2);
    expect(show!.total_episodes).toBe(3);
    expect(show!.watched_episodes_count).toBe(2);
    expect(show!.next_episode_air_date).toBe("2099-12-31");
  });

  it("returns 'watching' when released episodes exist but not all watched", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "show-3",
        objectType: "SHOW",
        title: "Watching Show",
      }),
    ]);
    await trackTitle("show-3", userId);

    const epIds = await insertEpisodes("show-3", [
      { season: 1, episode: 1, airDate: "2020-01-01" },
      { season: 1, episode: 2, airDate: "2020-01-08" },
      { season: 1, episode: 3, airDate: "2020-01-15" },
    ]);

    // Watch only the first episode
    await watchEpisode(epIds[0], userId);

    const titles = await getTrackedTitles(userId);
    const show = titles.find((t) => t.id === "show-3");
    expect(show).toBeDefined();
    expect(show!.show_status).toBe("watching");
    expect(show!.released_episodes_count).toBe(3);
    expect(show!.watched_episodes_count).toBe(1);
  });

  it("returns 'not_started' when episodes released but none watched", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "show-4",
        objectType: "SHOW",
        title: "Not Started Show",
      }),
    ]);
    await trackTitle("show-4", userId);

    await insertEpisodes("show-4", [
      { season: 1, episode: 1, airDate: "2020-01-01" },
      { season: 1, episode: 2, airDate: "2020-01-08" },
    ]);

    const titles = await getTrackedTitles(userId);
    const show = titles.find((t) => t.id === "show-4");
    expect(show).toBeDefined();
    expect(show!.show_status).toBe("not_started");
    expect(show!.released_episodes_count).toBe(2);
    expect(show!.watched_episodes_count).toBe(0);
  });

  it("returns 'unreleased' when no episodes have been released yet", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "show-5",
        objectType: "SHOW",
        title: "Unreleased Show",
      }),
    ]);
    await trackTitle("show-5", userId);

    // All episodes in the future
    await insertEpisodes("show-5", [
      { season: 1, episode: 1, airDate: "2099-01-01" },
      { season: 1, episode: 2, airDate: "2099-01-08" },
    ]);

    const titles = await getTrackedTitles(userId);
    const show = titles.find((t) => t.id === "show-5");
    expect(show).toBeDefined();
    expect(show!.show_status).toBe("unreleased");
    expect(show!.released_episodes_count).toBe(0);
    expect(show!.next_episode_air_date).toBe("2099-01-01");
  });

  it("returns null show_status for movies", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "movie-1",
        objectType: "MOVIE",
        title: "Test Movie",
      }),
    ]);
    await trackTitle("movie-1", userId);

    const titles = await getTrackedTitles(userId);
    const movie = titles.find((t) => t.id === "movie-1");
    expect(movie).toBeDefined();
    expect(movie!.show_status).toBeNull();
    expect(movie!.released_episodes_count).toBe(0);
  });

  it("returns 'unreleased' for show with no episodes at all", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "show-6",
        objectType: "SHOW",
        title: "Empty Show",
      }),
    ]);
    await trackTitle("show-6", userId);

    const titles = await getTrackedTitles(userId);
    const show = titles.find((t) => t.id === "show-6");
    expect(show).toBeDefined();
    expect(show!.show_status).toBe("unreleased");
    expect(show!.released_episodes_count).toBe(0);
    expect(show!.total_episodes).toBe(0);
  });
});

describe("getTrackedTitles soft cap", () => {
  // Seed 5 tracked titles with distinct tracked_at values (cap-1 oldest .. cap-5 newest)
  async function seedFiveTracked() {
    const ids = ["cap-1", "cap-2", "cap-3", "cap-4", "cap-5"];
    await upsertTitles(
      ids.map((id) =>
        makeParsedTitle({ id, objectType: "MOVIE", title: `Cap ${id}` }),
      ),
    );
    const db = getRawDb();
    for (const [i, id] of ids.entries()) {
      await trackTitle(id, userId);
      db.prepare(
        `UPDATE tracked SET tracked_at = ? WHERE title_id = ? AND user_id = ?`,
      ).run(`2024-01-0${i + 1} 00:00:00`, id, userId);
    }
    return ids;
  }

  it("returns at most opts.limit rows, keeping the most recently tracked", async () => {
    await seedFiveTracked();

    const results = await getTrackedTitles(userId, { limit: 3 });
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.id)).toEqual(["cap-5", "cap-4", "cap-3"]);
  });

  it("returns all rows by default when under MAX_TRACKED_LOAD", async () => {
    await seedFiveTracked();

    const results = await getTrackedTitles(userId);
    expect(MAX_TRACKED_LOAD).toBeGreaterThan(5);
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.id)).toEqual([
      "cap-5",
      "cap-4",
      "cap-3",
      "cap-2",
      "cap-1",
    ]);
  });
});

describe("updateTrackedStatus — watched_titles sync for movies", () => {
  it("inserts into watched_titles when status set to 'completed' for a MOVIE", async () => {
    await upsertTitles([makeParsedTitle({ id: "st-m1", objectType: "MOVIE" })]);
    await trackTitle("st-m1", userId);
    await updateTrackedStatus("st-m1", userId, "completed");

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("st-m1")).toBe(true);
  });

  it("deletes from watched_titles when status set to 'plan_to_watch' for a MOVIE", async () => {
    await upsertTitles([makeParsedTitle({ id: "st-m2", objectType: "MOVIE" })]);
    await trackTitle("st-m2", userId);
    await updateTrackedStatus("st-m2", userId, "completed");
    await updateTrackedStatus("st-m2", userId, "plan_to_watch");

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("st-m2")).toBe(false);
  });

  it("deletes from watched_titles when status cleared to null for a MOVIE", async () => {
    await upsertTitles([makeParsedTitle({ id: "st-m3", objectType: "MOVIE" })]);
    await trackTitle("st-m3", userId);
    await updateTrackedStatus("st-m3", userId, "completed");
    await updateTrackedStatus("st-m3", userId, null);

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("st-m3")).toBe(false);
  });

  it("does NOT touch watched_titles when status set to 'completed' for a SHOW", async () => {
    await upsertTitles([makeParsedTitle({ id: "st-s1", objectType: "SHOW" })]);
    await trackTitle("st-s1", userId);
    await updateTrackedStatus("st-s1", userId, "completed");

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("st-s1")).toBe(false);
  });
});

describe("getReleasedUnwatchedTrackedMovies", () => {
  it("returns a released tracked unwatched movie", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "ruw-1",
        objectType: "MOVIE",
        title: "Released Unwatched",
        releaseDate: "2020-01-01",
      }),
    ]);
    await trackTitle("ruw-1", userId);

    const results = await getReleasedUnwatchedTrackedMovies(userId);
    expect(results.some((r) => r.id === "ruw-1")).toBe(true);
  });

  it("excludes a movie that has been marked watched", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "ruw-2",
        objectType: "MOVIE",
        title: "Watched Movie",
        releaseDate: "2020-01-01",
      }),
    ]);
    await trackTitle("ruw-2", userId);
    await watchTitle("ruw-2", userId);

    const results = await getReleasedUnwatchedTrackedMovies(userId);
    expect(results.some((r) => r.id === "ruw-2")).toBe(false);
  });

  it("excludes an upcoming movie (release_date in the future)", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "ruw-3",
        objectType: "MOVIE",
        title: "Upcoming Movie",
        releaseDate: "2099-12-31",
      }),
    ]);
    await trackTitle("ruw-3", userId);

    const results = await getReleasedUnwatchedTrackedMovies(userId);
    expect(results.some((r) => r.id === "ruw-3")).toBe(false);
  });

  it("excludes a movie with null release_date", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "ruw-4",
        objectType: "MOVIE",
        title: "No Date Movie",
        releaseDate: null,
      }),
    ]);
    await trackTitle("ruw-4", userId);

    const results = await getReleasedUnwatchedTrackedMovies(userId);
    expect(results.some((r) => r.id === "ruw-4")).toBe(false);
  });

  it("excludes tracked shows", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "ruw-5",
        objectType: "SHOW",
        title: "A Show",
        releaseDate: "2020-01-01",
      }),
    ]);
    await trackTitle("ruw-5", userId);

    const results = await getReleasedUnwatchedTrackedMovies(userId);
    expect(results.some((r) => r.id === "ruw-5")).toBe(false);
  });

  it("returns results sorted by release_date descending", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "ruw-6a",
        objectType: "MOVIE",
        title: "Older",
        releaseDate: "2021-01-01",
      }),
      makeParsedTitle({
        id: "ruw-6b",
        objectType: "MOVIE",
        title: "Newer",
        releaseDate: "2022-06-01",
      }),
    ]);
    await trackTitle("ruw-6a", userId);
    await trackTitle("ruw-6b", userId);

    const results = await getReleasedUnwatchedTrackedMovies(userId);
    const ids = results
      .filter((r) => r.id === "ruw-6a" || r.id === "ruw-6b")
      .map((r) => r.id);
    expect(ids[0]).toBe("ruw-6b");
    expect(ids[1]).toBe("ruw-6a");
  });

  it("excludes movies tracked by a different user", async () => {
    const otherId = await createUser("other-user-ruw", "hash");
    await upsertTitles([
      makeParsedTitle({
        id: "ruw-7",
        objectType: "MOVIE",
        title: "Other User Movie",
        releaseDate: "2020-01-01",
      }),
    ]);
    await trackTitle("ruw-7", otherId);

    const results = await getReleasedUnwatchedTrackedMovies(userId);
    expect(results.some((r) => r.id === "ruw-7")).toBe(false);
  });
});

describe("getUpcomingTrackedMoviesOpen", () => {
  it("returns a tracked movie with a future release date", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "upc-1",
        objectType: "MOVIE",
        title: "Future Movie",
        releaseDate: "2099-06-01",
      }),
    ]);
    await trackTitle("upc-1", userId);

    const results = await getUpcomingTrackedMoviesOpen(userId);
    expect(results.some((r) => r.id === "upc-1")).toBe(true);
  });

  it("excludes movies with a past release date", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "upc-2",
        objectType: "MOVIE",
        title: "Past Movie",
        releaseDate: "2020-01-01",
      }),
    ]);
    await trackTitle("upc-2", userId);

    const results = await getUpcomingTrackedMoviesOpen(userId);
    expect(results.some((r) => r.id === "upc-2")).toBe(false);
  });

  it("excludes movies with null release_date", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "upc-3",
        objectType: "MOVIE",
        title: "No Date",
        releaseDate: null,
      }),
    ]);
    await trackTitle("upc-3", userId);

    const results = await getUpcomingTrackedMoviesOpen(userId);
    expect(results.some((r) => r.id === "upc-3")).toBe(false);
  });

  it("excludes tracked shows", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "upc-4",
        objectType: "SHOW",
        title: "Future Show",
        releaseDate: "2099-01-01",
      }),
    ]);
    await trackTitle("upc-4", userId);

    const results = await getUpcomingTrackedMoviesOpen(userId);
    expect(results.some((r) => r.id === "upc-4")).toBe(false);
  });

  it("returns results sorted by release_date ascending", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "upc-5a",
        objectType: "MOVIE",
        title: "Later",
        releaseDate: "2099-12-01",
      }),
      makeParsedTitle({
        id: "upc-5b",
        objectType: "MOVIE",
        title: "Sooner",
        releaseDate: "2099-06-01",
      }),
    ]);
    await trackTitle("upc-5a", userId);
    await trackTitle("upc-5b", userId);

    const results = await getUpcomingTrackedMoviesOpen(userId);
    const ids = results
      .filter((r) => r.id === "upc-5a" || r.id === "upc-5b")
      .map((r) => r.id);
    expect(ids[0]).toBe("upc-5b");
    expect(ids[1]).toBe("upc-5a");
  });
});
