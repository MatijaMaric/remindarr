import { ACHIEVEMENTS } from "./definitions";
import { upsertAchievementDef } from "../db/repository/achievements";
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
}
