import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, follow } from "../repository";
import {
  createRecommendation,
  getUserRecommendation,
  getDiscoveryFeed,
  getDiscoveryFeedCount,
  getSentRecommendations,
  markAsRead,
  deleteRecommendation,
  getUnreadCount,
} from "./recommendations";

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

describe("createRecommendation", () => {
  it("creates a recommendation and returns an id", async () => {
    const id = await createRecommendation(userA, "movie-1", "You should watch this!");
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
  });

  it("creates a recommendation without a message", async () => {
    const id = await createRecommendation(userA, "movie-1");
    expect(id).toBeDefined();
  });
});

describe("getUserRecommendation", () => {
  it("returns the recommendation if user already recommended the title", async () => {
    await createRecommendation(userA, "movie-1");
    const existing = await getUserRecommendation(userA, "movie-1");
    expect(existing).not.toBeNull();
    expect(existing?.id).toBeDefined();
  });

  it("returns undefined if user has not recommended the title", async () => {
    const existing = await getUserRecommendation(userA, "movie-1");
    expect(existing).toBeUndefined();
  });
});

describe("getDiscoveryFeed", () => {
  it("returns recommendations from followed users", async () => {
    // Bob follows Alice
    await follow(userB, userA);
    await createRecommendation(userA, "movie-1", "Check this out");

    const feed = await getDiscoveryFeed(userB);
    expect(feed).toHaveLength(1);
    expect(feed[0].fromUsername).toBe("alice");
    expect(feed[0].titleName).toBe("Test Movie");
  });

  it("does not return recommendations from unfollowed users", async () => {
    await createRecommendation(userA, "movie-1");

    // userB does NOT follow userA
    const feed = await getDiscoveryFeed(userB);
    expect(feed).toHaveLength(0);
  });

  it("returns empty list when user follows nobody", async () => {
    const feed = await getDiscoveryFeed(userA);
    expect(feed).toHaveLength(0);
  });

  it("includes read status from recommendation_reads", async () => {
    await follow(userB, userA);
    const recId = await createRecommendation(userA, "movie-1");

    // Before marking as read
    let feed = await getDiscoveryFeed(userB);
    expect(feed[0].readAt).toBeNull();

    // Mark as read
    await markAsRead(recId, userB);

    // After marking as read
    feed = await getDiscoveryFeed(userB);
    expect(feed[0].readAt).not.toBeNull();
  });

  it("supports pagination with limit and offset", async () => {
    await follow(userB, userA);
    await createRecommendation(userA, "movie-1");
    await createRecommendation(userA, "movie-2");

    const page1 = await getDiscoveryFeed(userB, 1, 0);
    expect(page1).toHaveLength(1);

    const page2 = await getDiscoveryFeed(userB, 1, 1);
    expect(page2).toHaveLength(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});

describe("getDiscoveryFeedCount", () => {
  it("returns the total count of recommendations from followed users", async () => {
    await follow(userB, userA);
    await createRecommendation(userA, "movie-1");
    await createRecommendation(userA, "movie-2");

    const count = await getDiscoveryFeedCount(userB);
    expect(count).toBe(2);
  });

  it("returns 0 when no followed users have recommendations", async () => {
    const count = await getDiscoveryFeedCount(userB);
    expect(count).toBe(0);
  });
});

describe("getSentRecommendations", () => {
  it("returns user's own recommendations", async () => {
    await createRecommendation(userA, "movie-1");
    await createRecommendation(userA, "movie-2");

    const recs = await getSentRecommendations(userA);
    expect(recs).toHaveLength(2);
  });

  it("returns empty list when no recommendations sent", async () => {
    const recs = await getSentRecommendations(userA);
    expect(recs).toHaveLength(0);
  });
});

describe("markAsRead", () => {
  it("inserts a read record into recommendation_reads", async () => {
    await follow(userB, userA);
    const id = await createRecommendation(userA, "movie-1");

    await markAsRead(id, userB);

    const feed = await getDiscoveryFeed(userB);
    expect(feed[0].readAt).not.toBeNull();
  });

  it("does not fail if called twice (conflict do nothing)", async () => {
    await follow(userB, userA);
    const id = await createRecommendation(userA, "movie-1");

    await markAsRead(id, userB);
    await markAsRead(id, userB); // should not throw

    const feed = await getDiscoveryFeed(userB);
    expect(feed[0].readAt).not.toBeNull();
  });
});

describe("deleteRecommendation", () => {
  it("deletes a recommendation the user created", async () => {
    const id = await createRecommendation(userA, "movie-1");

    await deleteRecommendation(id, userA);

    const recs = await getSentRecommendations(userA);
    expect(recs).toHaveLength(0);
  });

  it("does not delete if user is not the creator", async () => {
    const id = await createRecommendation(userA, "movie-1");

    await deleteRecommendation(id, userB); // not the creator

    const recs = await getSentRecommendations(userA);
    expect(recs).toHaveLength(1);
  });
});

describe("getUnreadCount", () => {
  it("returns count of unread recommendations from followed users", async () => {
    await follow(userB, userA);
    await follow(userB, userC);
    await createRecommendation(userA, "movie-1");
    await createRecommendation(userC, "movie-2");

    expect(await getUnreadCount(userB)).toBe(2);
  });

  it("decreases after marking as read", async () => {
    await follow(userB, userA);
    const id = await createRecommendation(userA, "movie-1");
    await createRecommendation(userA, "movie-2");

    await markAsRead(id, userB);

    expect(await getUnreadCount(userB)).toBe(1);
  });

  it("returns 0 when no followed users have recommendations", async () => {
    expect(await getUnreadCount(userA)).toBe(0);
  });

  it("returns 0 when user follows nobody", async () => {
    await createRecommendation(userA, "movie-1");
    expect(await getUnreadCount(userB)).toBe(0);
  });
});
