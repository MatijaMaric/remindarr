import { eq, and, like, sql, gte, lt, desc, asc, exists, count } from "drizzle-orm";
import { getDb } from "./schema";
import {
  titles,
  providers,
  offers,
  scores,
  episodes,
  users,
  sessions,
  settings,
  tracked,
  watchedEpisodes,
  notifiers,
} from "./schema";
import type { ParsedTitle } from "../tmdb/parser";
import { extractProviders } from "../tmdb/parser";
import { CONFIG } from "../config";
import { getRawDb } from "./schema";

// ─── Title / Offer / Score upserts ───────────────────────────────────────────

export function upsertTitles(parsedTitles: ParsedTitle[]) {
  const db = getDb();
  const raw = getRawDb();

  // Extract and upsert providers first
  const providerList = extractProviders(parsedTitles);

  raw.transaction(() => {
    for (const p of providerList) {
      db.insert(providers)
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
  })();

  raw.transaction(() => {
    for (const t of parsedTitles) {
      db.insert(titles)
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
      db.delete(offers).where(eq(offers.titleId, t.id)).run();
      for (const o of t.offers) {
        db.insert(offers)
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
      db.insert(scores)
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
  })();

  return parsedTitles.length;
}

// ─── Single title lookup ─────────────────────────────────────────────────────

export function getTitleById(titleId: string, userId?: string) {
  const db = getDb();

  const trackedSubquery = userId
    ? sql<number>`(SELECT EXISTS(SELECT 1 FROM tracked tr WHERE tr.title_id = ${titles.id} AND tr.user_id = ${userId}))`
    : sql<number>`0`;

  const row = db
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
    offers: getOffersForTitle(row.id),
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export interface TitleFilters {
  daysBack?: number;
  objectType?: string;
  provider?: string;
  genre?: string;
  language?: string;
  limit?: number;
  offset?: number;
}

export function getRecentTitles(filters: TitleFilters = {}, userId?: string) {
  const db = getDb();
  const { daysBack = 30, objectType, provider, genre, language, limit = 100, offset = 0 } = filters;

  const conditions: ReturnType<typeof eq>[] = [];

  if (daysBack) {
    conditions.push(gte(titles.releaseDate, sql`date('now', ${`-${daysBack} days`})`));
  }
  if (objectType) {
    conditions.push(eq(titles.objectType, objectType));
  }
  if (provider) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(offers)
          .innerJoin(providers, eq(offers.providerId, providers.id))
          .where(
            and(
              eq(offers.titleId, titles.id),
              eq(providers.technicalName, provider)
            )
          )
      )
    );
  }
  if (genre) {
    conditions.push(like(titles.genres, `%"${genre}"%`));
  }
  if (language) {
    conditions.push(eq(titles.originalLanguage, language));
  }

  const trackedSubquery = userId
    ? sql<number>`(SELECT EXISTS(SELECT 1 FROM tracked tr WHERE tr.title_id = ${titles.id} AND tr.user_id = ${userId}))`
    : sql<number>`0`;

  const rows = db
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

  return rows.map((row) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: Boolean(row.is_tracked),
    offers: getOffersForTitle(row.id),
  }));
}

export function getOffersForTitle(titleId: string) {
  const db = getDb();
  return db
    .select({
      id: offers.id,
      title_id: offers.titleId,
      provider_id: offers.providerId,
      monetization_type: offers.monetizationType,
      presentation_type: offers.presentationType,
      price_value: offers.priceValue,
      price_currency: offers.priceCurrency,
      url: offers.url,
      available_to: offers.availableTo,
      provider_name: providers.name,
      provider_technical_name: providers.technicalName,
      provider_icon_url: providers.iconUrl,
    })
    .from(offers)
    .innerJoin(providers, eq(offers.providerId, providers.id))
    .where(eq(offers.titleId, titleId))
    .all();
}

// ─── Tracking (per-user) ────────────────────────────────────────────────────

export function trackTitle(titleId: string, userId: string, notes?: string) {
  const db = getDb();
  db.insert(tracked)
    .values({ titleId, userId, notes: notes || null })
    .onConflictDoUpdate({
      target: [tracked.titleId, tracked.userId],
      set: { notes: sql`excluded.notes` },
    })
    .run();
}

export function untrackTitle(titleId: string, userId: string) {
  const db = getDb();
  db.delete(tracked)
    .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
    .run();
}

export function getTrackedTitles(userId: string) {
  const db = getDb();
  const rows = db
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
      tracked_at: tracked.trackedAt,
      notes: tracked.notes,
      is_tracked: sql<number>`1`,
    })
    .from(tracked)
    .innerJoin(titles, eq(titles.id, tracked.titleId))
    .leftJoin(scores, eq(scores.titleId, titles.id))
    .where(eq(tracked.userId, userId))
    .orderBy(desc(tracked.trackedAt))
    .all();

  return rows.map((row) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: true,
    offers: getOffersForTitle(row.id),
  }));
}

// ─── Search ──────────────────────────────────────────────────────────────────

export function searchLocalTitles(query: string, limit = 50, userId?: string) {
  const db = getDb();

  const trackedSubquery = userId
    ? sql<number>`(SELECT EXISTS(SELECT 1 FROM tracked tr WHERE tr.title_id = ${titles.id} AND tr.user_id = ${userId}))`
    : sql<number>`0`;

  const rows = db
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

  return rows.map((row) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: Boolean(row.is_tracked),
    offers: getOffersForTitle(row.id),
  }));
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export interface MonthFilters {
  month: string; // YYYY-MM
  objectType?: string;
  provider?: string;
}

export function getTitlesByMonth(filters: MonthFilters, userId?: string) {
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
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(offers)
          .innerJoin(providers, eq(offers.providerId, providers.id))
          .where(
            and(
              eq(offers.titleId, titles.id),
              eq(providers.technicalName, provider)
            )
          )
      )
    );
  }

  const rows = db
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

  return rows.map((row) => ({
    ...row,
    genres: row.genres ? JSON.parse(row.genres) : [],
    is_tracked: Boolean(row.is_tracked),
    offers: getOffersForTitle(row.id),
  }));
}

export function getProviders() {
  const db = getDb();
  return db
    .select({
      id: providers.id,
      name: providers.name,
      technical_name: providers.technicalName,
      icon_url: providers.iconUrl,
    })
    .from(providers)
    .orderBy(asc(providers.name))
    .all();
}

export function getGenres(): string[] {
  const raw = getRawDb();
  const rows = raw.prepare(
    "SELECT DISTINCT genres FROM titles WHERE genres IS NOT NULL AND genres != '[]'"
  ).all() as { genres: string }[];

  const genreSet = new Set<string>();
  for (const row of rows) {
    const parsed = JSON.parse(row.genres) as string[];
    for (const g of parsed) genreSet.add(g);
  }
  return Array.from(genreSet).sort();
}

export function getLanguages(): string[] {
  const raw = getRawDb();
  const rows = raw.prepare(
    "SELECT DISTINCT original_language FROM titles WHERE original_language IS NOT NULL ORDER BY original_language"
  ).all() as { original_language: string }[];
  return rows.map((r) => r.original_language);
}

// ─── Episodes ────────────────────────────────────────────────────────────────

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
}

export function getEpisodesByMonth(filters: MonthFilters, userId?: string) {
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
}

export function getEpisodesByDateRange(startDate: string, endDate: string, userId?: string) {
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
}

export function deleteEpisodesForTitle(titleId: string) {
  const db = getDb();
  db.delete(episodes).where(eq(episodes.titleId, titleId)).run();
}

export function getUnwatchedEpisodes(userId: string) {
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
}

// ─── Watched Episodes ─────────────────────────────────────────────────────────

export function getEpisodeAirDate(episodeId: number): string | null {
  const db = getDb();
  const row = db
    .select({ airDate: episodes.airDate })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .get();
  return row?.airDate ?? null;
}

export function getReleasedEpisodeIds(episodeIds: number[]): number[] {
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
}

export function watchEpisode(episodeId: number, userId: string) {
  const db = getDb();
  db.insert(watchedEpisodes)
    .values({ episodeId, userId })
    .onConflictDoNothing()
    .run();
}

export function unwatchEpisode(episodeId: number, userId: string) {
  const db = getDb();
  db.delete(watchedEpisodes)
    .where(and(eq(watchedEpisodes.episodeId, episodeId), eq(watchedEpisodes.userId, userId)))
    .run();
}

export function watchEpisodesBulk(episodeIds: number[], userId: string) {
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
}

export function unwatchEpisodesBulk(episodeIds: number[], userId: string) {
  const raw = getRawDb();
  const db = getDb();
  raw.transaction(() => {
    for (const episodeId of episodeIds) {
      db.delete(watchedEpisodes)
        .where(and(eq(watchedEpisodes.episodeId, episodeId), eq(watchedEpisodes.userId, userId)))
        .run();
    }
  })();
}

// ─── Users ───────────────────────────────────────────────────────────────────

export function createUser(
  username: string,
  passwordHash: string | null,
  displayName?: string,
  authProvider = "local",
  providerSubject?: string,
  isAdmin = false
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.insert(users)
    .values({
      id,
      username,
      passwordHash,
      displayName: displayName || null,
      authProvider,
      providerSubject: providerSubject || null,
      isAdmin: isAdmin ? 1 : 0,
    })
    .run();
  return id;
}

const userColumns = {
  id: users.id,
  username: users.username,
  password_hash: users.passwordHash,
  display_name: users.displayName,
  auth_provider: users.authProvider,
  provider_subject: users.providerSubject,
  is_admin: users.isAdmin,
  created_at: users.createdAt,
};

export function getUserByUsername(username: string) {
  const db = getDb();
  return db.select(userColumns).from(users).where(eq(users.username, username)).get() ?? null;
}

export function getUserById(id: string) {
  const db = getDb();
  return db.select(userColumns).from(users).where(eq(users.id, id)).get() ?? null;
}

export function getUserByProviderSubject(
  authProvider: string,
  providerSubject: string
) {
  const db = getDb();
  return (
    db
      .select(userColumns)
      .from(users)
      .where(
        and(
          eq(users.authProvider, authProvider),
          eq(users.providerSubject, providerSubject)
        )
      )
      .get() ?? null
  );
}

export function getUserCount(): number {
  const db = getDb();
  const row = db.select({ count: count() }).from(users).get();
  return row?.count ?? 0;
}

export function updateUserPassword(userId: string, passwordHash: string) {
  const db = getDb();
  db.update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
    .run();
}

export function updateUserAdmin(userId: string, isAdmin: boolean) {
  const db = getDb();
  db.update(users)
    .set({ isAdmin: isAdmin ? 1 : 0 })
    .where(eq(users.id, userId))
    .run();
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function createSession(userId: string): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + CONFIG.SESSION_DURATION_HOURS * 3600 * 1000
  ).toISOString();
  db.insert(sessions).values({ id, userId, expiresAt }).run();
  return id;
}

export function getSessionWithUser(token: string) {
  const db = getDb();
  const row = db
    .select({
      id: users.id,
      username: users.username,
      display_name: users.displayName,
      auth_provider: users.authProvider,
      is_admin: users.isAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(eq(sessions.id, token), sql`${sessions.expiresAt} > datetime('now')`)
    )
    .get();

  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    auth_provider: row.auth_provider,
    is_admin: Boolean(row.is_admin),
  };
}

export function deleteSession(token: string) {
  const db = getDb();
  db.delete(sessions).where(eq(sessions.id, token)).run();
}

export function deleteExpiredSessions() {
  const raw = getRawDb();
  const result = raw.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  if (result.changes > 0) {
    console.log(`[Auth] Cleaned up ${result.changes} expired sessions`);
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  const db = getDb();
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value` },
    })
    .run();
}

export function deleteSetting(key: string) {
  const db = getDb();
  db.delete(settings).where(eq(settings.key, key)).run();
}

export function getSettingsByPrefix(prefix: string): Record<string, string> {
  const db = getDb();
  const rows = db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(like(settings.key, `${prefix}%`))
    .all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// ─── OIDC Config Resolution ─────────────────────────────────────────────────

export function getOidcConfig() {
  const issuerUrl = CONFIG.OIDC_ISSUER_URL || getSetting("oidc_issuer_url") || "";
  const clientId = CONFIG.OIDC_CLIENT_ID || getSetting("oidc_client_id") || "";
  const clientSecret =
    CONFIG.OIDC_CLIENT_SECRET || getSetting("oidc_client_secret") || "";
  const redirectUri =
    CONFIG.OIDC_REDIRECT_URI || getSetting("oidc_redirect_uri") || "";

  const adminClaim =
    CONFIG.OIDC_ADMIN_CLAIM || getSetting("oidc_admin_claim") || "";
  const adminValue =
    CONFIG.OIDC_ADMIN_VALUE || getSetting("oidc_admin_value") || "";

  return { issuerUrl, clientId, clientSecret, redirectUri, adminClaim, adminValue };
}

export function isOidcConfigured(): boolean {
  const { issuerUrl, clientId, clientSecret } = getOidcConfig();
  return Boolean(issuerUrl && clientId && clientSecret);
}

// ─── Notifiers ──────────────────────────────────────────────────────────────

export function createNotifier(
  userId: string,
  provider: string,
  name: string,
  config: Record<string, string>,
  notifyTime: string,
  timezone: string
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.insert(notifiers)
    .values({
      id,
      userId,
      provider,
      name,
      config: JSON.stringify(config),
      notifyTime,
      timezone,
    })
    .run();
  return id;
}

export function updateNotifier(
  id: string,
  userId: string,
  updates: {
    name?: string;
    config?: Record<string, string>;
    notifyTime?: string;
    timezone?: string;
    enabled?: boolean;
  }
) {
  const db = getDb();
  const set: Record<string, any> = { updatedAt: sql`datetime('now')` };
  if (updates.name !== undefined) set.name = updates.name;
  if (updates.config !== undefined) set.config = JSON.stringify(updates.config);
  if (updates.notifyTime !== undefined) set.notifyTime = updates.notifyTime;
  if (updates.timezone !== undefined) set.timezone = updates.timezone;
  if (updates.enabled !== undefined) set.enabled = updates.enabled ? 1 : 0;

  db.update(notifiers)
    .set(set)
    .where(and(eq(notifiers.id, id), eq(notifiers.userId, userId)))
    .run();
}

export function deleteNotifier(id: string, userId: string) {
  const db = getDb();
  db.delete(notifiers)
    .where(and(eq(notifiers.id, id), eq(notifiers.userId, userId)))
    .run();
}

export function getNotifiersByUser(userId: string) {
  const db = getDb();
  return db
    .select({
      id: notifiers.id,
      user_id: notifiers.userId,
      provider: notifiers.provider,
      name: notifiers.name,
      config: notifiers.config,
      notify_time: notifiers.notifyTime,
      timezone: notifiers.timezone,
      enabled: notifiers.enabled,
      last_sent_date: notifiers.lastSentDate,
      created_at: notifiers.createdAt,
      updated_at: notifiers.updatedAt,
    })
    .from(notifiers)
    .where(eq(notifiers.userId, userId))
    .orderBy(asc(notifiers.createdAt))
    .all()
    .map((row) => ({
      ...row,
      config: JSON.parse(row.config),
      enabled: Boolean(row.enabled),
    }));
}

export function getNotifierById(id: string, userId: string) {
  const db = getDb();
  const row = db
    .select({
      id: notifiers.id,
      user_id: notifiers.userId,
      provider: notifiers.provider,
      name: notifiers.name,
      config: notifiers.config,
      notify_time: notifiers.notifyTime,
      timezone: notifiers.timezone,
      enabled: notifiers.enabled,
      last_sent_date: notifiers.lastSentDate,
      created_at: notifiers.createdAt,
      updated_at: notifiers.updatedAt,
    })
    .from(notifiers)
    .where(and(eq(notifiers.id, id), eq(notifiers.userId, userId)))
    .get();

  if (!row) return null;
  return {
    ...row,
    config: JSON.parse(row.config),
    enabled: Boolean(row.enabled),
  };
}

export function getDueNotifiers(
  timesByTimezone: Map<string, { time: string; date: string }>
) {
  const db = getDb();
  const raw = getRawDb();

  // Get all enabled notifiers
  const allEnabled = db
    .select({
      id: notifiers.id,
      user_id: notifiers.userId,
      provider: notifiers.provider,
      name: notifiers.name,
      config: notifiers.config,
      notify_time: notifiers.notifyTime,
      timezone: notifiers.timezone,
      last_sent_date: notifiers.lastSentDate,
    })
    .from(notifiers)
    .where(eq(notifiers.enabled, 1))
    .all();

  // Filter in JS: match notify_time to current time in their timezone,
  // and ensure we haven't already sent today
  return allEnabled
    .filter((n) => {
      const tzInfo = timesByTimezone.get(n.timezone);
      if (!tzInfo) return false;
      return n.notify_time === tzInfo.time && n.last_sent_date !== tzInfo.date;
    })
    .map((n) => ({
      ...n,
      config: JSON.parse(n.config),
      todayDate: timesByTimezone.get(n.timezone)!.date,
    }));
}

export function markNotifierSent(id: string, date: string) {
  const db = getDb();
  db.update(notifiers)
    .set({ lastSentDate: date, updatedAt: sql`datetime('now')` })
    .where(eq(notifiers.id, id))
    .run();
}

export function getDistinctNotifierTimezones(): string[] {
  const raw = getRawDb();
  const rows = raw
    .prepare("SELECT DISTINCT timezone FROM notifiers WHERE enabled = 1")
    .all() as { timezone: string }[];
  return rows.map((r) => r.timezone);
}

export function getEnabledNotifierSchedules(): { notify_time: string; timezone: string }[] {
  const raw = getRawDb();
  return raw
    .prepare("SELECT DISTINCT notify_time, timezone FROM notifiers WHERE enabled = 1")
    .all() as { notify_time: string; timezone: string }[];
}

export function getTrackedMoviesByReleaseDate(date: string, userId: string) {
  const db = getDb();
  const rows = db
    .select({
      id: titles.id,
      title: titles.title,
      release_year: titles.releaseYear,
      release_date: titles.releaseDate,
      poster_url: titles.posterUrl,
    })
    .from(titles)
    .innerJoin(tracked, and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)))
    .where(and(eq(titles.releaseDate, date), eq(titles.objectType, "MOVIE")))
    .all();

  return rows.map((row) => ({
    ...row,
    offers: getOffersForTitle(row.id),
  }));
}
