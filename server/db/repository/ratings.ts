import { eq, and, sql, inArray, count } from "drizzle-orm";
import { getDb } from "../schema";
import { ratings, episodeRatings, follows, users, episodes } from "../schema";
import { traceDbQuery } from "../../tracing";

export interface FriendsLovedTitle {
  id: string;
  title: string;
  poster_url: string | null;
  object_type: string;
  love_count: number;
  score: number;
}

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

// ─── Episode Ratings ─────────────────────────────────────────────────────────

export async function rateEpisode(userId: string, episodeId: number, rating: RatingValue, review?: string) {
  return traceDbQuery("rateEpisode", async () => {
    const db = getDb();
    await db.insert(episodeRatings)
      .values({ userId, episodeId, rating, review: review ?? null })
      .onConflictDoUpdate({
        target: [episodeRatings.userId, episodeRatings.episodeId],
        set: { rating, review: review ?? null, createdAt: sql`(datetime('now'))` },
      })
      .run();
  });
}

export async function unrateEpisode(userId: string, episodeId: number) {
  return traceDbQuery("unrateEpisode", async () => {
    const db = getDb();
    await db.delete(episodeRatings)
      .where(and(eq(episodeRatings.userId, userId), eq(episodeRatings.episodeId, episodeId)))
      .run();
  });
}

export async function getUserEpisodeRating(userId: string, episodeId: number): Promise<{ rating: RatingValue; review: string | null } | null> {
  return traceDbQuery("getUserEpisodeRating", async () => {
    const db = getDb();
    const row = await db
      .select({ rating: episodeRatings.rating, review: episodeRatings.review })
      .from(episodeRatings)
      .where(and(eq(episodeRatings.userId, userId), eq(episodeRatings.episodeId, episodeId)))
      .get();
    if (!row) return null;
    return { rating: row.rating as RatingValue, review: row.review };
  });
}

export async function getEpisodeRatings(episodeId: number): Promise<Record<RatingValue, number>> {
  return traceDbQuery("getEpisodeRatings", async () => {
    const db = getDb();
    const rows = await db
      .select({ rating: episodeRatings.rating, count: count() })
      .from(episodeRatings)
      .where(eq(episodeRatings.episodeId, episodeId))
      .groupBy(episodeRatings.rating)
      .all();
    const result: Record<RatingValue, number> = { HATE: 0, DISLIKE: 0, LIKE: 0, LOVE: 0 };
    for (const row of rows) {
      result[row.rating as RatingValue] = row.count;
    }
    return result;
  });
}

export async function getFriendsEpisodeRatings(userId: string, episodeId: number) {
  return traceDbQuery("getFriendsEpisodeRatings", async () => {
    const db = getDb();
    return await db
      .select({
        userId: episodeRatings.userId,
        username: users.username,
        displayName: users.name,
        image: users.image,
        rating: episodeRatings.rating,
      })
      .from(episodeRatings)
      .innerJoin(users, eq(users.id, episodeRatings.userId))
      .innerJoin(follows, and(eq(follows.followerId, userId), eq(follows.followingId, episodeRatings.userId)))
      .where(eq(episodeRatings.episodeId, episodeId))
      .all();
  });
}

export async function getSeasonEpisodeRatings(titleId: string, seasonNumber: number): Promise<Record<number, Record<RatingValue, number>>> {
  return traceDbQuery("getSeasonEpisodeRatings", async () => {
    const db = getDb();
    const rows = await db
      .select({
        episodeNumber: episodes.episodeNumber,
        rating: episodeRatings.rating,
        cnt: count(),
      })
      .from(episodeRatings)
      .innerJoin(episodes, eq(episodes.id, episodeRatings.episodeId))
      .where(and(eq(episodes.titleId, titleId), eq(episodes.seasonNumber, seasonNumber)))
      .groupBy(episodes.episodeNumber, episodeRatings.rating)
      .all();

    const result: Record<number, Record<RatingValue, number>> = {};
    for (const row of rows) {
      if (!result[row.episodeNumber]) {
        result[row.episodeNumber] = { HATE: 0, DISLIKE: 0, LIKE: 0, LOVE: 0 };
      }
      result[row.episodeNumber][row.rating as RatingValue] = row.cnt;
    }
    return result;
  });
}

export async function getFriendsLovedThisWeek(
  userId: string,
  limit = 20,
): Promise<FriendsLovedTitle[]> {
  return traceDbQuery("getFriendsLovedThisWeek", async () => {
    const db = getDb();
    return db.all<FriendsLovedTitle>(sql`
      SELECT
        t.id            AS id,
        t.title         AS title,
        t.poster_url    AS poster_url,
        t.object_type   AS object_type,
        COUNT(*)        AS love_count,
        SUM(CASE WHEN r.rating = 'LOVE' THEN 2 WHEN r.rating = 'LIKE' THEN 1 ELSE 0 END) AS score
      FROM ratings r
      JOIN follows f ON f.following_id = r.user_id AND f.follower_id = ${userId}
      JOIN titles t ON t.id = r.title_id
      WHERE r.rating IN ('LOVE', 'LIKE')
        AND r.created_at >= datetime('now', '-7 days')
        AND NOT EXISTS (
          SELECT 1 FROM ratings my_r
          WHERE my_r.user_id = ${userId} AND my_r.title_id = r.title_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM watched_titles wt
          WHERE wt.user_id = ${userId} AND wt.title_id = r.title_id
        )
      GROUP BY r.title_id
      ORDER BY score DESC, MAX(r.created_at) DESC
      LIMIT ${limit}
    `);
  });
}
