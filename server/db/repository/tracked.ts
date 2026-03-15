import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, offers, providers, scores, tracked } from "../schema";
import { traceDbQuery } from "../../tracing";
import { getOffersForTitle } from "./offers";

export function trackTitle(titleId: string, userId: string, notes?: string) {
  return traceDbQuery("trackTitle", () => {
    const db = getDb();
    db.insert(tracked)
      .values({ titleId, userId, notes: notes || null })
      .onConflictDoUpdate({
        target: [tracked.titleId, tracked.userId],
        set: { notes: sql`excluded.notes` },
      })
      .run();
  });
}

export function untrackTitle(titleId: string, userId: string) {
  return traceDbQuery("untrackTitle", () => {
    const db = getDb();
    db.delete(tracked)
      .where(and(eq(tracked.titleId, titleId), eq(tracked.userId, userId)))
      .run();
  });
}

export function getTrackedTitleIds(userId: string): Set<string> {
  return traceDbQuery("getTrackedTitleIds", () => {
    const db = getDb();
    const rows = db
      .select({ titleId: tracked.titleId })
      .from(tracked)
      .where(eq(tracked.userId, userId))
      .all();
    return new Set(rows.map((r) => r.titleId));
  });
}

export function getTrackedTitles(userId: string) {
  return traceDbQuery("getTrackedTitles", () => {
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
  });
}

export function getTrackedMoviesByReleaseDate(date: string, userId: string) {
  return traceDbQuery("getTrackedMoviesByReleaseDate", () => {
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
  });
}
