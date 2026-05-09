import { ACHIEVEMENTS } from "./definitions";
import { upsertAchievementDef } from "../db/repository/achievements";
import { getSetting } from "../db/repository/settings";
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
    await upsertAchievementDef(achievement);
  }

  log.info("Achievement registry sync complete");

  // Auto-trigger backfill once (idempotent via hasActiveJob guard)
  const { hasActiveJob, enqueueJob } = await import("../jobs/queue");
  const done = await getSetting("achievements_backfill_done");
  if (!done && !(await hasActiveJob("backfill-achievements"))) {
    await enqueueJob("backfill-achievements", {});
    log.info("Enqueued achievements backfill job");
  }
}
