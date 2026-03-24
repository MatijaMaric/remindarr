import { getDb } from "../db/schema";
import { titles } from "../db/schema";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { logger } from "../logger";

const log = logger.child({ module: "migrate-backdrops" });
import { fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { CONFIG } from "../config";

const DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One-time migration: fetches backdrop_path from TMDB for all existing
 * titles that don't have backdrop_url set yet.
 */
export async function migrateBackdrops(): Promise<{ updated: number; skipped: number; failed: number }> {
  if (!CONFIG.TMDB_API_KEY) {
    log.info("Skipping backdrop migration", { reason: "TMDB_API_KEY not configured" });
    return { updated: 0, skipped: 0, failed: 0 };
  }

  const db = getDb();
  const rows = await db
    .select({ id: titles.id, objectType: titles.objectType, tmdbId: titles.tmdbId })
    .from(titles)
    .where(and(isNull(titles.backdropUrl), isNotNull(titles.tmdbId)))
    .all();

  if (rows.length === 0) {
    log.info("No titles need backdrop migration");
    return { updated: 0, skipped: 0, failed: 0 };
  }

  log.info("Migrating backdrops", { count: rows.length });
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const tmdbId = parseInt(row.tmdbId!, 10);
      let backdropPath: string | null = null;

      if (row.objectType === "MOVIE" || row.id.startsWith("movie-")) {
        const details = await fetchMovieDetails(tmdbId);
        backdropPath = details.backdrop_path ?? null;
      } else {
        const details = await fetchTvDetails(tmdbId);
        backdropPath = details.backdrop_path ?? null;
      }

      if (backdropPath) {
        const backdropUrl = `${CONFIG.TMDB_IMAGE_BASE_URL}/w1280${backdropPath}`;
        await db.update(titles).set({ backdropUrl }).where(eq(titles.id, row.id)).run();
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      log.error("Failed to migrate backdrop", { titleId: row.id, err });
      failed++;
    }

    await delay(DELAY_MS);
  }

  log.info("Backdrop migration complete", { updated, skipped, failed });
  return { updated, skipped, failed };
}
