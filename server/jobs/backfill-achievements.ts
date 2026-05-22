import { sql } from "drizzle-orm";
import { getDb } from "../db/schema";
import { users } from "../db/schema";
import { ACHIEVEMENTS } from "../achievements/definitions";
import {
  evaluateCountMovies,
  evaluateCountEpisodes,
  evaluateStreak,
  evaluateGenreCount,
  evaluateCompletionist,
  evaluateSpeedBingeSeason,
  evaluateSocialFirstFollow,
  evaluateSocialFirstRecommendation,
} from "../achievements/evaluate";
import { upsertUserAchievement } from "../db/repository/achievements";
import { recomputeStreakFromHistory } from "../db/repository/streaks";
import { getSetting, setSetting } from "../db/repository/settings";
import { enqueueJob } from "./queue";
import { logger } from "../logger";
import { registerHandler } from "./worker";

const log = logger.child({ module: "backfill-achievements" });
const PAGE_SIZE = 50;

/**
 * Core handler logic — shared between Bun (registerHandler) and CF Workers (processor.ts).
 */
export async function runBackfillAchievements(
  _data?: string | null,
): Promise<void> {
  const db = getDb();

  // 1. Read cursor
  const cursor = (await getSetting("achievements_backfill_cursor")) ?? "";

  // 2. Fetch next page of users
  const rows = await db.all<{ id: string }>(sql`
    SELECT id FROM users
    WHERE id > ${cursor}
    ORDER BY id ASC
    LIMIT ${PAGE_SIZE}
  `);

  if (rows.length === 0) {
    await setSetting("achievements_backfill_done", "1");
    log.info("Backfill complete — no more users");
    return;
  }

  log.info("Backfill: processing page", { count: rows.length, cursor });

  for (const row of rows) {
    const userId = row.id;
    try {
      // 3a. Recompute streak from history
      await recomputeStreakFromHistory(userId);

      // 3b. Evaluate every achievement with earnedNotified=1 (backfill should not burst notifications)
      for (const a of ACHIEVEMENTS) {
        try {
          let result: { progress: number; earned: boolean };

          switch (a.kind) {
            case "count_movies":
              result = await evaluateCountMovies(userId, a.threshold);
              break;
            case "count_episodes":
              result = await evaluateCountEpisodes(userId, a.threshold);
              break;
            case "streak_days":
              result = await evaluateStreak(userId, a.threshold);
              break;
            case "genre_count":
              result = await evaluateGenreCount(
                userId,
                a.threshold,
                a.genre ?? "__any__",
              );
              break;
            case "completionist":
              // Without titleId — checks all shows the user has episodes for
              result = await evaluateCompletionist(userId, a.threshold);
              break;
            case "speed_binge_season": {
              // Query for candidate (user, title) pairs with >= threshold episodes
              const threshold = a.threshold;
              const windowHours = a.windowHours ?? 24;
              const candidateRows = await db.all<{ title_id: string }>(sql`
                SELECT e.title_id
                FROM watched_episodes we
                JOIN episodes e ON e.id = we.episode_id
                WHERE we.user_id = ${userId}
                  AND we.watched_at IS NOT NULL
                GROUP BY e.title_id
                HAVING COUNT(*) >= ${threshold}
              `);

              let maxProgress = 0;
              let anyEarned = false;

              for (const c of candidateRows) {
                const r = await evaluateSpeedBingeSeason(
                  userId,
                  threshold,
                  windowHours,
                  c.title_id,
                );
                if (r.earned) {
                  anyEarned = true;
                  maxProgress = Math.max(maxProgress, r.progress);
                } else {
                  maxProgress = Math.max(maxProgress, r.progress);
                }
              }

              result = { progress: maxProgress, earned: anyEarned };
              break;
            }
            case "social_first_follow":
              result = await evaluateSocialFirstFollow(userId);
              break;
            case "social_first_recommendation":
              result = await evaluateSocialFirstRecommendation(userId);
              break;
            default:
              continue;
          }

          const earnedAt = result.earned ? new Date().toISOString() : null;
          await upsertUserAchievement(
            userId,
            a.key,
            result.progress,
            earnedAt,
            { earnedNotified: 1 },
          );
        } catch (err) {
          log.warn("Backfill: error evaluating achievement for user", {
            userId,
            key: a.key,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      log.warn("Backfill: error processing user", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Update cursor
  const lastUserId = rows[rows.length - 1].id;
  await setSetting("achievements_backfill_cursor", lastUserId);

  // 5. If full page returned, enqueue next batch
  if (rows.length === PAGE_SIZE) {
    enqueueJob(
      "backfill-achievements",
      {},
      { runAt: new Date(Date.now() + 5000) },
    );
    log.info("Backfill: enqueued next batch", { nextCursor: lastUserId });
  } else {
    // 6. Done
    await setSetting("achievements_backfill_done", "1");
    log.info("Backfill: complete", { totalProcessed: rows.length });
  }
}

registerHandler("backfill-achievements", () => runBackfillAchievements());
