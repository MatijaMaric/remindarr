import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { titles, scores, tracked, titleGenres } from "../schema";
import { traceDbQuery } from "../../tracing";
import { getOffersForTitles } from "./offers";

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
        is_tracked: sql<number>`1`,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .leftJoin(scores, eq(scores.titleId, titles.id))
      .where(eq(tracked.userId, userId))
      .orderBy(desc(tracked.trackedAt))
      .all();

    const titleIds = rows.map((r) => r.id);
    const [offersByTitle, genresByTitle] = await Promise.all([
      getOffersForTitles(titleIds),
      getGenresForTitles(titleIds),
    ]);
    return rows.map((row) => ({
      ...row,
      genres: genresByTitle.get(row.id) ?? [],
      is_tracked: true,
      offers: offersByTitle.get(row.id) ?? [],
    }));
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

    const offersByTitle = await getOffersForTitles(rows.map((r) => r.id));
    return rows.map((row) => ({
      ...row,
      offers: offersByTitle.get(row.id) ?? [],
    }));
  });
}
