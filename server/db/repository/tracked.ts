import { episodeRuntime } from "./episode-runtime";
import {
  eq,
  and,
  or,
  sql,
  desc,
  gte,
  lt,
  lte,
  asc,
  inArray,
} from "drizzle-orm";
import { getDb } from "../schema";
import {
  titles,
  scores,
  tracked,
  watchedTitles,
  ratings,
  episodes,
  watchedEpisodes,
} from "../schema";
import { traceDbQuery } from "../../tracing";
import { logger } from "../../logger";
import { getOffersWithPlex } from "./offers";
import { getGenresForTitles } from "./titles";
import { getTagsForUser } from "./tags";

const log = logger.child({ module: "tracked-repo" });

// Soft cap on rows loaded by getTrackedTitles — a safety net against unbounded
// result sets, not pagination. Keeps the most recently tracked titles.
export const MAX_TRACKED_LOAD = 1000;

type ShowStatus =
  | "watching"
  | "caught_up"
  | "completed"
  | "not_started"
  | "unreleased"
  | null;

function computeShowStatus(
  objectType: string,
  releasedEpisodesCount: number,
  watchedEpisodesCount: number,
  totalEpisodes: number,
): ShowStatus {
  if (objectType !== "SHOW") return null;
  if (releasedEpisodesCount === 0) return "unreleased";
  if (watchedEpisodesCount === 0) return "not_started";
  if (
    totalEpisodes > 0 &&
    totalEpisodes === watchedEpisodesCount &&
    totalEpisodes === releasedEpisodesCount
  )
    return "completed";
  if (
    releasedEpisodesCount > 0 &&
    releasedEpisodesCount === watchedEpisodesCount &&
    totalEpisodes > releasedEpisodesCount
  )
    return "caught_up";
  if (releasedEpisodesCount > watchedEpisodesCount) return "watching";
  return null;
}

export async function trackTitle(
  titleId: string,
  userId: string,
  notes?: string,
) {
  return traceDbQuery("trackTitle", async () => {
    const db = getDb();
    await db
      .insert(tracked)
      .values({ titleId, userId, notes: notes || null })
      .onConflictDoUpdate({
        target: [tracked.titleId, tracked.userId],
        set: { notes: sql`excluded.notes` },
      })
      .run();
  });
}

export async function untrackTitle(titleId: string, userId: string) {
  return traceDbQuery("untrackTitle", async () => {
    const db = getDb();
    await db
      .delete(tracked)
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}

export async function getTrackedTitleIds(userId: string): Promise<Set<string>> {
  return traceDbQuery("getTrackedTitleIds", async () => {
    const db = getDb();
    const rows = await db
      .select({ titleId: tracked.titleId })
      .from(tracked)
      .where(eq(tracked.userId, userId))
      .all();
    return new Set(rows.map((r) => r.titleId));
  });
}

/** Membership check for a bounded ID set — avoids loading the user's full library. */
export async function getTrackedStatusForIds(
  userId: string,
  titleIds: string[],
): Promise<Set<string>> {
  return traceDbQuery("getTrackedStatusForIds", async () => {
    if (titleIds.length === 0) return new Set();
    const db = getDb();
    const rows = await db
      .select({ titleId: tracked.titleId })
      .from(tracked)
      .where(
        and(eq(tracked.userId, userId), inArray(tracked.titleId, titleIds)),
      )
      .all();
    return new Set(rows.map((r) => r.titleId));
  });
}

export async function getTrackedTitles(
  userId: string,
  opts: { limit?: number } = {},
) {
  return traceDbQuery("getTrackedTitles", async () => {
    const limit = opts.limit ?? MAX_TRACKED_LOAD;
    const db = getDb();
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
        tracked_at: tracked.trackedAt,
        notes: tracked.notes,
        public: tracked.public,
        user_status: tracked.userStatus,
        notification_mode: tracked.notificationMode,
        snooze_until: tracked.snoozeUntil,
        remind_on_release: tracked.remindOnRelease,
        is_tracked: sql<number>`1`,
        is_watched: sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`,
        total_episodes: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id})`,
        watched_episodes_count: sql<number>`(SELECT COUNT(*) FROM watched_episodes we INNER JOIN episodes e ON e.id = we.episode_id WHERE e.title_id = ${titles.id} AND we.user_id = ${userId})`,
        released_episodes_count: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
        latest_released_air_date: sql<
          string | null
        >`(SELECT MAX(e.air_date) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
        next_episode_air_date: sql<
          string | null
        >`(SELECT MIN(e.air_date) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date > date('now'))`,
        remaining_runtime_minutes: sql<number | null>`(
          SELECT CASE WHEN COUNT(*) = COUNT(${episodeRuntime(sql`e2.runtime_minutes`, sql`${titles.runtimeMinutes}`)})
            THEN COALESCE(SUM(${episodeRuntime(sql`e2.runtime_minutes`, sql`${titles.runtimeMinutes}`)}), 0) END
            FROM episodes e2
            WHERE e2.title_id = ${titles.id}
              AND e2.air_date <= date('now')
              AND e2.id NOT IN (
                SELECT we2.episode_id FROM watched_episodes we2 WHERE we2.user_id = ${userId}
              )
        )`,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(eq(tracked.userId, userId))
      .orderBy(desc(tracked.trackedAt))
      .limit(limit)
      .all();

    if (rows.length >= limit) {
      log.warn("getTrackedTitles hit soft cap; result truncated", {
        userId,
        limit,
      });
    }

    const titleIds = rows.map((r) => r.id);
    const [offersByTitle, genresByTitle, tagsByTitle] = await Promise.all([
      getOffersWithPlex(titleIds, userId),
      getGenresForTitles(titleIds),
      getTagsForUser(userId),
    ]);
    return rows.map((row) => ({
      ...row,
      genres: genresByTitle.get(row.id) ?? [],
      tags: tagsByTitle[row.id] ?? [],
      is_tracked: true,
      is_watched: Boolean(row.is_watched),
      public: Boolean(row.public),
      offers: offersByTitle.get(row.id) ?? [],
      show_status: computeShowStatus(
        row.object_type,
        row.released_episodes_count,
        row.watched_episodes_count,
        row.total_episodes,
      ),
    }));
  });
}

// D1 allows 100 bound parameters. This statement also binds userId.
const SHELF_ID_CHUNK = 90;

type ShelfTitleRow = {
  id: string;
  object_type: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  release_date: string | null;
  runtime_minutes: number | null;
  short_description: string | null;
  imdb_id: string | null;
  tmdb_id: string | null;
  poster_url: string | null;
  age_certification: string | null;
  original_language: string | null;
  tmdb_url: string | null;
  imdb_score: number | null;
  imdb_votes: number | null;
  tmdb_score: number | null;
  tracked_at: string | null;
  public: number | boolean;
  user_status: string | null;
  is_watched: number | boolean;
  total_episodes: number;
  watched_episodes_count: number;
  released_episodes_count: number;
};

async function loadShelfTitles(userId: string, orderedIds: string[]) {
  if (orderedIds.length === 0) return [];
  const db = getDb();
  const byId = new Map<string, ShelfTitleRow>();
  for (let i = 0; i < orderedIds.length; i += SHELF_ID_CHUNK) {
    const chunk = orderedIds.slice(i, i + SHELF_ID_CHUNK);
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
        imdb_score: scores.imdbScore,
        imdb_votes: scores.imdbVotes,
        tmdb_score: scores.tmdbScore,
        tracked_at: tracked.trackedAt,
        public: tracked.public,
        user_status: tracked.userStatus,
        is_watched: sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`,
        total_episodes: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id})`,
        watched_episodes_count: sql<number>`(SELECT COUNT(*) FROM watched_episodes we INNER JOIN episodes e ON e.id = we.episode_id WHERE e.title_id = ${titles.id} AND we.user_id = ${userId})`,
        released_episodes_count: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
      })
      .from(titles)
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)),
      )
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(inArray(titles.id, chunk))
      .all();
    for (const row of rows) byId.set(row.id, row);
  }

  const uniqueIds = [...new Set(orderedIds)];
  const [offersByTitle, genresByTitle] = await Promise.all([
    getOffersWithPlex(uniqueIds, userId),
    getGenresForTitles(uniqueIds),
  ]);

  return orderedIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        ...row,
        genres: genresByTitle.get(row.id) ?? [],
        is_tracked: true,
        is_watched: Boolean(row.is_watched),
        public: Boolean(row.public),
        offers: offersByTitle.get(row.id) ?? [],
        show_status: computeShowStatus(
          row.object_type,
          row.released_episodes_count,
          row.watched_episodes_count,
          row.total_episodes,
        ),
      },
    ];
  });
}

/**
 * Read-only smart shelves derived from tracked titles and watch rows.
 * Continue Watching: shows with at least one watched episode and at least one
 * already-aired episode still unwatched, newest watch first.
 * Start Watching: tracked movies and shows the user has not started that
 * already have a release or an aired episode, newest tracked first.
 */
export async function getSmartShelves(userId: string) {
  return traceDbQuery("getSmartShelves", async () => {
    const db = getDb();
    const [continueRows, startRows] = await Promise.all([
      db
        .select({
          id: titles.id,
        })
        .from(tracked)
        .innerJoin(titles, eq(titles.id, tracked.titleId))
        .innerJoin(episodes, eq(episodes.titleId, titles.id))
        .innerJoin(
          watchedEpisodes,
          and(
            eq(watchedEpisodes.episodeId, episodes.id),
            eq(watchedEpisodes.userId, userId),
          ),
        )
        .where(
          and(
            eq(tracked.userId, userId),
            eq(titles.objectType, "SHOW"),
            sql`EXISTS (
              SELECT 1 FROM episodes eu
              WHERE eu.title_id = ${titles.id}
                AND eu.air_date IS NOT NULL
                AND eu.air_date != ''
                AND eu.air_date <= date('now')
                AND NOT EXISTS (
                  SELECT 1 FROM watched_episodes weu
                  WHERE weu.episode_id = eu.id AND weu.user_id = ${userId}
                )
            )`,
          ),
        )
        .groupBy(titles.id)
        .orderBy(desc(sql`MAX(${watchedEpisodes.watchedAt})`), asc(titles.id))
        .limit(MAX_TRACKED_LOAD)
        .all(),
      db
        .select({ id: titles.id })
        .from(tracked)
        .innerJoin(titles, eq(titles.id, tracked.titleId))
        .where(
          and(
            eq(tracked.userId, userId),
            sql`NOT EXISTS (
              SELECT 1 FROM watched_titles wt
              WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId}
            )`,
            sql`NOT EXISTS (
              SELECT 1 FROM watched_episodes we
              INNER JOIN episodes e ON e.id = we.episode_id
              WHERE e.title_id = ${titles.id} AND we.user_id = ${userId}
            )`,
            or(
              and(
                eq(titles.objectType, "MOVIE"),
                sql`${titles.releaseDate} IS NOT NULL AND ${titles.releaseDate} != ''`,
                lte(titles.releaseDate, sql`date('now')`),
              ),
              and(
                eq(titles.objectType, "SHOW"),
                sql`EXISTS (
                  SELECT 1 FROM episodes e
                  WHERE e.title_id = ${titles.id}
                    AND e.air_date IS NOT NULL
                    AND e.air_date != ''
                    AND e.air_date <= date('now')
                )`,
              ),
            ),
          ),
        )
        .orderBy(desc(tracked.trackedAt), asc(titles.id))
        .limit(MAX_TRACKED_LOAD)
        .all(),
    ]);

    if (continueRows.length >= MAX_TRACKED_LOAD) {
      log.warn("getSmartShelves continue_watching hit soft cap", {
        userId,
        limit: MAX_TRACKED_LOAD,
      });
    }
    if (startRows.length >= MAX_TRACKED_LOAD) {
      log.warn("getSmartShelves start_watching hit soft cap", {
        userId,
        limit: MAX_TRACKED_LOAD,
      });
    }

    const continueIds = continueRows.map((row) => row.id);
    const startIds = startRows.map((row) => row.id);
    const titlesById = new Map(
      (await loadShelfTitles(userId, [...continueIds, ...startIds])).map(
        (title) => [title.id, title],
      ),
    );
    const pick = (ids: string[]) =>
      ids.flatMap((id) => {
        const title = titlesById.get(id);
        return title ? [title] : [];
      });

    return {
      continue_watching: pick(continueIds),
      start_watching: pick(startIds),
    };
  });
}

export async function getPublicTrackedTitles(
  userId: string,
  opts: { limit?: number } = {},
) {
  return traceDbQuery("getPublicTrackedTitles", async () => {
    const limit = opts.limit ?? MAX_TRACKED_LOAD;
    const db = getDb();
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
        tracked_at: tracked.trackedAt,
        user_status: tracked.userStatus,
        notification_mode: tracked.notificationMode,
        is_tracked: sql<number>`1`,
        is_watched: sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`,
        total_episodes: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id})`,
        watched_episodes_count: sql<number>`(SELECT COUNT(*) FROM watched_episodes we INNER JOIN episodes e ON e.id = we.episode_id WHERE e.title_id = ${titles.id} AND we.user_id = ${userId})`,
        released_episodes_count: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
        latest_released_air_date: sql<
          string | null
        >`(SELECT MAX(e.air_date) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
        next_episode_air_date: sql<
          string | null
        >`(SELECT MIN(e.air_date) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date > date('now'))`,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(and(eq(tracked.userId, userId), eq(tracked.public, 1)))
      .orderBy(desc(tracked.trackedAt))
      .limit(limit)
      .all();

    if (rows.length >= limit) {
      log.warn("getPublicTrackedTitles hit soft cap; result truncated", {
        userId,
        limit,
      });
    }

    const titleIds = rows.map((r) => r.id);
    const [offersByTitle, genresByTitle] = await Promise.all([
      // Public profiles: don't inject Plex offers (they're per-user/private)
      getOffersWithPlex(titleIds, undefined),
      getGenresForTitles(titleIds),
    ]);
    return rows.map((row) => ({
      ...row,
      genres: genresByTitle.get(row.id) ?? [],
      is_tracked: true,
      is_watched: Boolean(row.is_watched),
      offers: offersByTitle.get(row.id) ?? [],
      show_status: computeShowStatus(
        row.object_type,
        row.released_episodes_count,
        row.watched_episodes_count,
        row.total_episodes,
      ),
    }));
  });
}

/** Public watchlist ids only. Overlap uses this instead of the full title payload. */
export async function getPublicTrackedTitleIds(
  userId: string,
): Promise<Set<string>> {
  return traceDbQuery("getPublicTrackedTitleIds", async () => {
    const db = getDb();
    const rows = await db
      .select({ titleId: tracked.titleId })
      .from(tracked)
      .where(and(eq(tracked.userId, userId), eq(tracked.public, 1)))
      .all();
    return new Set(rows.map((r) => r.titleId));
  });
}

export async function updateTrackedVisibility(
  titleId: string,
  userId: string,
  isPublic: boolean,
) {
  return traceDbQuery("updateTrackedVisibility", async () => {
    const db = getDb();
    await db
      .update(tracked)
      .set({ public: isPublic ? 1 : 0 })
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}

export async function updateAllTrackedVisibility(
  userId: string,
  isPublic: boolean,
) {
  return traceDbQuery("updateAllTrackedVisibility", async () => {
    const db = getDb();
    await db
      .update(tracked)
      .set({ public: isPublic ? 1 : 0 })
      .where(eq(tracked.userId, userId))
      .run();
  });
}

export async function getPublicTrackedCount(userId: string): Promise<number> {
  return traceDbQuery("getPublicTrackedCount", async () => {
    const db = getDb();
    const row = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tracked)
      .where(and(eq(tracked.userId, userId), eq(tracked.public, 1)))
      .get();
    return row?.count ?? 0;
  });
}

export async function getTrackedMoviesByReleaseDate(
  date: string,
  userId: string,
) {
  return traceDbQuery("getTrackedMoviesByReleaseDate", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: titles.id,
        title: titles.title,
        release_year: titles.releaseYear,
        release_date: titles.releaseDate,
        poster_url: titles.posterUrl,
        snooze_until: tracked.snoozeUntil,
      })
      .from(titles)
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)),
      )
      .where(and(eq(titles.releaseDate, date), eq(titles.objectType, "MOVIE")))
      .all();

    const offersByTitle = await getOffersWithPlex(
      rows.map((r) => r.id),
      userId,
    );
    return rows.map((row) => ({
      ...row,
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}

export async function getReleasedUnwatchedTrackedMovies(userId: string) {
  return traceDbQuery("getReleasedUnwatchedTrackedMovies", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: titles.id,
        title: titles.title,
        release_date: titles.releaseDate,
        release_year: titles.releaseYear,
        poster_url: titles.posterUrl,
        age_certification: titles.ageCertification,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .where(
        and(
          eq(tracked.userId, userId),
          eq(titles.objectType, "MOVIE"),
          sql`${titles.releaseDate} IS NOT NULL AND ${titles.releaseDate} != ''`,
          lte(titles.releaseDate, sql`date('now')`),
          sql`NOT EXISTS (SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`,
        ),
      )
      .orderBy(desc(titles.releaseDate))
      .all();

    const offersByTitle = await getOffersWithPlex(
      rows.map((r) => r.id),
      userId,
    );
    return rows.map((row) => ({
      ...row,
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}

export async function getUpcomingTrackedMoviesOpen(userId: string) {
  return traceDbQuery("getUpcomingTrackedMoviesOpen", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: titles.id,
        title: titles.title,
        release_date: titles.releaseDate,
        release_year: titles.releaseYear,
        poster_url: titles.posterUrl,
        age_certification: titles.ageCertification,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .where(
        and(
          eq(tracked.userId, userId),
          eq(titles.objectType, "MOVIE"),
          sql`${titles.releaseDate} IS NOT NULL AND ${titles.releaseDate} != ''`,
          sql`${titles.releaseDate} > date('now')`,
        ),
      )
      .orderBy(asc(titles.releaseDate))
      .all();

    const offersByTitle = await getOffersWithPlex(
      rows.map((r) => r.id),
      userId,
    );
    return rows.map((row) => ({
      ...row,
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}

export type UserStatus =
  | "plan_to_watch"
  | "watching"
  | "on_hold"
  | "dropped"
  | "completed";

export async function getUpcomingTrackedMovies(
  userId: string,
  startDate: string,
  endDate: string,
) {
  return traceDbQuery("getUpcomingTrackedMovies", async () => {
    const db = getDb();
    return db
      .select({
        id: titles.id,
        title: titles.title,
        release_date: titles.releaseDate,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .where(
        and(
          eq(tracked.userId, userId),
          sql`${titles.objectType} = 'MOVIE'`,
          gte(titles.releaseDate, startDate),
          lt(titles.releaseDate, endDate),
        ),
      )
      .orderBy(asc(titles.releaseDate))
      .all();
  });
}

export async function updateTrackedStatus(
  titleId: string,
  userId: string,
  status: UserStatus | null,
) {
  return traceDbQuery("updateTrackedStatus", async () => {
    const db = getDb();
    await db
      .update(tracked)
      .set({ userStatus: status })
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
    const titleRow = await db
      .select({ objectType: titles.objectType })
      .from(titles)
      .where(eq(titles.id, titleId))
      .get();
    if (titleRow?.objectType === "MOVIE") {
      if (status === "completed") {
        await db
          .insert(watchedTitles)
          .values({ titleId, userId })
          .onConflictDoNothing()
          .run();
      } else {
        await db
          .delete(watchedTitles)
          .where(
            and(
              eq(watchedTitles.titleId, titleId),
              eq(watchedTitles.userId, userId),
            ),
          )
          .run();
      }
    }
  });
}

export type NotificationMode = "all" | "premieres_only" | "none";

export async function updateNotificationMode(
  titleId: string,
  userId: string,
  mode: NotificationMode | null,
): Promise<void> {
  return traceDbQuery("updateNotificationMode", async () => {
    const db = getDb();
    await db
      .update(tracked)
      .set({ notificationMode: mode })
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}

// Cloudflare D1 caps bound parameters per statement at 100. These writes bind
// the user id plus one placeholder per title id.
const BULK_TRACKED_CHUNK_SIZE = 90;
// watched_titles inserts bind title_id and user_id per row (90 params).
const BULK_WATCHED_TITLE_CHUNK_SIZE = 45;

// title_id, user_id, and notes — 3 bound params per row.
const BULK_TRACK_INSERT_CHUNK = 30;

export async function trackTitlesBulk(
  userId: string,
  rows: Array<{ titleId: string; notes?: string | null }>,
) {
  return traceDbQuery("trackTitlesBulk", async () => {
    if (rows.length === 0) return;
    const byId = new Map<string, string | null>();
    for (const row of rows) byId.set(row.titleId, row.notes || null);
    const entries = [...byId.entries()];
    const db = getDb();
    for (let i = 0; i < entries.length; i += BULK_TRACK_INSERT_CHUNK) {
      const chunk = entries.slice(i, i + BULK_TRACK_INSERT_CHUNK);
      await db
        .insert(tracked)
        .values(chunk.map(([titleId, notes]) => ({ titleId, userId, notes })))
        .onConflictDoUpdate({
          target: [tracked.titleId, tracked.userId],
          set: { notes: sql`excluded.notes` },
        })
        .run();
    }
  });
}

export async function untrackTitlesBulk(userId: string, titleIds: string[]) {
  return traceDbQuery("untrackTitlesBulk", async () => {
    if (titleIds.length === 0) return;
    const db = getDb();
    for (let i = 0; i < titleIds.length; i += BULK_TRACKED_CHUNK_SIZE) {
      const chunk = titleIds.slice(i, i + BULK_TRACKED_CHUNK_SIZE);
      await db
        .delete(tracked)
        .where(and(eq(tracked.userId, userId), inArray(tracked.titleId, chunk)))
        .run();
    }
  });
}

export async function updateTrackedStatusBulk(
  userId: string,
  titleIds: string[],
  status: UserStatus | null,
) {
  return traceDbQuery("updateTrackedStatusBulk", async () => {
    if (titleIds.length === 0) return;
    const db = getDb();
    for (let i = 0; i < titleIds.length; i += BULK_TRACKED_CHUNK_SIZE) {
      const chunk = titleIds.slice(i, i + BULK_TRACKED_CHUNK_SIZE);
      await db
        .update(tracked)
        .set({ userStatus: status })
        .where(and(eq(tracked.userId, userId), inArray(tracked.titleId, chunk)))
        .run();
    }

    // Same movie-only watched_titles side effect as updateTrackedStatus.
    const movieIds: string[] = [];
    for (let i = 0; i < titleIds.length; i += BULK_TRACKED_CHUNK_SIZE) {
      const chunk = titleIds.slice(i, i + BULK_TRACKED_CHUNK_SIZE);
      const rows = await db
        .select({ id: titles.id })
        .from(titles)
        .where(and(inArray(titles.id, chunk), eq(titles.objectType, "MOVIE")))
        .all();
      for (const row of rows) movieIds.push(row.id);
    }
    if (movieIds.length === 0) return;

    if (status === "completed") {
      for (let i = 0; i < movieIds.length; i += BULK_WATCHED_TITLE_CHUNK_SIZE) {
        const chunk = movieIds.slice(i, i + BULK_WATCHED_TITLE_CHUNK_SIZE);
        await db
          .insert(watchedTitles)
          .values(chunk.map((titleId) => ({ titleId, userId })))
          .onConflictDoNothing()
          .run();
      }
      return;
    }

    for (let i = 0; i < movieIds.length; i += BULK_TRACKED_CHUNK_SIZE) {
      const chunk = movieIds.slice(i, i + BULK_TRACKED_CHUNK_SIZE);
      await db
        .delete(watchedTitles)
        .where(
          and(
            eq(watchedTitles.userId, userId),
            inArray(watchedTitles.titleId, chunk),
          ),
        )
        .run();
    }
  });
}

export async function updateNotificationModeBulk(
  userId: string,
  titleIds: string[],
  mode: NotificationMode | null,
): Promise<void> {
  return traceDbQuery("updateNotificationModeBulk", async () => {
    if (titleIds.length === 0) return;
    const db = getDb();
    for (let i = 0; i < titleIds.length; i += BULK_TRACKED_CHUNK_SIZE) {
      const chunk = titleIds.slice(i, i + BULK_TRACKED_CHUNK_SIZE);
      await db
        .update(tracked)
        .set({ notificationMode: mode })
        .where(and(eq(tracked.userId, userId), inArray(tracked.titleId, chunk)))
        .run();
    }
  });
}

export async function getTrackedTitlesForNotifications(userId: string) {
  return traceDbQuery("getTrackedTitlesForNotifications", async () => {
    const db = getDb();
    return db
      .select({
        title_id: tracked.titleId,
        notification_mode: tracked.notificationMode,
      })
      .from(tracked)
      .where(eq(tracked.userId, userId))
      .all();
  });
}

export async function updateTrackedNotes(
  titleId: string,
  userId: string,
  notes: string | null,
) {
  return traceDbQuery("updateTrackedNotes", async () => {
    const db = getDb();
    await db
      .update(tracked)
      .set({ notes })
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}

/**
 * Get tracked movies releasing within [startDate, endDate) for a user.
 * Used for weekly digest notifications.
 */
export async function getTrackedMoviesByReleaseDateRange(
  startDate: string,
  endDate: string,
  userId: string,
) {
  return traceDbQuery("getTrackedMoviesByReleaseDateRange", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: titles.id,
        title: titles.title,
        release_year: titles.releaseYear,
        release_date: titles.releaseDate,
        poster_url: titles.posterUrl,
        snooze_until: tracked.snoozeUntil,
      })
      .from(titles)
      .innerJoin(
        tracked,
        and(eq(tracked.titleId, titles.id), eq(tracked.userId, userId)),
      )
      .where(
        and(
          gte(titles.releaseDate, startDate),
          lt(titles.releaseDate, endDate),
          eq(titles.objectType, "MOVIE"),
        ),
      )
      .all();

    const offersByTitle = await getOffersWithPlex(
      rows.map((r) => r.id),
      userId,
    );
    return rows.map((row) => ({
      ...row,
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}

// D1 caps bound parameters at 100 per statement; this query binds only title ids.
const TRACKED_TITLEIDS_CHUNK_SIZE = 100;

/**
 * Returns a map of titleId -> userIds for all users tracking any of the given titleIds.
 * Used during sync to find who should receive streaming availability alerts.
 */
export async function getUsersTrackingTitles(
  titleIds: string[],
): Promise<Map<string, string[]>> {
  return traceDbQuery("getUsersTrackingTitles", async () => {
    if (titleIds.length === 0) return new Map();
    const db = getDb();
    const map = new Map<string, string[]>();
    for (let i = 0; i < titleIds.length; i += TRACKED_TITLEIDS_CHUNK_SIZE) {
      const chunk = titleIds.slice(i, i + TRACKED_TITLEIDS_CHUNK_SIZE);
      const rows = await db
        .select({ titleId: tracked.titleId, userId: tracked.userId })
        .from(tracked)
        .where(inArray(tracked.titleId, chunk))
        .all();
      for (const row of rows) {
        const list = map.get(row.titleId) ?? [];
        list.push(row.userId);
        map.set(row.titleId, list);
      }
    }
    return map;
  });
}

export async function setSnooze(
  titleId: string,
  userId: string,
  until: string | null,
): Promise<void> {
  return traceDbQuery("setSnooze", async () => {
    const db = getDb();
    await db
      .update(tracked)
      .set({ snoozeUntil: until })
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}

export type SuggestionSeedReason = "loved" | "liked" | "watched" | "tracked";

export interface SuggestionSourceTitle {
  id: string;
  tmdbId: string;
  objectType: "MOVIE" | "SHOW";
  title: string;
  posterUrl: string | null;
  reason: SuggestionSeedReason;
}

const titleSelectFields = {
  id: titles.id,
  tmdbId: titles.tmdbId,
  objectType: titles.objectType,
  title: titles.title,
  posterUrl: titles.posterUrl,
};

export async function getSuggestionSeedTitles(
  userId: string,
  limit: number,
): Promise<SuggestionSourceTitle[]> {
  return traceDbQuery("getSuggestionSeedTitles", async () => {
    const db = getDb();
    const tmdbNotNull = sql`${titles.tmdbId} IS NOT NULL`;
    const seen = new Set<string>();
    const result: SuggestionSourceTitle[] = [];

    const addRows = (
      rows: {
        id: string;
        tmdbId: string | null;
        objectType: string;
        title: string;
        posterUrl: string | null;
      }[],
      reason: SuggestionSeedReason,
    ) => {
      for (const r of rows) {
        if (result.length >= limit) break;
        if (!r.tmdbId || seen.has(r.id)) continue;
        seen.add(r.id);
        result.push({
          id: r.id,
          tmdbId: r.tmdbId,
          objectType: r.objectType as "MOVIE" | "SHOW",
          title: r.title,
          posterUrl: r.posterUrl,
          reason,
        });
      }
    };

    // Tier 1: loved titles
    const loved = await db
      .select(titleSelectFields)
      .from(ratings)
      .innerJoin(titles, eq(titles.id, ratings.titleId))
      .where(
        and(
          eq(ratings.userId, userId),
          eq(ratings.rating, "LOVE"),
          tmdbNotNull,
        ),
      )
      .orderBy(desc(ratings.createdAt))
      .limit(limit)
      .all();
    addRows(loved, "loved");
    if (result.length >= limit) return result;

    // Tier 2: liked titles
    const liked = await db
      .select(titleSelectFields)
      .from(ratings)
      .innerJoin(titles, eq(titles.id, ratings.titleId))
      .where(
        and(
          eq(ratings.userId, userId),
          eq(ratings.rating, "LIKE"),
          tmdbNotNull,
        ),
      )
      .orderBy(desc(ratings.createdAt))
      .limit(limit)
      .all();
    addRows(liked, "liked");
    if (result.length >= limit) return result;

    // Tier 3: watched titles
    const watched = await db
      .select(titleSelectFields)
      .from(watchedTitles)
      .innerJoin(titles, eq(titles.id, watchedTitles.titleId))
      .where(and(eq(watchedTitles.userId, userId), tmdbNotNull))
      .orderBy(desc(watchedTitles.watchedAt))
      .limit(limit)
      .all();
    addRows(watched, "watched");
    if (result.length >= limit) return result;

    // Tier 4: tracked (fallback for new users)
    const trackedRows = await db
      .select(titleSelectFields)
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .where(and(eq(tracked.userId, userId), tmdbNotNull))
      .orderBy(desc(tracked.trackedAt))
      .limit(limit)
      .all();
    addRows(trackedRows, "tracked");

    return result;
  });
}

export async function setRemindOnRelease(
  titleId: string,
  userId: string,
  enabled: boolean,
): Promise<void> {
  return traceDbQuery("setRemindOnRelease", async () => {
    const db = getDb();
    await db
      .update(tracked)
      .set({ remindOnRelease: enabled ? 1 : 0 })
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}
