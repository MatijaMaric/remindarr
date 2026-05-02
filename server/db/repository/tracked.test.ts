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
} from "../repository";
import { getTrackedTitles } from "./tracked";
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
    .all(titleId) as { id: number; season_number: number; episode_number: number }[];
  return rows.map((r) => r.id);
}

describe("getTrackedTitles show_status", () => {
  it("returns 'completed' when all episodes released and watched", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Completed Show" }),
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
      makeParsedTitle({ id: "show-2", objectType: "SHOW", title: "Caught Up Show" }),
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
      makeParsedTitle({ id: "show-3", objectType: "SHOW", title: "Watching Show" }),
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
      makeParsedTitle({ id: "show-4", objectType: "SHOW", title: "Not Started Show" }),
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
      makeParsedTitle({ id: "show-5", objectType: "SHOW", title: "Unreleased Show" }),
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
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", title: "Test Movie" }),
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
      makeParsedTitle({ id: "show-6", objectType: "SHOW", title: "Empty Show" }),
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
