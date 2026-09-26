import { eq, and, sql, gte, lt, lte, asc, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, episodes, tracked, watchedEpisodes } from "../schema";
import { traceDbQuery } from "../../tracing";
import { logger } from "../../logger";
import { getOffersWithPlex } from "./offers";
import { localDateForTimezone } from "../../utils/timezone";
import type { MonthFilters } from "./titles";

const log = logger.child({ module: "episodes-repo" });

// Safety nets against unbounded unwatched queues (soaps, long anime), not
// pagination. Per-title keeps the earliest unwatched episodes. The global cap
// keeps the front of the recency sort.
export const MAX_UNWATCHED_PER_TITLE = 100;
export const MAX_UNWATCHED_EPISODES = 2000;

export async function upsertEpisodes(
  episodeList: {
    title_id: string;
    season_number: number;
    episode_number: number;
    name: string | null;
    overview: string | null;
    air_date: string | null;
    still_path: string | null;
    runtime_minutes?: number | null;
  }[],
) {
  return traceDbQuery("upsertEpisodes", async () => {
    const db = getDb();

    for (const ep of episodeList) {
      await db
        .insert(episodes)
        .values({
          titleId: ep.title_id,
          seasonNumber: ep.season_number,
          episodeNumber: ep.episode_number,
          name: ep.name,
          overview: ep.overview,
          airDate: ep.air_date,
          stillPath: ep.still_path,
          runtimeMinutes:
            ep.runtime_minutes && ep.runtime_minutes > 0
              ? ep.runtime_minutes
              : null,
          updatedAt: sql`datetime('now')`,
        })
        .onConflictDoUpdate({
          target: [
            episodes.titleId,
            episodes.seasonNumber,
            episodes.episodeNumber,
          ],
          set: {
            name: sql`excluded.name`,
            overview: sql`excluded.overview`,
            airDate: sql`excluded.air_date`,
            stillPath: sql`excluded.still_path`,
            runtimeMinutes: sql`COALESCE(excluded.runtime_minutes, episodes.runtime_minutes)`,
            updatedAt: sql`datetime('now')`,
          },
        })
        .run();
    }

    return episodeList.length;
  });
}

export async function getEpisodesByMonth(
  filters: MonthFilters,
  userId?: string,
) {
  return traceDbQuery("getEpisodesByMonth", async () => {
    const db = getDb();
    const { month, objectType } = filters;

    const [year, mon] = month.split("-").map(Number);
    const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
    const nextMonth =
      mon === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

    if (objectType === "MOVIE") return [];
    if (!userId) return [];

    const rows = await db
      .select({
        id: episodes.id,
        title_id: episodes.titleId,
        season_number: episodes.seasonNumber,
        episode_number: episodes.episodeNumber,
        name: episodes.name,
        overview: episodes.overview,
        air_date: episodes.airDate,
        still_path: episodes.stillPath,
        updated_at: episodes.updatedAt,
        show_title: titles.title,
        show_original_title: titles.originalTitle,
        poster_url: titles.posterUrl,
        backdrop_url: titles.backdropUrl,
        age_certification: titles.ageCertification,
        is_watched: sql<boolean>`EXISTS(
          SELECT 1 FROM watched_episodes we
          WHERE we.episode_id = ${episodes.id} AND we.user_id = ${userId}
        )`,
      })
      .from(episodes)
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)),
      )
      .where(
        and(gte(episodes.airDate, startDate), lt(episodes.airDate, nextMonth)),
      )
      .orderBy(asc(episodes.airDate), asc(titles.title))
      .all();

    const offersByTitle = await getOffersWithPlex(
      [...new Set(rows.map((r) => r.title_id))],
      userId,
    );
    return rows.map((row) => ({
      ...row,
      is_watched: !!row.is_watched,
      offers: offersByTitle.get(row.title_id) ?? [],
    }));
  });
}

export async function getEpisodesByDateRange(
  startDate: string,
  endDate: string,
  userId?: string,
) {
  return traceDbQuery("getEpisodesByDateRange", async () => {
    const db = getDb();
    if (!userId) return [];

    const rows = await db
      .select({
        id: episodes.id,
        title_id: episodes.titleId,
        season_number: episodes.seasonNumber,
        episode_number: episodes.episodeNumber,
        name: episodes.name,
        overview: episodes.overview,
        air_date: episodes.airDate,
        still_path: episodes.stillPath,
        updated_at: episodes.updatedAt,
        show_title: titles.title,
        show_original_title: titles.originalTitle,
        poster_url: titles.posterUrl,
        backdrop_url: titles.backdropUrl,
        age_certification: titles.ageCertification,
        notification_mode: tracked.notificationMode,
        snooze_until: tracked.snoozeUntil,
        is_watched: sql<boolean>`EXISTS(
          SELECT 1 FROM watched_episodes we
          WHERE we.episode_id = ${episodes.id} AND we.user_id = ${userId}
        )`,
      })
      .from(episodes)
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)),
      )
      .where(
        and(gte(episodes.airDate, startDate), lt(episodes.airDate, endDate)),
      )
      .orderBy(asc(episodes.airDate), asc(titles.title))
      .all();

    const offersByTitle = await getOffersWithPlex(
      [...new Set(rows.map((r) => r.title_id))],
      userId,
    );
    return rows.map((row) => ({
      ...row,
      is_watched: !!row.is_watched,
      offers: offersByTitle.get(row.title_id) ?? [],
    }));
  });
}

export async function deleteEpisodesForTitle(titleId: string) {
  return traceDbQuery("deleteEpisodesForTitle", async () => {
    const db = getDb();
    await db.delete(episodes).where(eq(episodes.titleId, titleId)).run();
  });
}

type UnwatchedEpisodeQueryRow = {
  id: number;
  title_id: string;
  season_number: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  still_path: string | null;
  updated_at: string | null;
  show_title: string;
  show_original_title: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  age_certification: string | null;
  total_episodes: number;
  watched_episodes_count: number;
  unwatched_count: number;
};

/**
 * Core implementation: fetches unwatched episodes and returns them alongside
 * the lastWatchedByTitle map so callers can reuse it without a second query.
 *
 * Per-title aired/watched totals are aggregated once and joined. `opts.limit`
 * keeps the first N titles in the recency sort (up-next). `opts.perTitleLimit`
 * caps episodes per show; counts stay the full-show totals.
 */
export async function getUnwatchedEpisodesWithMeta(
  userId: string,
  timezone = "UTC",
  opts?: { limit?: number; perTitleLimit?: number },
) {
  return traceDbQuery("getUnwatchedEpisodesWithMeta", async () => {
    const db = getDb();
    const today = localDateForTimezone(timezone);
    const perTitleLimit = Math.min(
      opts?.perTitleLimit ?? MAX_UNWATCHED_PER_TITLE,
      MAX_UNWATCHED_PER_TITLE,
    );
    const titleLimitSql =
      opts?.limit != null ? sql`AND title_rank <= ${opts.limit}` : sql``;

    // Counts are per title, not per episode. Window rank keeps the earliest
    // unwatched episodes and (when asked) the first N titles by recency.
    const rows = await db.all<UnwatchedEpisodeQueryRow>(sql`
      WITH title_counts AS (
        SELECT
          e.title_id AS title_id,
          SUM(CASE
            WHEN e.air_date IS NOT NULL AND e.air_date <= ${today} THEN 1
            ELSE 0
          END) AS total_episodes,
          COUNT(we.episode_id) AS watched_episodes_count,
          SUM(CASE
            WHEN e.air_date IS NOT NULL AND e.air_date <= ${today}
              AND we.episode_id IS NULL THEN 1
            ELSE 0
          END) AS unwatched_count
        FROM episodes e
        INNER JOIN tracked t ON t.title_id = e.title_id AND t.user_id = ${userId}
        LEFT JOIN watched_episodes we
          ON we.episode_id = e.id AND we.user_id = ${userId}
        GROUP BY e.title_id
      ),
      last_watched AS (
        SELECT e.title_id AS title_id, MAX(we.watched_at) AS last_watched_at
        FROM watched_episodes we
        INNER JOIN episodes e ON e.id = we.episode_id
        WHERE we.user_id = ${userId}
        GROUP BY e.title_id
      ),
      ranked AS (
        SELECT
          e.id AS id,
          e.title_id AS title_id,
          e.season_number AS season_number,
          e.episode_number AS episode_number,
          e.name AS name,
          e.overview AS overview,
          e.air_date AS air_date,
          e.still_path AS still_path,
          e.updated_at AS updated_at,
          ti.title AS show_title,
          ti.original_title AS show_original_title,
          ti.poster_url AS poster_url,
          ti.backdrop_url AS backdrop_url,
          ti.age_certification AS age_certification,
          tc.total_episodes AS total_episodes,
          tc.watched_episodes_count AS watched_episodes_count,
          tc.unwatched_count AS unwatched_count,
          lw.last_watched_at AS last_watched_at,
          ROW_NUMBER() OVER (
            PARTITION BY e.title_id
            ORDER BY e.season_number ASC, e.episode_number ASC
          ) AS rn,
          DENSE_RANK() OVER (
            ORDER BY
              CASE WHEN lw.last_watched_at IS NULL THEN 1 ELSE 0 END ASC,
              lw.last_watched_at DESC,
              ti.title ASC,
              e.title_id ASC
          ) AS title_rank
        FROM episodes e
        INNER JOIN titles ti ON ti.id = e.title_id
        INNER JOIN tracked t ON t.title_id = ti.id AND t.user_id = ${userId}
        INNER JOIN title_counts tc ON tc.title_id = e.title_id
        LEFT JOIN last_watched lw ON lw.title_id = e.title_id
        WHERE e.air_date IS NOT NULL
          AND e.air_date <= ${today}
          AND NOT EXISTS (
            SELECT 1 FROM watched_episodes we
            WHERE we.episode_id = e.id AND we.user_id = ${userId}
          )
      )
      SELECT
        id, title_id, season_number, episode_number, name, overview, air_date,
        still_path, updated_at, show_title, show_original_title, poster_url,
        backdrop_url, age_certification, total_episodes, watched_episodes_count,
        unwatched_count
      FROM ranked
      WHERE rn <= ${perTitleLimit}
      ${titleLimitSql}
      ORDER BY
        CASE WHEN last_watched_at IS NULL THEN 1 ELSE 0 END ASC,
        last_watched_at DESC,
        show_title ASC,
        title_id ASC,
        season_number ASC,
        episode_number ASC
      LIMIT ${MAX_UNWATCHED_EPISODES}
    `);

    const hitPerTitleCap =
      perTitleLimit === MAX_UNWATCHED_PER_TITLE &&
      rows.some((row) => Number(row.unwatched_count) > MAX_UNWATCHED_PER_TITLE);
    if (hitPerTitleCap || rows.length >= MAX_UNWATCHED_EPISODES) {
      log.warn("getUnwatchedEpisodesWithMeta hit cap; result truncated", {
        userId,
        perTitleLimit,
        globalLimit: MAX_UNWATCHED_EPISODES,
        titleLimit: opts?.limit ?? null,
      });
    }

    const lastWatchedByTitle = await getLastWatchedAtPerShow(userId);

    const titleOrder = new Map<string, number>();
    for (const row of rows) {
      if (!titleOrder.has(row.title_id)) {
        titleOrder.set(row.title_id, titleOrder.size);
      }
    }

    const sortedRows = [...rows].sort((a, b) => {
      const aWatched = lastWatchedByTitle.get(a.title_id)?.getTime() ?? null;
      const bWatched = lastWatchedByTitle.get(b.title_id)?.getTime() ?? null;
      if (aWatched !== bWatched) {
        if (aWatched === null) return 1;
        if (bWatched === null) return -1;
        return bWatched - aWatched;
      }
      const aIdx = titleOrder.get(a.title_id)!;
      const bIdx = titleOrder.get(b.title_id)!;
      if (aIdx !== bIdx) return aIdx - bIdx;
      if (a.season_number !== b.season_number)
        return a.season_number - b.season_number;
      return a.episode_number - b.episode_number;
    });

    const offersByTitle = await getOffersWithPlex(
      [...new Set(sortedRows.map((r) => r.title_id))],
      userId,
    );
    const episodeRows = sortedRows.map((row) => ({
      ...row,
      total_episodes: Number(row.total_episodes),
      watched_episodes_count: Number(row.watched_episodes_count),
      unwatched_count: Number(row.unwatched_count),
      is_watched: false,
      offers: offersByTitle.get(row.title_id) ?? [],
    }));

    return { episodes: episodeRows, lastWatchedByTitle };
  });
}

/** Convenience wrapper that preserves the original public signature. */
export async function getUnwatchedEpisodes(userId: string, timezone = "UTC") {
  const { episodes: episodeRows } = await getUnwatchedEpisodesWithMeta(
    userId,
    timezone,
  );
  return episodeRows.map(({ unwatched_count: _unwatchedCount, ...row }) => row);
}

/**
 * Returns the earliest unwatched aired episode (by season then episode number)
 * for a given show and user. Used by the Up Next queue to surface the specific
 * next episode to watch.
 */
export async function getNextUnwatchedEpisode(
  userId: string,
  titleId: string,
  timezone = "UTC",
) {
  return traceDbQuery("getNextUnwatchedEpisode", async () => {
    const db = getDb();
    const today = localDateForTimezone(timezone);

    const row = await db
      .select({
        id: episodes.id,
        title_id: episodes.titleId,
        season_number: episodes.seasonNumber,
        episode_number: episodes.episodeNumber,
        name: episodes.name,
        air_date: episodes.airDate,
      })
      .from(episodes)
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, episodes.titleId), eq(tracked.userId, userId)),
      )
      .where(
        and(
          eq(episodes.titleId, titleId),
          lte(episodes.airDate, today),
          sql`NOT EXISTS(
            SELECT 1 FROM watched_episodes we
            WHERE we.episode_id = ${episodes.id} AND we.user_id = ${userId}
          )`,
        ),
      )
      .orderBy(asc(episodes.seasonNumber), asc(episodes.episodeNumber))
      .limit(1)
      .get();

    return row ?? null;
  });
}

export type NextUnwatchedEpisodeRow = {
  id: number;
  title_id: string;
  season_number: number;
  episode_number: number;
  name: string | null;
  air_date: string | null;
};

/**
 * Batch variant of getNextUnwatchedEpisode. Returns a Map<titleId, row> for
 * all requested titles in a single query using ROW_NUMBER() window function.
 * Eliminates the N+1 pattern in the Up Next route.
 */
export async function getNextUnwatchedEpisodesForTitles(
  userId: string,
  titleIds: string[],
  timezone = "UTC",
): Promise<Map<string, NextUnwatchedEpisodeRow>> {
  return traceDbQuery("getNextUnwatchedEpisodesForTitles", async () => {
    if (titleIds.length === 0) return new Map();

    const db = getDb();
    const today = localDateForTimezone(timezone);

    // Build a comma-separated list of quoted title IDs for the IN clause.
    // We use sql.join to safely parameterise each value.
    const titleIdList = sql.join(
      titleIds.map((id) => sql`${id}`),
      sql`, `,
    );

    const rows = await db.all<NextUnwatchedEpisodeRow>(sql`
      SELECT id, title_id, season_number, episode_number, name, air_date
      FROM (
        SELECT
          e.id,
          e.title_id,
          e.season_number,
          e.episode_number,
          e.name,
          e.air_date,
          ROW_NUMBER() OVER (
            PARTITION BY e.title_id
            ORDER BY e.season_number ASC, e.episode_number ASC
          ) AS rn
        FROM episodes e
        INNER JOIN tracked t ON t.title_id = e.title_id AND t.user_id = ${userId}
        WHERE e.title_id IN (${titleIdList})
          AND e.air_date IS NOT NULL
          AND e.air_date <= ${today}
          AND NOT EXISTS (
            SELECT 1 FROM watched_episodes we
            WHERE we.episode_id = e.id AND we.user_id = ${userId}
          )
      )
      WHERE rn = 1
    `);

    const result = new Map<string, NextUnwatchedEpisodeRow>();
    for (const row of rows) {
      result.set(row.title_id, row);
    }
    return result;
  });
}

/**
 * Returns a Map<titleId, Date> of the most recent watched_at timestamp per
 * show for the given user. Used by Up Next to sort in-progress shows by
 * recency (most recently watched first).
 */
export async function getLastWatchedAtPerShow(
  userId: string,
): Promise<Map<string, Date>> {
  return traceDbQuery("getLastWatchedAtPerShow", async () => {
    const db = getDb();

    const rows = await db
      .select({
        title_id: episodes.titleId,
        last_watched_at: sql<string>`MAX(${watchedEpisodes.watchedAt})`,
      })
      .from(watchedEpisodes)
      .innerJoin(episodes, eq(episodes.id, watchedEpisodes.episodeId))
      .where(eq(watchedEpisodes.userId, userId))
      .groupBy(episodes.titleId)
      .all();

    const result = new Map<string, Date>();
    for (const row of rows) {
      if (row.last_watched_at) {
        result.set(row.title_id, new Date(row.last_watched_at));
      }
    }
    return result;
  });
}

// ─── Watched Episodes ─────────────────────────────────────────────────────────

export async function getEpisodeAirDate(
  episodeId: number,
): Promise<string | null> {
  return traceDbQuery("getEpisodeAirDate", async () => {
    const db = getDb();
    const row = await db
      .select({ airDate: episodes.airDate })
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .get();
    return row?.airDate ?? null;
  });
}

export async function getEpisodeTitleId(
  episodeId: number,
): Promise<string | null> {
  return traceDbQuery("getEpisodeTitleId", async () => {
    const db = getDb();
    const row = await db
      .select({ titleId: episodes.titleId })
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .get();
    return row?.titleId ?? null;
  });
}

export async function getEpisodeTitleIds(
  episodeIds: number[],
): Promise<Map<number, string>> {
  return traceDbQuery("getEpisodeTitleIds", async () => {
    if (episodeIds.length === 0) return new Map();
    const db = getDb();
    const rows = await db
      .select({ id: episodes.id, titleId: episodes.titleId })
      .from(episodes)
      .where(inArray(episodes.id, episodeIds))
      .all();
    return new Map(rows.map((r) => [r.id, r.titleId]));
  });
}

export async function getReleasedEpisodeIds(
  episodeIds: number[],
  timezone = "UTC",
): Promise<number[]> {
  return traceDbQuery("getReleasedEpisodeIds", async () => {
    const today = localDateForTimezone(timezone);
    const db = getDb();
    const rows = await db
      .select({ id: episodes.id })
      .from(episodes)
      .where(
        and(
          inArray(episodes.id, episodeIds),
          sql`${episodes.airDate} IS NOT NULL`,
          sql`${episodes.airDate} <= ${today}`,
        ),
      )
      .all();
    return rows.map((r) => r.id);
  });
}

export async function getReleasedEpisodesWithAirDate(
  episodeIds: number[],
  timezone = "UTC",
): Promise<Array<{ id: number; airDate: string }>> {
  return traceDbQuery("getReleasedEpisodesWithAirDate", async () => {
    if (episodeIds.length === 0) return [];
    const today = localDateForTimezone(timezone);
    const db = getDb();
    const rows = await db
      .select({ id: episodes.id, airDate: episodes.airDate })
      .from(episodes)
      .where(
        and(
          inArray(episodes.id, episodeIds),
          sql`${episodes.airDate} IS NOT NULL`,
          sql`${episodes.airDate} <= ${today}`,
        ),
      )
      .all();
    return rows.filter(
      (r): r is { id: number; airDate: string } => r.airDate !== null,
    );
  });
}

export async function watchEpisode(episodeId: number, userId: string) {
  return traceDbQuery("watchEpisode", async () => {
    const db = getDb();
    await db
      .insert(watchedEpisodes)
      .values({ episodeId, userId })
      .onConflictDoNothing()
      .run();
  });
}

export async function setWatchedEpisodeWatchedAt(
  episodeId: number,
  userId: string,
  watchedAt: string,
): Promise<void> {
  return traceDbQuery("setWatchedEpisodeWatchedAt", async () => {
    const db = getDb();
    await db
      .update(watchedEpisodes)
      .set({ watchedAt })
      .where(
        and(
          eq(watchedEpisodes.episodeId, episodeId),
          eq(watchedEpisodes.userId, userId),
        ),
      )
      .run();
  });
}

export async function unwatchEpisode(episodeId: number, userId: string) {
  return traceDbQuery("unwatchEpisode", async () => {
    const db = getDb();
    await db
      .delete(watchedEpisodes)
      .where(
        and(
          eq(watchedEpisodes.episodeId, episodeId),
          eq(watchedEpisodes.userId, userId),
        ),
      )
      .run();
  });
}

// Cloudflare D1 caps bound parameters per statement at 100. With 3 columns
// per row (episode_id, user_id, watched_at) a chunk of 30 rows uses 90 params,
// leaving headroom for future columns.
const BULK_WATCHED_CHUNK_SIZE = 30;

export async function watchEpisodesBulk(
  episodeIds: number[],
  userId: string,
  watchedAtByEpisodeId?: Map<number, string>,
) {
  return traceDbQuery("watchEpisodesBulk", async () => {
    if (episodeIds.length === 0) return;
    const db = getDb();
    for (let i = 0; i < episodeIds.length; i += BULK_WATCHED_CHUNK_SIZE) {
      const chunk = episodeIds.slice(i, i + BULK_WATCHED_CHUNK_SIZE);
      await db
        .insert(watchedEpisodes)
        .values(
          chunk.map((episodeId) => {
            const watchedAt = watchedAtByEpisodeId?.get(episodeId);
            return watchedAt
              ? { episodeId, userId, watchedAt }
              : { episodeId, userId };
          }),
        )
        .onConflictDoNothing()
        .run();
    }
  });
}

export async function unwatchEpisodesBulk(
  episodeIds: number[],
  userId: string,
) {
  return traceDbQuery("unwatchEpisodesBulk", async () => {
    if (episodeIds.length === 0) return;
    const db = getDb();
    for (let i = 0; i < episodeIds.length; i += BULK_WATCHED_CHUNK_SIZE) {
      const chunk = episodeIds.slice(i, i + BULK_WATCHED_CHUNK_SIZE);
      await db
        .delete(watchedEpisodes)
        .where(
          and(
            eq(watchedEpisodes.userId, userId),
            inArray(watchedEpisodes.episodeId, chunk),
          ),
        )
        .run();
    }
  });
}

// Re-stamps `watched_episodes.watched_at` for already-watched episodes to the
// episode's air date. When `titleId` is provided, scope is restricted to that
// title; otherwise applies to every watched episode for the user.
// Episodes without an `air_date` are skipped. Returns rows affected.
export async function backdateWatchedEpisodesToAirDate(
  userId: string,
  titleId?: string,
): Promise<number> {
  return traceDbQuery("backdateWatchedEpisodesToAirDate", async () => {
    const db = getDb();
    const titleFilter = titleId
      ? sql`AND ${episodes.titleId} = ${titleId}`
      : sql``;
    const result = await db.run(sql`
      UPDATE watched_episodes
      SET watched_at = (
        SELECT ${episodes.airDate} || ' 00:00:00'
        FROM ${episodes}
        WHERE ${episodes.id} = watched_episodes.episode_id
      )
      WHERE watched_episodes.user_id = ${userId}
        AND EXISTS (
          SELECT 1 FROM ${episodes}
          WHERE ${episodes.id} = watched_episodes.episode_id
            AND ${episodes.airDate} IS NOT NULL
            ${titleFilter}
        )
    `);
    return typeof result === "object" && result !== null && "changes" in result
      ? Number((result as { changes: number }).changes)
      : 0;
  });
}

export async function getSeasonEpisodeStatus(
  titleId: string,
  seasonNumber: number,
  userId: string,
): Promise<Array<{ episode_number: number; id: number; is_watched: boolean }>> {
  return traceDbQuery("getSeasonEpisodeStatus", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: episodes.id,
        episode_number: episodes.episodeNumber,
        is_watched: sql<boolean>`EXISTS(
          SELECT 1 FROM watched_episodes we
          WHERE we.episode_id = ${episodes.id} AND we.user_id = ${userId}
        )`,
      })
      .from(episodes)
      .where(
        and(
          eq(episodes.titleId, titleId),
          eq(episodes.seasonNumber, seasonNumber),
        ),
      )
      .orderBy(asc(episodes.episodeNumber))
      .all();

    return rows.map((row) => ({
      ...row,
      is_watched: !!row.is_watched,
    }));
  });
}

export async function getWatchedEpisodesForExport(
  userId: string,
): Promise<Map<string, Array<{ season: number; episode: number }>>> {
  return traceDbQuery("getWatchedEpisodesForExport", async () => {
    const db = getDb();
    const rows = await db
      .select({
        titleId: episodes.titleId,
        season: episodes.seasonNumber,
        episode: episodes.episodeNumber,
      })
      .from(watchedEpisodes)
      .innerJoin(episodes, eq(watchedEpisodes.episodeId, episodes.id))
      .where(eq(watchedEpisodes.userId, userId))
      .all();

    const map = new Map<string, Array<{ season: number; episode: number }>>();
    for (const row of rows) {
      if (!map.has(row.titleId)) map.set(row.titleId, []);
      map.get(row.titleId)!.push({ season: row.season, episode: row.episode });
    }
    return map;
  });
}

export async function getEpisodeIdsBySE(
  titleId: string,
  sePairs: Array<{ season: number; episode: number }>,
): Promise<number[]> {
  return traceDbQuery("getEpisodeIdsBySE", async () => {
    if (sePairs.length === 0) return [];
    const db = getDb();
    const rows = await db
      .select({
        id: episodes.id,
        season: episodes.seasonNumber,
        episode: episodes.episodeNumber,
      })
      .from(episodes)
      .where(eq(episodes.titleId, titleId))
      .all();

    const wanted = new Set(sePairs.map((p) => `${p.season}:${p.episode}`));
    return rows
      .filter((r) => wanted.has(`${r.season}:${r.episode}`))
      .map((r) => r.id);
  });
}
