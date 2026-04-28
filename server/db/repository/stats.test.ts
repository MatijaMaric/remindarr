import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, upsertEpisodes, watchEpisode } from "../repository";
import { logWatch } from "./watch-history";
import { getUserPace, computeEta } from "./stats";
import { getRawDb } from "../bun-db";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

async function insertShow(id: string, runtimeMinutes: number | null = 45) {
  await upsertTitles([
    makeParsedTitle({ id, objectType: "SHOW", title: `Show ${id}`, runtimeMinutes }),
  ]);
}

async function insertEpisodeForShow(
  showId: string,
  season: number,
  episode: number,
  airDate: string,
): Promise<number> {
  await upsertEpisodes([
    {
      title_id: showId,
      season_number: season,
      episode_number: episode,
      name: `S${season}E${episode}`,
      overview: null,
      air_date: airDate,
      still_path: null,
    },
  ]);
  const db = getRawDb();
  const row = db
    .prepare(
      `SELECT id FROM episodes WHERE title_id = ? AND season_number = ? AND episode_number = ?`,
    )
    .get(showId, season, episode) as { id: number } | undefined;
  if (!row) throw new Error("Episode not found after insert");
  return row.id;
}

// Insert a watch_history row with a specific watched_at date
async function insertWatchHistory(
  titleId: string,
  episodeId: number,
  watchedAt: string,
) {
  await logWatch(userId, titleId, episodeId, watchedAt);
}

describe("getUserPace", () => {
  it("returns null when no watch history", async () => {
    const pace = await getUserPace(userId);
    expect(pace.minutesPerDay).toBeNull();
  });

  it("computes pace from watch_history", async () => {
    await insertShow("show-1", 60);
    const epId = await insertEpisodeForShow("show-1", 1, 1, "2024-01-01");
    // Watch within last 30 days
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    await insertWatchHistory("show-1", epId, recentDate.toISOString());

    const pace = await getUserPace(userId);
    // 1 episode * 60 min / 30 days = 2 min/day
    expect(pace.minutesPerDay).toBeCloseTo(2, 5);
  });

  it("falls back to watched_episodes when watch_history empty", async () => {
    await insertShow("show-2", 30);
    const epId = await insertEpisodeForShow("show-2", 1, 1, "2024-01-01");
    // Mark as watched (goes into watched_episodes) with recent date
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    // Insert directly into watched_episodes with a recent watchedAt
    const db = getRawDb();
    db.prepare(
      `INSERT OR IGNORE INTO watched_episodes (episode_id, user_id, watched_at) VALUES (?, ?, ?)`,
    ).run(epId, userId, recentDate.toISOString());

    const pace = await getUserPace(userId);
    // 1 episode * 30 min / 30 days = 1 min/day
    expect(pace.minutesPerDay).toBeCloseTo(1, 5);
  });

  it("returns null (not 0) when pace is 0 — no episodes watched in last 30 days", async () => {
    await insertShow("show-3", 45);
    const epId = await insertEpisodeForShow("show-3", 1, 1, "2023-01-01");
    // Watched 60 days ago — outside the 30-day window
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    await insertWatchHistory("show-3", epId, oldDate.toISOString());

    const pace = await getUserPace(userId);
    expect(pace.minutesPerDay).toBeNull();
  });

  it("ignores episodes from shows with null runtime_minutes", async () => {
    await insertShow("show-4", null); // no runtime set
    const epId = await insertEpisodeForShow("show-4", 1, 1, "2024-01-01");
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    await insertWatchHistory("show-4", epId, recentDate.toISOString());

    const pace = await getUserPace(userId);
    expect(pace.minutesPerDay).toBeNull();
  });
});

describe("computeEta", () => {
  it("returns null when minutesPerDay is null", () => {
    expect(computeEta(300, null)).toBeNull();
  });

  it("returns null when minutesPerDay is 0", () => {
    expect(computeEta(300, 0)).toBeNull();
  });

  it("returns null when minutesPerDay is negative", () => {
    expect(computeEta(300, -5)).toBeNull();
  });

  it("computes correct ETA", () => {
    // 600 minutes remaining, 60 min/day => 10 days
    expect(computeEta(600, 60)).toBe(10);
  });

  it("rounds up fractional days", () => {
    // 61 minutes remaining, 60 min/day => ceil(61/60) = 2
    expect(computeEta(61, 60)).toBe(2);
  });

  it("returns 0 days when remaining is 0", () => {
    expect(computeEta(0, 60)).toBe(0);
  });
});
