import { eq, and, sql, desc, gte, lt, asc } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, scores, tracked, watchedTitles } from "../schema";
import { traceDbQuery } from "../../tracing";
import { getOffersWithPlex } from "./offers";
import { getGenresForTitles } from "./titles";

type ShowStatus = "watching" | "caught_up" | "completed" | "not_started" | "unreleased" | null;

function computeShowStatus(
  objectType: string,
  releasedEpisodesCount: number,
  watchedEpisodesCount: number,
  totalEpisodes: number,
): ShowStatus {
  if (objectType !== "SHOW") return null;
  if (releasedEpisodesCount === 0) return "unreleased";
  if (watchedEpisodesCount === 0) return "not_started";
  if (totalEpisodes > 0 && totalEpisodes === watchedEpisodesCount && totalEpisodes === releasedEpisodesCount) return "completed";
  if (releasedEpisodesCount > 0 && releasedEpisodesCount === watchedEpisodesCount && totalEpisodes > releasedEpisodesCount) return "caught_up";
  if (releasedEpisodesCount > watchedEpisodesCount) return "watching";
  return null;
}

export async function trackTitle(titleId: string, userId: string, notes?: string) {
  return traceDbQuery("trackTitle", async () => {
    const db = getDb();
    await db.insert(tracked)
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
    await db.delete(tracked)
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

export async function getTrackedTitles(userId: string) {
  return traceDbQuery("getTrackedTitles", async () => {
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
        is_tracked: sql<number>`1`,
        is_watched: sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`,
        total_episodes: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id})`,
        watched_episodes_count: sql<number>`(SELECT COUNT(*) FROM watched_episodes we INNER JOIN episodes e ON e.id = we.episode_id WHERE e.title_id = ${titles.id} AND we.user_id = ${userId})`,
        released_episodes_count: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
        latest_released_air_date: sql<string | null>`(SELECT MAX(e.air_date) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
        next_episode_air_date: sql<string | null>`(SELECT MIN(e.air_date) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date > date('now'))`,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(eq(tracked.userId, userId))
      .orderBy(desc(tracked.trackedAt))
      .all();

    const titleIds = rows.map((r) => r.id);
    const [offersByTitle, genresByTitle] = await Promise.all([
      getOffersWithPlex(titleIds, userId),
      getGenresForTitles(titleIds),
    ]);
    return rows.map((row) => ({
      ...row,
      genres: genresByTitle.get(row.id) ?? [],
      is_tracked: true,
      is_watched: Boolean(row.is_watched),
      public: Boolean(row.public),
      offers: offersByTitle.get(row.id) ?? [],
      show_status: computeShowStatus(row.object_type, row.released_episodes_count, row.watched_episodes_count, row.total_episodes),
    }));
  });
}

export async function getPublicTrackedTitles(userId: string) {
  return traceDbQuery("getPublicTrackedTitles", async () => {
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
        is_tracked: sql<number>`1`,
        is_watched: sql<number>`EXISTS(SELECT 1 FROM watched_titles wt WHERE wt.title_id = ${titles.id} AND wt.user_id = ${userId})`,
        total_episodes: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id})`,
        watched_episodes_count: sql<number>`(SELECT COUNT(*) FROM watched_episodes we INNER JOIN episodes e ON e.id = we.episode_id WHERE e.title_id = ${titles.id} AND we.user_id = ${userId})`,
        released_episodes_count: sql<number>`(SELECT COUNT(*) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
        latest_released_air_date: sql<string | null>`(SELECT MAX(e.air_date) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date <= date('now'))`,
        next_episode_air_date: sql<string | null>`(SELECT MIN(e.air_date) FROM episodes e WHERE e.title_id = ${titles.id} AND e.air_date > date('now'))`,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(and(eq(tracked.userId, userId), eq(tracked.public, 1)))
      .orderBy(desc(tracked.trackedAt))
      .all();

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
      show_status: computeShowStatus(row.object_type, row.released_episodes_count, row.watched_episodes_count, row.total_episodes),
    }));
  });
}

export async function updateTrackedVisibility(titleId: string, userId: string, isPublic: boolean) {
  return traceDbQuery("updateTrackedVisibility", async () => {
    const db = getDb();
    await db.update(tracked)
      .set({ public: isPublic ? 1 : 0 })
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}

export async function updateAllTrackedVisibility(userId: string, isPublic: boolean) {
  return traceDbQuery("updateAllTrackedVisibility", async () => {
    const db = getDb();
    await db.update(tracked)
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

export async function getTrackedMoviesByReleaseDate(date: string, userId: string) {
  return traceDbQuery("getTrackedMoviesByReleaseDate", async () => {
    const db = getDb();
    const rows = await db
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

    const offersByTitle = await getOffersWithPlex(rows.map((r) => r.id), userId);
    return rows.map((row) => ({
      ...row,
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}

export type UserStatus = "plan_to_watch" | "watching" | "on_hold" | "dropped" | "completed";

export async function getUpcomingTrackedMovies(userId: string, startDate: string, endDate: string) {
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
        )
      )
      .orderBy(asc(titles.releaseDate))
      .all();
  });
}

export async function updateTrackedStatus(titleId: string, userId: string, status: UserStatus | null) {
  return traceDbQuery("updateTrackedStatus", async () => {
    const db = getDb();
    await db.update(tracked)
      .set({ userStatus: status })
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}
