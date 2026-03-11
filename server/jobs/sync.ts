import { registerHandler } from "./worker";
import { registerCron } from "./queue";
import { CONFIG } from "../config";
import { fetchNewReleases } from "../justwatch/client";
import { upsertTitles } from "../db/repository";
import { syncEpisodes } from "../tmdb/sync";

export function registerSyncJobs() {
  // ─── Handlers ───────────────────────────────────────────────────────────

  registerHandler("sync-titles", async () => {
    const titles = await fetchNewReleases({ daysBack: CONFIG.DEFAULT_DAYS_BACK });
    const count = upsertTitles(titles);
    console.log(`[Sync] Synced ${count} titles from JustWatch`);
  });

  registerHandler("sync-episodes", async () => {
    if (!CONFIG.TMDB_API_KEY) {
      console.log("[Sync] Skipping episode sync — TMDB_API_KEY not configured");
      return;
    }
    const result = await syncEpisodes();
    console.log(`[Sync] Synced ${result.synced} episodes from ${result.shows} shows`);
  });

  // ─── Cron Schedules ────────────────────────────────────────────────────

  registerCron("sync-titles", CONFIG.SYNC_TITLES_CRON);
  registerCron("sync-episodes", CONFIG.SYNC_EPISODES_CRON);
}
