import { logger } from "../logger";
import { registerHandler } from "./worker";

const log = logger.child({ module: "sync" });
import { registerCron, enqueueJob } from "./queue";
import { CONFIG } from "../config";
import { fetchNewReleases } from "../tmdb/sync-titles";
import { upsertTitles } from "../db/repository";
import { syncEpisodes } from "../tmdb/sync";
import { migrateTitles } from "./migrate-titles";

export function registerSyncJobs() {
  // ─── Handlers ───────────────────────────────────────────────────────────

  registerHandler("sync-titles", async () => {
    const titles = await fetchNewReleases({ daysBack: CONFIG.DEFAULT_DAYS_BACK });
    const count = await upsertTitles(titles);
    log.info("Synced titles from TMDB", { count });
  });

  registerHandler("sync-episodes", async () => {
    if (!CONFIG.TMDB_API_KEY) {
      log.info("Skipping episode sync", { reason: "TMDB_API_KEY not configured" });
      return;
    }
    const result = await syncEpisodes();
    log.info("Synced episodes", { synced: result.synced, shows: result.shows });
  });

  registerHandler("migrate-titles", async () => {
    await migrateTitles();
  });

  // ─── Cron Schedules ────────────────────────────────────────────────────

  registerCron("sync-titles", CONFIG.SYNC_TITLES_CRON);
  registerCron("sync-episodes", CONFIG.SYNC_EPISODES_CRON);

  // Enqueue one-time title migration (will no-op if all titles already have original_title)
  enqueueJob("migrate-titles", undefined, { maxAttempts: 1 });
}
