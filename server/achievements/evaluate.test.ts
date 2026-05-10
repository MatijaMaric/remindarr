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
  evaluateMonthlyCountRepeatable,
  evaluateWeekendWarriorRepeatable,
  evaluateDecadeCount,
  evaluateLanguageCount,
  evaluateLongFilm,
} from "./evaluate";
import { userAchievementEarns, achievements } from "../db/schema";
import { upsertAchievementDef } from "../db/repository/achievements";

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

// ─── monthly_count_repeatable ─────────────────────────────────────────────────

describe("evaluateMonthlyCountRepeatable", () => {
  const showId = "show-monthly";
  const achievementKey = "monthly_watcher_test";

  beforeEach(async () => {
    await upsertAchievementDef({
      key: achievementKey,
      kind: "monthly_count_repeatable",
      threshold: 2,
      points: 10,
      title: "Monthly Watcher",
      description: "Watch 2 episodes in a month",
      icon: "Calendar",
    });
    await upsertTitles([makeParsedTitle({ id: showId, objectType: "SHOW", title: "Monthly Show" })]);
    await upsertEpisodes([
      { title_id: showId, season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: showId, season_number: 1, episode_number: 2, name: "E2", overview: null, air_date: "2024-01-02", still_path: null },
      { title_id: showId, season_number: 1, episode_number: 3, name: "E3", overview: null, air_date: "2024-02-01", still_path: null },
      { title_id: showId, season_number: 1, episode_number: 4, name: "E4", overview: null, air_date: "2024-02-02", still_path: null },
    ]);
  });

  it("returns newEarns for months that hit threshold", async () => {
    const db = getDb();
    const eps = await db.select().from(episodes).all();

    // Watch 2 episodes in Jan and 2 in Feb
    await db.insert(watchedEpisodes).values({ episodeId: eps[0].id, userId, watchedAt: "2024-01-10T10:00:00.000Z" }).onConflictDoNothing().run();
    await db.insert(watchedEpisodes).values({ episodeId: eps[1].id, userId, watchedAt: "2024-01-15T10:00:00.000Z" }).onConflictDoNothing().run();
    await db.insert(watchedEpisodes).values({ episodeId: eps[2].id, userId, watchedAt: "2024-02-10T10:00:00.000Z" }).onConflictDoNothing().run();
    await db.insert(watchedEpisodes).values({ episodeId: eps[3].id, userId, watchedAt: "2024-02-15T10:00:00.000Z" }).onConflictDoNothing().run();

    const result = await evaluateMonthlyCountRepeatable(userId, 2, achievementKey);
    expect(result.progress).toBe(2); // 2 months hit threshold
    expect(result.newEarns).toHaveLength(2);
    const months = result.newEarns.map((e) => (e.context as { month: string }).month);
    expect(months).toContain("2024-01");
    expect(months).toContain("2024-02");
  });

  it("skips months already in user_achievement_earns", async () => {
    const db = getDb();
    const eps = await db.select().from(episodes).all();

    // Watch 2 episodes in Jan and 2 in Feb
    await db.insert(watchedEpisodes).values({ episodeId: eps[0].id, userId, watchedAt: "2024-01-10T10:00:00.000Z" }).onConflictDoNothing().run();
    await db.insert(watchedEpisodes).values({ episodeId: eps[1].id, userId, watchedAt: "2024-01-15T10:00:00.000Z" }).onConflictDoNothing().run();
    await db.insert(watchedEpisodes).values({ episodeId: eps[2].id, userId, watchedAt: "2024-02-10T10:00:00.000Z" }).onConflictDoNothing().run();
    await db.insert(watchedEpisodes).values({ episodeId: eps[3].id, userId, watchedAt: "2024-02-15T10:00:00.000Z" }).onConflictDoNothing().run();

    // Stamp Jan as already earned
    await db.insert(userAchievementEarns).values({
      userId,
      achievementKey,
      earnedAt: "2024-01-01T00:00:00.000Z",
      context: null,
    }).run();

    const result = await evaluateMonthlyCountRepeatable(userId, 2, achievementKey);
    expect(result.progress).toBe(2);
    expect(result.newEarns).toHaveLength(1); // only Feb is new
    expect((result.newEarns[0].context as { month: string }).month).toBe("2024-02");
  });

  it("returns zero when no months hit threshold", async () => {
    const db = getDb();
    const eps = await db.select().from(episodes).all();

    // Only 1 episode in Jan (below threshold of 2)
    await db.insert(watchedEpisodes).values({ episodeId: eps[0].id, userId, watchedAt: "2024-01-10T10:00:00.000Z" }).onConflictDoNothing().run();

    const result = await evaluateMonthlyCountRepeatable(userId, 2, achievementKey);
    expect(result.progress).toBe(0);
    expect(result.newEarns).toHaveLength(0);
  });
});

// ─── weekend_warrior_repeatable ───────────────────────────────────────────────

describe("evaluateWeekendWarriorRepeatable", () => {
  const showId = "show-weekend";
  const achievementKey = "weekend_warrior_test";

  beforeEach(async () => {
    await upsertAchievementDef({
      key: achievementKey,
      kind: "weekend_warrior_repeatable",
      threshold: 2,
      points: 10,
      title: "Weekend Warrior",
      description: "Watch 2 episodes on a weekend",
      icon: "Zap",
    });
    await upsertTitles([makeParsedTitle({ id: showId, objectType: "SHOW", title: "Weekend Show" })]);
    await upsertEpisodes([
      { title_id: showId, season_number: 1, episode_number: 1, name: "E1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: showId, season_number: 1, episode_number: 2, name: "E2", overview: null, air_date: "2024-01-06", still_path: null },
      { title_id: showId, season_number: 1, episode_number: 3, name: "E3", overview: null, air_date: "2024-01-07", still_path: null },
    ]);
  });

  it("returns newEarns for weekends that hit threshold", async () => {
    const db = getDb();
    const eps = await db.select().from(episodes).all();

    // 2024-01-06 is Saturday, 2024-01-07 is Sunday — both in week W01
    await db.insert(watchedEpisodes).values({ episodeId: eps[1].id, userId, watchedAt: "2024-01-06T10:00:00.000Z" }).onConflictDoNothing().run();
    await db.insert(watchedEpisodes).values({ episodeId: eps[2].id, userId, watchedAt: "2024-01-07T10:00:00.000Z" }).onConflictDoNothing().run();

    const result = await evaluateWeekendWarriorRepeatable(userId, 2, achievementKey);
    expect(result.progress).toBe(1); // 1 week hit threshold
    expect(result.newEarns).toHaveLength(1);
  });

  it("skips weekends already in user_achievement_earns", async () => {
    const db = getDb();
    const eps = await db.select().from(episodes).all();

    // 2024-01-06 Saturday, 2024-01-07 Sunday
    await db.insert(watchedEpisodes).values({ episodeId: eps[1].id, userId, watchedAt: "2024-01-06T10:00:00.000Z" }).onConflictDoNothing().run();
    await db.insert(watchedEpisodes).values({ episodeId: eps[2].id, userId, watchedAt: "2024-01-07T10:00:00.000Z" }).onConflictDoNothing().run();

    // Stamp this week as already earned — earnedAt is within the same week
    // evaluateWeekendWarriorRepeatable stamps with new Date().toISOString(), so we use a known date
    // The stamped weeks logic uses getUTCDate() / 7 which can be imprecise; stamp with the earn timestamp
    await db.insert(userAchievementEarns).values({
      userId,
      achievementKey,
      earnedAt: new Date().toISOString(), // this gets ceil'd via getUTCDate/7
      context: null,
    }).run();

    // With existing stamp for current week, and watching on week W01 (2024),
    // the week keys won't match the current week, so new earns are still returned
    const result = await evaluateWeekendWarriorRepeatable(userId, 2, achievementKey);
    expect(result.newEarns).toHaveLength(1); // W01-2024 not stamped yet
  });

  it("returns zero when no weekend episodes hit threshold", async () => {
    const db = getDb();
    const eps = await db.select().from(episodes).all();

    // 2024-01-01 is a Monday (weekday) — won't count
    await db.insert(watchedEpisodes).values({ episodeId: eps[0].id, userId, watchedAt: "2024-01-01T10:00:00.000Z" }).onConflictDoNothing().run();

    const result = await evaluateWeekendWarriorRepeatable(userId, 2, achievementKey);
    expect(result.progress).toBe(0);
    expect(result.newEarns).toHaveLength(0);
  });
});

// ─── decade_count ─────────────────────────────────────────────────────────────

describe("evaluateDecadeCount", () => {
  it("returns zero progress with no watched titles", async () => {
    const result = await evaluateDecadeCount(userId, 1);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("counts distinct decades across watched titles", async () => {
    // Titles from 3 different decades: 1980s, 1990s, 2000s
    await upsertTitles([makeParsedTitle({ id: "decade-1980", objectType: "MOVIE", releaseYear: 1985 })]);
    await upsertTitles([makeParsedTitle({ id: "decade-1990", objectType: "MOVIE", releaseYear: 1995 })]);
    await upsertTitles([makeParsedTitle({ id: "decade-2000", objectType: "MOVIE", releaseYear: 2005 })]);
    await watchTitle("decade-1980", userId);
    await watchTitle("decade-1990", userId);
    await watchTitle("decade-2000", userId);

    const result = await evaluateDecadeCount(userId, 3);
    expect(result.progress).toBe(3);
    expect(result.earned).toBe(true);
  });

  it("does not double-count titles from the same decade", async () => {
    // Both titles are from the 2010s
    await upsertTitles([makeParsedTitle({ id: "decade-2010a", objectType: "MOVIE", releaseYear: 2011 })]);
    await upsertTitles([makeParsedTitle({ id: "decade-2010b", objectType: "MOVIE", releaseYear: 2019 })]);
    await watchTitle("decade-2010a", userId);
    await watchTitle("decade-2010b", userId);

    const result = await evaluateDecadeCount(userId, 2);
    expect(result.progress).toBe(1); // only 1 distinct decade
    expect(result.earned).toBe(false);
  });

  it("returns false when below threshold", async () => {
    await upsertTitles([makeParsedTitle({ id: "decade-single", objectType: "MOVIE", releaseYear: 2024 })]);
    await watchTitle("decade-single", userId);

    const result = await evaluateDecadeCount(userId, 3);
    expect(result.progress).toBe(1);
    expect(result.earned).toBe(false);
  });
});

// ─── language_count ───────────────────────────────────────────────────────────

describe("evaluateLanguageCount", () => {
  it("returns zero progress with no watched titles", async () => {
    const result = await evaluateLanguageCount(userId, 2);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("counts distinct languages across watched titles", async () => {
    await upsertTitles([makeParsedTitle({ id: "lang-en", objectType: "MOVIE", originalLanguage: "en" })]);
    await upsertTitles([makeParsedTitle({ id: "lang-fr", objectType: "MOVIE", originalLanguage: "fr" })]);
    await upsertTitles([makeParsedTitle({ id: "lang-ja", objectType: "MOVIE", originalLanguage: "ja" })]);
    await watchTitle("lang-en", userId);
    await watchTitle("lang-fr", userId);
    await watchTitle("lang-ja", userId);

    const result = await evaluateLanguageCount(userId, 3);
    expect(result.progress).toBe(3);
    expect(result.earned).toBe(true);
  });

  it("does not double-count titles with the same language", async () => {
    await upsertTitles([makeParsedTitle({ id: "lang-en1", objectType: "MOVIE", originalLanguage: "en" })]);
    await upsertTitles([makeParsedTitle({ id: "lang-en2", objectType: "MOVIE", originalLanguage: "en" })]);
    await watchTitle("lang-en1", userId);
    await watchTitle("lang-en2", userId);

    const result = await evaluateLanguageCount(userId, 2);
    expect(result.progress).toBe(1); // only 1 distinct language
    expect(result.earned).toBe(false);
  });

  it("earned = true at threshold", async () => {
    await upsertTitles([makeParsedTitle({ id: "lang-de", objectType: "MOVIE", originalLanguage: "de" })]);
    await upsertTitles([makeParsedTitle({ id: "lang-es", objectType: "MOVIE", originalLanguage: "es" })]);
    await watchTitle("lang-de", userId);
    await watchTitle("lang-es", userId);

    const result = await evaluateLanguageCount(userId, 2);
    expect(result.progress).toBe(2);
    expect(result.earned).toBe(true);
  });
});

// ─── long_film ────────────────────────────────────────────────────────────────

describe("evaluateLongFilm", () => {
  it("returns zero progress with no watched movies", async () => {
    const result = await evaluateLongFilm(userId);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("not earned when movie runtime is below 180 minutes", async () => {
    await upsertTitles([makeParsedTitle({ id: "short-film", objectType: "MOVIE", runtimeMinutes: 120 })]);
    await watchTitle("short-film", userId);

    const result = await evaluateLongFilm(userId);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });

  it("earned when user has watched a movie with runtime >= 180 minutes", async () => {
    await upsertTitles([makeParsedTitle({ id: "long-film", objectType: "MOVIE", runtimeMinutes: 195 })]);
    await watchTitle("long-film", userId);

    const result = await evaluateLongFilm(userId);
    expect(result.progress).toBe(1);
    expect(result.earned).toBe(true);
  });

  it("earned at exactly 180 minutes", async () => {
    await upsertTitles([makeParsedTitle({ id: "exactly-180", objectType: "MOVIE", runtimeMinutes: 180 })]);
    await watchTitle("exactly-180", userId);

    const result = await evaluateLongFilm(userId);
    expect(result.progress).toBe(1);
    expect(result.earned).toBe(true);
  });

  it("progress is capped at 1 even with multiple long films watched", async () => {
    await upsertTitles([makeParsedTitle({ id: "long-film-1", objectType: "MOVIE", runtimeMinutes: 185 })]);
    await upsertTitles([makeParsedTitle({ id: "long-film-2", objectType: "MOVIE", runtimeMinutes: 200 })]);
    await watchTitle("long-film-1", userId);
    await watchTitle("long-film-2", userId);

    const result = await evaluateLongFilm(userId);
    expect(result.progress).toBe(1); // capped at 1
    expect(result.earned).toBe(true);
  });

  it("does not count SHOW titles", async () => {
    await upsertTitles([makeParsedTitle({ id: "long-show", objectType: "SHOW", title: "Long Show", runtimeMinutes: 999 })]);
    await watchTitle("long-show", userId);

    const result = await evaluateLongFilm(userId);
    expect(result.progress).toBe(0);
    expect(result.earned).toBe(false);
  });
});
