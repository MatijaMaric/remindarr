import { eq, and, inArray, sql, sum, count } from "drizzle-orm";
import { getDb } from "../schema";
import {
  achievements,
  userAchievements,
  userAchievementEarns,
  users,
} from "../schema";
import type {
  AchievementDefRow,
  UserAchievementRow,
  UserAchievementEarnRow,
} from "../schema";
import type {
  Achievement,
  AchievementMeta,
} from "../../achievements/definitions";
import { traceDbQuery } from "../../tracing";
import { getCache } from "../../cache";

export type { AchievementDefRow, UserAchievementRow, UserAchievementEarnRow };

/**
 * Upsert a single achievement definition into the achievements table.
 * metadata stores optional fields (genre, seasons, windowHours) as JSON.
 * Optionally accepts AchievementMeta to populate derived columns (repeatable, tier, family, rungIndex, category).
 */
export async function upsertAchievementDef(
  a: Achievement,
  meta?: AchievementMeta,
): Promise<void> {
  return traceDbQuery("upsertAchievementDef", async () => {
    const db = getDb();
    const metadataFields: Record<string, unknown> = {};
    if (a.genre !== undefined) metadataFields.genre = a.genre;
    if (a.seasons !== undefined) metadataFields.seasons = a.seasons;
    if (a.windowHours !== undefined) metadataFields.windowHours = a.windowHours;
    const metadata =
      Object.keys(metadataFields).length > 0
        ? JSON.stringify(metadataFields)
        : null;

    const newCols = meta
      ? {
          repeatable: meta.repeatable ? 1 : 0,
          tier: meta.tier,
          family: meta.family ?? null,
          rungIndex: meta.rungIndex ?? null,
          category: meta.category,
        }
      : {};

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
        ...newCols,
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
          ...newCols,
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
export async function getUserAchievements(
  userId: string,
): Promise<UserAchievementRow[]> {
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
  opts?: { earnedNotified?: 1 },
): Promise<{ newlyEarned: boolean }> {
  return traceDbQuery("upsertUserAchievement", async () => {
    const db = getDb();

    // Check current state
    const existing = await db
      .select({ earnedAt: userAchievements.earnedAt })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementKey, key),
        ),
      )
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
export async function listEarnedSince(
  userId: string,
  since: string,
): Promise<UserAchievementRow[]> {
  return traceDbQuery("listEarnedSince", async () => {
    const db = getDb();
    return await db
      .select()
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          sql`${userAchievements.earnedAt} >= ${since}`,
        ),
      )
      .all();
  });
}

/**
 * Mark a batch of achievement keys as notified for a user.
 */
export async function markAchievementsNotified(
  userId: string,
  keys: string[],
): Promise<void> {
  return traceDbQuery("markAchievementsNotified", async () => {
    if (keys.length === 0) return;
    const db = getDb();
    await db
      .update(userAchievements)
      .set({ earnedNotified: 1 })
      .where(
        and(
          eq(userAchievements.userId, userId),
          inArray(userAchievements.achievementKey, keys),
        ),
      )
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
      .innerJoin(
        achievements,
        eq(achievements.key, userAchievements.achievementKey),
      )
      .where(
        and(
          eq(userAchievements.userId, userId),
          sql`${userAchievements.earnedAt} IS NOT NULL`,
        ),
      )
      .get();
    return Number(row?.total ?? 0);
  });
}

/**
 * Insert new earn audit rows and bump earned_count + last_earned_at in user_achievements.
 */
export async function appendUserAchievementEarns(
  userId: string,
  key: string,
  earns: Array<{ earnedAt: string; context?: Record<string, unknown> }>,
): Promise<void> {
  if (earns.length === 0) return;
  return traceDbQuery("appendUserAchievementEarns", async () => {
    const db = getDb();
    const latestEarnedAt = earns.reduce(
      (max, e) => (e.earnedAt > max ? e.earnedAt : max),
      earns[0].earnedAt,
    );

    for (const earn of earns) {
      await db
        .insert(userAchievementEarns)
        .values({
          userId,
          achievementKey: key,
          earnedAt: earn.earnedAt,
          context: earn.context ? JSON.stringify(earn.context) : null,
        })
        .run();
    }

    // Bump earned_count and last_earned_at
    await db
      .update(userAchievements)
      .set({
        earnedCount: sql`${userAchievements.earnedCount} + ${earns.length}`,
        lastEarnedAt: latestEarnedAt,
        earnedAt: sql`COALESCE(${userAchievements.earnedAt}, ${latestEarnedAt})`,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementKey, key),
        ),
      )
      .run();
  });
}

const RARITY_CACHE_TTL = 3600; // 1 hour
const RARITY_MIN_EARNERS = 5; // hide rarity when fewer users have earned

export type RarityBucket = "common" | "rare" | "epic" | "legendary";

export interface RarityResult {
  pct: number;
  bucket: RarityBucket;
}

/**
 * Get rarity for a one-shot achievement (% of users who earned it).
 * Returns null when fewer than RARITY_MIN_EARNERS users have earned it.
 * Result is cached for RARITY_CACHE_TTL seconds.
 */
export async function getRarityForKey(
  key: string,
): Promise<RarityResult | null> {
  return traceDbQuery("getRarityForKey", async () => {
    const cache = getCache();
    const cacheKey = `achievements:rarity:v1:${key}`;

    const cached = await cache.get<RarityResult | null>(cacheKey);
    if (cached !== null) return cached;

    const db = getDb();

    // Count earners for this achievement key
    const earnersRow = await db
      .select({ earners: count() })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.achievementKey, key),
          sql`${userAchievements.earnedAt} IS NOT NULL`,
        ),
      )
      .get();

    const earners = earnersRow?.earners ?? 0;

    if (earners < RARITY_MIN_EARNERS) {
      await cache.set(cacheKey, null, RARITY_CACHE_TTL);
      return null;
    }

    // Count total users
    const totalRow = await db.select({ total: count() }).from(users).get();

    const totalUsers = totalRow?.total ?? 0;

    const pct = totalUsers > 0 ? (earners / totalUsers) * 100 : 0;
    let bucket: RarityBucket;
    if (pct >= 25) bucket = "common";
    else if (pct >= 5) bucket = "rare";
    else if (pct >= 1) bucket = "epic";
    else bucket = "legendary";

    const result: RarityResult = { pct: Math.round(pct * 10) / 10, bucket };
    await cache.set(cacheKey, result, RARITY_CACHE_TTL);
    return result;
  });
}

/**
 * Get earn history for a repeatable achievement, most recent first.
 */
export async function getEarnHistory(
  userId: string,
  key: string,
  limit = 12,
): Promise<UserAchievementEarnRow[]> {
  return traceDbQuery("getEarnHistory", async () => {
    const db = getDb();
    return await db
      .select()
      .from(userAchievementEarns)
      .where(
        and(
          eq(userAchievementEarns.userId, userId),
          eq(userAchievementEarns.achievementKey, key),
        ),
      )
      .orderBy(sql`${userAchievementEarns.earnedAt} DESC`)
      .limit(limit)
      .all();
  });
}

/**
 * Get recently earned achievements for a user (union of one-shot earnedAt + repeatable lastEarnedAt).
 * Returns up to `limit` rows ordered by most recently earned desc.
 */
export async function getRecentlyEarned(
  userId: string,
  limit = 8,
): Promise<UserAchievementRow[]> {
  return traceDbQuery("getRecentlyEarned", async () => {
    const db = getDb();
    return await db
      .select()
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          sql`${userAchievements.earnedAt} IS NOT NULL`,
        ),
      )
      .orderBy(
        sql`COALESCE(${userAchievements.lastEarnedAt}, ${userAchievements.earnedAt}) DESC`,
      )
      .limit(limit)
      .all();
  });
}

// D1 caps bound parameters per statement at 100.
// Chunk at 50 IDs to stay safely under the cap.
const XP_BATCH_CHUNK_SIZE = 50;

/**
 * Sum XP for multiple users in chunks of 50 (D1 100-param safety).
 * Returns a Map<userId, xp>.
 */
export async function sumXpBatch(
  userIds: string[],
): Promise<Map<string, number>> {
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
        .innerJoin(
          achievements,
          eq(achievements.key, userAchievements.achievementKey),
        )
        .where(
          and(
            inArray(userAchievements.userId, chunk),
            sql`${userAchievements.earnedAt} IS NOT NULL`,
          ),
        )
        .groupBy(userAchievements.userId)
        .all();

      for (const row of rows) {
        result.set(row.userId, Number(row.total ?? 0));
      }
    }

    return result;
  });
}
