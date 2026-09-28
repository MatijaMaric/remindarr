import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, titles } from "../db/schema";
import { logger } from "../logger";
import { fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { CONFIG } from "../config";
import { sleep } from "../lib/http";

const log = logger.child({ module: "migrate-backdrops" });

const DELAY_MS = 500;
const DEFAULT_BATCH_SIZE = 20;

/**
 * One-time migration: fetches backdrop_path from TMDB for existing titles
 * that don't have backdrop_url set yet.
 *
 * Processes at most `batchSize` titles per call to stay within CF CPU limits.
 * Sets `backdrop_checked = 1` after each lookup (including "no backdrop" and
 * failures) so those rows are not selected again. Titles that already have a
 * backdrop are left alone.
 * Returns `hasMore: true` when the batch was full — callers should re-enqueue.
 */
export async function migrateBackdrops(
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<{
  updated: number;
  skipped: number;
  failed: number;
  hasMore: boolean;
}> {
  if (!CONFIG.TMDB_API_KEY) {
    log.info("Skipping backdrop migration", {
      reason: "TMDB_API_KEY not configured",
    });
    return { updated: 0, skipped: 0, failed: 0, hasMore: false };
  }

  const db = getDb();
  const rows = await db
    .select({
      id: titles.id,
      objectType: titles.objectType,
      tmdbId: titles.tmdbId,
    })
    .from(titles)
    .where(
      and(
        eq(titles.backdropChecked, 0),
        isNull(titles.backdropUrl),
        isNotNull(titles.tmdbId),
      ),
    )
    .limit(batchSize)
    .all();

  if (rows.length === 0) {
    log.info("No titles need backdrop migration");
    return { updated: 0, skipped: 0, failed: 0, hasMore: false };
  }

  // A full batch means there are likely more rows beyond this page.
  const hasMore = rows.length === batchSize;
  log.info("Migrating backdrops batch", { count: rows.length, hasMore });
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    let backdropUrl: string | null = null;
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
        backdropUrl = `${CONFIG.TMDB_IMAGE_BASE_URL}/w1280${backdropPath}`;
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      log.error("Failed to migrate backdrop", { titleId: row.id, err });
      failed++;
    }

    // Mark checked even when TMDB has no backdrop or the fetch fails, so the
    // next batch does not select the same NULL backdrop_url rows again.
    await db
      .update(titles)
      .set(
        backdropUrl
          ? { backdropUrl, backdropChecked: 1 }
          : { backdropChecked: 1 },
      )
      .where(eq(titles.id, row.id))
      .run();

    await sleep(DELAY_MS);
  }

  log.info("Backdrop migration batch complete", {
    updated,
    skipped,
    failed,
    hasMore,
  });
  return { updated, skipped, failed, hasMore };
}
