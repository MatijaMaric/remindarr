import { CONFIG } from "../config";
import { getDb } from "../db/schema";
import { upsertEpisodes, deleteEpisodesForTitle } from "../db/repository";
import { fetchShowDetails, fetchSeasonEpisodes } from "./client";
import type { TmdbEpisode } from "./types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const details = await fetchShowDetails(tmdbId);

  // Skip ended/canceled shows that already have episodes synced
  if (details.status === "Ended" || details.status === "Canceled") {
    const existing = db.prepare(
      "SELECT COUNT(*) as count FROM episodes WHERE title_id = ?"
    ).get(titleId) as { count: number };
    if (existing.count > 0) {
      return 0;
    }
  }

  // 7 days ago for filtering
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  // Determine which season to fetch: use next_episode or last_episode season, or latest
  let seasonToFetch = details.number_of_seasons;
  if (details.next_episode_to_air) {
    seasonToFetch = details.next_episode_to_air.season_number;
  } else if (details.last_episode_to_air) {
    seasonToFetch = details.last_episode_to_air.season_number;
  }

  const seasonData = await fetchSeasonEpisodes(tmdbId, seasonToFetch);

  // Filter to recent/upcoming episodes
  const episodes: EpisodeRow[] = seasonData.episodes
    .filter((ep: TmdbEpisode) => ep.air_date && ep.air_date >= cutoffStr)
    .map((ep: TmdbEpisode) => ({
      title_id: titleId,
      season_number: ep.season_number,
      episode_number: ep.episode_number,
      name: ep.name || null,
      overview: ep.overview || null,
      air_date: ep.air_date,
      still_path: ep.still_path,
    }));

  if (episodes.length > 0) {
    upsertEpisodes(episodes);
  }

  console.log(`[TMDB] Synced ${episodes.length} episodes for "${title}" (S${String(seasonToFetch).padStart(2, "0")})`);
  return episodes.length;
}

export async function syncEpisodes(): Promise<{ synced: number; shows: number }> {
  const db = getDb();

  // Get all tracked shows with tmdb_id
  const trackedShows = db.prepare(`
    SELECT t.id, t.tmdb_id, t.title
    FROM tracked tr
    JOIN titles t ON t.id = tr.title_id
    WHERE t.object_type = 'SHOW' AND t.tmdb_id IS NOT NULL
  `).all() as { id: string; tmdb_id: string; title: string }[];

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
      console.error(`[TMDB] Failed to sync "${show.title}" (tmdb:${show.tmdb_id}):`, err);
    }

    // Rate limit delay
    await delay(CONFIG.EPISODE_SYNC_DELAY_MS);
  }

  return { synced: totalSynced, shows: showsProcessed };
}
