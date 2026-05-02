import { eq, and, or, sql, gte, lte, lt, desc, asc, exists, notExists, inArray, like } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, providers, offers, scores, tracked, titleGenres, watchedTitles } from "../schema";
import type { ParsedTitle, ParsedOffer, ParsedProvider, ParsedScores } from "../../tmdb/parser";
import { extractProviders } from "../../tmdb/parser";
import { traceDbQuery } from "../../tracing";
import { getOffersWithPlex } from "./offers";
import { toCanonicalGenre } from "../../genres";
import { canonicalProviderId } from "../../streaming-availability/provider-map";
import type { DrizzleDb } from "../../platform/types";

// ─── Filter caches (genres & languages change only on sync) ──────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface FilterCache<T> {
  value: T;
  expiresAt: number;
}

let genresCache: FilterCache<string[]> | null = null;
let languagesCache: FilterCache<string[]> | null = null;

// In-flight promise refs prevent thundering-herd: concurrent callers that
// arrive while the cache is expired all await the same refresh promise.
let genresInflight: Promise<string[]> | null = null;
let languagesInflight: Promise<string[]> | null = null;

export function invalidateFilterCaches(): void {
  genresCache = null;
  languagesCache = null;
}

// ─── Title / Offer / Score upserts ───────────────────────────────────────────

/**
 * Upsert provider rows. Idempotent — any conflict on `id` updates the
 * descriptive fields. Used as the first step of `upsertTitles` so that
 * subsequent offer rows can satisfy their FK to `providers`.
 */
export async function upsertProviderRows(
  providerList: ParsedProvider[],
  tx: DrizzleDb,
): Promise<void> {
  for (const p of providerList) {
    await tx.insert(providers)
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
}

/**
 * Upsert a single title row, refreshing all mutable fields and bumping
 * `updated_at`. Existing rows are matched by primary key.
 */
export async function upsertTitleRow(
  t: ParsedTitle,
  tx: DrizzleDb,
): Promise<void> {
  await tx.insert(titles)
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
}

/**
 * Replace the title's genre membership with the provided list. The
 * existing rows are deleted first so the set ends up exactly equal to
 * `genres` (deduplicated via `onConflictDoNothing` on the composite key).
 */
export async function upsertTitleGenres(
  titleId: string,
  genres: string[] | undefined,
  tx: DrizzleDb,
): Promise<void> {
  await tx.delete(titleGenres).where(eq(titleGenres.titleId, titleId)).run();
  for (const genre of (genres ?? [])) {
    await tx.insert(titleGenres)
      .values({ titleId, genre })
      .onConflictDoNothing()
      .run();
  }
}

/**
 * Replace the title's offers, preserving previously stored deep links
 * keyed by (providerId, monetizationType). When a duplicate provider ID
 * has been remapped to a canonical ID, the canonical key is also indexed
 * so the deep link survives the remap.
 *
 * Caller is expected to skip this when `newOffers` is empty — that case
 * is treated as "no new offer data" and we deliberately leave existing
 * offers untouched (prevents sync fallbacks from wiping availability).
 */
export async function mergeOffers(
  titleId: string,
  newOffers: ParsedOffer[],
  tx: DrizzleDb,
): Promise<void> {
  if (newOffers.length === 0) return;

  // Preserve deep links: build a map of (providerId, monetizationType) → deepLink
  const existingOffers = await tx
    .select({
      providerId: offers.providerId,
      monetizationType: offers.monetizationType,
      deepLink: offers.deepLink,
    })
    .from(offers)
    .where(eq(offers.titleId, titleId))
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

  await tx.delete(offers).where(eq(offers.titleId, titleId)).run();
  for (const o of newOffers) {
    const preservedDeepLink = deepLinkMap.get(`${o.providerId}:${o.monetizationType}`) ?? null;
    await tx.insert(offers)
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

/**
 * Upsert a single title's score row. Conflict on `title_id` updates all
 * three score columns from the incoming payload.
 */
export async function upsertScores(
  titleId: string,
  parsedScores: ParsedScores,
  tx: DrizzleDb,
): Promise<void> {
  await tx.insert(scores)
    .values({
      titleId,
      imdbScore: parsedScores.imdbScore,
      imdbVotes: parsedScores.imdbVotes,
      tmdbScore: parsedScores.tmdbScore,
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

/**
 * Top-level orchestrator: upserts providers (FK targets), then for each
 * title upserts the title row, replaces genre membership, merges offers
 * (preserving deep links), and upserts scores. The filter caches are
 * invalidated once at the end. Behaviour is identical to the prior
 * monolithic implementation; the helpers exist for testability and
 * clearer error origin.
 */
export async function upsertTitles(parsedTitles: ParsedTitle[]) {
  return traceDbQuery("upsertTitles", async () => {
    const db = getDb();

    // Extract and upsert providers first so offer FKs are satisfied
    const providerList = extractProviders(parsedTitles);
    await upsertProviderRows(providerList, db);

    for (const t of parsedTitles) {
      await upsertTitleRow(t, db);
      await upsertTitleGenres(t.id, t.genres, db);
      await mergeOffers(t.id, t.offers, db);
      await upsertScores(t.id, t.scores, db);
    }

    invalidateFilterCaches();
    return parsedTitles.length;
  });
}

// ─── Genre helpers ───────────────────────────────────────────────────────────

export async function getGenresForTitles(titleIds: string[]): Promise<Map<string, string[]>> {
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

    const todayStr = new Date().toISOString().slice(0, 10);
    conditions.push(lte(titles.releaseDate, todayStr));
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

export interface LocalSearchFilters {
  yearMin?: number;
  yearMax?: number;
  minRating?: number;
  objectType?: string;
  language?: string;
}

export async function searchLocalTitles(query: string, limit = 50, userId?: string, filters: LocalSearchFilters = {}) {
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

    const conditions: ReturnType<typeof eq>[] = [like(titles.title, `%${query}%`)];

    if (filters.yearMin != null) {
      conditions.push(gte(titles.releaseYear, filters.yearMin));
    }
    if (filters.yearMax != null) {
      // Use sql<number> cast to silence type mismatch between number and number | null column
      conditions.push(sql`${titles.releaseYear} <= ${filters.yearMax}` as ReturnType<typeof eq>);
    }
    if (filters.minRating != null) {
      conditions.push(gte(scores.imdbScore, filters.minRating));
    }
    if (filters.objectType) {
      conditions.push(eq(titles.objectType, filters.objectType));
    }
    if (filters.language) {
      conditions.push(eq(titles.originalLanguage, filters.language));
    }

    const rows = await (userId
      ? queryBuilder.leftJoin(tracked, and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)))
      : queryBuilder
    )
      .where(and(...conditions))
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
    const rows = await db
      .select({
        id: providers.id,
        name: providers.name,
        technical_name: providers.technicalName,
        icon_url: providers.iconUrl,
      })
      .from(providers)
      .orderBy(asc(providers.name))
      .all();
    const seen = new Map<number, typeof rows[number]>();
    for (const row of rows) {
      const cid = canonicalProviderId(row.id);
      if (!seen.has(cid)) {
        seen.set(cid, cid === row.id ? row : { ...row, id: cid });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function getGenres(): Promise<string[]> {
  const now = Date.now();
  if (genresCache && now < genresCache.expiresAt) {
    return Promise.resolve(genresCache.value);
  }
  if (genresInflight) return genresInflight;

  genresInflight = traceDbQuery("getGenres", async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ genre: titleGenres.genre })
      .from(titleGenres)
      .orderBy(asc(titleGenres.genre))
      .all();
    const rawGenres = rows.map((r) => r.genre);
    return [...new Set(rawGenres.map(toCanonicalGenre))].sort();
  }).then((result) => {
    genresCache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  }).finally(() => {
    genresInflight = null;
  });

  return genresInflight;
}

export function getLanguages(): Promise<string[]> {
  const now = Date.now();
  if (languagesCache && now < languagesCache.expiresAt) {
    return Promise.resolve(languagesCache.value);
  }
  if (languagesInflight) return languagesInflight;

  languagesInflight = traceDbQuery("getLanguages", async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ original_language: titles.originalLanguage })
      .from(titles)
      .where(sql`${titles.originalLanguage} IS NOT NULL`)
      .orderBy(asc(titles.originalLanguage))
      .all();
    return rows.map((r) => r.original_language!);
  }).then((result) => {
    languagesCache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  }).finally(() => {
    languagesInflight = null;
  });

  return languagesInflight;
}
