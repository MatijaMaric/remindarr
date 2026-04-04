import { logger } from "../logger";
import {
  getLibrarySections,
  getWatchedMovies,
  getWatchedEpisodes,
  getShowsInSection,
  PlexAuthError,
} from "./client";
import { parsePlexGuids, parseLegacyGuid, toRemindarrTitleId } from "./guid";
import { watchTitle, watchEpisodesBulk, getEpisodeIdsBySE } from "../db/repository";
import { updateIntegrationSyncStatus, disableIntegration } from "../db/repository";
import type { PlexConfig } from "../db/repository/integrations";

const log = logger.child({ module: "plex-sync" });

export type SyncResult = {
  moviesMarked: number;
  episodesMarked: number;
};

type IntegrationRow = {
  id: string;
  user_id: string;
  config: PlexConfig;
};

export async function syncPlexWatched(integration: IntegrationRow): Promise<SyncResult> {
  const { id: integrationId, user_id: userId, config } = integration;
  const { plexToken, serverUrl, syncMovies, syncEpisodes } = config;

  let moviesMarked = 0;
  let episodesMarked = 0;

  try {
    const sections = await getLibrarySections(serverUrl, plexToken);

    // ─── Sync movies ───────────────────────────────────────────────────────
    if (syncMovies) {
      const movieSections = sections.filter((s) => s.type === "movie");
      for (const section of movieSections) {
        const watched = await getWatchedMovies(serverUrl, plexToken, section.key);
        for (const item of watched) {
          const guids = parsePlexGuids(item.Guid) || parseLegacyGuid(item.guid);
          if (!guids.tmdbId) continue;
          const titleId = toRemindarrTitleId("movie", guids.tmdbId);
          try {
            await watchTitle(titleId, userId);
            moviesMarked++;
          } catch {
            // Title not in Remindarr DB — skip silently
          }
        }
      }
    }

    // ─── Sync episodes ─────────────────────────────────────────────────────
    if (syncEpisodes) {
      const showSections = sections.filter((s) => s.type === "show");

      for (const section of showSections) {
        // Build a map of Plex ratingKey → TMDB ID from shows
        const shows = await getShowsInSection(serverUrl, plexToken, section.key);
        const showTmdbMap = new Map<string, number>();
        for (const show of shows) {
          const guids = parsePlexGuids(show.Guid) || parseLegacyGuid(show.guid);
          if (guids.tmdbId) showTmdbMap.set(show.ratingKey, guids.tmdbId);
        }

        const watchedEps = await getWatchedEpisodes(serverUrl, plexToken, section.key);

        // Group watched episodes by show (grandparentRatingKey)
        const byShow = new Map<string, Array<{ season: number; episode: number }>>();
        for (const ep of watchedEps) {
          const showKey = ep.grandparentRatingKey ?? "";
          if (!showKey) continue;
          if (!byShow.has(showKey)) byShow.set(showKey, []);
          byShow.get(showKey)!.push({ season: ep.seasonNumber, episode: ep.index });
        }

        for (const [showKey, sePairs] of byShow) {
          const tmdbId = showTmdbMap.get(showKey);
          if (!tmdbId) continue;
          const titleId = toRemindarrTitleId("show", tmdbId);

          const episodeIds = await getEpisodeIdsBySE(titleId, sePairs);
          if (episodeIds.length === 0) continue;

          await watchEpisodesBulk(episodeIds, userId);
          episodesMarked += episodeIds.length;
        }
      }
    }

    await updateIntegrationSyncStatus(integrationId, new Date().toISOString(), null);
    log.info("Plex sync complete", { integrationId, moviesMarked, episodesMarked });
    return { moviesMarked, episodesMarked };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (err instanceof PlexAuthError) {
      log.warn("Plex token revoked, disabling integration", { integrationId });
      await disableIntegration(integrationId);
    }

    await updateIntegrationSyncStatus(integrationId, null, errorMsg);
    log.error("Plex sync failed", { integrationId, error: errorMsg });
    throw err;
  }
}
