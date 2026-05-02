import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser, upsertTitles } from "../repository";
import { makeParsedTitle, makeParsedOffer } from "../../test-utils/fixtures";
import {
  getSubscribedProviderIds,
  setSubscribedProviderIds,
  getOnlyMineFilter,
  setOnlyMineFilter,
  filterValidProviderIds,
} from "./user-subscribed-providers";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("subuser", "hash");
  // Seed providers 8 (Netflix) and 337 (Disney+) via a title with offers
  await upsertTitles([
    makeParsedTitle({
      id: "movie-sub-1",
      offers: [
        makeParsedOffer({ titleId: "movie-sub-1", providerId: 8, providerName: "Netflix", providerTechnicalName: "netflix" }),
        makeParsedOffer({ titleId: "movie-sub-1", providerId: 337, providerName: "Disney+", providerTechnicalName: "disneyplus" }),
      ],
    }),
  ]);
});

afterAll(() => {
  teardownTestDb();
});

describe("getSubscribedProviderIds / setSubscribedProviderIds", () => {
  it("returns empty array for a new user", async () => {
    const ids = await getSubscribedProviderIds(userId);
    expect(ids).toEqual([]);
  });

  it("normalises non-canonical provider IDs (119→9) on save", async () => {
    // Seed canonical provider 9 (Amazon Prime Video)
    await upsertTitles([
      makeParsedTitle({
        id: "movie-sub-canonical",
        offers: [makeParsedOffer({ titleId: "movie-sub-canonical", providerId: 9, providerName: "Amazon Prime Video", providerTechnicalName: "amazon_prime_video" })],
      }),
    ]);
    await setSubscribedProviderIds(userId, [119]);
    const ids = await getSubscribedProviderIds(userId);
    expect(ids).toEqual([9]);
  });

  it("round-trips set and get", async () => {
    await setSubscribedProviderIds(userId, [8, 337]);
    const ids = await getSubscribedProviderIds(userId);
    expect(ids.sort((a, b) => a - b)).toEqual([8, 337]);
  });

  it("replaces the full list on each set (no duplicates)", async () => {
    await setSubscribedProviderIds(userId, [8]);
    await setSubscribedProviderIds(userId, [337]);
    const ids = await getSubscribedProviderIds(userId);
    expect(ids).toEqual([337]);
  });

  it("clearing to empty array removes all subscriptions", async () => {
    await setSubscribedProviderIds(userId, [8, 337]);
    await setSubscribedProviderIds(userId, []);
    const ids = await getSubscribedProviderIds(userId);
    expect(ids).toEqual([]);
  });

  it("is scoped per user — another user's subscriptions don't interfere", async () => {
    const other = await createUser("subuser2", "hash");
    await setSubscribedProviderIds(userId, [8]);
    await setSubscribedProviderIds(other, [337]);
    expect(await getSubscribedProviderIds(userId)).toEqual([8]);
    expect(await getSubscribedProviderIds(other)).toEqual([337]);
  });
});

describe("getOnlyMineFilter / setOnlyMineFilter", () => {
  it("defaults to false for a new user", async () => {
    const value = await getOnlyMineFilter(userId);
    expect(value).toBe(false);
  });

  it("round-trips true", async () => {
    await setOnlyMineFilter(userId, true);
    expect(await getOnlyMineFilter(userId)).toBe(true);
  });

  it("round-trips false", async () => {
    await setOnlyMineFilter(userId, true);
    await setOnlyMineFilter(userId, false);
    expect(await getOnlyMineFilter(userId)).toBe(false);
  });
});

describe("filterValidProviderIds", () => {
  it("returns empty for empty input", async () => {
    expect(await filterValidProviderIds([])).toEqual([]);
  });

  it("returns only IDs that exist in the providers table", async () => {
    const result = await filterValidProviderIds([8, 337, 9999]);
    expect(result.sort((a, b) => a - b)).toEqual([8, 337]);
  });

  it("returns empty when none of the IDs exist", async () => {
    const result = await filterValidProviderIds([9998, 9999]);
    expect(result).toEqual([]);
  });
});
