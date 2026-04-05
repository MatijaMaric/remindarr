import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser, upsertTitles } from "../repository";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { getUnalertedProviders, markAlerted } from "./streaming-alerts";

let userId: string;
const TITLE_ID = "movie-streaming-1";

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("alertuser", "hash");
  await upsertTitles([makeParsedTitle({ id: TITLE_ID, title: "Streaming Movie" })]);
});

afterAll(() => {
  teardownTestDb();
});

describe("getUnalertedProviders", () => {
  it("returns all providerIds when none have been alerted", async () => {
    const result = await getUnalertedProviders(userId, TITLE_ID, [8, 119, 337]);
    expect(result).toEqual([8, 119, 337]);
  });

  it("returns empty array when providerIds is empty", async () => {
    const result = await getUnalertedProviders(userId, TITLE_ID, []);
    expect(result).toEqual([]);
  });

  it("excludes already-alerted providerIds", async () => {
    await markAlerted(userId, TITLE_ID, 8, "Netflix");
    const result = await getUnalertedProviders(userId, TITLE_ID, [8, 119, 337]);
    expect(result).not.toContain(8);
    expect(result).toContain(119);
    expect(result).toContain(337);
  });

  it("returns empty array when all providers have been alerted", async () => {
    await markAlerted(userId, TITLE_ID, 8, "Netflix");
    await markAlerted(userId, TITLE_ID, 119, "Amazon Prime");
    const result = await getUnalertedProviders(userId, TITLE_ID, [8, 119]);
    expect(result).toEqual([]);
  });

  it("is scoped per user — other user's alerts don't affect this user", async () => {
    const otherUserId = await createUser("otheruser", "hash");
    await markAlerted(otherUserId, TITLE_ID, 8, "Netflix");
    // userId has NOT been alerted, so 8 should still show as unalerted
    const result = await getUnalertedProviders(userId, TITLE_ID, [8]);
    expect(result).toContain(8);
  });

  it("is scoped per title — alerts for other titles don't affect this title", async () => {
    const OTHER_TITLE_ID = "movie-streaming-2";
    await upsertTitles([makeParsedTitle({ id: OTHER_TITLE_ID, title: "Other Movie" })]);
    await markAlerted(userId, OTHER_TITLE_ID, 8, "Netflix");
    // TITLE_ID has NOT been alerted for provider 8
    const result = await getUnalertedProviders(userId, TITLE_ID, [8]);
    expect(result).toContain(8);
  });
});

describe("markAlerted", () => {
  it("marks a provider as alerted", async () => {
    await markAlerted(userId, TITLE_ID, 8, "Netflix");
    const result = await getUnalertedProviders(userId, TITLE_ID, [8]);
    expect(result).toEqual([]);
  });

  it("is idempotent — calling twice does not throw", async () => {
    await markAlerted(userId, TITLE_ID, 8, "Netflix");
    await markAlerted(userId, TITLE_ID, 8, "Netflix");
    const result = await getUnalertedProviders(userId, TITLE_ID, [8]);
    expect(result).toEqual([]);
  });
});
