import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, upsertEpisodes } from "../repository";
import { getRawDb } from "../bun-db";
import {
  getWatchHistoryById,
  updateWatchHistoryWatchedAt,
  getLatestWatchHistoryFor,
  logWatch,
} from "./watch-history";

let userId: string;
let otherUserId: string;

function makeEpisode(titleId: string, n: number) {
  return {
    title_id: titleId,
    season_number: 1,
    episode_number: n,
    name: `Episode ${n}`,
    overview: null,
    air_date: "2024-01-01",
    still_path: null,
  };
}

function getEpisodeId(titleId: string, episodeNumber: number): number {
  const db = getRawDb();
  const row = db
    .prepare("SELECT id FROM episodes WHERE title_id = ? AND episode_number = ?")
    .get(titleId, episodeNumber) as { id: number } | undefined;
  return row!.id;
}

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
  otherUserId = await createUser("otheruser", "hash2");
});

afterAll(() => {
  teardownTestDb();
});

describe("getWatchHistoryById", () => {
  it("returns null for unknown id", async () => {
    const row = await getWatchHistoryById("nonexistent", userId);
    expect(row).toBeNull();
  });

  it("returns the row for the correct user", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-ghb-1", objectType: "MOVIE" })]);
    await logWatch(userId, "movie-ghb-1");

    const db = getRawDb();
    const histRow = db.prepare("SELECT id FROM watch_history WHERE user_id = ?").get(userId) as { id: string };

    const result = await getWatchHistoryById(histRow.id, userId);
    expect(result).not.toBeNull();
    expect(result!.titleId).toBe("movie-ghb-1");
    expect(result!.userId).toBe(userId);
  });

  it("returns null for another user's row id", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-ghb-2", objectType: "MOVIE" })]);
    await logWatch(otherUserId, "movie-ghb-2");

    const db = getRawDb();
    const histRow = db.prepare("SELECT id FROM watch_history WHERE user_id = ?").get(otherUserId) as { id: string };

    const result = await getWatchHistoryById(histRow.id, userId);
    expect(result).toBeNull();
  });
});

describe("updateWatchHistoryWatchedAt", () => {
  it("updates the watched_at value for the correct row", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-upd-1", objectType: "MOVIE" })]);
    await logWatch(userId, "movie-upd-1");

    const db = getRawDb();
    const histRow = db.prepare("SELECT id FROM watch_history WHERE user_id = ?").get(userId) as { id: string };

    await updateWatchHistoryWatchedAt(histRow.id, userId, "2020-06-15 12:00:00");

    const updated = db.prepare("SELECT watched_at FROM watch_history WHERE id = ?").get(histRow.id) as { watched_at: string };
    expect(updated.watched_at).toBe("2020-06-15 12:00:00");
  });

  it("does not affect rows belonging to another user", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-upd-2", objectType: "MOVIE" })]);
    await logWatch(otherUserId, "movie-upd-2");

    const db = getRawDb();
    const histRow = db.prepare("SELECT id, watched_at FROM watch_history WHERE user_id = ?").get(otherUserId) as { id: string; watched_at: string };
    const originalWatchedAt = histRow.watched_at;

    await updateWatchHistoryWatchedAt(histRow.id, userId, "2020-06-15 12:00:00");

    const unchanged = db.prepare("SELECT watched_at FROM watch_history WHERE id = ?").get(histRow.id) as { watched_at: string };
    expect(unchanged.watched_at).toBe(originalWatchedAt);
  });
});

describe("getLatestWatchHistoryFor", () => {
  it("returns null when no history rows exist", async () => {
    const result = await getLatestWatchHistoryFor(userId, "nonexistent-title", null);
    expect(result).toBeNull();
  });

  it("returns the maximum watched_at for a movie (episodeId = null)", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-lat-1", objectType: "MOVIE" })]);
    await logWatch(userId, "movie-lat-1", undefined, "2024-01-01 10:00:00");
    await logWatch(userId, "movie-lat-1", undefined, "2024-06-15 08:00:00");
    await logWatch(userId, "movie-lat-1", undefined, "2023-12-31 23:59:59");

    const result = await getLatestWatchHistoryFor(userId, "movie-lat-1", null);
    expect(result).toBe("2024-06-15 08:00:00");
  });

  it("returns the maximum watched_at for a specific episode", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-lat-1", objectType: "SHOW" })]);
    await upsertEpisodes([makeEpisode("show-lat-1", 1)]);
    const epId = getEpisodeId("show-lat-1", 1);

    await logWatch(userId, "show-lat-1", epId, "2024-03-01 00:00:00");
    await logWatch(userId, "show-lat-1", epId, "2024-09-20 00:00:00");

    const result = await getLatestWatchHistoryFor(userId, "show-lat-1", epId);
    expect(result).toBe("2024-09-20 00:00:00");
  });

  it("does not mix movie and episode rows when episodeId is null", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-lat-2", objectType: "SHOW" })]);
    await upsertEpisodes([makeEpisode("show-lat-2", 1)]);
    const epId = getEpisodeId("show-lat-2", 1);

    await logWatch(userId, "show-lat-2", epId, "2024-11-01 00:00:00");
    await logWatch(userId, "show-lat-2", undefined, "2024-01-01 00:00:00");

    const movieResult = await getLatestWatchHistoryFor(userId, "show-lat-2", null);
    expect(movieResult).toBe("2024-01-01 00:00:00");
  });
});
