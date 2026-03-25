import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser } from "../repository";
import { watchTitle, unwatchTitle, getWatchedTitleIds } from "./watched-titles";

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
