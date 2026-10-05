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

function achievementMetadata(a: Achievement): string | null {
  const metadataFields: Record<string, unknown> = {};
  if (a.genre !== undefined) metadataFields.genre = a.genre;
  if (a.seasons !== undefined) metadataFields.seasons = a.seasons;
  if (a.windowHours !== undefined) metadataFields.windowHours = a.windowHours;
  return Object.keys(metadataFields).length > 0
    ? JSON.stringify(metadataFields)
    : null;
}

function achievementDefValues(a: Achievement, meta?: AchievementMeta) {
  return {
    key: a.key,
    kind: a.kind,
    threshold: a.threshold,
    points: a.points,
    title: a.title,
    description: a.description,
    icon: a.icon,
    metadata: achievementMetadata(a),
    repeatable: meta?.repeatable ? 1 : 0,
    tier: meta?.tier ?? "one-shot",
    family: meta?.family ?? null,
    rungIndex: meta?.rungIndex ?? null,
    category: meta?.category ?? "special",
  };
}

function achievementDefUnchanged(
  row: AchievementDefRow | undefined,
  values: ReturnType<typeof achievementDefValues>,
): boolean {
  if (!row) return false;
  return (
    row.kind === values.kind &&
    row.threshold === values.threshold &&
    row.points === values.points &&
    row.title === values.title &&
    row.description === values.description &&
    row.icon === values.icon &&
    (row.metadata ?? null) === values.metadata &&
    row.repeatable === values.repeatable &&
    row.tier === values.tier &&
    (row.family ?? null) === values.family &&
    (row.rungIndex ?? null) === values.rungIndex &&
    row.category === values.category
  );
}

// 13 bound params per row. D1 caps a statement at 100, so 7 rows = 91.
const ACHIEVEMENT_DEF_CHUNK = 7;

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
    const metadata = achievementMetadata(a);

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

/**
 * Upsert many achievement definitions in chunked multi-row statements.
 * Skips the write when every row already matches. One Sentry span for the
 * whole call — the cron must not emit `upsertAchievementDef` once per row.
 */
export async function upsertAchievementDefs(
  entries: ReadonlyArray<{ achievement: Achievement; meta?: AchievementMeta }>,
): Promise<void> {
  if (entries.length === 0) return;
  return traceDbQuery("upsertAchievementDefs", async () => {
    const db = getDb();
    const rows = entries.map(({ achievement, meta }) =>
      achievementDefValues(achievement, meta),
    );
    const existing = await db.select().from(achievements).all();
    const byKey = new Map(existing.map((row) => [row.key, row]));
    if (rows.every((row) => achievementDefUnchanged(byKey.get(row.key), row))) {
      return;
    }

    for (let i = 0; i < rows.length; i += ACHIEVEMENT_DEF_CHUNK) {
      const chunk = rows.slice(i, i + ACHIEVEMENT_DEF_CHUNK);
      await db
        .insert(achievements)
        .values(chunk)
        .onConflictDoUpdate({
          target: achievements.key,
          set: {
            kind: sql`excluded.kind`,
            threshold: sql`excluded.threshold`,
            points: sql`excluded.points`,
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            icon: sql`excluded.icon`,
            metadata: sql`excluded.metadata`,
            repeatable: sql`excluded.repeatable`,
            tier: sql`excluded.tier`,
            family: sql`excluded.family`,
            rungIndex: sql`excluded.rung_index`,
            category: sql`excluded.category`,
          },
        })
        .run();
    }
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

export type UserAchievementUpsert = {
  key: string;
  progress: number;
  earnedAt: string | null;
  /** Backfill sets this so historical earns do not notify. */
  earnedNotified?: 1;
};

function userAchievementUnchanged(
  row: UserAchievementRow | undefined,
  entry: UserAchievementUpsert,
): boolean {
  if (!row) return false;
  if (row.progress !== entry.progress) return false;
  const wasEarned = row.earnedAt != null;
  const nowEarned = entry.earnedAt != null;
  // Already-earned rows keep the first earnedAt, so a new timestamp is not a write.
  if (!wasEarned && nowEarned) return false;
  if (entry.earnedNotified === 1 && row.earnedNotified !== 1) return false;
  return true;
}

// 7 bound params per row (last_earned_at is inlined NULL). D1 caps a
// statement at 100, so 14 rows = 98.
const USER_ACHIEVEMENT_CHUNK = 14;

/**
 * Upsert many user_achievement rows for one user in chunked multi-row
 * statements. Skips rows whose progress and earn state already match.
 * One Sentry span for the whole call — watched/tick must not emit
 * `upsertUserAchievement` once per key.
 *
 * Returns whether each key transitioned earnedAt from null to non-null.
 * Re-eval keeps the first earn time so already-earned badges stay quiet.
 */
export async function upsertUserAchievements(
  userId: string,
  entries: readonly UserAchievementUpsert[],
): Promise<Map<string, { newlyEarned: boolean }>> {
  const results = new Map<string, { newlyEarned: boolean }>();
  if (entries.length === 0) return results;

  return traceDbQuery("upsertUserAchievements", async () => {
    const db = getDb();
    const unique = new Map<string, UserAchievementUpsert>();
    for (const entry of entries) unique.set(entry.key, entry);

    const existing = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId))
      .all();
    const byKey = new Map(existing.map((row) => [row.achievementKey, row]));

    const changed: UserAchievementUpsert[] = [];
    for (const entry of unique.values()) {
      const row = byKey.get(entry.key);
      const wasEarned = row?.earnedAt != null;
      const nowEarned = entry.earnedAt != null;
      results.set(entry.key, { newlyEarned: !wasEarned && nowEarned });
      if (!userAchievementUnchanged(row, entry)) changed.push(entry);
    }

    if (changed.length === 0) return results;

    const updatedAt = new Date().toISOString();
    for (let i = 0; i < changed.length; i += USER_ACHIEVEMENT_CHUNK) {
      const chunk = changed.slice(i, i + USER_ACHIEVEMENT_CHUNK);
      await db
        .insert(userAchievements)
        .values(
          chunk.map((entry) => ({
            userId,
            achievementKey: entry.key,
            progress: entry.progress,
            earnedAt: entry.earnedAt,
            earnedNotified: entry.earnedNotified ?? 0,
            updatedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [userAchievements.userId, userAchievements.achievementKey],
          set: {
            progress: sql`excluded.progress`,
            earnedAt: sql`COALESCE(${userAchievements.earnedAt}, excluded.earned_at)`,
            earnedNotified: sql`CASE WHEN excluded.earned_notified = 1 THEN 1 ELSE ${userAchievements.earnedNotified} END`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();
    }

    return results;
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
  const result = await upsertUserAchievements(userId, [
    {
      key,
      progress,
      earnedAt,
      ...(opts?.earnedNotified === 1 ? { earnedNotified: 1 as const } : {}),
    },
  ]);
  return result.get(key) ?? { newlyEarned: false };
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

// D1 caps bound parameters at 100 per statement; 4 params per row -> 80 per chunk.
const EARN_INSERT_CHUNK_SIZE = 20;

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

    for (let i = 0; i < earns.length; i += EARN_INSERT_CHUNK_SIZE) {
      const chunk = earns.slice(i, i + EARN_INSERT_CHUNK_SIZE);
      await db
        .insert(userAchievementEarns)
        .values(
          chunk.map((earn) => ({
            userId,
            achievementKey: key,
            earnedAt: earn.earnedAt,
            context: earn.context ? JSON.stringify(earn.context) : null,
          })),
        )
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
