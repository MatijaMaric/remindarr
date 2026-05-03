import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, trackTitle, upsertEpisodes, watchEpisode, watchEpisodesBulk } from "../repository";
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

  it("orders title-groups by most recent watched_at descending, with never-watched titles last (alphabetical fallback)", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

    await upsertTitles([
      makeParsedTitle({ id: "show-2", objectType: "SHOW", title: "B Show" }),
      makeParsedTitle({ id: "show-3", objectType: "SHOW", title: "A Never Watched Show" }),
    ]);
    await trackTitle("show-2", userId);
    await trackTitle("show-3", userId);

    await upsertEpisodes([
      // show-1 (Test Show): two unwatched + one we'll mark watched at the EARLIER time
      { title_id: "show-1", season_number: 1, episode_number: 1, name: "S1 E1", overview: null, air_date: twoDaysAgo, still_path: null },
      { title_id: "show-1", season_number: 1, episode_number: 2, name: "S1 E2", overview: null, air_date: yesterday, still_path: null },
      { title_id: "show-1", season_number: 1, episode_number: 3, name: "S1 E3 (will be watched)", overview: null, air_date: yesterday, still_path: null },
      // show-2 (B Show): two unwatched + one we'll mark watched at the LATER time
      { title_id: "show-2", season_number: 1, episode_number: 1, name: "B S1 E1", overview: null, air_date: twoDaysAgo, still_path: null },
      { title_id: "show-2", season_number: 1, episode_number: 2, name: "B S1 E2", overview: null, air_date: yesterday, still_path: null },
      { title_id: "show-2", season_number: 1, episode_number: 3, name: "B S1 E3 (will be watched)", overview: null, air_date: yesterday, still_path: null },
      // show-3 (never watched): two unwatched
      { title_id: "show-3", season_number: 1, episode_number: 1, name: "A S1 E1", overview: null, air_date: twoDaysAgo, still_path: null },
      { title_id: "show-3", season_number: 1, episode_number: 2, name: "A S1 E2", overview: null, air_date: yesterday, still_path: null },
    ]);

    const all = await getUnwatchedEpisodes(userId);
    const show1Watched = all.find((e) => e.title_id === "show-1" && e.episode_number === 3)!;
    const show2Watched = all.find((e) => e.title_id === "show-2" && e.episode_number === 3)!;

    // show-2 watched 1 hour after show-1 → show-2 should sort first by recency.
    await watchEpisodesBulk(
      [show1Watched.id, show2Watched.id],
      userId,
      new Map([
        [show1Watched.id, "2024-01-01 12:00:00"],
        [show2Watched.id, "2024-01-01 13:00:00"],
      ]),
    );

    const results = await getUnwatchedEpisodes(userId);
    const titleOrder: string[] = [];
    for (const ep of results) {
      if (titleOrder[titleOrder.length - 1] !== ep.title_id) titleOrder.push(ep.title_id);
    }

    // show-2 first (most recently watched), then show-1, then show-3 (never watched, alphabetical fallback by title)
    expect(titleOrder).toEqual(["show-2", "show-1", "show-3"]);

    // Within each group, episodes preserve season/episode ascending order
    const show1Episodes = results.filter((e) => e.title_id === "show-1");
    expect(show1Episodes.map((e) => e.episode_number)).toEqual([1, 2]);
    const show2Episodes = results.filter((e) => e.title_id === "show-2");
    expect(show2Episodes.map((e) => e.episode_number)).toEqual([1, 2]);
    const show3Episodes = results.filter((e) => e.title_id === "show-3");
    expect(show3Episodes.map((e) => e.episode_number)).toEqual([1, 2]);
  });
});
