import { eq, sql, and } from "drizzle-orm";
import { getDb } from "../schema";
import { userStreaks, watchHistory } from "../schema";
import { traceDbQuery } from "../../tracing";

export interface StreakRow {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastWatchDate: string | null;
  updatedAt: string;
}

/** Get the current streak row for a user. Returns null if no streak exists. */
export async function getStreak(userId: string): Promise<StreakRow | null> {
  return traceDbQuery("getStreak", async () => {
    const db = getDb();
    const row = await db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, userId))
      .get();

    if (!row) return null;

    return {
      userId: row.userId,
      currentStreak: row.currentStreak,
      longestStreak: row.longestStreak,
      lastWatchDate: row.lastWatchDate,
      updatedAt: row.updatedAt ?? new Date().toISOString(),
    };
  });
}

/**
 * Bump the streak for a user based on a watch event.
 *
 * NOTE: All dates are computed in UTC. users.locale is a BCP-47 locale tag
 * (not a timezone), so we cannot derive user timezones from it.
 * All streak logic runs on UTC date buckets.
 *
 * Algorithm (UTC date buckets):
 * - No row → INSERT current=1, longest=1, last=today
 * - last == today → no-op (same-day double-watch)
 * - day diff == 1 → current += 1; longest = max(longest, current)
 * - day diff >= 2 → current = 1 (new watch is day 1, not 0)
 *
 * Concurrent-write safety: use conditional UPDATE WHERE last_watch_date IS <old value>;
 * retries up to 3× on conflict.
 */
export async function bumpStreak(
  userId: string,
  watchedAt?: string,
): Promise<StreakRow> {
  return traceDbQuery("bumpStreak", async () => {
    const db = getDb();
    const today = toUtcDateString(watchedAt ?? new Date().toISOString());
    const updatedAt = new Date().toISOString();

    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const existing = await db
        .select()
        .from(userStreaks)
        .where(eq(userStreaks.userId, userId))
        .get();

      if (!existing) {
        // No row — insert new streak starting at 1
        try {
          await db
            .insert(userStreaks)
            .values({
              userId,
              currentStreak: 1,
              longestStreak: 1,
              lastWatchDate: today,
              updatedAt,
            })
            .run();
          return {
            userId,
            currentStreak: 1,
            longestStreak: 1,
            lastWatchDate: today,
            updatedAt,
          };
        } catch {
          // Race — another insert beat us, retry
          continue;
        }
      }

      const last = existing.lastWatchDate;
      const dayDiff = last ? dateDiffDays(last, today) : 999;

      if (dayDiff === 0) {
        // Same day — no-op
        return {
          userId: existing.userId,
          currentStreak: existing.currentStreak,
          longestStreak: existing.longestStreak,
          lastWatchDate: existing.lastWatchDate,
          updatedAt: existing.updatedAt ?? updatedAt,
        };
      }

      let newCurrent: number;
      if (dayDiff === 1) {
        newCurrent = existing.currentStreak + 1;
      } else {
        newCurrent = 1;
      }
      const newLongest = Math.max(existing.longestStreak, newCurrent);

      // Conditional update — only if lastWatchDate hasn't changed (optimistic lock)
      const result = await db
        .update(userStreaks)
        .set({
          currentStreak: newCurrent,
          longestStreak: newLongest,
          lastWatchDate: today,
          updatedAt,
        })
        .where(
          and(
            eq(userStreaks.userId, userId),
            last
              ? eq(userStreaks.lastWatchDate, last)
              : sql`${userStreaks.lastWatchDate} IS NULL`,
          ),
        )
        .run();

      if ((result as unknown as { changes?: number }).changes !== 0) {
        return {
          userId,
          currentStreak: newCurrent,
          longestStreak: newLongest,
          lastWatchDate: today,
          updatedAt,
        };
      }
      // Another write modified last_watch_date — retry
    }

    // After all retries, just return current state
    const row = await db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, userId))
      .get();
    return {
      userId: row?.userId ?? userId,
      currentStreak: row?.currentStreak ?? 0,
      longestStreak: row?.longestStreak ?? 0,
      lastWatchDate: row?.lastWatchDate ?? null,
      updatedAt: row?.updatedAt ?? new Date().toISOString(),
    };
  });
}

/**
 * Recompute streak from full watch_history — used only by backfill job.
 * Reads DISTINCT date(watched_at) UTC from watch_history, runs the same
 * algorithm over sorted dates, then persists the result.
 */
export async function recomputeStreakFromHistory(
  userId: string,
): Promise<StreakRow> {
  return traceDbQuery("recomputeStreakFromHistory", async () => {
    const db = getDb();

    // Get all distinct UTC dates from watch_history for this user
    const rows = await db.all<{ watch_date: string }>(sql`
      SELECT DISTINCT date(watched_at) as watch_date
      FROM watch_history
      WHERE user_id = ${userId}
        AND watched_at IS NOT NULL
      ORDER BY watch_date ASC
    `);

    const dates = rows.map((r) => r.watch_date);

    if (dates.length === 0) {
      // No history — reset streak
      const updatedAt = new Date().toISOString();
      await db
        .insert(userStreaks)
        .values({
          userId,
          currentStreak: 0,
          longestStreak: 0,
          lastWatchDate: null,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: userStreaks.userId,
          set: {
            currentStreak: 0,
            longestStreak: 0,
            lastWatchDate: null,
            updatedAt,
          },
        })
        .run();
      return {
        userId,
        currentStreak: 0,
        longestStreak: 0,
        lastWatchDate: null,
        updatedAt,
      };
    }

    // Run the streak algorithm over sorted dates
    let currentStreak = 1;
    let longestStreak = 1;
    let runLength = 1;

    for (let i = 1; i < dates.length; i++) {
      const diff = dateDiffDays(dates[i - 1], dates[i]);
      if (diff === 1) {
        runLength++;
        if (runLength > longestStreak) longestStreak = runLength;
      } else {
        runLength = 1;
      }
    }

    // Check if the last date is today or yesterday to determine currentStreak
    const today = toUtcDateString(new Date().toISOString());
    const lastDate = dates[dates.length - 1];
    const daysSinceLast = dateDiffDays(lastDate, today);

    if (daysSinceLast <= 1) {
      // Streak is still active — compute current streak from the end
      currentStreak = 1;
      for (let i = dates.length - 1; i > 0; i--) {
        const diff = dateDiffDays(dates[i - 1], dates[i]);
        if (diff === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    } else {
      // Streak expired
      currentStreak = 0;
    }

    longestStreak = Math.max(longestStreak, currentStreak);

    const updatedAt = new Date().toISOString();
    await db
      .insert(userStreaks)
      .values({
        userId,
        currentStreak,
        longestStreak,
        lastWatchDate: lastDate,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: userStreaks.userId,
        set: {
          currentStreak,
          longestStreak,
          lastWatchDate: lastDate,
          updatedAt,
        },
      })
      .run();

    return {
      userId,
      currentStreak,
      longestStreak,
      lastWatchDate: lastDate,
      updatedAt,
    };
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Convert an ISO datetime string to a UTC date string (YYYY-MM-DD). */
function toUtcDateString(isoString: string): string {
  return new Date(isoString).toISOString().slice(0, 10);
}

/** Compute the signed difference in days between two UTC date strings (b - a). */
function dateDiffDays(a: string, b: string): number {
  const aMs = new Date(`${a}T00:00:00Z`).getTime();
  const bMs = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((bMs - aMs) / (1000 * 60 * 60 * 24));
}
