import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { createUser, upsertTitles, watchEpisode } from "../db/repository";
import { episodes, getDb, watchedEpisodes } from "../db/schema";
import { CONFIG } from "../config";
import * as client from "./client";
import { syncEpisodesForShow } from "./sync";
import type { TmdbEpisode, TmdbShowDetails } from "./types";

const details: TmdbShowDetails = {
  id: 123,
  name: "Test Show",
  status: "Ended",
  number_of_seasons: 2,
  next_episode_to_air: null,
  last_episode_to_air: null,
};
const episode = (season: number, number = 1): TmdbEpisode => ({
  id: season * 100 + number,
  name: `Episode ${number}`,
  overview: "",
  air_date: "2024-01-01",
  episode_number: number,
  season_number: season,
  still_path: null,
});
let originalDelay: number;
let showSpy: ReturnType<typeof spyOn<typeof client, "fetchShowDetails">>;
let seasonSpy: ReturnType<typeof spyOn<typeof client, "fetchSeasonEpisodes">>;

beforeEach(async () => {
  setupTestDb();
  originalDelay = CONFIG.EPISODE_SYNC_DELAY_MS;
  CONFIG.EPISODE_SYNC_DELAY_MS = 0;
  showSpy = spyOn(client, "fetchShowDetails").mockResolvedValue(details);
  seasonSpy = spyOn(client, "fetchSeasonEpisodes");
  await upsertTitles([makeParsedTitle({ id: "tv-123", objectType: "SHOW" })]);
});

afterEach(() => {
  showSpy.mockRestore();
  seasonSpy.mockRestore();
  CONFIG.EPISODE_SYNC_DELAY_MS = originalDelay;
  teardownTestDb();
});

describe("syncEpisodesForShow", () => {
  it.each(["Ended", "Canceled"])(
    "recovers a failed season for a %s show and preserves watched episodes",
    async (status) => {
      showSpy.mockResolvedValue({ ...details, status });
      seasonSpy.mockImplementation(async (_, season) => {
        if (season === 2) throw new Error("Temporary season failure");
        return {
          id: season,
          season_number: season,
          episodes: [episode(season)],
        };
      });
      expect(await syncEpisodesForShow("tv-123", "123", "Test Show")).toBe(1);
      const first = await getDb().select().from(episodes).get();
      const userId = await createUser("viewer", "hash");
      await watchEpisode(first!.id, userId);
      const watchedBefore = await getDb().select().from(watchedEpisodes).all();

      seasonSpy.mockImplementation(async (_, season) => ({
        id: season,
        season_number: season,
        episodes: [episode(season)],
      }));
      expect(await syncEpisodesForShow("tv-123", "123", "Test Show")).toBe(2);
      const rows = await getDb().select().from(episodes).all();
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.seasonNumber === 1)?.id).toBe(first!.id);
      expect(await getDb().select().from(watchedEpisodes).all()).toEqual(
        watchedBefore,
      );
    },
  );

  it("discovers a finale after a returning show becomes ended", async () => {
    showSpy.mockResolvedValue({
      ...details,
      status: "Returning Series",
      number_of_seasons: 1,
    });
    seasonSpy.mockResolvedValue({
      id: 1,
      season_number: 1,
      episodes: [episode(1)],
    });
    await syncEpisodesForShow("tv-123", "123", "Test Show");

    showSpy.mockResolvedValue({ ...details, number_of_seasons: 1 });
    seasonSpy.mockResolvedValue({
      id: 1,
      season_number: 1,
      episodes: [episode(1), episode(1, 2)],
    });
    expect(await syncEpisodesForShow("tv-123", "123", "Test Show")).toBe(2);
    const rows = await getDb()
      .select()
      .from(episodes)
      .where(eq(episodes.titleId, "tv-123"))
      .all();
    expect(rows.map((row) => row.episodeNumber).sort()).toEqual([1, 2]);
  });
});
