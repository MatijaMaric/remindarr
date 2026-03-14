import { CONFIG } from "../config";
import { logger } from "../logger";

const log = logger.child({ module: "tmdb" });
import { getDb } from "../db/schema";
import { titles, episodes, tracked } from "../db/schema";
import { upsertEpisodes } from "../db/repository";
import { fetchShowDetails, fetchSeasonEpisodes } from "./client";
import { eq, and, count, isNotNull } from "drizzle-orm";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the numeric TMDB ID from our internal title ID format "tv-12345" or the tmdb_id field */
function extractTmdbId(titleId: string, tmdbIdField: string | null): string {
  if (tmdbIdField) return tmdbIdField;
  if (titleId.startsWith("tv-")) return titleId.slice(3);
  return titleId;
}

interface EpisodeRow {
  title_id: string;
  season_number: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  still_path: string | null;
}

export async function syncEpisodesForShow(
  titleId: string,
  tmdbId: string,
  title: string
): Promise<number> {
  const db = getDb();

  const resolvedTmdbId = extractTmdbId(titleId, tmdbId);
  const details = await fetchShowDetails(resolvedTmdbId);

  // Skip ended/canceled shows that already have episodes synced
  if (details.status === "Ended" || details.status === "Canceled") {
    const existing = db
      .select({ count: count() })
      .from(episodes)
      .where(eq(episodes.titleId, titleId))
      .get();
    if (existing && existing.count > 0) {
      return 0;
    }
  }

  // Fetch all seasons (1 through number_of_seasons)
  const allEpisodes: EpisodeRow[] = [];

  for (let season = 1; season <= details.number_of_seasons; season++) {
    if (season > 1) await delay(CONFIG.EPISODE_SYNC_DELAY_MS);

    try {
      const seasonData = await fetchSeasonEpisodes(resolvedTmdbId, season);
      for (const ep of seasonData.episodes) {
        allEpisodes.push({
          title_id: titleId,
          season_number: ep.season_number,
          episode_number: ep.episode_number,
          name: ep.name || null,
          overview: ep.overview || null,
          air_date: ep.air_date,
          still_path: ep.still_path,
        });
      }
    } catch (err) {
      log.error("Failed to fetch season", { season, title, err });
    }
  }

  if (allEpisodes.length > 0) {
    upsertEpisodes(allEpisodes);
  }

  log.info("Synced episodes", { episodes: allEpisodes.length, seasons: details.number_of_seasons, title });
  return allEpisodes.length;
}

export async function syncEpisodes(): Promise<{ synced: number; shows: number }> {
  const db = getDb();

  // Get all tracked shows with tmdb_id
  const trackedShows = db
    .select({
      id: titles.id,
      tmdb_id: titles.tmdbId,
      title: titles.title,
    })
    .from(tracked)
    .innerJoin(titles, eq(titles.id, tracked.titleId))
    .where(and(eq(titles.objectType, "SHOW"), isNotNull(titles.tmdbId)))
    .all() as { id: string; tmdb_id: string; title: string }[];

  if (trackedShows.length === 0) {
    return { synced: 0, shows: 0 };
  }

  let totalSynced = 0;
  let showsProcessed = 0;

  for (const show of trackedShows) {
    try {
      const synced = await syncEpisodesForShow(show.id, show.tmdb_id, show.title);
      if (synced >= 0) {
        totalSynced += synced;
        showsProcessed++;
      }
    } catch (err) {
      log.error("Failed to sync show", { title: show.title, tmdbId: show.tmdb_id, err });
    }

    // Rate limit delay
    await delay(CONFIG.EPISODE_SYNC_DELAY_MS);
  }

  return { synced: totalSynced, shows: showsProcessed };
}
