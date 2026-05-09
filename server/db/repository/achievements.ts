import { eq, and, inArray, sql, sum } from "drizzle-orm";
import { getDb } from "../schema";
import { achievements, userAchievements } from "../schema";
import type { AchievementDefRow, UserAchievementRow } from "../schema";
import type { Achievement } from "../../achievements/definitions";
import { traceDbQuery } from "../../tracing";

export type { AchievementDefRow, UserAchievementRow };

/**
 * Upsert a single achievement definition into the achievements table.
 * metadata stores optional fields (genre, seasons, windowHours) as JSON.
 */
export async function upsertAchievementDef(a: Achievement): Promise<void> {
  return traceDbQuery("upsertAchievementDef", async () => {
    const db = getDb();
    const metadataFields: Record<string, unknown> = {};
    if (a.genre !== undefined) metadataFields.genre = a.genre;
    if (a.seasons !== undefined) metadataFields.seasons = a.seasons;
    if (a.windowHours !== undefined) metadataFields.windowHours = a.windowHours;
    const metadata = Object.keys(metadataFields).length > 0
      ? JSON.stringify(metadataFields)
      : null;

    await db
      .insert(achievements)
      .values({
        key: a.key,
        kind: a.kind,
        threshold: a.threshold,
        points: a.points,
        title: a.title,
        description: a.description,
        icon: a.icon,
        metadata,
      })
      .onConflictDoUpdate({
        target: achievements.key,
        set: {
          kind: a.kind,
          threshold: a.threshold,
          points: a.points,
          title: a.title,
          description: a.description,
          icon: a.icon,
          metadata,
        },
      })
      .run();
  });
}

/** List all achievement definitions from the DB. */
export async function listAchievementDefs(): Promise<AchievementDefRow[]> {
  return traceDbQuery("listAchievementDefs", async () => {
    const db = getDb();
    return await db.select().from(achievements).all();
  });
}

/** Get all user_achievements rows for a user. */
export async function getUserAchievements(userId: string): Promise<UserAchievementRow[]> {
  return traceDbQuery("getUserAchievements", async () => {
    const db = getDb();
    return await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId))
      .all();
  });
}

/**
 * Upsert a user_achievement row, tracking progress and earned status.
 * Returns whether this call newly earned the achievement
 * (transitioned earnedAt from null to non-null).
 *
 * @param opts.earnedNotified - If 1, marks the achievement as already notified
 *   (used by the backfill job to prevent notification bursts for historical earns).
 */
export async function upsertUserAchievement(
  userId: string,
  key: string,
  progress: number,
  earnedAt: string | null,
  opts?: { earnedNotified?: 1 }
): Promise<{ newlyEarned: boolean }> {
  return traceDbQuery("upsertUserAchievement", async () => {
    const db = getDb();

    // Check current state
    const existing = await db
      .select({ earnedAt: userAchievements.earnedAt })
      .from(userAchievements)
      .where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementKey, key)))
      .get();

    const wasEarned = existing?.earnedAt != null;
    const nowEarned = earnedAt != null;
    const newlyEarned = !wasEarned && nowEarned;

    const earnedNotified = opts?.earnedNotified ?? 0;

    await db
      .insert(userAchievements)
      .values({
        userId,
        achievementKey: key,
        progress,
        earnedAt,
        earnedNotified,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [userAchievements.userId, userAchievements.achievementKey],
        set: {
          progress,
          earnedAt: earnedAt ?? existing?.earnedAt ?? null,
          // Only force earnedNotified=1 when explicitly requested (backfill path)
          ...(opts?.earnedNotified === 1 ? { earnedNotified: 1 } : {}),
          updatedAt: new Date().toISOString(),
        },
      })
      .run();

    return { newlyEarned };
  });
}

/**
 * List earned achievements since a given ISO timestamp.
 */
export async function listEarnedSince(userId: string, since: string): Promise<UserAchievementRow[]> {
  return traceDbQuery("listEarnedSince", async () => {
    const db = getDb();
    return await db
      .select()
      .from(userAchievements)
      .where(and(
        eq(userAchievements.userId, userId),
        sql`${userAchievements.earnedAt} >= ${since}`
      ))
      .all();
  });
}

/**
 * Mark a batch of achievement keys as notified for a user.
 */
export async function markAchievementsNotified(userId: string, keys: string[]): Promise<void> {
  return traceDbQuery("markAchievementsNotified", async () => {
    if (keys.length === 0) return;
    const db = getDb();
    await db
      .update(userAchievements)
      .set({ earnedNotified: 1 })
      .where(and(
        eq(userAchievements.userId, userId),
        inArray(userAchievements.achievementKey, keys)
      ))
      .run();
  });
}

/**
 * Sum XP (points from earned achievements) for a single user.
 */
export async function sumXpForUser(userId: string): Promise<number> {
  return traceDbQuery("sumXpForUser", async () => {
    const db = getDb();
    const row = await db
      .select({ total: sum(achievements.points) })
      .from(userAchievements)
      .innerJoin(achievements, eq(achievements.key, userAchievements.achievementKey))
      .where(and(
        eq(userAchievements.userId, userId),
        sql`${userAchievements.earnedAt} IS NOT NULL`
      ))
      .get();
    return Number(row?.total ?? 0);
  });
}

// D1 caps bound parameters per statement at 100.
// Chunk at 50 IDs to stay safely under the cap.
const XP_BATCH_CHUNK_SIZE = 50;

/**
 * Sum XP for multiple users in chunks of 50 (D1 100-param safety).
 * Returns a Map<userId, xp>.
 */
export async function sumXpBatch(userIds: string[]): Promise<Map<string, number>> {
  return traceDbQuery("sumXpBatch", async () => {
    const result = new Map<string, number>();
    if (userIds.length === 0) return result;

    const db = getDb();

    for (let i = 0; i < userIds.length; i += XP_BATCH_CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + XP_BATCH_CHUNK_SIZE);

      const rows = await db
        .select({
          userId: userAchievements.userId,
          total: sum(achievements.points),
        })
        .from(userAchievements)
        .innerJoin(achievements, eq(achievements.key, userAchievements.achievementKey))
        .where(and(
          inArray(userAchievements.userId, chunk),
          sql`${userAchievements.earnedAt} IS NOT NULL`
        ))
        .groupBy(userAchievements.userId)
        .all();

      for (const row of rows) {
        result.set(row.userId, Number(row.total ?? 0));
      }
    }

    return result;
  });
}
