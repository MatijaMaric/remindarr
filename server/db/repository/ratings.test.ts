import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser } from "../repository";
import { follow } from "./follows";
import {
  rateTitle,
  unrateTitle,
  getUserRating,
  getTitleRatings,
  getFriendsRatings,
} from "./ratings";

let userA: string;
let userB: string;
let userC: string;

beforeEach(async () => {
  setupTestDb();
  userA = await createUser("alice", "hash");
  userB = await createUser("bob", "hash");
  userC = await createUser("carol", "hash");
  await upsertTitles([
    makeParsedTitle({ id: "movie-1", title: "Test Movie" }),
    makeParsedTitle({ id: "movie-2", title: "Another Movie" }),
  ]);
});

afterAll(() => {
  teardownTestDb();
});

describe("rateTitle", () => {
  it("inserts a new rating", async () => {
    await rateTitle(userA, "movie-1", "LOVE");
    const rating = await getUserRating(userA, "movie-1");
    expect(rating).toBe("LOVE");
  });

  it("updates an existing rating (upsert)", async () => {
    await rateTitle(userA, "movie-1", "LIKE");
    await rateTitle(userA, "movie-1", "LOVE");
    const rating = await getUserRating(userA, "movie-1");
    expect(rating).toBe("LOVE");
  });
});

describe("unrateTitle", () => {
  it("removes a rating", async () => {
    await rateTitle(userA, "movie-1", "LIKE");
    await unrateTitle(userA, "movie-1");
    const rating = await getUserRating(userA, "movie-1");
    expect(rating).toBeNull();
  });

  it("is a no-op when no rating exists", async () => {
    await unrateTitle(userA, "movie-1");
    const rating = await getUserRating(userA, "movie-1");
    expect(rating).toBeNull();
  });
});

describe("getUserRating", () => {
  it("returns the rating for a user+title", async () => {
    await rateTitle(userA, "movie-1", "DISLIKE");
    expect(await getUserRating(userA, "movie-1")).toBe("DISLIKE");
  });

  it("returns null when no rating exists", async () => {
    expect(await getUserRating(userA, "movie-1")).toBeNull();
  });
});

describe("getTitleRatings", () => {
  it("returns aggregated counts per rating type", async () => {
    await rateTitle(userA, "movie-1", "LOVE");
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userC, "movie-1", "LIKE");

    const result = await getTitleRatings("movie-1");
    expect(result.LOVE).toBe(2);
    expect(result.LIKE).toBe(1);
    expect(result.DISLIKE).toBe(0);
    expect(result.HATE).toBe(0);
  });

  it("returns all zeros for an unrated title", async () => {
    const result = await getTitleRatings("movie-2");
    expect(result.LOVE).toBe(0);
    expect(result.LIKE).toBe(0);
    expect(result.DISLIKE).toBe(0);
    expect(result.HATE).toBe(0);
  });
});

describe("getFriendsRatings", () => {
  it("returns ratings from users the current user follows", async () => {
    await follow(userA, userB);
    await follow(userA, userC);
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userC, "movie-1", "LIKE");

    const result = await getFriendsRatings(userA, "movie-1");
    expect(result).toHaveLength(2);
    const usernames = result.map((r) => r.username);
    expect(usernames).toContain("bob");
    expect(usernames).toContain("carol");
  });

  it("does not include ratings from unfollowed users", async () => {
    await follow(userA, userB);
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userC, "movie-1", "LIKE"); // not followed by userA

    const result = await getFriendsRatings(userA, "movie-1");
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("bob");
  });

  it("returns empty list when no friends have rated", async () => {
    await follow(userA, userB);
    const result = await getFriendsRatings(userA, "movie-1");
    expect(result).toHaveLength(0);
  });
});
