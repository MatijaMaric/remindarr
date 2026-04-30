import { eq, and, sql, desc, count, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "../schema";
import { recommendations, recommendationReads, users, titles, follows } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function createRecommendation(
  fromUserId: string,
  titleId: string,
  message?: string,
  targetUserId?: string,
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
        targetUserId: targetUserId ?? null,
      })
      .run();
    return id;
  });
}

export async function getUserRecommendation(
  userId: string,
  titleId: string,
  targetUserId?: string,
) {
  return traceDbQuery("getUserRecommendation", async () => {
    const db = getDb();
    const targetCondition = targetUserId != null
      ? eq(recommendations.targetUserId, targetUserId)
      : isNull(recommendations.targetUserId);
    return await db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(
        and(
          eq(recommendations.fromUserId, userId),
          eq(recommendations.titleId, titleId),
          targetCondition,
        ),
      )
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

    // A recommendation is visible if:
    //   a) it is directly targeted at this user, OR
    //   b) it is a broadcast (no target) from someone the user follows
    const visibilityCondition = followedIds.length === 0
      ? eq(recommendations.targetUserId, userId)
      : or(
          eq(recommendations.targetUserId, userId),
          and(
            isNull(recommendations.targetUserId),
            inArray(recommendations.fromUserId, followedIds),
          ),
        );

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
        targetUserId: recommendations.targetUserId,
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
      .where(visibilityCondition)
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

    const visibilityCondition = followedIds.length === 0
      ? eq(recommendations.targetUserId, userId)
      : or(
          eq(recommendations.targetUserId, userId),
          and(
            isNull(recommendations.targetUserId),
            inArray(recommendations.fromUserId, followedIds),
          ),
        );

    const row = await db
      .select({ count: count() })
      .from(recommendations)
      .where(visibilityCondition)
      .get();
    return row?.count ?? 0;
  });
}

export async function getSentRecommendations(userId: string) {
  return traceDbQuery("getSentRecommendations", async () => {
    const db = getDb();
    // Raw query to support LEFT JOIN on target user without Drizzle alias complexity
    type Row = {
      id: string;
      titleId: string;
      titleName: string;
      titleObjectType: string;
      posterUrl: string | null;
      message: string | null;
      createdAt: string | null;
      targetUserId: string | null;
      targetUsername: string | null;
      targetDisplayName: string | null;
    };
    return db.all<Row>(sql`
      SELECT
        r.id AS id,
        r.title_id AS titleId,
        t.title AS titleName,
        t.object_type AS titleObjectType,
        t.poster_url AS posterUrl,
        r.message AS message,
        r.created_at AS createdAt,
        r.target_user_id AS targetUserId,
        tu.username AS targetUsername,
        tu.name AS targetDisplayName
      FROM recommendations r
      INNER JOIN titles t ON t.id = r.title_id
      LEFT JOIN users tu ON tu.id = r.target_user_id
      WHERE r.from_user_id = ${userId}
      ORDER BY r.created_at DESC
    `);
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

    const visibilityCondition = followedIds.length === 0
      ? eq(recommendations.targetUserId, userId)
      : or(
          eq(recommendations.targetUserId, userId),
          and(
            isNull(recommendations.targetUserId),
            inArray(recommendations.fromUserId, followedIds),
          ),
        );

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
          visibilityCondition,
          sql`${recommendationReads.readAt} IS NULL`,
        ),
      )
      .get();
    return row?.count ?? 0;
  });
}
