import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import {
  createUser,
  upsertTitles,
  upsertEpisodes,
  watchEpisode,
  watchTitle,
  trackTitle,
  getTrackedTitles,
} from "../repository";
import { episodes, getDb } from "../schema";
import { getStatsOverview, getUserPace, computeEta } from "./stats";
import { computeYearInReview } from "./year-in-review";
import { syncEpisodesForShow } from "../../tmdb/sync";
import * as client from "../../tmdb/client";

let userId: string;
let showSpy: ReturnType<typeof spyOn<typeof client, "fetchShowDetails">>;
let seasonSpy: ReturnType<typeof spyOn<typeof client, "fetchSeasonEpisodes">>;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("runtime-viewer", "hash");
  await upsertTitles([
    makeParsedTitle({ id: "tv-123", objectType: "SHOW", runtimeMinutes: null }),
    makeParsedTitle({ id: "movie-1", runtimeMinutes: 136 }),
  ]);
  await trackTitle("tv-123", userId);
  showSpy = spyOn(client, "fetchShowDetails").mockResolvedValue({
    id: 123,
    name: "Show",
    status: "Returning Series",
    number_of_seasons: 1,
    next_episode_to_air: null,
    last_episode_to_air: null,
  });
  seasonSpy = spyOn(client, "fetchSeasonEpisodes").mockResolvedValue({
    id: 1,
    season_number: 1,
    episodes: [59, 31].map((runtime, index) => ({
      id: index + 1,
      season_number: 1,
      episode_number: index + 1,
      runtime,
      name: "Episode",
      overview: "",
      air_date: "2024-01-01",
      still_path: null,
    })),
  });
});

afterEach(() => {
  showSpy.mockRestore();
  seasonSpy.mockRestore();
  teardownTestDb();
});

describe("episode runtime policy", () => {
  it("persists TMDB durations and shares episode-first totals across stats, review, pace and ETA", async () => {
    await syncEpisodesForShow("tv-123", "123", "Show");
    const rows = await getDb()
      .select()
      .from(episodes)
      .orderBy(episodes.episodeNumber)
      .all();
    expect(rows.map((row) => row.runtimeMinutes)).toEqual([59, 31]);
    await watchEpisode(rows[0].id, userId);
    await watchTitle("movie-1", userId);
    expect((await getStatsOverview(userId)).watch_time_minutes).toBe(195);
    expect(
      (await computeYearInReview(userId, new Date().getUTCFullYear()))
        .watch_time_minutes,
    ).toBe(195);
    expect((await getUserPace(userId)).minutesPerDay).toBeCloseTo(59 / 30);
    expect((await getTrackedTitles(userId))[0].remaining_runtime_minutes).toBe(
      31,
    );

    await upsertTitles([
      makeParsedTitle({ id: "tv-123", objectType: "SHOW", runtimeMinutes: 45 }),
    ]);
    expect((await getStatsOverview(userId)).watch_time_minutes).toBe(195);
    expect((await getTrackedTitles(userId))[0].remaining_runtime_minutes).toBe(
      31,
    );
  });

  it("uses show estimates when available, flags unknown durations, and avoids incomplete ETAs", async () => {
    await upsertEpisodes(
      [1, 2].map((episode) => ({
        title_id: "tv-123",
        season_number: 1,
        episode_number: episode,
        name: null,
        overview: null,
        air_date: "2024-01-01",
        still_path: null,
      })),
    );
    const first = await getDb().select().from(episodes).get();
    await watchEpisode(first!.id, userId);
    const overview = await getStatsOverview(userId);
    expect(overview.watch_time_unknown_episodes).toBe(1);
    expect(
      (await computeYearInReview(userId, new Date().getUTCFullYear()))
        .watch_time_unknown_episodes,
    ).toBe(1);
    expect((await getUserPace(userId)).minutesPerDay).toBeNull();
    expect(
      (await getTrackedTitles(userId))[0].remaining_runtime_minutes,
    ).toBeNull();
    expect(computeEta(null, 45)).toBeNull();

    await upsertTitles([
      makeParsedTitle({ id: "tv-123", objectType: "SHOW", runtimeMinutes: 45 }),
    ]);
    expect((await getStatsOverview(userId)).watch_time_minutes_shows).toBe(45);
    expect(
      (await computeYearInReview(userId, new Date().getUTCFullYear()))
        .watch_time_minutes_shows,
    ).toBe(45);
    expect((await getUserPace(userId)).minutesPerDay).toBe(1.5);
    expect((await getTrackedTitles(userId))[0].remaining_runtime_minutes).toBe(
      45,
    );
  });

  it("retains measured runtime when a later partial upsert omits it", async () => {
    await syncEpisodesForShow("tv-123", "123", "Show");
    await upsertEpisodes([
      {
        title_id: "tv-123",
        season_number: 1,
        episode_number: 1,
        name: "Updated",
        overview: null,
        air_date: null,
        still_path: null,
      },
    ]);
    const first = await getDb()
      .select()
      .from(episodes)
      .where(eq(episodes.episodeNumber, 1))
      .get();
    expect(first?.runtimeMinutes).toBe(59);
  });
});
