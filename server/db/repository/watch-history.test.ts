import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, upsertEpisodes } from "../repository";
import { getRawDb } from "../bun-db";
import {
  getWatchHistoryById,
  updateWatchHistoryWatchedAt,
  getLatestWatchHistoryFor,
  logWatch,
  getTitleWatchHistory,
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

describe("getTitleWatchHistory", () => {
  it("default: returns { history, has_more: false, next_cursor: null } for result within default limit", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-twh-1", objectType: "MOVIE" })]);
    await logWatch(userId, "movie-twh-1", undefined, "2024-01-01 10:00:00");
    await logWatch(userId, "movie-twh-1", undefined, "2024-01-02 10:00:00");
    await logWatch(userId, "movie-twh-1", undefined, "2024-01-03 10:00:00");

    const result = await getTitleWatchHistory(userId, "movie-twh-1");
    expect(result.history.length).toBe(3);
    expect(result.has_more).toBe(false);
    expect(result.next_cursor).toBeNull();
  });

  it("returns has_more: true and non-null next_cursor when more rows exist", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-twh-2", objectType: "MOVIE" })]);
    // limit=2, insert 3 rows (limit + 1)
    await logWatch(userId, "movie-twh-2", undefined, "2024-01-01 10:00:00");
    await logWatch(userId, "movie-twh-2", undefined, "2024-01-02 10:00:00");
    await logWatch(userId, "movie-twh-2", undefined, "2024-01-03 10:00:00");

    const result = await getTitleWatchHistory(userId, "movie-twh-2", { limit: 2 });
    expect(result.history.length).toBe(2);
    expect(result.has_more).toBe(true);
    expect(typeof result.next_cursor).toBe("string");
  });

  it("cursor advances correctly with no overlap or gap", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-twh-3", objectType: "MOVIE" })]);
    const db = getRawDb();
    // Insert 4 watches with distinct timestamps (oldest to newest)
    db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-3", null, "2024-01-01 10:00:00", null]);
    db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-3", null, "2024-01-02 10:00:00", null]);
    db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-3", null, "2024-01-03 10:00:00", null]);
    db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-3", null, "2024-01-04 10:00:00", null]);

    const page1 = await getTitleWatchHistory(userId, "movie-twh-3", { limit: 2 });
    expect(page1.history.length).toBe(2);
    expect(page1.has_more).toBe(true);
    expect(page1.next_cursor).not.toBeNull();

    const page2 = await getTitleWatchHistory(userId, "movie-twh-3", { limit: 2, before: page1.next_cursor! });
    expect(page2.history.length).toBe(2);

    const page1Ids = page1.history.map((r) => r.id);
    const page2Ids = page2.history.map((r) => r.id);
    // No overlap
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);
    // Combined = 4 unique entries
    const allIds = new Set([...page1Ids, ...page2Ids]);
    expect(allIds.size).toBe(4);
  });

  it("identical-timestamp keyset correctness: no dup or skip on tie-break", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-twh-4", objectType: "MOVIE" })]);
    const db = getRawDb();
    const sameTs = "2024-06-15 12:00:00";
    // Insert 3 rows with same timestamp
    db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-4", null, sameTs, null]);
    db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-4", null, sameTs, null]);
    db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-4", null, sameTs, null]);

    const page1 = await getTitleWatchHistory(userId, "movie-twh-4", { limit: 2 });
    expect(page1.history.length).toBe(2);
    expect(page1.has_more).toBe(true);
    expect(page1.next_cursor).not.toBeNull();

    const page2 = await getTitleWatchHistory(userId, "movie-twh-4", { limit: 2, before: page1.next_cursor! });
    expect(page2.history.length).toBe(1);

    const page1Ids = page1.history.map((r) => r.id);
    const page2Ids = page2.history.map((r) => r.id);
    // No overlap
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);
    // All 3 unique entries covered
    const allIds = new Set([...page1Ids, ...page2Ids]);
    expect(allIds.size).toBe(3);
  });

  it("episodeId filter: returns only matching episode rows", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-twh-5", objectType: "SHOW" })]);
    await upsertEpisodes([makeEpisode("show-twh-5", 1)]);
    const epId = getEpisodeId("show-twh-5", 1);

    // Episode watch
    await logWatch(userId, "show-twh-5", epId, "2024-01-01 10:00:00");
    // Movie/show-level watch (no episodeId)
    await logWatch(userId, "show-twh-5", undefined, "2024-01-02 10:00:00");

    const result = await getTitleWatchHistory(userId, "show-twh-5", { episodeId: epId });
    expect(result.history.length).toBe(1);
    expect(result.history[0].episodeId).toBe(epId);
  });

  it("episodeId absent: returns all rows", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-twh-6", objectType: "SHOW" })]);
    await upsertEpisodes([makeEpisode("show-twh-6", 1)]);
    const epId = getEpisodeId("show-twh-6", 1);

    await logWatch(userId, "show-twh-6", epId, "2024-01-01 10:00:00");
    await logWatch(userId, "show-twh-6", undefined, "2024-01-02 10:00:00");

    const result = await getTitleWatchHistory(userId, "show-twh-6");
    expect(result.history.length).toBe(2);
    expect(result.has_more).toBe(false);
    expect(result.next_cursor).toBeNull();
  });

  it("limit clamping: caps at 100 rows max", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-twh-7", objectType: "MOVIE" })]);
    const db = getRawDb();
    // Insert 102 rows with varied timestamps to ensure unique keyset ordering
    for (let i = 0; i < 102; i++) {
      const hour = String(i % 24).padStart(2, "0");
      const day = String((Math.floor(i / 24) + 1)).padStart(2, "0");
      db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-7", null, `2024-01-${day} ${hour}:00:00`, null]);
    }

    const result = await getTitleWatchHistory(userId, "movie-twh-7", { limit: 200 });
    expect(result.history.length).toBe(100);
    expect(result.has_more).toBe(true);
  });

  it("malformed cursor is safely ignored and returns first-page results", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-twh-8", objectType: "MOVIE" })]);
    await logWatch(userId, "movie-twh-8", undefined, "2024-01-01 10:00:00");
    await logWatch(userId, "movie-twh-8", undefined, "2024-01-02 10:00:00");

    // Cursor with no pipe separator is malformed and should be treated as first page
    const result = await getTitleWatchHistory(userId, "movie-twh-8", { before: "nocursorpipe" });
    expect(result.history.length).toBe(2);

    // Should match the result with no cursor at all
    const baseline = await getTitleWatchHistory(userId, "movie-twh-8");
    const resultIds = result.history.map(r => r.id).sort();
    const baselineIds = baseline.history.map(r => r.id).sort();
    expect(resultIds).toEqual(baselineIds);
  });

  it("next_cursor is null on the final page", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-twh-9", objectType: "MOVIE" })]);
    const db = getRawDb();
    // Insert 5 rows
    for (let i = 0; i < 5; i++) {
      db.run("INSERT INTO watch_history (id, user_id, title_id, episode_id, watched_at, note) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, "movie-twh-9", null, `2024-01-0${i + 1} 10:00:00`, null]);
    }

    // Traverse all pages with limit=2
    let cursor: string | null = null;
    let lastResult: { history: { id: string; watchedAt: string; episodeId: number | null; note: string | null }[]; has_more: boolean; next_cursor: string | null } | null = null;
    let pages = 0;
    do {
      lastResult = await getTitleWatchHistory(userId, "movie-twh-9", { limit: 2, before: cursor ?? undefined });
      cursor = lastResult.next_cursor;
      pages++;
    } while (lastResult.has_more);

    // After traversal, last page should have next_cursor = null
    expect(lastResult!.has_more).toBe(false);
    expect(lastResult!.next_cursor).toBeNull();
    expect(pages).toBeGreaterThan(1);
  });
});
