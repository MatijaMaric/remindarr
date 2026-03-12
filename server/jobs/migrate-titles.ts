import { getRawDb } from "../db/schema";
import { fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { CONFIG } from "../config";

const DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One-time migration: fetches English titles and original titles from TMDB
 * for all existing titles that don't have original_title set yet.
 */
export async function migrateTitles(): Promise<{ updated: number; failed: number }> {
  if (!CONFIG.TMDB_API_KEY) {
    console.log("[MigrateTitles] Skipping — TMDB_API_KEY not configured");
    return { updated: 0, failed: 0 };
  }

  const db = getRawDb();
  const rows = db
    .prepare(
      "SELECT id, object_type, tmdb_id FROM titles WHERE original_title IS NULL AND tmdb_id IS NOT NULL"
    )
    .all() as { id: string; object_type: string; tmdb_id: string }[];

  if (rows.length === 0) {
    console.log("[MigrateTitles] No titles need migration");
    return { updated: 0, failed: 0 };
  }

  console.log(`[MigrateTitles] Migrating ${rows.length} titles...`);
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const tmdbId = parseInt(row.tmdb_id, 10);
      let englishTitle: string;
      let originalTitle: string;

      if (row.object_type === "MOVIE" || row.id.startsWith("movie-")) {
        const details = await fetchMovieDetails(tmdbId);
        englishTitle = details.title;
        originalTitle = details.original_title;
      } else {
        const details = await fetchTvDetails(tmdbId);
        englishTitle = details.name;
        originalTitle = details.original_name;
      }

      db.prepare(
        "UPDATE titles SET title = ?, original_title = ? WHERE id = ?"
      ).run(englishTitle, originalTitle, row.id);
      updated++;
    } catch (err) {
      console.error(`[MigrateTitles] Failed to migrate ${row.id}:`, err);
      failed++;
    }

    await delay(DELAY_MS);
  }

  console.log(`[MigrateTitles] Done: ${updated} updated, ${failed} failed`);
  return { updated, failed };
}
