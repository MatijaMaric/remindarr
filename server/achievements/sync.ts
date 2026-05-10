import { ACHIEVEMENTS, ACHIEVEMENT_META } from "./definitions";
import { upsertAchievementDef } from "../db/repository/achievements";
import { getSetting } from "../db/repository/settings";
import { enqueueOnce } from "../jobs/backend";
import { logger } from "../logger";

const log = logger.child({ module: "achievements-sync" });

/**
 * Sync the ACHIEVEMENTS registry into the `achievements` table.
 * UPSERTs each entry — does NOT delete missing keys (orphan rows are tolerated).
 * Safe to call multiple times (idempotent).
 */
export async function syncAchievementRegistry(): Promise<void> {
  log.info("Syncing achievement registry", { count: ACHIEVEMENTS.length });

  for (const achievement of ACHIEVEMENTS) {
    const meta = ACHIEVEMENT_META.get(achievement.key);
    await upsertAchievementDef(achievement, meta);
  }

  log.info("Achievement registry sync complete");

  // Auto-trigger backfill once — idempotent via the backend dispatcher's
  // dedup logic (DO: idempotent flag; D1: enqueueOneTimeMigration sentinel row)
  const done = await getSetting("achievements_backfill_done_v2");
  if (!done) {
    await enqueueOnce("backfill-achievements");
    log.info("Enqueued achievements backfill job");
  }
}
