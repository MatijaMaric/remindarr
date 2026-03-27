import { logger } from "../logger";
import { registerHandler } from "./worker";

const log = logger.child({ module: "sync" });
import { registerCron, enqueueJob } from "./queue";
import { CONFIG } from "../config";
import { fetchNewReleases } from "../tmdb/sync-titles";
import { upsertTitles, getEpisodeIdsBySE, watchEpisodesBulk } from "../db/repository";
import { syncEpisodes, syncEpisodesForShow } from "../tmdb/sync";
import { fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { parseMovieDetails, parseTvDetails } from "../tmdb/parser";
import { migrateTitles } from "./migrate-titles";
import { migrateBackdrops } from "./migrate-backdrops";
import { migrateOffers } from "./migrate-offers";

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

  registerHandler("sync-show-episodes", async (job) => {
    if (!CONFIG.TMDB_API_KEY) {
      log.info("Skipping show episode sync", { reason: "TMDB_API_KEY not configured" });
      return;
    }
    const data = job.data ? JSON.parse(job.data) : null;
    if (!data?.titleId || !data?.tmdbId || !data?.title) {
      throw new Error("sync-show-episodes job missing required data fields");
    }
    const count = await syncEpisodesForShow(data.titleId, data.tmdbId, data.title);
    log.info("Synced show episodes via job", { title: data.title, episodes: count });

    // Restore watched episodes if provided (from watchlist import)
    if (Array.isArray(data.watchedEpisodes) && data.watchedEpisodes.length > 0 && data.userId) {
      const episodeIds = await getEpisodeIdsBySE(data.titleId, data.watchedEpisodes);
      if (episodeIds.length > 0) {
        await watchEpisodesBulk(episodeIds, data.userId);
        log.info("Restored watched episodes from import", {
          title: data.title,
          watched: episodeIds.length,
          requested: data.watchedEpisodes.length,
        });
      }
    }
  });

  registerHandler("backfill-title-offers", async (job) => {
    if (!CONFIG.TMDB_API_KEY) {
      log.info("Skipping offers backfill", { reason: "TMDB_API_KEY not configured" });
      return;
    }
    const data = job.data ? JSON.parse(job.data) : null;
    if (!data?.tmdbId || !data?.objectType) {
      throw new Error("backfill-title-offers job missing required data fields");
    }
    const tmdbId = Number(data.tmdbId);
    const title = data.objectType === "MOVIE"
      ? parseMovieDetails(await fetchMovieDetails(tmdbId))
      : parseTvDetails(await fetchTvDetails(tmdbId));
    if (title.offers.length > 0) {
      await upsertTitles([title]);
      log.info("Backfilled offers for title", { title: title.title, offers: title.offers.length });
    } else {
      log.info("No offers found for title", { title: title.title });
    }
  });

  registerHandler("migrate-titles", async () => {
    await migrateTitles();
  });

  registerHandler("migrate-backdrops", async () => {
    await migrateBackdrops();
  });

  registerHandler("migrate-offers", async () => {
    await migrateOffers();
  });

  // ─── Cron Schedules ────────────────────────────────────────────────────

  registerCron("sync-titles", CONFIG.SYNC_TITLES_CRON);
  registerCron("sync-episodes", CONFIG.SYNC_EPISODES_CRON);

  // Enqueue one-time title migration (will no-op if all titles already have original_title)
  enqueueJob("migrate-titles", undefined, { maxAttempts: 1 });

  // Enqueue one-time backdrop backfill (will no-op if all titles already have backdrop_url)
  enqueueJob("migrate-backdrops", undefined, { maxAttempts: 1 });

  // Enqueue one-time offers backfill (will no-op if all titles already have offers)
  enqueueJob("migrate-offers", undefined, { maxAttempts: 1 });
}
