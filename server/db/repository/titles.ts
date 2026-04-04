import { eq, and, or, sql, gte, lt, desc, asc, exists, notExists, inArray, like } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, providers, offers, scores, tracked, titleGenres, watchedTitles } from "../schema";
import type { ParsedTitle } from "../../tmdb/parser";
import { extractProviders } from "../../tmdb/parser";
import { traceDbQuery } from "../../tracing";
import { getOffersWithPlex } from "./offers";
import { toCanonicalGenre } from "../../genres";
import { canonicalProviderId } from "../../streaming-availability/provider-map";

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
          originalLanguage: t.originalLanguage,
          imdbId: t.imdbId,
          tmdbId: t.tmdbId,
          posterUrl: t.posterUrl,
          backdropUrl: t.backdropUrl,
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
            originalLanguage: sql`excluded.original_language`,
            imdbId: sql`excluded.imdb_id`,
            tmdbId: sql`excluded.tmdb_id`,
            posterUrl: sql`excluded.poster_url`,
            backdropUrl: sql`excluded.backdrop_url`,
            ageCertification: sql`excluded.age_certification`,
            tmdbUrl: sql`excluded.tmdb_url`,
            updatedAt: sql`datetime('now')`,
          },
        })
        .run();

      // Replace genres
      await db.delete(titleGenres).where(eq(titleGenres.titleId, t.id)).run();
      for (const genre of (t.genres ?? [])) {
        await db.insert(titleGenres).values({ titleId: t.id, genre }).onConflictDoNothing().run();
      }

      // Replace offers only when new data includes them (prevents sync fallback from wiping existing offers)
      if (t.offers.length > 0) {
        // Preserve deep links: build a map of (providerId, monetizationType) → deepLink
        const existingOffers = await db
          .select({ providerId: offers.providerId, monetizationType: offers.monetizationType, deepLink: offers.deepLink })
          .from(offers)
          .where(eq(offers.titleId, t.id))
          .all();
        const deepLinkMap = new Map<string, string>();
        for (const o of existingOffers) {
          if (o.deepLink && o.providerId != null) {
            deepLinkMap.set(`${o.providerId}:${o.monetizationType}`, o.deepLink);
            // Also index by canonical ID so remapped duplicate providers keep their deep links
            const canonical = canonicalProviderId(o.providerId);
            if (canonical !== o.providerId) {
              deepLinkMap.set(`${canonical}:${o.monetizationType}`, o.deepLink);
            }
          }
        }

        await db.delete(offers).where(eq(offers.titleId, t.id)).run();
        for (const o of t.offers) {
          const preservedDeepLink = deepLinkMap.get(`${o.providerId}:${o.monetizationType}`) ?? null;
          await db.insert(offers)
            .values({
              titleId: o.titleId,
              providerId: o.providerId,
              monetizationType: o.monetizationType,
              presentationType: o.presentationType,
              priceValue: o.priceValue,
              priceCurrency: o.priceCurrency,
              url: o.url,
              deepLink: preservedDeepLink,
              availableTo: o.availableTo,
            })
            .run();
        }
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

// ─── Genre helpers ───────────────────────────────────────────────────────────

async function getGenresForTitles(titleIds: string[]): Promise<Map<string, string[]>> {
  if (titleIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ titleId: titleGenres.titleId, genre: titleGenres.genre })
    .from(titleGenres)
    .where(inArray(titleGenres.titleId, titleIds))
    .all();
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.titleId) ?? [];
    list.push(row.genre);
    map.set(row.titleId, list);
  }
  return map;
}

// ─── Single title lookup ─────────────────────────────────────────────────────

export async function getTitleById(titleId: string, userId?: string) {
  return traceDbQuery("getTitleById", async () => {
    const db = getDb();

    const queryBuilder = db
      .select({
        id: titles.id,
        object_type: titles.objectType,
        title: titles.title,
        original_title: titles.originalTitle,
        release_year: titles.releaseYear,
        release_date: titles.releaseDate,
        runtime_minutes: titles.runtimeMinutes,
        short_description: titles.shortDescription,
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
        is_tracked: userId
          ? sql<number>`CASE WHEN ${tracked.titleId} IS NOT NULL THEN 1 ELSE 0 END`
          : sql<number>`0`,
        is_public: userId
          ? tracked.public
          : sql<number | null>`NULL`,
        is_watched: userId
          ? sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`
          : sql<number>`0`,
      })
      .from(titles)
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .$dynamic();

    const row = await (userId
      ? queryBuilder.leftJoin(tracked, and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)))
      : queryBuilder
    ).where(eq(titles.id, titleId)).get();

    if (!row) return null;

    const [genreMap, offersMap] = await Promise.all([
      getGenresForTitles([row.id]),
      getOffersWithPlex([row.id], userId),
    ]);
    return {
      ...row,
      genres: genreMap.get(row.id) ?? [],
      is_tracked: Boolean(row.is_tracked),
      is_public: row.is_public != null ? Boolean(row.is_public) : undefined,
      is_watched: Boolean(row.is_watched),
      offers: offersMap.get(row.id) ?? [],
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
      const genreConditions = genres.map((g) =>
        exists(
          db
            .select({ one: sql`1` })
            .from(titleGenres)
            .where(and(eq(titleGenres.titleId, titles.id), eq(titleGenres.genre, g)))
        )
      );
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

    const queryBuilder = db
      .select({
        id: titles.id,
        object_type: titles.objectType,
        title: titles.title,
        original_title: titles.originalTitle,
        release_year: titles.releaseYear,
        release_date: titles.releaseDate,
        runtime_minutes: titles.runtimeMinutes,
        short_description: titles.shortDescription,
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
        is_tracked: userId
          ? sql<number>`CASE WHEN ${tracked.titleId} IS NOT NULL THEN 1 ELSE 0 END`
          : sql<number>`0`,
        is_watched: userId
          ? sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`
          : sql<number>`0`,
      })
      .from(titles)
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .$dynamic();

    const rows = await (userId
      ? queryBuilder.leftJoin(tracked, and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)))
      : queryBuilder
    )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(titles.releaseDate))
      .limit(limit)
      .offset(offset)
      .all();

    const titleIds = rows.map((r) => r.id);
    const [offersByTitle, genresByTitle] = await Promise.all([
      getOffersWithPlex(titleIds, userId),
      getGenresForTitles(titleIds),
    ]);
    return rows.map((row) => ({
      ...row,
      genres: genresByTitle.get(row.id) ?? [],
      is_tracked: Boolean(row.is_tracked),
      is_watched: Boolean(row.is_watched),
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}

export async function searchLocalTitles(query: string, limit = 50, userId?: string) {
  return traceDbQuery("searchLocalTitles", async () => {
    const db = getDb();

    const queryBuilder = db
      .select({
        id: titles.id,
        object_type: titles.objectType,
        title: titles.title,
        original_title: titles.originalTitle,
        release_year: titles.releaseYear,
        release_date: titles.releaseDate,
        runtime_minutes: titles.runtimeMinutes,
        short_description: titles.shortDescription,
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
        is_tracked: userId
          ? sql<number>`CASE WHEN ${tracked.titleId} IS NOT NULL THEN 1 ELSE 0 END`
          : sql<number>`0`,
        is_watched: userId
          ? sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`
          : sql<number>`0`,
      })
      .from(titles)
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .$dynamic();

    const rows = await (userId
      ? queryBuilder.leftJoin(tracked, and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)))
      : queryBuilder
    )
      .where(like(titles.title, `%${query}%`))
      .orderBy(desc(titles.releaseDate))
      .limit(limit)
      .all();

    const titleIds = rows.map((r) => r.id);
    const [offersByTitle, genresByTitle] = await Promise.all([
      getOffersWithPlex(titleIds, userId),
      getGenresForTitles(titleIds),
    ]);
    return rows.map((row) => ({
      ...row,
      genres: genresByTitle.get(row.id) ?? [],
      is_tracked: Boolean(row.is_tracked),
      is_watched: Boolean(row.is_watched),
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
      is_watched: userId
        ? sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`
        : sql<number>`0`,
    })
    .from(titles)
    .leftJoin(scores, eq(scores.titleId, titles.id))
    .where(and(...conditions))
    .orderBy(asc(titles.releaseDate))
    .all();

  const titleIds = rows.map((r) => r.id);
  const [offersByTitle, genresByTitle] = await Promise.all([
    getOffersWithPlex(titleIds, userId),
    getGenresForTitles(titleIds),
  ]);
  return rows.map((row) => ({
    ...row,
    genres: genresByTitle.get(row.id) ?? [],
    is_tracked: Boolean(row.is_tracked),
    is_watched: Boolean(row.is_watched),
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
      .selectDistinct({ genre: titleGenres.genre })
      .from(titleGenres)
      .orderBy(asc(titleGenres.genre))
      .all();
    const rawGenres = rows.map((r) => r.genre);
    return [...new Set(rawGenres.map(toCanonicalGenre))].sort();
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
