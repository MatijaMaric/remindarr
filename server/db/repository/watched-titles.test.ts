import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, trackTitle, updateTrackedStatus } from "../repository";
import { watchTitle, unwatchTitle, getWatchedTitleIds } from "./watched-titles";
import { getTrackedTitles } from "./tracked";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("watchTitle", () => {
  it("inserts a watched record", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-1" })]);
    await watchTitle("movie-1", userId);

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("movie-1")).toBe(true);
  });

  it("is idempotent — calling twice does not error", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-2" })]);
    await watchTitle("movie-2", userId);
    await watchTitle("movie-2", userId);

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("movie-2")).toBe(true);
  });
});

describe("unwatchTitle", () => {
  it("removes a watched record", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-3" })]);
    await watchTitle("movie-3", userId);
    await unwatchTitle("movie-3", userId);

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("movie-3")).toBe(false);
  });

  it("is a no-op on an unwatched title", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-4" })]);
    await unwatchTitle("movie-4", userId);

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("movie-4")).toBe(false);
  });
});

describe("watchTitle — status sync", () => {
  it("sets user_status=completed on a tracked MOVIE", async () => {
    await upsertTitles([makeParsedTitle({ id: "sync-m1", objectType: "MOVIE" })]);
    await trackTitle("sync-m1", userId);
    await watchTitle("sync-m1", userId);

    const titles = await getTrackedTitles(userId);
    const row = titles.find((t) => t.id === "sync-m1");
    expect(row?.user_status).toBe("completed");
  });

  it("does not error when watching an untracked MOVIE", async () => {
    await upsertTitles([makeParsedTitle({ id: "sync-m2", objectType: "MOVIE" })]);
    await watchTitle("sync-m2", userId);

    const ids = await getWatchedTitleIds(userId);
    expect(ids.has("sync-m2")).toBe(true);
  });

  it("does NOT set user_status on a tracked SHOW", async () => {
    await upsertTitles([makeParsedTitle({ id: "sync-s1", objectType: "SHOW" })]);
    await trackTitle("sync-s1", userId);
    await watchTitle("sync-s1", userId);

    const titles = await getTrackedTitles(userId);
    const row = titles.find((t) => t.id === "sync-s1");
    expect(row?.user_status).toBeNull();
  });
});

describe("unwatchTitle — status sync", () => {
  it("clears user_status=completed when unwatching a MOVIE", async () => {
    await upsertTitles([makeParsedTitle({ id: "sync-m3", objectType: "MOVIE" })]);
    await trackTitle("sync-m3", userId);
    await watchTitle("sync-m3", userId);
    await unwatchTitle("sync-m3", userId);

    const titles = await getTrackedTitles(userId);
    const row = titles.find((t) => t.id === "sync-m3");
    expect(row?.user_status).toBeNull();
  });

  it("preserves non-completed user_status when unwatching a MOVIE", async () => {
    await upsertTitles([makeParsedTitle({ id: "sync-m4", objectType: "MOVIE" })]);
    await trackTitle("sync-m4", userId);
    await updateTrackedStatus("sync-m4", userId, "dropped");
    await unwatchTitle("sync-m4", userId);

    const titles = await getTrackedTitles(userId);
    const row = titles.find((t) => t.id === "sync-m4");
    expect(row?.user_status).toBe("dropped");
  });
});

describe("getWatchedTitleIds", () => {
  it("returns correct set of watched title IDs", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-5" }),
      makeParsedTitle({ id: "movie-6" }),
      makeParsedTitle({ id: "movie-7" }),
    ]);
    await watchTitle("movie-5", userId);
    await watchTitle("movie-7", userId);

    const ids = await getWatchedTitleIds(userId);
    expect(ids.size).toBe(2);
    expect(ids.has("movie-5")).toBe(true);
    expect(ids.has("movie-6")).toBe(false);
    expect(ids.has("movie-7")).toBe(true);
  });

  it("returns empty set when no titles are watched", async () => {
    const ids = await getWatchedTitleIds(userId);
    expect(ids.size).toBe(0);
  });
});
