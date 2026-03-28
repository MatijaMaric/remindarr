import { eq, and, sql, count } from "drizzle-orm";
import { getDb } from "../schema";
import { follows, users } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function follow(followerId: string, followingId: string) {
  return traceDbQuery("follow", async () => {
    if (followerId === followingId) {
      throw new Error("Cannot follow yourself");
    }
    const db = getDb();
    await db.insert(follows)
      .values({ followerId, followingId })
      .onConflictDoNothing()
      .run();
  });
}

export async function unfollow(followerId: string, followingId: string) {
  return traceDbQuery("unfollow", async () => {
    const db = getDb();
    await db.delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .run();
  });
}

export async function getFollowers(userId: string) {
  return traceDbQuery("getFollowers", async () => {
    const db = getDb();
    return await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.name,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followerId))
      .where(eq(follows.followingId, userId))
      .all();
  });
}

export async function getFollowing(userId: string) {
  return traceDbQuery("getFollowing", async () => {
    const db = getDb();
    return await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.name,
        followedAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followingId))
      .where(eq(follows.followerId, userId))
      .all();
  });
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  return traceDbQuery("isFollowing", async () => {
    const db = getDb();
    const row = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .get();
    return row !== undefined;
  });
}

export async function areMutualFollowers(userId1: string, userId2: string): Promise<boolean> {
  return traceDbQuery("areMutualFollowers", async () => {
    const [a, b] = await Promise.all([
      isFollowing(userId1, userId2),
      isFollowing(userId2, userId1),
    ]);
    return a && b;
  });
}

export async function getFollowerCount(userId: string): Promise<number> {
  return traceDbQuery("getFollowerCount", async () => {
    const db = getDb();
    const row = await db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followingId, userId))
      .get();
    return row?.count ?? 0;
  });
}

export async function getFollowingCount(userId: string): Promise<number> {
  return traceDbQuery("getFollowingCount", async () => {
    const db = getDb();
    const row = await db
      .select({ count: count() })
      .from(follows)
      .where(eq(follows.followerId, userId))
      .get();
    return row?.count ?? 0;
  });
}
