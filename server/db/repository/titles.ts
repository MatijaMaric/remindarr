import { eq, and, or, like, sql, gte, lt, desc, asc, exists, notExists, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, providers, offers, scores, tracked } from "../schema";
import type { ParsedTitle } from "../../tmdb/parser";
import { extractProviders } from "../../tmdb/parser";
import { traceDbQuery } from "../../tracing";
import { getOffersForTitle, getOffersForTitles } from "./offers";

// ─── Filter caches (genres & languages change only on sync) ──────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface FilterCache<T> {
  value: T;
  expiresAt: number;
}

let genresCache: FilterCache<string[]> | null = null;
let languagesCache: FilterCache<string[]> | null = null;

export function invalidateFilterCaches(): void {
  genresCache = null;
  languagesCache = null;
}

// ─── Title / Offer / Score upserts ───────────────────────────────────────────

export async function upsertTitles(parsedTitles: ParsedTitle[]) {
  return traceDbQuery("upsertTitles", async () => {
    const db = getDb();

    // Extract and upsert providers first
    const providerList = extractProviders(parsedTitles);

    for (const p of providerList) {
      await db.insert(providers)
        .values({
          id: p.id,
          name: p.name,
          technicalName: p.technicalName,
          iconUrl: p.iconUrl,
        })
        .onConflictDoUpdate({
          target: providers.id,
          set: {
            name: sql`excluded.name`,
            technicalName: sql`excluded.technical_name`,
            iconUrl: sql`excluded.icon_url`,
          },
        })
        .run();
    }

    for (const t of parsedTitles) {
      await db.insert(titles)
        .values({
          id: t.id,
          objectType: t.objectType,
          title: t.title,
          originalTitle: t.originalTitle,
          releaseYear: t.releaseYear,
          releaseDate: t.releaseDate,
          runtimeMinutes: t.runtimeMinutes,
          shortDescription: t.shortDescription,
          genres: JSON.stringify(t.genres),
          originalLanguage: t.originalLanguage,
          imdbId: t.imdbId,
          tmdbId: t.tmdbId,
          posterUrl: t.posterUrl,
          ageCertification: t.ageCertification,
          tmdbUrl: t.tmdbUrl,
          updatedAt: sql`datetime('now')`,
        })
        .onConflictDoUpdate({
          target: titles.id,
          set: {
            title: sql`excluded.title`,
            originalTitle: sql`excluded.original_title`,
            releaseYear: sql`excluded.release_year`,
            releaseDate: sql`excluded.release_date`,
            runtimeMinutes: sql`excluded.runtime_minutes`,
            shortDescription: sql`excluded.short_description`,
            genres: sql`excluded.genres`,
            originalLanguage: sql`excluded.original_language`,
            imdbId: sql`excluded.imdb_id`,
            tmdbId: sql`excluded.tmdb_id`,
            posterUrl: sql`excluded.poster_url`,
            ageCertification: sql`excluded.age_certification`,
            tmdbUrl: sql`excluded.tmdb_url`,
            updatedAt: sql`datetime('now')`,
          },
        })
        .run();

      // Replace offers
      await db.delete(offers).where(eq(offers.titleId, t.id)).run();
      for (const o of t.offers) {
        await db.insert(offers)
          .values({
            titleId: o.titleId,
            providerId: o.providerId,
            monetizationType: o.monetizationType,
            presentationType: o.presentationType,
            priceValue: o.priceValue,
            priceCurrency: o.priceCurrency,
            url: o.url,
            availableTo: o.availableTo,
          })
          .run();
      }

      // Upsert scores
      await db.insert(scores)
        .values({
          titleId: t.id,
          imdbScore: t.scores.imdbScore,
          imdbVotes: t.scores.imdbVotes,
          tmdbScore: t.scores.tmdbScore,
        })
        .onConflictDoUpdate({
          target: scores.titleId,
          set: {
            imdbScore: sql`excluded.imdb_score`,
            imdbVotes: sql`excluded.imdb_votes`,
            tmdbScore: sql`excluded.tmdb_score`,
          },
        })
        .run();
    }

    invalidateFilterCaches();
    return parsedTitles.length;
  });
}

// ─── Single title lookup ─────────────────────────────────────────────────────

export async function getTitleById(titleId: string, userId?: string) {
  return traceDbQuery("getTitleById", async () => {
    const db = getDb();

    const trackedSubquery = userId
      ? sql<number>`(SELECT EXISTS(SELECT 1 FROM tracked tr WHERE tr.title_id = ${titles.id} AND tr.user_id = ${userId}))`
      : sql<number>`0`;

    const row = await db
      .select({
        id: titles.id,
        object_type: titles.objectType,
        title: titles.title,
        original_title: titles.originalTitle,
        release_year: titles.releaseYear,
        release_date: titles.releaseDate,
        runtime_minutes: titles.runtimeMinutes,
        short_description: titles.shortDescription,
        genres: titles.genres,
        imdb_id: titles.imdbId,
        tmdb_id: titles.tmdbId,
        poster_url: titles.posterUrl,
        age_certification: titles.ageCertification,
        original_language: titles.originalLanguage,
        tmdb_url: titles.tmdbUrl,
        updated_at: titles.updatedAt,
        imdb_score: scores.imdbScore,
        imdb_votes: scores.imdbVotes,
        tmdb_score: scores.tmdbScore,
        is_tracked: trackedSubquery,
      })
      .from(titles)
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(eq(titles.id, titleId))
      .get();

    if (!row) return null;

    return {
      ...row,
      genres: row.genres ? JSON.parse(row.genres) : [],
      is_tracked: Boolean(row.is_tracked),
      offers: await getOffersForTitle(row.id),
    };
  });
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export interface TitleFilters {
  daysBack?: number;
  objectTypes?: string[];
  providers?: string[];
  genres?: string[];
  languages?: string[];
  excludeTracked?: boolean;
  limit?: number;
  offset?: number;
}

export async function getRecentTitles(filters: TitleFilters = {}, userId?: string) {
  return traceDbQuery("getRecentTitles", async () => {
    const db = getDb();
    const { daysBack = 30, objectTypes, providers: filterProviders, genres, languages, excludeTracked, limit = 100, offset = 0 } = filters;

    const conditions: ReturnType<typeof eq>[] = [];

    if (daysBack) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      conditions.push(gte(titles.releaseDate, cutoffStr));
    }
    if (objectTypes && objectTypes.length > 0) {
      conditions.push(inArray(titles.objectType, objectTypes));
    }
    if (filterProviders && filterProviders.length > 0) {
      const providerConditions = filterProviders.map((p) => {
        const providerId = Number(p);
        if (!isNaN(providerId)) {
          return exists(
            db
              .select({ one: sql`1` })
              .from(offers)
              .where(and(eq(offers.titleId, titles.id), eq(offers.providerId, providerId)))
          );
        } else {
          return exists(
            db
              .select({ one: sql`1` })
              .from(offers)
              .innerJoin(providers, eq(offers.providerId, providers.id))
              .where(and(eq(offers.titleId, titles.id), eq(providers.technicalName, p)))
          );
        }
      });
      conditions.push(providerConditions.length === 1 ? providerConditions[0] : or(...providerConditions)!);
    }
    if (genres && genres.length > 0) {
      const genreConditions = genres.map((g) => like(titles.genres, `%"${g}"%`));
      conditions.push(genreConditions.length === 1 ? genreConditions[0] : or(...genreConditions)!);
    }
    if (languages && languages.length > 0) {
      conditions.push(inArray(titles.originalLanguage, languages));
    }
    if (excludeTracked && userId) {
      conditions.push(
        notExists(
          db
            .select({ one: sql`1` })
            .from(tracked)
            .where(and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)))
        )
      );
    }

    const trackedSubquery = userId
      ? sql<number>`(SELECT EXISTS(SELECT 1 FROM tracked tr WHERE tr.title_id = ${titles.id} AND tr.user_id = ${userId}))`
      : sql<number>`0`;

    const rows = await db
      .select({
        id: titles.id,
        object_type: titles.objectType,
        title: titles.title,
        original_title: titles.originalTitle,
        release_year: titles.releaseYear,
        release_date: titles.releaseDate,
        runtime_minutes: titles.runtimeMinutes,
        short_description: titles.shortDescription,
        genres: titles.genres,
        imdb_id: titles.imdbId,
        tmdb_id: titles.tmdbId,
        poster_url: titles.posterUrl,
        age_certification: titles.ageCertification,
        original_language: titles.originalLanguage,
        tmdb_url: titles.tmdbUrl,
        updated_at: titles.updatedAt,
        imdb_score: scores.imdbScore,
        imdb_votes: scores.imdbVotes,
        tmdb_score: scores.tmdbScore,
        is_tracked: trackedSubquery,
      })
      .from(titles)
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(titles.releaseDate))
      .limit(limit)
      .offset(offset)
      .all();

    const offersByTitle = await getOffersForTitles(rows.map((r) => r.id));
    return rows.map((row) => ({
      ...row,
      genres: row.genres ? JSON.parse(row.genres) : [],
      is_tracked: Boolean(row.is_tracked),
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}

export async function searchLocalTitles(query: string, limit = 50, userId?: string) {
  return traceDbQuery("searchLocalTitles", async () => {
    const db = getDb();

    const trackedSubquery = userId
      ? sql<number>`(SELECT EXISTS(SELECT 1 FROM tracked tr WHERE tr.title_id = ${titles.id} AND tr.user_id = ${userId}))`
      : sql<number>`0`;

    const rows = await db
      .select({
        id: titles.id,
        object_type: titles.objectType,
        title: titles.title,
        original_title: titles.originalTitle,
        release_year: titles.releaseYear,
        release_date: titles.releaseDate,
        runtime_minutes: titles.runtimeMinutes,
        short_description: titles.shortDescription,
        genres: titles.genres,
        imdb_id: titles.imdbId,
        tmdb_id: titles.tmdbId,
        poster_url: titles.posterUrl,
        age_certification: titles.ageCertification,
        original_language: titles.originalLanguage,
        tmdb_url: titles.tmdbUrl,
        updated_at: titles.updatedAt,
        imdb_score: scores.imdbScore,
        imdb_votes: scores.imdbVotes,
        tmdb_score: scores.tmdbScore,
        is_tracked: trackedSubquery,
      })
      .from(titles)
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(like(titles.title, `%${query}%`))
      .orderBy(desc(titles.releaseDate))
      .limit(limit)
      .all();

    const offersByTitle = await getOffersForTitles(rows.map((r) => r.id));
    return rows.map((row) => ({
      ...row,
      genres: row.genres ? JSON.parse(row.genres) : [],
      is_tracked: Boolean(row.is_tracked),
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export interface MonthFilters {
  month: string; // YYYY-MM
  objectType?: string;
  provider?: string;
}

export async function getTitlesByMonth(filters: MonthFilters, userId?: string) {
  return traceDbQuery("getTitlesByMonth", async () => {
  const db = getDb();
  const { month, objectType, provider } = filters;

  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const nextMonth =
    mon === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

  const conditions: ReturnType<typeof eq>[] = [
    gte(titles.releaseDate, startDate),
    lt(titles.releaseDate, nextMonth),
  ];

  // Only tracked titles for the given user
  if (userId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(tracked)
          .where(
            and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId))
          )
      )
    );
  } else {
    // No user = no results (same behavior as before: conditions.push("0"))
    conditions.push(sql`0` as any);
  }

  if (objectType) {
    conditions.push(eq(titles.objectType, objectType));
  }
  if (provider) {
    const providerId = Number(provider);
    if (!isNaN(providerId)) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(offers)
            .where(and(eq(offers.titleId, titles.id), eq(offers.providerId, providerId)))
        )
      );
    } else {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(offers)
            .innerJoin(providers, eq(offers.providerId, providers.id))
            .where(and(eq(offers.titleId, titles.id), eq(providers.technicalName, provider)))
        )
      );
    }
  }

  const rows = await db
    .select({
      id: titles.id,
      object_type: titles.objectType,
      title: titles.title,
      original_title: titles.originalTitle,
      release_year: titles.releaseYear,
      release_date: titles.releaseDate,
      runtime_minutes: titles.runtimeMinutes,
      short_description: titles.shortDescription,
      genres: titles.genres,
      imdb_id: titles.imdbId,
      tmdb_id: titles.tmdbId,
      poster_url: titles.posterUrl,
      age_certification: titles.ageCertification,
      original_language: titles.originalLanguage,
      tmdb_url: titles.tmdbUrl,
      updated_at: titles.updatedAt,
      imdb_score: scores.imdbScore,
      imdb_votes: scores.imdbVotes,
      tmdb_score: scores.tmdbScore,
      is_tracked: sql<number>`1`,
    })
    .from(titles)
    .leftJoin(scores, eq(scores.titleId, titles.id))
    .where(and(...conditions))
    .orderBy(asc(titles.releaseDate))
    .all();

  const offersByTitle = await getOffersForTitles(rows.map((r) => r.id));
  return rows.map((row) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: Boolean(row.is_tracked),
    offers: offersByTitle.get(row.id) ?? [],
  }));
  });
}

export async function getProviders() {
  return traceDbQuery("getProviders", async () => {
    const db = getDb();
    return await db
      .select({
        id: providers.id,
        name: providers.name,
        technical_name: providers.technicalName,
        icon_url: providers.iconUrl,
      })
      .from(providers)
      .orderBy(asc(providers.name))
      .all();
  });
}

export async function getGenres(): Promise<string[]> {
  const now = Date.now();
  if (genresCache && now < genresCache.expiresAt) {
    return genresCache.value;
  }

  const result = await traceDbQuery("getGenres", async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ genres: titles.genres })
      .from(titles)
      .where(and(
        sql`${titles.genres} IS NOT NULL`,
        sql`${titles.genres} != '[]'`
      ))
      .all();

    const genreSet = new Set<string>();
    for (const row of rows) {
      if (row.genres) {
        const parsed = JSON.parse(row.genres) as string[];
        for (const g of parsed) genreSet.add(g);
      }
    }
    return Array.from(genreSet).sort();
  });

  genresCache = { value: result, expiresAt: now + CACHE_TTL_MS };
  return result;
}

export async function getLanguages(): Promise<string[]> {
  const now = Date.now();
  if (languagesCache && now < languagesCache.expiresAt) {
    return languagesCache.value;
  }

  const result = await traceDbQuery("getLanguages", async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ original_language: titles.originalLanguage })
      .from(titles)
      .where(sql`${titles.originalLanguage} IS NOT NULL`)
      .orderBy(asc(titles.originalLanguage))
      .all();
    return rows.map((r) => r.original_language!);
  });

  languagesCache = { value: result, expiresAt: now + CACHE_TTL_MS };
  return result;
}
