import { logger } from "../logger";
import { getLibrarySections, getAllMoviesInSection, getShowsInSection, PlexAuthError } from "./client";
import { parsePlexGuids, parseLegacyGuid, toRemindarrTitleId } from "./guid";
import { upsertPlexLibraryItems, deleteStaleLibraryItems } from "../db/repository/plex-library";
import { updateIntegrationSyncStatus, disableIntegration } from "../db/repository";
import type { PlexConfig } from "../db/repository/integrations";

const log = logger.child({ module: "plex-library-sync" });

export type LibrarySyncResult = {
  moviesAdded: number;
  showsAdded: number;
};

type IntegrationRow = {
  id: string;
  user_id: string;
  config: PlexConfig;
};

export async function syncPlexLibrary(integration: IntegrationRow): Promise<LibrarySyncResult> {
  const { id: integrationId, user_id: userId, config } = integration;
  const { plexToken, serverUrl } = config;

  let moviesAdded = 0;
  let showsAdded = 0;

  try {
    const sections = await getLibrarySections(serverUrl, plexToken);
    const itemsToUpsert: Parameters<typeof upsertPlexLibraryItems>[0] = [];
    const currentTitleIds: string[] = [];

    // ─── Scan movie sections ───────────────────────────────────────────────
    const movieSections = sections.filter((s) => s.type === "movie");
    for (const section of movieSections) {
      const movies = await getAllMoviesInSection(serverUrl, plexToken, section.key);
      for (const item of movies) {
        const guids = parsePlexGuids(item.Guid) || parseLegacyGuid(item.guid);
        if (!guids.tmdbId) continue;
        const titleId = toRemindarrTitleId("movie", guids.tmdbId);
        currentTitleIds.push(titleId);
        itemsToUpsert.push({
          integrationId,
          userId,
          titleId,
          ratingKey: item.ratingKey,
          mediaType: "movie",
        });
        moviesAdded++;
      }
    }

    // ─── Scan show sections ────────────────────────────────────────────────
    const showSections = sections.filter((s) => s.type === "show");
    for (const section of showSections) {
      const shows = await getShowsInSection(serverUrl, plexToken, section.key);
      for (const item of shows) {
        const guids = parsePlexGuids(item.Guid) || parseLegacyGuid(item.guid);
        if (!guids.tmdbId) continue;
        const titleId = toRemindarrTitleId("show", guids.tmdbId);
        currentTitleIds.push(titleId);
        itemsToUpsert.push({
          integrationId,
          userId,
          titleId,
          ratingKey: item.ratingKey,
          mediaType: "show",
        });
        showsAdded++;
      }
    }

    // Upsert all items, then remove stale ones in a single pass
    await upsertPlexLibraryItems(itemsToUpsert);
    await deleteStaleLibraryItems(integrationId, currentTitleIds);

    log.info("Plex library sync complete", { integrationId, moviesAdded, showsAdded });
    return { moviesAdded, showsAdded };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (err instanceof PlexAuthError) {
      log.warn("Plex token revoked, disabling integration", { integrationId });
      await disableIntegration(integrationId);
    }

    log.error("Plex library sync failed", { integrationId, error: errorMsg });
    throw err;
  }
}
