import { ACHIEVEMENTS, ACHIEVEMENT_META } from "./definitions";
import { upsertAchievementDefs } from "../db/repository/achievements";
import { getSetting } from "../db/repository/settings";
import { enqueueOnce } from "../jobs/backend";
import { logger } from "../logger";

const log = logger.child({ module: "achievements-sync" });

export const BACKFILL_DONE_KEY = "achievements_backfill_done_v2";

/**
 * Sync the ACHIEVEMENTS registry into the `achievements` table.
 * One batched upsert — does NOT delete missing keys (orphan rows are tolerated).
 * Skips the write when every definition already matches. Safe to call multiple times.
 */
export async function syncAchievementRegistry(): Promise<void> {
  log.info("Syncing achievement registry", { count: ACHIEVEMENTS.length });

  await upsertAchievementDefs(
    ACHIEVEMENTS.map((achievement) => ({
      achievement,
      meta: ACHIEVEMENT_META.get(achievement.key),
    })),
  );

  log.info("Achievement registry sync complete");

  // Auto-trigger backfill once — idempotent via the backend dispatcher's
  // dedup logic (DO: idempotent flag; D1: enqueueOneTimeMigration sentinel row)
  const done = await getSetting(BACKFILL_DONE_KEY);
  if (!done) {
    await enqueueOnce("backfill-achievements");
    log.info("Enqueued achievements backfill job");
  }
}
