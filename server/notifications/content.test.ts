import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import {
  upsertTitles,
  upsertEpisodes,
  createUser,
  trackTitle,
} from "../db/repository";
import { buildNotificationContent, buildWeeklyDigestContent } from "./content";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("buildNotificationContent", () => {
  it("returns episodes airing today for tracked shows", async () => {
    const today = "2026-03-12";

    // Create a show and track it
    await upsertTitles([
      makeParsedTitle({
        id: "show-1",
        objectType: "SHOW",
        title: "Test Show",
        releaseDate: "2026-01-01",
      }),
    ]);
    await trackTitle("show-1", userId);

    // Add episode airing today
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 5,
        name: "Episode Five",
        overview: null,
        air_date: today,
        still_path: null,
      },
    ]);

    const content = await buildNotificationContent(userId, today);

    expect(content.episodes).toHaveLength(1);
    expect(content.episodes[0].showTitle).toBe("Test Show");
    expect(content.episodes[0].seasonNumber).toBe(1);
    expect(content.episodes[0].episodeNumber).toBe(5);
    expect(content.episodes[0].episodeName).toBe("Episode Five");
    expect(content.date).toBe(today);
  });

  it("returns tracked movies releasing today", async () => {
    const today = "2026-03-12";

    await upsertTitles([
      makeParsedTitle({
        id: "movie-1",
        objectType: "MOVIE",
        title: "New Movie",
        releaseDate: today,
        releaseYear: 2026,
      }),
    ]);
    await trackTitle("movie-1", userId);

    const content = await buildNotificationContent(userId, today);

    expect(content.movies).toHaveLength(1);
    expect(content.movies[0].title).toBe("New Movie");
    expect(content.movies[0].releaseYear).toBe(2026);
  });

  it("returns empty content when nothing is releasing", async () => {
    const content = await buildNotificationContent(userId, "2026-03-12");

    expect(content.episodes).toHaveLength(0);
    expect(content.movies).toHaveLength(0);
  });

  it("does not include untracked titles", async () => {
    const today = "2026-03-12";

    await upsertTitles([
      makeParsedTitle({
        id: "movie-2",
        objectType: "MOVIE",
        title: "Untracked Movie",
        releaseDate: today,
      }),
    ]);
    // Intentionally NOT tracking

    const content = await buildNotificationContent(userId, today);
    expect(content.movies).toHaveLength(0);
  });

  it("scopes content to the requesting user", async () => {
    const today = "2026-03-12";
    const otherUserId = await createUser("other", "hash");

    await upsertTitles([
      makeParsedTitle({
        id: "movie-3",
        objectType: "MOVIE",
        title: "Other's Movie",
        releaseDate: today,
      }),
    ]);
    await trackTitle("movie-3", otherUserId);

    const content = await buildNotificationContent(userId, today);
    expect(content.movies).toHaveLength(0);

    const otherContent = await buildNotificationContent(otherUserId, today);
    expect(otherContent.movies).toHaveLength(1);
  });
});

describe("buildWeeklyDigestContent", () => {
  it("returns episodes across the date range for tracked shows", async () => {
    const startDate = "2026-04-07";
    const endDate = "2026-04-14";

    await upsertTitles([
      makeParsedTitle({
        id: "show-w1",
        objectType: "SHOW",
        title: "Weekly Show",
        releaseDate: "2026-01-01",
      }),
    ]);
    await trackTitle("show-w1", userId);

    await upsertEpisodes([
      {
        title_id: "show-w1",
        season_number: 1,
        episode_number: 1,
        name: "Episode One",
        overview: null,
        air_date: "2026-04-08",
        still_path: null,
      },
      {
        title_id: "show-w1",
        season_number: 1,
        episode_number: 2,
        name: "Episode Two",
        overview: null,
        air_date: "2026-04-11",
        still_path: null,
      },
    ]);

    const content = await buildWeeklyDigestContent(userId, startDate, endDate);

    expect(content.episodes).toHaveLength(2);
    expect(content.episodes[0].showTitle).toBe("Weekly Show");
    expect(content.date).toBe(startDate);
  });

  it("returns tracked movies releasing within the date range", async () => {
    const startDate = "2026-04-07";
    const endDate = "2026-04-14";

    await upsertTitles([
      makeParsedTitle({
        id: "movie-w1",
        objectType: "MOVIE",
        title: "Week Movie",
        releaseDate: "2026-04-10",
        releaseYear: 2026,
      }),
    ]);
    await trackTitle("movie-w1", userId);

    const content = await buildWeeklyDigestContent(userId, startDate, endDate);

    expect(content.movies).toHaveLength(1);
    expect(content.movies[0].title).toBe("Week Movie");
  });

  it("excludes movies outside the date range", async () => {
    const startDate = "2026-04-07";
    const endDate = "2026-04-14";

    await upsertTitles([
      makeParsedTitle({
        id: "movie-w2",
        objectType: "MOVIE",
        title: "Outside Range Movie",
        releaseDate: "2026-04-15",
        releaseYear: 2026,
      }),
    ]);
    await trackTitle("movie-w2", userId);

    const content = await buildWeeklyDigestContent(userId, startDate, endDate);

    expect(content.movies).toHaveLength(0);
  });

  it("returns empty content when nothing is in range", async () => {
    const content = await buildWeeklyDigestContent(userId, "2026-04-07", "2026-04-14");

    expect(content.episodes).toHaveLength(0);
    expect(content.movies).toHaveLength(0);
  });

  it("does not include untracked titles", async () => {
    const startDate = "2026-04-07";
    const endDate = "2026-04-14";

    await upsertTitles([
      makeParsedTitle({
        id: "movie-w3",
        objectType: "MOVIE",
        title: "Untracked Week Movie",
        releaseDate: "2026-04-10",
      }),
    ]);
    // Intentionally NOT tracking

    const content = await buildWeeklyDigestContent(userId, startDate, endDate);
    expect(content.movies).toHaveLength(0);
  });
});
