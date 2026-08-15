import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, createUser, trackTitle } from "../db/repository";
import { listTrackedShowsForEpisodeSync } from "./sync";

beforeEach(() => {
  setupTestDb();
});

afterAll(() => {
  teardownTestDb();
});

describe("listTrackedShowsForEpisodeSync", () => {
  it("returns one row per unique show when many users track it", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "tv-1",
        objectType: "SHOW",
        title: "Shared Show",
        tmdbId: "1",
      }),
    ]);
    const userA = await createUser("usera", "hash");
    const userB = await createUser("userb", "hash");
    await trackTitle("tv-1", userA);
    await trackTitle("tv-1", userB);

    const shows = await listTrackedShowsForEpisodeSync();
    expect(shows).toHaveLength(1);
    expect(shows[0]).toEqual({
      id: "tv-1",
      tmdb_id: "1",
      title: "Shared Show",
    });
  });

  it("omits movies and shows without a TMDB id", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "movie-1",
        objectType: "MOVIE",
        title: "A Movie",
        tmdbId: "99",
      }),
      makeParsedTitle({
        id: "tv-no-tmdb",
        objectType: "SHOW",
        title: "No Tmdb",
        tmdbId: null,
      }),
      makeParsedTitle({
        id: "tv-2",
        objectType: "SHOW",
        title: "Real Show",
        tmdbId: "2",
      }),
    ]);
    const userId = await createUser("user", "hash");
    await trackTitle("movie-1", userId);
    await trackTitle("tv-no-tmdb", userId);
    await trackTitle("tv-2", userId);

    const shows = await listTrackedShowsForEpisodeSync();
    expect(shows).toEqual([
      { id: "tv-2", tmdb_id: "2", title: "Real Show" },
    ]);
  });
});
