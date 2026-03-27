import { getDb } from "../db/schema";
import { titles, offers } from "../db/schema";
import { isNotNull, sql } from "drizzle-orm";
import { logger } from "../logger";
import { fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { parseMovieDetails, parseTvDetails } from "../tmdb/parser";
import { upsertTitles } from "../db/repository";
import { CONFIG } from "../config";

const log = logger.child({ module: "migrate-offers" });

const DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One-time migration: fetches watch provider offers from TMDB
 * for all existing titles that have no offers in the database.
 */
export async function migrateOffers(): Promise<{ updated: number; skipped: number; failed: number }> {
  if (!CONFIG.TMDB_API_KEY) {
    log.info("Skipping offers migration", { reason: "TMDB_API_KEY not configured" });
    return { updated: 0, skipped: 0, failed: 0 };
  }

  const db = getDb();
  const rows = await db
    .select({ id: titles.id, objectType: titles.objectType, tmdbId: titles.tmdbId })
    .from(titles)
    .where(
      sql`${titles.tmdbId} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${offers} WHERE ${offers.titleId} = ${titles.id})`
    )
    .all();

  if (rows.length === 0) {
    log.info("No titles need offers migration");
    return { updated: 0, skipped: 0, failed: 0 };
  }

  log.info("Migrating offers", { count: rows.length });
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

    await delay(DELAY_MS);
  }

  log.info("Offers migration complete", { updated, skipped, failed });
  return { updated, skipped, failed };
}
