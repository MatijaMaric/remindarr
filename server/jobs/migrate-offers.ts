import { eq, sql } from "drizzle-orm";
import { getDb, titles, offers } from "../db/schema";
import { logger } from "../logger";
import { fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { parseMovieDetails, parseTvDetails } from "../tmdb/parser";
import { upsertTitles } from "../db/repository";
import { CONFIG } from "../config";

const log = logger.child({ module: "migrate-offers" });

const DELAY_MS = 500;
const DEFAULT_BATCH_SIZE = 20;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One-time migration: fetches watch provider offers from TMDB
 * for all existing titles that have no offers in the database.
 *
 * Processes at most `batchSize` titles per call to stay within CF CPU limits.
 * Sets `offers_checked = 1` on each title after processing (regardless of
 * whether offers were found) so titles with no streaming availability are
 * not retried on every subsequent run.
 * Returns `hasMore: true` when the batch was full — callers should re-enqueue.
 */
export async function migrateOffers(batchSize = DEFAULT_BATCH_SIZE): Promise<{ updated: number; skipped: number; failed: number; hasMore: boolean }> {
  if (!CONFIG.TMDB_API_KEY) {
    log.info("Skipping offers migration", { reason: "TMDB_API_KEY not configured" });
    return { updated: 0, skipped: 0, failed: 0, hasMore: false };
  }

  const db = getDb();
  const rows = await db
    .select({ id: titles.id, objectType: titles.objectType, tmdbId: titles.tmdbId })
    .from(titles)
    .where(
      sql`${titles.tmdbId} IS NOT NULL AND ${titles.offersChecked} = 0`
    )
    .limit(batchSize)
    .all();

  if (rows.length === 0) {
    log.info("No titles need offers migration");
    return { updated: 0, skipped: 0, failed: 0, hasMore: false };
  }

  // A full batch means there are likely more rows beyond this page.
  const hasMore = rows.length === batchSize;
  log.info("Migrating offers batch", { count: rows.length, hasMore });
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const tmdbId = parseInt(row.tmdbId!, 10);
      const isMovie = row.objectType === "MOVIE" || row.id.startsWith("movie-");

      const title = isMovie
        ? parseMovieDetails(await fetchMovieDetails(tmdbId))
        : parseTvDetails(await fetchTvDetails(tmdbId));

      if (title.offers.length > 0) {
        await upsertTitles([title]);
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      log.error("Failed to migrate offers", { titleId: row.id, err });
      failed++;
    }

    // Mark as checked regardless of outcome so it isn't retried on the next run.
    await db.update(titles).set({ offersChecked: 1 }).where(eq(titles.id, row.id));

    await delay(DELAY_MS);
  }

  log.info("Offers migration batch complete", { updated, skipped, failed, hasMore });
  return { updated, skipped, failed, hasMore };
}
