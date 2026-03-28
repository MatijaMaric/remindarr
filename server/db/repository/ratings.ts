import { eq, and, sql, inArray, count } from "drizzle-orm";
import { getDb } from "../schema";
import { ratings, follows, users } from "../schema";
import { traceDbQuery } from "../../tracing";

export type RatingValue = "HATE" | "DISLIKE" | "LIKE" | "LOVE";

export async function rateTitle(userId: string, titleId: string, rating: RatingValue) {
  return traceDbQuery("rateTitle", async () => {
    const db = getDb();
    await db.insert(ratings)
      .values({ userId, titleId, rating })
      .onConflictDoUpdate({
        target: [ratings.userId, ratings.titleId],
        set: { rating, createdAt: sql`(datetime('now'))` },
      })
      .run();
  });
}

export async function unrateTitle(userId: string, titleId: string) {
  return traceDbQuery("unrateTitle", async () => {
    const db = getDb();
    await db.delete(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.titleId, titleId)))
      .run();
  });
}

export async function getUserRating(userId: string, titleId: string): Promise<RatingValue | null> {
  return traceDbQuery("getUserRating", async () => {
    const db = getDb();
    const row = await db
      .select({ rating: ratings.rating })
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.titleId, titleId)))
      .get();
    return (row?.rating as RatingValue) ?? null;
  });
}

export async function getTitleRatings(titleId: string): Promise<Record<RatingValue, number>> {
  return traceDbQuery("getTitleRatings", async () => {
    const db = getDb();
    const rows = await db
      .select({
        rating: ratings.rating,
        count: count(),
      })
      .from(ratings)
      .where(eq(ratings.titleId, titleId))
      .groupBy(ratings.rating)
      .all();
    const result: Record<RatingValue, number> = { HATE: 0, DISLIKE: 0, LIKE: 0, LOVE: 0 };
    for (const row of rows) {
      result[row.rating as RatingValue] = row.count;
    }
    return result;
  });
}

export async function getFriendsRatings(userId: string, titleId: string) {
  return traceDbQuery("getFriendsRatings", async () => {
    const db = getDb();
    return await db
      .select({
        userId: ratings.userId,
        username: users.username,
        displayName: users.name,
        image: users.image,
        rating: ratings.rating,
      })
      .from(ratings)
      .innerJoin(users, eq(users.id, ratings.userId))
      .innerJoin(follows, and(eq(follows.followerId, userId), eq(follows.followingId, ratings.userId)))
      .where(eq(ratings.titleId, titleId))
      .all();
  });
}
