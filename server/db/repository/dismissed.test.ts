import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser } from "../repository";
import { dismissTitle, undismissTitle, getDismissedTitleIds, getDismissedCount } from "./dismissed";
import { upsertTitles } from "./titles";

let userId: string;
const titleId = "tt-1";
const titleId2 = "tt-2";

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("alice", "hash");
  await upsertTitles([
    { id: titleId, objectType: "SHOW", title: "Test Show", originalTitle: null, releaseYear: 2024, releaseDate: null, runtimeMinutes: null, shortDescription: null, genres: [], originalLanguage: "en", imdbId: null, tmdbId: null, posterUrl: null, backdropUrl: null, ageCertification: null, tmdbUrl: null, offers: [], scores: { imdbScore: null, imdbVotes: null, tmdbScore: null } },
    { id: titleId2, objectType: "MOVIE", title: "Test Movie", originalTitle: null, releaseYear: 2024, releaseDate: null, runtimeMinutes: null, shortDescription: null, genres: [], originalLanguage: "en", imdbId: null, tmdbId: null, posterUrl: null, backdropUrl: null, ageCertification: null, tmdbUrl: null, offers: [], scores: { imdbScore: null, imdbVotes: null, tmdbScore: null } },
  ]);
});

afterAll(() => {
  teardownTestDb();
});

describe("dismissTitle", () => {
  it("adds a title to the dismissed set", async () => {
    await dismissTitle(userId, titleId);
    const ids = await getDismissedTitleIds(userId);
    expect(ids.has(titleId)).toBe(true);
  });

  it("is idempotent — dismissing twice does not error", async () => {
    await dismissTitle(userId, titleId);
    await dismissTitle(userId, titleId);
    const ids = await getDismissedTitleIds(userId);
    expect(ids.size).toBe(1);
  });

  it("dismissed titles are isolated per user", async () => {
    const userId2 = await createUser("bob", "hash");
    await dismissTitle(userId, titleId);
    const ids = await getDismissedTitleIds(userId2);
    expect(ids.has(titleId)).toBe(false);
  });
});

describe("undismissTitle", () => {
  it("removes a title from the dismissed set", async () => {
    await dismissTitle(userId, titleId);
    await undismissTitle(userId, titleId);
    const ids = await getDismissedTitleIds(userId);
    expect(ids.has(titleId)).toBe(false);
  });

  it("is a no-op when title was not dismissed", async () => {
    await undismissTitle(userId, titleId);
    const ids = await getDismissedTitleIds(userId);
    expect(ids.size).toBe(0);
  });
});

describe("getDismissedTitleIds", () => {
  it("returns all dismissed titles for a user", async () => {
    await dismissTitle(userId, titleId);
    await dismissTitle(userId, titleId2);
    const ids = await getDismissedTitleIds(userId);
    expect(ids.size).toBe(2);
    expect(ids.has(titleId)).toBe(true);
    expect(ids.has(titleId2)).toBe(true);
  });

  it("returns an empty set when nothing is dismissed", async () => {
    const ids = await getDismissedTitleIds(userId);
    expect(ids.size).toBe(0);
  });
});

describe("getDismissedCount", () => {
  it("returns the number of dismissed titles", async () => {
    await dismissTitle(userId, titleId);
    await dismissTitle(userId, titleId2);
    expect(await getDismissedCount(userId)).toBe(2);
  });

  it("returns 0 when nothing is dismissed", async () => {
    expect(await getDismissedCount(userId)).toBe(0);
  });
});
