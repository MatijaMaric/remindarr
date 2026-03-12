import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import {
  upsertTitles,
  upsertEpisodes,
  createUser,
  trackTitle,
} from "../db/repository";
import { buildNotificationContent } from "./content";

let userId: string;

beforeEach(() => {
  setupTestDb();
  userId = createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("buildNotificationContent", () => {
  it("returns episodes airing today for tracked shows", () => {
    const today = "2026-03-12";

    // Create a show and track it
    upsertTitles([
      makeParsedTitle({
        id: "show-1",
        objectType: "SHOW",
        title: "Test Show",
        releaseDate: "2026-01-01",
      }),
    ]);
    trackTitle("show-1", userId);

    // Add episode airing today
    upsertEpisodes([
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

    const content = buildNotificationContent(userId, today);

    expect(content.episodes).toHaveLength(1);
    expect(content.episodes[0].showTitle).toBe("Test Show");
    expect(content.episodes[0].seasonNumber).toBe(1);
    expect(content.episodes[0].episodeNumber).toBe(5);
    expect(content.episodes[0].episodeName).toBe("Episode Five");
    expect(content.date).toBe(today);
  });

  it("returns tracked movies releasing today", () => {
    const today = "2026-03-12";

    upsertTitles([
      makeParsedTitle({
        id: "movie-1",
        objectType: "MOVIE",
        title: "New Movie",
        releaseDate: today,
        releaseYear: 2026,
      }),
    ]);
    trackTitle("movie-1", userId);

    const content = buildNotificationContent(userId, today);

    expect(content.movies).toHaveLength(1);
    expect(content.movies[0].title).toBe("New Movie");
    expect(content.movies[0].releaseYear).toBe(2026);
  });

  it("returns empty content when nothing is releasing", () => {
    const content = buildNotificationContent(userId, "2026-03-12");

    expect(content.episodes).toHaveLength(0);
    expect(content.movies).toHaveLength(0);
  });

  it("does not include untracked titles", () => {
    const today = "2026-03-12";

    upsertTitles([
      makeParsedTitle({
        id: "movie-2",
        objectType: "MOVIE",
        title: "Untracked Movie",
        releaseDate: today,
      }),
    ]);
    // Intentionally NOT tracking

    const content = buildNotificationContent(userId, today);
    expect(content.movies).toHaveLength(0);
  });

  it("scopes content to the requesting user", () => {
    const today = "2026-03-12";
    const otherUserId = createUser("other", "hash");

    upsertTitles([
      makeParsedTitle({
        id: "movie-3",
        objectType: "MOVIE",
        title: "Other's Movie",
        releaseDate: today,
      }),
    ]);
    trackTitle("movie-3", otherUserId);

    const content = buildNotificationContent(userId, today);
    expect(content.movies).toHaveLength(0);

    const otherContent = buildNotificationContent(otherUserId, today);
    expect(otherContent.movies).toHaveLength(1);
  });
});
