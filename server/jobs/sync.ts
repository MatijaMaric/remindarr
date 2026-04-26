import { logger } from "../logger";
import { registerHandler } from "./worker";
import { getEnabledIntegrationsByProvider } from "../db/repository";
import { syncPlexWatched } from "../plex/sync";
import { syncPlexLibrary } from "../plex/library-sync";
import { checkStreamingAlerts } from "./check-streaming-alerts";
import { syncFailureTotal } from "../metrics";

const log = logger.child({ module: "sync" });
import { registerCron, enqueueJob, hasActiveJob } from "./queue";
import { CONFIG } from "../config";
import { fetchNewReleases } from "../tmdb/sync-titles";
import { upsertTitles, getEpisodeIdsBySE, watchEpisodesBulk } from "../db/repository";
import { syncEpisodes, syncEpisodesForShow } from "../tmdb/sync";
import { fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { parseMovieDetails, parseTvDetails } from "../tmdb/parser";
import { migrateTitles } from "./migrate-titles";
import { migrateBackdrops } from "./migrate-backdrops";
import { migrateOffers } from "./migrate-offers";
import { enrichTitleDeepLinks } from "../streaming-availability/enrich";
import { RateLimitError } from "../streaming-availability/types";
import { getTitlesNeedingSaEnrichment } from "../db/repository";
import { syncEachWithDelay } from "../tmdb/sync-utils";

export function registerSyncJobs() {
  // ─── Handlers ───────────────────────────────────────────────────────────

  registerHandler("sync-titles", async () => {
    const titles = await fetchNewReleases({ daysBack: CONFIG.DEFAULT_DAYS_BACK });
    const titleIds = titles.map((t) => t.id);
    const count = await upsertTitles(titles);
    log.info("Synced titles from TMDB", { count });
    await checkStreamingAlerts(titleIds);
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

  registerHandler("sync-deep-links", async () => {
    if (!CONFIG.STREAMING_AVAILABILITY_API_KEY) {
      log.info("Skipping deep link sync", { reason: "STREAMING_AVAILABILITY_API_KEY not configured" });
      return;
    }
    const titleRows = await getTitlesNeedingSaEnrichment();
    if (titleRows.length === 0) {
      log.info("No titles need deep link enrichment");
      return;
    }
    log.info("Starting deep link sync", { count: titleRows.length });
    let enriched = 0;
    let processed = 0;
    await syncEachWithDelay(titleRows, {
      delayMs: 500,
      label: "sync-deep-links",
      log,
      onItem: async (t) => {
        const count = await enrichTitleDeepLinks(
          t.id,
          Number(t.tmdbId),
          t.objectType as "MOVIE" | "SHOW",
        );
        enriched += count;
        processed++;
      },
      onError: (err, t) => {
        if (err instanceof RateLimitError) {
          log.warn("SA rate limit hit, stopping early", { processed, enriched });
          return "stop";
        }
        log.error("SA enrichment failed", { titleId: t.id, err });
      },
    });
    log.info("Deep link sync complete", { processed, enriched });
  });

  registerHandler("sync-plex-watched", async () => {
    const integrations = await getEnabledIntegrationsByProvider("plex");
    if (integrations.length === 0) {
      log.info("No enabled Plex integrations, skipping sync");
      return;
    }
    log.info("Starting Plex watched sync", { count: integrations.length });
    let synced = 0;
    let failed = 0;
    for (const integration of integrations) {
      try {
        const result = await syncPlexWatched(integration as any);
        log.info("Plex sync done", {
          integrationId: integration.id,
          moviesMarked: result.moviesMarked,
          episodesMarked: result.episodesMarked,
          succeeded: result.succeeded,
          failedCount: result.failed.length,
        });
        synced++;
      } catch (err) {
        failed++;
        log.warn("Plex sync item failed", { err });
        syncFailureTotal.inc({ source: "plex" });
      }
    }
    log.info("Plex watched sync complete", { synced, failed });
  });

  registerHandler("sync-plex-library", async () => {
    const integrations = await getEnabledIntegrationsByProvider("plex");
    if (integrations.length === 0) {
      log.info("No enabled Plex integrations, skipping library sync");
      return;
    }
    log.info("Starting Plex library sync", { count: integrations.length });
    let synced = 0;
    let failed = 0;
    for (const integration of integrations) {
      try {
        const result = await syncPlexLibrary(integration as any);
        log.info("Plex library sync done", {
          integrationId: integration.id,
          moviesAdded: result.moviesAdded,
          showsAdded: result.showsAdded,
        });
        synced++;
      } catch (err) {
        failed++;
        log.warn("Plex sync item failed", { err });
        syncFailureTotal.inc({ source: "plex" });
      }
    }
    log.info("Plex library sync complete", { synced, failed });
  });

  // ─── Cron Schedules ────────────────────────────────────────────────────

  registerCron("sync-titles", CONFIG.SYNC_TITLES_CRON);
  registerCron("sync-episodes", CONFIG.SYNC_EPISODES_CRON);
  registerCron("sync-plex-watched", CONFIG.SYNC_PLEX_CRON);
  registerCron("sync-plex-library", CONFIG.SYNC_PLEX_LIBRARY_CRON);

  if (CONFIG.STREAMING_AVAILABILITY_API_KEY) {
    registerCron("sync-deep-links", CONFIG.SYNC_DEEP_LINKS_CRON);
  }

  // Enqueue one-time migration jobs only if not already pending/running/completed
  if (!hasActiveJob("migrate-titles")) {
    enqueueJob("migrate-titles", undefined, { maxAttempts: 1 });
  }

  if (!hasActiveJob("migrate-backdrops")) {
    enqueueJob("migrate-backdrops", undefined, { maxAttempts: 1 });
  }

  if (!hasActiveJob("migrate-offers")) {
    enqueueJob("migrate-offers", undefined, { maxAttempts: 1 });
  }

  // Enqueue one-time deep link backfill for existing titles
  if (CONFIG.STREAMING_AVAILABILITY_API_KEY && !hasActiveJob("sync-deep-links")) {
    enqueueJob("sync-deep-links", undefined, { maxAttempts: 1 });
  }
}
