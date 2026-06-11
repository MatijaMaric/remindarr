import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser, upsertTitles } from "../repository";
import { makeParsedTitle } from "../../test-utils/fixtures";
import {
  getUnalertedProviders,
  getUnalertedProvidersBulk,
  markAlerted,
} from "./streaming-alerts";

let userId: string;
const TITLE_ID = "movie-streaming-1";

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("alertuser", "hash");
  await upsertTitles([
    makeParsedTitle({ id: TITLE_ID, title: "Streaming Movie" }),
  ]);
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
    await upsertTitles([
      makeParsedTitle({ id: OTHER_TITLE_ID, title: "Other Movie" }),
    ]);
    await markAlerted(userId, OTHER_TITLE_ID, 8, "Netflix");
    // TITLE_ID has NOT been alerted for provider 8
    const result = await getUnalertedProviders(userId, TITLE_ID, [8]);
    expect(result).toContain(8);
  });
});

describe("getUnalertedProvidersBulk", () => {
  it("returns per-user unalerted providers when one user is partially alerted", async () => {
    const otherUserId = await createUser("bulkuser2", "hash");
    await markAlerted(userId, TITLE_ID, 8, "Netflix");

    const result = await getUnalertedProvidersBulk(
      [userId, otherUserId],
      TITLE_ID,
      [8, 119, 337],
    );

    expect(result.size).toBe(2);
    expect(result.get(userId)).toEqual([119, 337]);
    expect(result.get(otherUserId)).toEqual([8, 119, 337]);
  });

  it("returns an empty map when userIds is empty", async () => {
    const result = await getUnalertedProvidersBulk([], TITLE_ID, [8, 119]);
    expect(result.size).toBe(0);
  });

  it("maps every user to an empty array when providerIds is empty", async () => {
    const otherUserId = await createUser("bulkuser3", "hash");
    const result = await getUnalertedProvidersBulk(
      [userId, otherUserId],
      TITLE_ID,
      [],
    );
    expect(result.size).toBe(2);
    expect(result.get(userId)).toEqual([]);
    expect(result.get(otherUserId)).toEqual([]);
  });

  it("is scoped per kind — departure alerts don't affect arrivals", async () => {
    await markAlerted(userId, TITLE_ID, 8, "Netflix", "departure");
    const arrivals = await getUnalertedProvidersBulk(
      [userId],
      TITLE_ID,
      [8],
      "arrival",
    );
    expect(arrivals.get(userId)).toEqual([8]);
    const departures = await getUnalertedProvidersBulk(
      [userId],
      TITLE_ID,
      [8],
      "departure",
    );
    expect(departures.get(userId)).toEqual([]);
  });

  it("returns correct results for >60 users (userId chunking)", async () => {
    // 50 providerIds → chunk size 47 (97 - 50), so 61 users span 2 chunks
    const providerIds = Array.from({ length: 50 }, (_, i) => i + 1);
    const userIds: string[] = [];
    for (let i = 0; i < 61; i++) {
      userIds.push(await createUser(`bulk-chunk-${i}`, "hash"));
    }
    // One alerted user in the first chunk, one in the second
    await markAlerted(userIds[0], TITLE_ID, 1, "Provider 1");
    await markAlerted(userIds[60], TITLE_ID, 2, "Provider 2");

    const result = await getUnalertedProvidersBulk(
      userIds,
      TITLE_ID,
      providerIds,
    );

    expect(result.size).toBe(61);
    expect(result.get(userIds[0])).toEqual(
      providerIds.filter((id) => id !== 1),
    );
    expect(result.get(userIds[60])).toEqual(
      providerIds.filter((id) => id !== 2),
    );
    for (let i = 1; i < 60; i++) {
      expect(result.get(userIds[i])).toEqual(providerIds);
    }
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
