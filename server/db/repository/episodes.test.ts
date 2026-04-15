import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, trackTitle, upsertEpisodes, watchEpisode } from "../repository";
import { getUnwatchedEpisodes } from "./episodes";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
  await upsertTitles([makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Test Show" })]);
  await trackTitle("show-1", userId);
});

afterAll(() => {
  teardownTestDb();
});

describe("getUnwatchedEpisodes", () => {
  it("includes episodes that aired today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Today Episode",
        overview: null,
        air_date: today,
        still_path: null,
      },
    ]);

    const results = await getUnwatchedEpisodes(userId);
    expect(results.some((e) => e.air_date === today)).toBe(true);
  });

  it("excludes future episodes", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 2,
        name: "Future Episode",
        overview: null,
        air_date: tomorrow,
        still_path: null,
      },
    ]);

    const results = await getUnwatchedEpisodes(userId);
    expect(results.some((e) => e.air_date === tomorrow)).toBe(false);
  });

  it("excludes episodes already watched", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 3,
        name: "Watched Episode",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    const [episode] = await getUnwatchedEpisodes(userId);
    await watchEpisode(episode.id, userId);

    const after = await getUnwatchedEpisodes(userId);
    expect(after.some((e) => e.id === episode.id)).toBe(false);
  });
});
