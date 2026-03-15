import { eq, and, sql, gte, lt, asc } from "drizzle-orm";
import { getDb, getRawDb } from "../schema";
import { titles, episodes, tracked, watchedEpisodes } from "../schema";
import { traceDbQuery } from "../../tracing";
import { getOffersForTitle } from "./offers";
import type { MonthFilters } from "./titles";

export function upsertEpisodes(
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
  return traceDbQuery("upsertEpisodes", () => {
    const db = getDb();
    const raw = getRawDb();

    raw.transaction(() => {
      for (const ep of episodeList) {
        db.insert(episodes)
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
    })();

    return episodeList.length;
  });
}

export function getEpisodesByMonth(filters: MonthFilters, userId?: string) {
  return traceDbQuery("getEpisodesByMonth", () => {
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

    const rows = db
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

    return rows.map((row) => ({
      ...row,
      is_watched: !!row.is_watched,
      offers: getOffersForTitle(row.title_id),
    }));
  });
}

export function getEpisodesByDateRange(startDate: string, endDate: string, userId?: string) {
  return traceDbQuery("getEpisodesByDateRange", () => {
    const db = getDb();
    if (!userId) return [];

    const rows = db
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

    return rows.map((row) => ({
      ...row,
      is_watched: !!row.is_watched,
      offers: getOffersForTitle(row.title_id),
    }));
  });
}

export function deleteEpisodesForTitle(titleId: string) {
  return traceDbQuery("deleteEpisodesForTitle", () => {
    const db = getDb();
    db.delete(episodes).where(eq(episodes.titleId, titleId)).run();
  });
}

export function getUnwatchedEpisodes(userId: string) {
  return traceDbQuery("getUnwatchedEpisodes", () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const rows = db
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

    return rows.map((row) => ({
      ...row,
      is_watched: false,
      offers: getOffersForTitle(row.title_id),
    }));
  });
}

// ─── Watched Episodes ─────────────────────────────────────────────────────────

export function getEpisodeAirDate(episodeId: number): string | null {
  return traceDbQuery("getEpisodeAirDate", () => {
    const db = getDb();
    const row = db
      .select({ airDate: episodes.airDate })
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .get();
    return row?.airDate ?? null;
  });
}

export function getReleasedEpisodeIds(episodeIds: number[]): number[] {
  return traceDbQuery("getReleasedEpisodeIds", () => {
    const today = new Date().toISOString().slice(0, 10);
    const db = getDb();
    const rows = db
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

export function watchEpisode(episodeId: number, userId: string) {
  return traceDbQuery("watchEpisode", () => {
    const db = getDb();
    db.insert(watchedEpisodes)
      .values({ episodeId, userId })
      .onConflictDoNothing()
      .run();
  });
}

export function unwatchEpisode(episodeId: number, userId: string) {
  return traceDbQuery("unwatchEpisode", () => {
    const db = getDb();
    db.delete(watchedEpisodes)
      .where(and(eq(watchedEpisodes.episodeId, episodeId), eq(watchedEpisodes.userId, userId)))
      .run();
  });
}

export function watchEpisodesBulk(episodeIds: number[], userId: string) {
  return traceDbQuery("watchEpisodesBulk", () => {
    const raw = getRawDb();
    const db = getDb();
    raw.transaction(() => {
      for (const episodeId of episodeIds) {
        db.insert(watchedEpisodes)
          .values({ episodeId, userId })
          .onConflictDoNothing()
          .run();
      }
    })();
  });
}

export function unwatchEpisodesBulk(episodeIds: number[], userId: string) {
  return traceDbQuery("unwatchEpisodesBulk", () => {
    const raw = getRawDb();
    const db = getDb();
    raw.transaction(() => {
      for (const episodeId of episodeIds) {
        db.delete(watchedEpisodes)
          .where(and(eq(watchedEpisodes.episodeId, episodeId), eq(watchedEpisodes.userId, userId)))
          .run();
      }
    })();
  });
}
