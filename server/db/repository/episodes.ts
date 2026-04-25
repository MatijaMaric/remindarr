import { eq, and, sql, gte, lt, lte, asc, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, episodes, tracked, watchedEpisodes } from "../schema";
import { traceDbQuery } from "../../tracing";
import { getOffersWithPlex } from "./offers";
import { localDateForTimezone } from "../../utils/timezone";
import type { MonthFilters } from "./titles";

export async function upsertEpisodes(
  episodeList: {
    title_id: string;
    season_number: number;
    episode_number: number;
    name: string | null;
    overview: string | null;
    air_date: string | null;
    still_path: string | null;
  }[]
) {
  return traceDbQuery("upsertEpisodes", async () => {
    const db = getDb();

    for (const ep of episodeList) {
      await db.insert(episodes)
        .values({
          titleId: ep.title_id,
          seasonNumber: ep.season_number,
          episodeNumber: ep.episode_number,
          name: ep.name,
          overview: ep.overview,
          airDate: ep.air_date,
          stillPath: ep.still_path,
          updatedAt: sql`datetime('now')`,
        })
        .onConflictDoUpdate({
          target: [episodes.titleId, episodes.seasonNumber, episodes.episodeNumber],
          set: {
            name: sql`excluded.name`,
            overview: sql`excluded.overview`,
            airDate: sql`excluded.air_date`,
            stillPath: sql`excluded.still_path`,
            updatedAt: sql`datetime('now')`,
          },
        })
        .run();
    }

    return episodeList.length;
  });
}

export async function getEpisodesByMonth(filters: MonthFilters, userId?: string) {
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
        is_watched: sql<boolean>`EXISTS(
          SELECT 1 FROM watched_episodes we
          WHERE we.episode_id = ${episodes.id} AND we.user_id = ${userId}
        )`,
      })
      .from(episodes)
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId))
      )
      .where(and(gte(episodes.airDate, startDate), lt(episodes.airDate, nextMonth)))
      .orderBy(asc(episodes.airDate), asc(titles.title))
      .all();

    const offersByTitle = await getOffersWithPlex([...new Set(rows.map((r) => r.title_id))], userId);
    return rows.map((row) => ({
      ...row,
      is_watched: !!row.is_watched,
      offers: offersByTitle.get(row.title_id) ?? [],
    }));
  });
}

export async function getEpisodesByDateRange(startDate: string, endDate: string, userId?: string) {
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
        notification_mode: tracked.notificationMode,
        is_watched: sql<boolean>`EXISTS(
          SELECT 1 FROM watched_episodes we
          WHERE we.episode_id = ${episodes.id} AND we.user_id = ${userId}
        )`,
      })
      .from(episodes)
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId))
      )
      .where(and(gte(episodes.airDate, startDate), lt(episodes.airDate, endDate)))
      .orderBy(asc(episodes.airDate), asc(titles.title))
      .all();

    const offersByTitle = await getOffersWithPlex([...new Set(rows.map((r) => r.title_id))], userId);
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

export async function getUnwatchedEpisodes(userId: string, timezone = "UTC") {
  return traceDbQuery("getUnwatchedEpisodes", async () => {
    const db = getDb();
    const today = localDateForTimezone(timezone);

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
        total_episodes: sql<number>`(
          SELECT COUNT(*) FROM episodes e2
          WHERE e2.title_id = ${episodes.titleId}
          AND e2.air_date IS NOT NULL AND e2.air_date <= ${today}
        )`,
        watched_episodes_count: sql<number>`(
          SELECT COUNT(*) FROM watched_episodes we2
          INNER JOIN episodes e3 ON e3.id = we2.episode_id
          WHERE e3.title_id = ${episodes.titleId} AND we2.user_id = ${userId}
        )`,
      })
      .from(episodes)
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId))
      )
      .where(
        and(
          lte(episodes.airDate, today),
          sql`NOT EXISTS(
            SELECT 1 FROM watched_episodes we
            WHERE we.episode_id = ${episodes.id} AND we.user_id = ${userId}
          )`
        )
      )
      .orderBy(asc(titles.title), asc(episodes.seasonNumber), asc(episodes.episodeNumber))
      .all();

    const offersByTitle = await getOffersWithPlex([...new Set(rows.map((r) => r.title_id))], userId);
    return rows.map((row) => ({
      ...row,
      is_watched: false,
      offers: offersByTitle.get(row.title_id) ?? [],
    }));
  });
}

// ─── Watched Episodes ─────────────────────────────────────────────────────────

export async function getEpisodeAirDate(episodeId: number): Promise<string | null> {
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

export async function getEpisodeTitleId(episodeId: number): Promise<string | null> {
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

export async function getEpisodeTitleIds(episodeIds: number[]): Promise<Map<number, string>> {
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

export async function getReleasedEpisodeIds(episodeIds: number[], timezone = "UTC"): Promise<number[]> {
  return traceDbQuery("getReleasedEpisodeIds", async () => {
    const today = localDateForTimezone(timezone);
    const db = getDb();
    const rows = await db
      .select({ id: episodes.id })
      .from(episodes)
      .where(
        and(
          sql`${episodes.id} IN (${sql.join(episodeIds.map((id) => sql`${id}`), sql`, `)})`,
          sql`${episodes.airDate} IS NOT NULL`,
          sql`${episodes.airDate} <= ${today}`
        )
      )
      .all();
    return rows.map((r) => r.id);
  });
}

export async function getReleasedEpisodesWithAirDate(
  episodeIds: number[],
  timezone = "UTC"
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
          sql`${episodes.airDate} <= ${today}`
        )
      )
      .all();
    return rows
      .filter((r): r is { id: number; airDate: string } => r.airDate !== null);
  });
}

export async function watchEpisode(episodeId: number, userId: string) {
  return traceDbQuery("watchEpisode", async () => {
    const db = getDb();
    await db.insert(watchedEpisodes)
      .values({ episodeId, userId })
      .onConflictDoNothing()
      .run();
  });
}

export async function unwatchEpisode(episodeId: number, userId: string) {
  return traceDbQuery("unwatchEpisode", async () => {
    const db = getDb();
    await db.delete(watchedEpisodes)
      .where(and(eq(watchedEpisodes.episodeId, episodeId), eq(watchedEpisodes.userId, userId)))
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
  watchedAtByEpisodeId?: Map<number, string>
) {
  return traceDbQuery("watchEpisodesBulk", async () => {
    if (episodeIds.length === 0) return;
    const db = getDb();
    for (let i = 0; i < episodeIds.length; i += BULK_WATCHED_CHUNK_SIZE) {
      const chunk = episodeIds.slice(i, i + BULK_WATCHED_CHUNK_SIZE);
      await db.insert(watchedEpisodes)
        .values(
          chunk.map((episodeId) => {
            const watchedAt = watchedAtByEpisodeId?.get(episodeId);
            return watchedAt ? { episodeId, userId, watchedAt } : { episodeId, userId };
          })
        )
        .onConflictDoNothing()
        .run();
    }
  });
}

export async function unwatchEpisodesBulk(episodeIds: number[], userId: string) {
  return traceDbQuery("unwatchEpisodesBulk", async () => {
    if (episodeIds.length === 0) return;
    const db = getDb();
    for (let i = 0; i < episodeIds.length; i += BULK_WATCHED_CHUNK_SIZE) {
      const chunk = episodeIds.slice(i, i + BULK_WATCHED_CHUNK_SIZE);
      await db.delete(watchedEpisodes)
        .where(and(eq(watchedEpisodes.userId, userId), inArray(watchedEpisodes.episodeId, chunk)))
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
    const titleFilter = titleId ? sql`AND ${episodes.titleId} = ${titleId}` : sql``;
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
  userId: string
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
      .where(and(eq(episodes.titleId, titleId), eq(episodes.seasonNumber, seasonNumber)))
      .orderBy(asc(episodes.episodeNumber))
      .all();

    return rows.map((row) => ({
      ...row,
      is_watched: !!row.is_watched,
    }));
  });
}

export async function getWatchedEpisodesForExport(userId: string): Promise<Map<string, Array<{ season: number; episode: number }>>> {
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
  sePairs: Array<{ season: number; episode: number }>
): Promise<number[]> {
  return traceDbQuery("getEpisodeIdsBySE", async () => {
    if (sePairs.length === 0) return [];
    const db = getDb();
    const rows = await db
      .select({ id: episodes.id, season: episodes.seasonNumber, episode: episodes.episodeNumber })
      .from(episodes)
      .where(eq(episodes.titleId, titleId))
      .all();

    const wanted = new Set(sePairs.map((p) => `${p.season}:${p.episode}`));
    return rows.filter((r) => wanted.has(`${r.season}:${r.episode}`)).map((r) => r.id);
  });
}
