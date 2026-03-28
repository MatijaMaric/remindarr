import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser } from "../repository";
import {
  follow,
  unfollow,
  getFollowers,
  getFollowing,
  isFollowing,
  areMutualFollowers,
  getFollowerCount,
  getFollowingCount,
} from "./follows";

let userA: string;
let userB: string;
let userC: string;

beforeEach(async () => {
  setupTestDb();
  userA = await createUser("alice", "hash");
  userB = await createUser("bob", "hash");
  userC = await createUser("carol", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("follow", () => {
  it("creates a follow relationship", async () => {
    await follow(userA, userB);
    expect(await isFollowing(userA, userB)).toBe(true);
  });

  it("is idempotent — following twice does not error", async () => {
    await follow(userA, userB);
    await follow(userA, userB);
    expect(await isFollowing(userA, userB)).toBe(true);
    expect(await getFollowerCount(userB)).toBe(1);
  });

  it("throws when trying to follow yourself", async () => {
    await expect(follow(userA, userA)).rejects.toThrow("Cannot follow yourself");
  });
});

describe("unfollow", () => {
  it("removes a follow relationship", async () => {
    await follow(userA, userB);
    await unfollow(userA, userB);
    expect(await isFollowing(userA, userB)).toBe(false);
  });

  it("is a no-op when not following", async () => {
    await unfollow(userA, userB);
    expect(await isFollowing(userA, userB)).toBe(false);
  });
});

describe("getFollowers", () => {
  it("returns users following a given user", async () => {
    await follow(userA, userC);
    await follow(userB, userC);

    const followers = await getFollowers(userC);
    expect(followers).toHaveLength(2);
    const usernames = followers.map((f) => f.username);
    expect(usernames).toContain("alice");
    expect(usernames).toContain("bob");
  });

  it("returns empty list when no followers", async () => {
    const followers = await getFollowers(userA);
    expect(followers).toHaveLength(0);
  });
});

describe("getFollowing", () => {
  it("returns users that a given user follows", async () => {
    await follow(userA, userB);
    await follow(userA, userC);

    const following = await getFollowing(userA);
    expect(following).toHaveLength(2);
    const usernames = following.map((f) => f.username);
    expect(usernames).toContain("bob");
    expect(usernames).toContain("carol");
  });

  it("returns empty list when not following anyone", async () => {
    const following = await getFollowing(userA);
    expect(following).toHaveLength(0);
  });
});

describe("isFollowing", () => {
  it("returns true when following", async () => {
    await follow(userA, userB);
    expect(await isFollowing(userA, userB)).toBe(true);
  });

  it("returns false when not following", async () => {
    expect(await isFollowing(userA, userB)).toBe(false);
  });

  it("is directional — A follows B does not mean B follows A", async () => {
    await follow(userA, userB);
    expect(await isFollowing(userA, userB)).toBe(true);
    expect(await isFollowing(userB, userA)).toBe(false);
  });
});

describe("areMutualFollowers", () => {
  it("returns true when both users follow each other", async () => {
    await follow(userA, userB);
    await follow(userB, userA);
    expect(await areMutualFollowers(userA, userB)).toBe(true);
  });

  it("returns false when only one follows the other", async () => {
    await follow(userA, userB);
    expect(await areMutualFollowers(userA, userB)).toBe(false);
  });

  it("returns false when neither follows the other", async () => {
    expect(await areMutualFollowers(userA, userB)).toBe(false);
  });
});

describe("getFollowerCount / getFollowingCount", () => {
  it("returns correct follower count", async () => {
    await follow(userA, userC);
    await follow(userB, userC);
    expect(await getFollowerCount(userC)).toBe(2);
  });

  it("returns correct following count", async () => {
    await follow(userA, userB);
    await follow(userA, userC);
    expect(await getFollowingCount(userA)).toBe(2);
  });

  it("returns 0 for no followers/following", async () => {
    expect(await getFollowerCount(userA)).toBe(0);
    expect(await getFollowingCount(userA)).toBe(0);
  });
});
