import { eq, and, sql, gte, lt, asc, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, episodes, tracked, watchedEpisodes } from "../schema";
import { traceDbQuery } from "../../tracing";
import { getOffersForTitles } from "./offers";
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

    const offersByTitle = await getOffersForTitles([...new Set(rows.map((r) => r.title_id))]);
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

    const offersByTitle = await getOffersForTitles([...new Set(rows.map((r) => r.title_id))]);
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

export async function getUnwatchedEpisodes(userId: string) {
  return traceDbQuery("getUnwatchedEpisodes", async () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

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
      })
      .from(episodes)
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId))
      )
      .where(
        and(
          lt(episodes.airDate, today),
          sql`NOT EXISTS(
            SELECT 1 FROM watched_episodes we
            WHERE we.episode_id = ${episodes.id} AND we.user_id = ${userId}
          )`
        )
      )
      .orderBy(asc(titles.title), asc(episodes.seasonNumber), asc(episodes.episodeNumber))
      .all();

    const offersByTitle = await getOffersForTitles([...new Set(rows.map((r) => r.title_id))]);
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

export async function getReleasedEpisodeIds(episodeIds: number[]): Promise<number[]> {
  return traceDbQuery("getReleasedEpisodeIds", async () => {
    const today = new Date().toISOString().slice(0, 10);
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

export async function watchEpisodesBulk(episodeIds: number[], userId: string) {
  return traceDbQuery("watchEpisodesBulk", async () => {
    if (episodeIds.length === 0) return;
    const db = getDb();
    await db.insert(watchedEpisodes)
      .values(episodeIds.map((episodeId) => ({ episodeId, userId })))
      .onConflictDoNothing()
      .run();
  });
}

export async function unwatchEpisodesBulk(episodeIds: number[], userId: string) {
  return traceDbQuery("unwatchEpisodesBulk", async () => {
    if (episodeIds.length === 0) return;
    const db = getDb();
    await db.delete(watchedEpisodes)
      .where(and(eq(watchedEpisodes.userId, userId), inArray(watchedEpisodes.episodeId, episodeIds)))
      .run();
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
