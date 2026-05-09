import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import {
  createUser,
  upsertTitles,
  watchTitle,
  upsertEpisodes,
  watchEpisode,
} from "../db/repository";
import { createRecommendation } from "../db/repository/recommendations";
import { follow } from "../db/repository/follows";
import { logWatch } from "../db/repository/watch-history";
import { bumpStreak } from "../db/repository/streaks";
import { getDb } from "../db/schema";
import {
  watchedEpisodes,
  titleGenres,
  episodes,
  watchHistory,
} from "../db/schema";
import {
  evaluateCountMovies,
  evaluateCountEpisodes,
  evaluateStreak,
  evaluateGenreCount,
  evaluateCompletionist,
  evaluateSocialFirstRecommendation,
  evaluateSocialFirstFollow,
  evaluateSpeedBingeSeason,
} from "./evaluate";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

// ─── count_movies ─────────────────────────────────────────────────────────────

describe("evaluateCountMovies", () => {
  it("returns zero progress with no watched movies", async () => {
    const result = await evaluateCountMovies(userId, 10);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("returns partial progress below threshold", async () => {
    await upsertTitles([makeParsedTitle({ id: "m1", objectType: "MOVIE" })]);
    await upsertTitles([makeParsedTitle({ id: "m2", objectType: "MOVIE" })]);
    await watchTitle("m1", userId);
    await watchTitle("m2", userId);

    const result = await evaluateCountMovies(userId, 10);
    expect(result.progress).toBe(2);
    expect(result.earned).toBe(false);
  });

  it("earned = true exactly at threshold", async () => {
    for (let i = 0; i < 3; i++) {
      const id = `movie-${i}`;
      await upsertTitles([makeParsedTitle({ id, objectType: "MOVIE" })]);
      await watchTitle(id, userId);
    }
    const result = await evaluateCountMovies(userId, 3);
    expect(result.progress).toBe(3);
    expect(result.earned).toBe(true);
  });

  it("earned = true past threshold", async () => {
    for (let i = 0; i < 5; i++) {
      const id = `moviet-${i}`;
      await upsertTitles([makeParsedTitle({ id, objectType: "MOVIE" })]);
      await watchTitle(id, userId);
    }
    const result = await evaluateCountMovies(userId, 3);
    expect(result.progress).toBe(5);
    expect(result.earned).toBe(true);
  });

  it("does not count SHOW titles", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Test Show" })]);
    await watchTitle("show-1", userId);

    const result = await evaluateCountMovies(userId, 1);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });
});

// ─── count_episodes ───────────────────────────────────────────────────────────

describe("evaluateCountEpisodes", () => {
  const showId = "show-eps-test";

  beforeEach(async () => {
    await upsertTitles([makeParsedTitle({ id: showId, objectType: "SHOW", title: "Episode Test Show" })]);
  });

  it("returns zero progress with no watched episodes", async () => {
    const result = await evaluateCountEpisodes(userId, 100);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("returns partial progress below threshold", async () => {
    await upsertEpisodes([
      { title_id: showId, season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: showId, season_number: 1, episode_number: 2, name: "E2", overview: null, air_date: "2024-01-08", still_path: null },
    ]);
    const db = getDb();
    const epRows = await db.select().from(episodes).all();
    for (const ep of epRows) {
      await watchEpisode(ep.id, userId);
    }

    const result = await evaluateCountEpisodes(userId, 100);
    expect(result.progress).toBe(2);
    expect(result.earned).toBe(false);
  });

  it("earned = true at threshold", async () => {
    await upsertEpisodes([
      { title_id: showId, season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: "2024-01-01", still_path: null },
    ]);
    const db = getDb();
    const ep = await db.select().from(episodes).all();
    await watchEpisode(ep[0].id, userId);

    const result = await evaluateCountEpisodes(userId, 1);
    expect(result.progress).toBe(1);
    expect(result.earned).toBe(true);
  });
});

// ─── streak_days ──────────────────────────────────────────────────────────────

describe("evaluateStreak", () => {
  it("returns zero when no streak row exists", async () => {
    const result = await evaluateStreak(userId, 3);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("reflects current streak from user_streaks", async () => {
    // Bump streak to 3 days by simulating consecutive days
    const day1 = "2024-01-01T10:00:00.000Z";
    const day2 = "2024-01-02T10:00:00.000Z";
    const day3 = "2024-01-03T10:00:00.000Z";
    await bumpStreak(userId, day1);
    await bumpStreak(userId, day2);
    await bumpStreak(userId, day3);

    const result = await evaluateStreak(userId, 3);
    expect(result.progress).toBe(3);
    expect(result.earned).toBe(true);
  });

  it("returns false when streak is below threshold", async () => {
    await bumpStreak(userId, "2024-01-01T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-02T10:00:00.000Z");

    const result = await evaluateStreak(userId, 7);
    expect(result.progress).toBe(2);
    expect(result.earned).toBe(false);
  });
});

// ─── genre_count ──────────────────────────────────────────────────────────────

describe("evaluateGenreCount", () => {
  it("returns zero with no watched titles", async () => {
    const result = await evaluateGenreCount(userId, 5, "Action");
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("counts distinct Action titles watched", async () => {
    const db = getDb();
    for (let i = 0; i < 3; i++) {
      const id = `action-${i}`;
      await upsertTitles([makeParsedTitle({ id, objectType: "MOVIE", genres: ["Action"] })]);
      await db.insert(titleGenres).values({ titleId: id, genre: "Action" }).onConflictDoNothing().run();
      await watchTitle(id, userId);
    }

    const result = await evaluateGenreCount(userId, 3, "Action");
    expect(result.progress).toBe(3);
    expect(result.earned).toBe(true);
  });

  it("__any__ counts distinct genres, not titles", async () => {
    const db = getDb();
    const m1 = "genre-any-1";
    const m2 = "genre-any-2";
    await upsertTitles([makeParsedTitle({ id: m1, objectType: "MOVIE" })]);
    await upsertTitles([makeParsedTitle({ id: m2, objectType: "MOVIE" })]);
    await db.insert(titleGenres).values({ titleId: m1, genre: "Action" }).onConflictDoNothing().run();
    await db.insert(titleGenres).values({ titleId: m1, genre: "Drama" }).onConflictDoNothing().run();
    await db.insert(titleGenres).values({ titleId: m2, genre: "Comedy" }).onConflictDoNothing().run();
    await watchTitle(m1, userId);
    await watchTitle(m2, userId);

    // 3 distinct genres watched
    const result = await evaluateGenreCount(userId, 3, "__any__");
    expect(result.progress).toBe(3);
    expect(result.earned).toBe(true);
  });

  it("__any__ returns false when below threshold", async () => {
    const m1 = "genre-any-few";
    // Use genres: [] to avoid the default ["Action", "Drama"] from the fixture
    await upsertTitles([makeParsedTitle({ id: m1, objectType: "MOVIE", genres: ["Thriller"] })]);
    await watchTitle(m1, userId);

    // Only 1 distinct genre watched — below threshold of 5
    const result = await evaluateGenreCount(userId, 5, "__any__");
    expect(result.progress).toBe(1);
    expect(result.earned).toBe(false);
  });
});

// ─── completionist ────────────────────────────────────────────────────────────

describe("evaluateCompletionist", () => {
  const showId = "show-completionist";
  const pastDate = "2024-01-01";

  beforeEach(async () => {
    await upsertTitles([makeParsedTitle({ id: showId, objectType: "SHOW", title: "Completionist Show" })]);
  });

  it("returns zero when no episodes watched", async () => {
    await upsertEpisodes([
      { title_id: showId, season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: pastDate, still_path: null },
    ]);
    const result = await evaluateCompletionist(userId, 1);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("earned when all released episodes of a show are watched (titleId mode)", async () => {
    await upsertEpisodes([
      { title_id: showId, season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: pastDate, still_path: null },
      { title_id: showId, season_number: 1, episode_number: 2, name: "E2", overview: null, air_date: pastDate, still_path: null },
    ]);
    const db = getDb();
    const eps = await db.select().from(episodes).all();
    for (const ep of eps) {
      await watchEpisode(ep.id, userId);
    }

    const result = await evaluateCompletionist(userId, 1, showId);
    expect(result.earned).toBe(true);
  });

  it("not earned with only partial episodes watched (titleId mode)", async () => {
    await upsertEpisodes([
      { title_id: showId, season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: pastDate, still_path: null },
      { title_id: showId, season_number: 1, episode_number: 2, name: "E2", overview: null, air_date: pastDate, still_path: null },
    ]);
    const db = getDb();
    const eps = await db.select().from(episodes).all();
    await watchEpisode(eps[0].id, userId); // only first

    const result = await evaluateCompletionist(userId, 1, showId);
    expect(result.earned).toBe(false);
  });

  it("counts completed shows in null titleId mode", async () => {
    await upsertEpisodes([
      { title_id: showId, season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: pastDate, still_path: null },
    ]);
    const db = getDb();
    const eps = await db.select().from(episodes).all();
    await watchEpisode(eps[0].id, userId);

    const result = await evaluateCompletionist(userId, 1);
    expect(result.progress).toBe(1);
    expect(result.earned).toBe(true);
  });
});

// ─── social_first_recommendation ─────────────────────────────────────────────

describe("evaluateSocialFirstRecommendation", () => {
  it("returns zero progress with no recommendations sent", async () => {
    const result = await evaluateSocialFirstRecommendation(userId);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("earned after sending first recommendation", async () => {
    await upsertTitles([makeParsedTitle({ id: "rec-movie", objectType: "MOVIE" })]);
    const userId2 = await createUser("receiver", "hash");
    await createRecommendation(userId, "rec-movie", undefined, userId2);

    const result = await evaluateSocialFirstRecommendation(userId);
    expect(result.progress).toBe(1);
    expect(result.earned).toBe(true);
  });

  it("progress capped at 1 even with multiple recommendations", async () => {
    await upsertTitles([makeParsedTitle({ id: "rec-movie2", objectType: "MOVIE" })]);
    const userId2 = await createUser("receiver2", "hash");
    await createRecommendation(userId, "rec-movie2", undefined, userId2);
    await createRecommendation(userId, "rec-movie2", undefined, userId2);

    const result = await evaluateSocialFirstRecommendation(userId);
    expect(result.progress).toBe(1);
  });
});

// ─── social_first_follow ──────────────────────────────────────────────────────

describe("evaluateSocialFirstFollow", () => {
  it("returns zero progress with no follows", async () => {
    const result = await evaluateSocialFirstFollow(userId);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("earned after following first user", async () => {
    const userId2 = await createUser("followee", "hash");
    await follow(userId, userId2);

    const result = await evaluateSocialFirstFollow(userId);
    expect(result.progress).toBe(1);
    expect(result.earned).toBe(true);
  });
});

// ─── speed_binge_season ───────────────────────────────────────────────────────

describe("evaluateSpeedBingeSeason", () => {
  const showId = "show-speed-binge";

  beforeEach(async () => {
    await upsertTitles([makeParsedTitle({ id: showId, objectType: "SHOW", title: "Speed Binge Show" })]);
  });

  it("returns zero progress with no watched episodes", async () => {
    const result = await evaluateSpeedBingeSeason(userId, 8, 24, showId);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("earned when 8 episodes watched in a 24h window", async () => {
    await upsertEpisodes(
      Array.from({ length: 8 }, (_, i) => ({
        title_id: showId,
        season_number: 1,
        episode_number: i + 1,
        name: `E${i + 1}`,
        overview: null,
        air_date: "2024-01-01",
        still_path: null,
      }))
    );
    const db = getDb();
    const eps = await db.select().from(episodes).all();

    // Watch all 8 within the same hour
    const baseTime = new Date("2024-06-01T10:00:00.000Z");
    for (let i = 0; i < eps.length; i++) {
      const watchedAt = new Date(baseTime.getTime() + i * 5 * 60 * 1000).toISOString();
      await db
        .insert(watchedEpisodes)
        .values({ episodeId: eps[i].id, userId, watchedAt })
        .onConflictDoNothing()
        .run();
    }

    const result = await evaluateSpeedBingeSeason(userId, 8, 24, showId);
    expect(result.progress).toBe(8);
    expect(result.earned).toBe(true);
  });

  it("not earned when episodes span more than 24h", async () => {
    await upsertEpisodes(
      Array.from({ length: 8 }, (_, i) => ({
        title_id: showId,
        season_number: 1,
        episode_number: i + 1,
        name: `E${i + 1}`,
        overview: null,
        air_date: "2024-01-01",
        still_path: null,
      }))
    );
    const db = getDb();
    const eps = await db.select().from(episodes).all();

    // Spread 8 episodes over 3 days (way more than 24h)
    for (let i = 0; i < eps.length; i++) {
      const watchedAt = new Date("2024-06-01T10:00:00.000Z");
      watchedAt.setDate(watchedAt.getDate() + i);
      await db
        .insert(watchedEpisodes)
        .values({ episodeId: eps[i].id, userId, watchedAt: watchedAt.toISOString() })
        .onConflictDoNothing()
        .run();
    }

    const result = await evaluateSpeedBingeSeason(userId, 8, 24, showId);
    expect(result.earned).toBe(false);
  });

  it("partial progress below threshold", async () => {
    await upsertEpisodes(
      Array.from({ length: 4 }, (_, i) => ({
        title_id: showId,
        season_number: 1,
        episode_number: i + 1,
        name: `E${i + 1}`,
        overview: null,
        air_date: "2024-01-01",
        still_path: null,
      }))
    );
    const db = getDb();
    const eps = await db.select().from(episodes).all();
    const baseTime = new Date("2024-06-01T10:00:00.000Z");
    for (let i = 0; i < eps.length; i++) {
      const watchedAt = new Date(baseTime.getTime() + i * 10 * 60 * 1000).toISOString();
      await db
        .insert(watchedEpisodes)
        .values({ episodeId: eps[i].id, userId, watchedAt })
        .onConflictDoNothing()
        .run();
    }

    const result = await evaluateSpeedBingeSeason(userId, 8, 24, showId);
    expect(result.progress).toBe(4);
    expect(result.earned).toBe(false);
  });
});
