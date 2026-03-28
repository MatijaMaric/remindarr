import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser } from "../repository";
import {
  createRecommendation,
  getReceivedRecommendations,
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
    const id = await createRecommendation(userA, userB, "movie-1", "You should watch this!");
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
  });

  it("creates a recommendation without a message", async () => {
    const id = await createRecommendation(userA, userB, "movie-1");
    expect(id).toBeDefined();
  });
});

describe("getReceivedRecommendations", () => {
  it("returns received recommendations with user and title info", async () => {
    await createRecommendation(userA, userB, "movie-1", "Check this out");
    await createRecommendation(userC, userB, "movie-2");

    const recs = await getReceivedRecommendations(userB);
    expect(recs).toHaveLength(2);
    expect(recs[0].fromUsername).toBeDefined();
    expect(recs[0].titleName).toBeDefined();
  });

  it("returns empty list when no recommendations", async () => {
    const recs = await getReceivedRecommendations(userA);
    expect(recs).toHaveLength(0);
  });

  it("supports pagination with limit and offset", async () => {
    await createRecommendation(userA, userB, "movie-1");
    await createRecommendation(userC, userB, "movie-2");

    const page1 = await getReceivedRecommendations(userB, 1, 0);
    expect(page1).toHaveLength(1);

    const page2 = await getReceivedRecommendations(userB, 1, 1);
    expect(page2).toHaveLength(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});

describe("getSentRecommendations", () => {
  it("returns sent recommendations", async () => {
    await createRecommendation(userA, userB, "movie-1");
    await createRecommendation(userA, userC, "movie-2");

    const recs = await getSentRecommendations(userA);
    expect(recs).toHaveLength(2);
  });

  it("returns empty list when no recommendations sent", async () => {
    const recs = await getSentRecommendations(userA);
    expect(recs).toHaveLength(0);
  });
});

describe("markAsRead", () => {
  it("sets readAt on a received recommendation", async () => {
    const id = await createRecommendation(userA, userB, "movie-1");

    await markAsRead(id, userB);

    const recs = await getReceivedRecommendations(userB);
    expect(recs[0].readAt).not.toBeNull();
  });

  it("does not mark if user is not the recipient", async () => {
    const id = await createRecommendation(userA, userB, "movie-1");

    await markAsRead(id, userC); // userC is not the recipient

    const recs = await getReceivedRecommendations(userB);
    expect(recs[0].readAt).toBeNull();
  });
});

describe("deleteRecommendation", () => {
  it("deletes a recommendation the user received", async () => {
    const id = await createRecommendation(userA, userB, "movie-1");

    await deleteRecommendation(id, userB);

    const recs = await getReceivedRecommendations(userB);
    expect(recs).toHaveLength(0);
  });

  it("deletes a recommendation the user sent", async () => {
    const id = await createRecommendation(userA, userB, "movie-1");

    await deleteRecommendation(id, userA);

    const recs = await getSentRecommendations(userA);
    expect(recs).toHaveLength(0);
  });

  it("does not delete if user is neither sender nor recipient", async () => {
    const id = await createRecommendation(userA, userB, "movie-1");

    await deleteRecommendation(id, userC);

    const recs = await getReceivedRecommendations(userB);
    expect(recs).toHaveLength(1);
  });
});

describe("getUnreadCount", () => {
  it("returns count of unread recommendations", async () => {
    await createRecommendation(userA, userB, "movie-1");
    await createRecommendation(userC, userB, "movie-2");

    expect(await getUnreadCount(userB)).toBe(2);
  });

  it("decreases after marking as read", async () => {
    const id = await createRecommendation(userA, userB, "movie-1");
    await createRecommendation(userC, userB, "movie-2");

    await markAsRead(id, userB);

    expect(await getUnreadCount(userB)).toBe(1);
  });

  it("returns 0 when no unread recommendations", async () => {
    expect(await getUnreadCount(userA)).toBe(0);
  });
});
