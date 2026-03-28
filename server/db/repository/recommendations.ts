import { eq, and, sql, or, desc, count, isNull } from "drizzle-orm";
import { getDb } from "../schema";
import { recommendations, users, titles } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function createRecommendation(
  fromUserId: string,
  toUserId: string,
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
        toUserId,
        titleId,
        message: message ?? null,
      })
      .run();
    return id;
  });
}

export async function getReceivedRecommendations(userId: string, limit = 20, offset = 0) {
  return traceDbQuery("getReceivedRecommendations", async () => {
    const db = getDb();
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
        readAt: recommendations.readAt,
      })
      .from(recommendations)
      .innerJoin(users, eq(users.id, recommendations.fromUserId))
      .innerJoin(titles, eq(titles.id, recommendations.titleId))
      .where(eq(recommendations.toUserId, userId))
      .orderBy(desc(recommendations.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
  });
}

export async function getSentRecommendations(userId: string) {
  return traceDbQuery("getSentRecommendations", async () => {
    const db = getDb();
    return await db
      .select({
        id: recommendations.id,
        toUserId: recommendations.toUserId,
        toUsername: users.username,
        toDisplayName: users.name,
        toImage: users.image,
        titleId: recommendations.titleId,
        titleName: titles.title,
        titleObjectType: titles.objectType,
        posterUrl: titles.posterUrl,
        message: recommendations.message,
        createdAt: recommendations.createdAt,
        readAt: recommendations.readAt,
      })
      .from(recommendations)
      .innerJoin(users, eq(users.id, recommendations.toUserId))
      .innerJoin(titles, eq(titles.id, recommendations.titleId))
      .where(eq(recommendations.fromUserId, userId))
      .orderBy(desc(recommendations.createdAt))
      .all();
  });
}

export async function markAsRead(id: string, userId: string) {
  return traceDbQuery("markRecommendationAsRead", async () => {
    const db = getDb();
    await db.update(recommendations)
      .set({ readAt: sql`(datetime('now'))` })
      .where(and(eq(recommendations.id, id), eq(recommendations.toUserId, userId)))
      .run();
  });
}

export async function deleteRecommendation(id: string, userId: string) {
  return traceDbQuery("deleteRecommendation", async () => {
    const db = getDb();
    await db.delete(recommendations)
      .where(
        and(
          eq(recommendations.id, id),
          or(eq(recommendations.fromUserId, userId), eq(recommendations.toUserId, userId)),
        )
      )
      .run();
  });
}

export async function getReceivedCount(userId: string): Promise<number> {
  return traceDbQuery("getReceivedRecommendationCount", async () => {
    const db = getDb();
    const row = await db
      .select({ count: count() })
      .from(recommendations)
      .where(eq(recommendations.toUserId, userId))
      .get();
    return row?.count ?? 0;
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return traceDbQuery("getUnreadRecommendationCount", async () => {
    const db = getDb();
    const row = await db
      .select({ count: count() })
      .from(recommendations)
      .where(and(eq(recommendations.toUserId, userId), isNull(recommendations.readAt)))
      .get();
    return row?.count ?? 0;
  });
}
