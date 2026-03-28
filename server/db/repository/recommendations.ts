import { eq, and, sql, desc, count, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { recommendations, recommendationReads, users, titles, follows } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function createRecommendation(
  fromUserId: string,
  titleId: string,
  message?: string,
): Promise<string> {
  return traceDbQuery("createRecommendation", async () => {
    const db = getDb();
    const id = crypto.randomUUID();
    await db.insert(recommendations)
      .values({
        id,
        fromUserId,
        titleId,
        message: message ?? null,
      })
      .run();
    return id;
  });
}

export async function getUserRecommendation(userId: string, titleId: string) {
  return traceDbQuery("getUserRecommendation", async () => {
    const db = getDb();
    return await db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(and(eq(recommendations.fromUserId, userId), eq(recommendations.titleId, titleId)))
      .get();
  });
}

export async function getDiscoveryFeed(userId: string, limit = 20, offset = 0) {
  return traceDbQuery("getDiscoveryFeed", async () => {
    const db = getDb();
    // Get IDs of users the current user follows
    const followedUsers = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId))
      .all();

    const followedIds = followedUsers.map((u) => u.id);
    if (followedIds.length === 0) {
      return [];
    }

    return await db
      .select({
        id: recommendations.id,
        fromUserId: recommendations.fromUserId,
        fromUsername: users.username,
        fromDisplayName: users.name,
        fromImage: users.image,
        titleId: recommendations.titleId,
        titleName: titles.title,
        titleObjectType: titles.objectType,
        posterUrl: titles.posterUrl,
        message: recommendations.message,
        createdAt: recommendations.createdAt,
        readAt: recommendationReads.readAt,
      })
      .from(recommendations)
      .innerJoin(users, eq(users.id, recommendations.fromUserId))
      .innerJoin(titles, eq(titles.id, recommendations.titleId))
      .leftJoin(
        recommendationReads,
        and(
          eq(recommendationReads.recommendationId, recommendations.id),
          eq(recommendationReads.userId, sql`${userId}`),
        ),
      )
      .where(inArray(recommendations.fromUserId, followedIds))
      .orderBy(desc(recommendations.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
  });
}

export async function getDiscoveryFeedCount(userId: string): Promise<number> {
  return traceDbQuery("getDiscoveryFeedCount", async () => {
    const db = getDb();
    const followedUsers = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId))
      .all();

    const followedIds = followedUsers.map((u) => u.id);
    if (followedIds.length === 0) {
      return 0;
    }

    const row = await db
      .select({ count: count() })
      .from(recommendations)
      .where(inArray(recommendations.fromUserId, followedIds))
      .get();
    return row?.count ?? 0;
  });
}

export async function getSentRecommendations(userId: string) {
  return traceDbQuery("getSentRecommendations", async () => {
    const db = getDb();
    return await db
      .select({
        id: recommendations.id,
        titleId: recommendations.titleId,
        titleName: titles.title,
        titleObjectType: titles.objectType,
        posterUrl: titles.posterUrl,
        message: recommendations.message,
        createdAt: recommendations.createdAt,
      })
      .from(recommendations)
      .innerJoin(titles, eq(titles.id, recommendations.titleId))
      .where(eq(recommendations.fromUserId, userId))
      .orderBy(desc(recommendations.createdAt))
      .all();
  });
}

export async function markAsRead(recommendationId: string, userId: string) {
  return traceDbQuery("markRecommendationAsRead", async () => {
    const db = getDb();
    await db.insert(recommendationReads)
      .values({
        recommendationId,
        userId,
      })
      .onConflictDoNothing()
      .run();
  });
}

export async function deleteRecommendation(id: string, userId: string) {
  return traceDbQuery("deleteRecommendation", async () => {
    const db = getDb();
    // Only the creator can delete
    await db.delete(recommendations)
      .where(
        and(
          eq(recommendations.id, id),
          eq(recommendations.fromUserId, userId),
        )
      )
      .run();
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return traceDbQuery("getUnreadRecommendationCount", async () => {
    const db = getDb();
    // Get IDs of users the current user follows
    const followedUsers = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId))
      .all();

    const followedIds = followedUsers.map((u) => u.id);
    if (followedIds.length === 0) {
      return 0;
    }

    const row = await db
      .select({ count: count() })
      .from(recommendations)
      .leftJoin(
        recommendationReads,
        and(
          eq(recommendationReads.recommendationId, recommendations.id),
          eq(recommendationReads.userId, sql`${userId}`),
        ),
      )
      .where(
        and(
          inArray(recommendations.fromUserId, followedIds),
          sql`${recommendationReads.readAt} IS NULL`,
        ),
      )
      .get();
    return row?.count ?? 0;
  });
}
