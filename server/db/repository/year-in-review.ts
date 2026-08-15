import { sql } from "drizzle-orm";
import { getDb } from "../schema";
import { traceDbQuery } from "../../tracing";
import { getCache } from "../../cache";
import type { Cache } from "../../cache/types";

export interface YearInReviewTitleRef {
  title_id: string;
  title: string;
  poster_url: string | null;
}

export interface YearInReviewGenre {
  genre: string;
  count: number;
}

export interface YearInReviewProvider {
  provider_id: number;
  name: string;
  count: number;
}

export interface YearInReviewShow extends YearInReviewTitleRef {
  count: number;
}

export interface YearInReviewBinge extends YearInReviewTitleRef {
  days: number;
  episodes: number;
}

export interface YearInReviewRewatch extends YearInReviewTitleRef {
  plays: number;
}

export interface YearInReviewWatch extends YearInReviewTitleRef {
  watched_at: string;
}

export interface YearInReview {
  year: number;
  movies_watched: number;
  episodes_watched: number;
  watch_time_minutes: number;
  watch_time_minutes_movies: number;
  watch_time_minutes_shows: number;
  top_genres: YearInReviewGenre[];
  top_providers: YearInReviewProvider[];
  top_shows: YearInReviewShow[];
  longest_binge: YearInReviewBinge | null;
  most_rewatched: YearInReviewRewatch | null;
  first_watch: YearInReviewWatch | null;
  last_watch: YearInReviewWatch | null;
  years: number[];
}

function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

function tryGetCache(): Cache | null {
  try {
    return getCache();
  } catch {
    return null;
  }
}

function cacheKey(userId: string, year: number): string {
  return `year-in-review:v1:${userId}:${year}`;
}

function cacheTtlSeconds(year: number): number {
  const currentYear = new Date().getUTCFullYear();
  // ponytail: cache not a table; add year_in_review rows if KV evictions matter
  return year < currentYear ? 90 * 24 * 3600 : 3600;
}

export async function getYearInReview(
  userId: string,
  year: number,
): Promise<YearInReview> {
  const cache = tryGetCache();
  const key = cacheKey(userId, year);
  if (cache) {
    const hit = await cache.get<YearInReview>(key);
    if (hit) return hit;
  }
  const data = await computeYearInReview(userId, year);
  if (cache) {
    await cache.set(key, data, cacheTtlSeconds(year));
  }
  return data;
}

export async function computeYearInReview(
  userId: string,
  year: number,
): Promise<YearInReview> {
  return traceDbQuery("computeYearInReview", async () => {
    const { start, end } = yearBounds(year);
    const [
      counts,
      topGenres,
      topProviders,
      topShows,
      bingeDays,
      mostRewatched,
      edgeWatches,
      years,
    ] = await Promise.all([
      queryCounts(userId, start, end),
      queryTopGenres(userId, start, end),
      queryTopProviders(userId, start, end),
      queryTopShows(userId, start, end),
      queryBingeDays(userId, start, end),
      queryMostRewatched(userId, start, end),
      queryEdgeWatches(userId, start, end),
      queryYears(userId),
    ]);

    return {
      year,
      movies_watched: counts.movies_watched,
      episodes_watched: counts.episodes_watched,
      watch_time_minutes_movies: counts.watch_time_minutes_movies,
      watch_time_minutes_shows: counts.watch_time_minutes_shows,
      watch_time_minutes:
        counts.watch_time_minutes_movies + counts.watch_time_minutes_shows,
      top_genres: topGenres,
      top_providers: topProviders,
      top_shows: topShows,
      longest_binge: longestBinge(bingeDays),
      most_rewatched: mostRewatched,
      first_watch: edgeWatches.first,
      last_watch: edgeWatches.last,
      years,
    };
  });
}

async function queryCounts(
  userId: string,
  start: string,
  end: string,
): Promise<{
  movies_watched: number;
  episodes_watched: number;
  watch_time_minutes_movies: number;
  watch_time_minutes_shows: number;
}> {
  const db = getDb();
  const rows = await db.all<{
    movies_watched: number;
    episodes_watched: number;
    watch_time_minutes_movies: number;
    watch_time_minutes_shows: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM watched_titles wt
       INNER JOIN titles ti ON ti.id = wt.title_id
       WHERE wt.user_id = ${userId}
         AND ti.object_type = 'MOVIE'
         AND wt.watched_at >= ${start}
         AND wt.watched_at < ${end}) AS movies_watched,
      (SELECT COUNT(*) FROM watched_episodes we
       WHERE we.user_id = ${userId}
         AND we.watched_at >= ${start}
         AND we.watched_at < ${end}) AS episodes_watched,
      (SELECT COALESCE(SUM(ti.runtime_minutes), 0) FROM watched_titles wt
       INNER JOIN titles ti ON ti.id = wt.title_id
       WHERE wt.user_id = ${userId}
         AND ti.object_type = 'MOVIE'
         AND ti.runtime_minutes IS NOT NULL
         AND wt.watched_at >= ${start}
         AND wt.watched_at < ${end}) AS watch_time_minutes_movies,
      (SELECT COALESCE(SUM(ti.runtime_minutes), 0) FROM watched_episodes we
       INNER JOIN episodes e ON e.id = we.episode_id
       INNER JOIN titles ti ON ti.id = e.title_id
       WHERE we.user_id = ${userId}
         AND ti.runtime_minutes IS NOT NULL
         AND we.watched_at >= ${start}
         AND we.watched_at < ${end}) AS watch_time_minutes_shows
  `);
  return (
    rows[0] ?? {
      movies_watched: 0,
      episodes_watched: 0,
      watch_time_minutes_movies: 0,
      watch_time_minutes_shows: 0,
    }
  );
}

async function queryTopGenres(
  userId: string,
  start: string,
  end: string,
  limit = 5,
): Promise<YearInReviewGenre[]> {
  const db = getDb();
  return db.all<YearInReviewGenre>(sql`
    SELECT tg.genre, COUNT(*) AS count
    FROM (
      SELECT wt.title_id FROM watched_titles wt
      INNER JOIN titles ti ON ti.id = wt.title_id
      WHERE wt.user_id = ${userId}
        AND ti.object_type = 'MOVIE'
        AND wt.watched_at >= ${start}
        AND wt.watched_at < ${end}
      UNION
      SELECT e.title_id FROM watched_episodes we
      INNER JOIN episodes e ON e.id = we.episode_id
      WHERE we.user_id = ${userId}
        AND we.watched_at >= ${start}
        AND we.watched_at < ${end}
    ) AS watched
    INNER JOIN title_genres tg ON tg.title_id = watched.title_id
    GROUP BY tg.genre
    ORDER BY count DESC
    LIMIT ${limit}
  `);
}

async function queryTopProviders(
  userId: string,
  start: string,
  end: string,
  limit = 5,
): Promise<YearInReviewProvider[]> {
  const db = getDb();
  return db.all<YearInReviewProvider>(sql`
    SELECT p.id AS provider_id, p.name, COUNT(DISTINCT watched.title_id) AS count
    FROM (
      SELECT wt.title_id FROM watched_titles wt
      INNER JOIN titles ti ON ti.id = wt.title_id
      WHERE wt.user_id = ${userId}
        AND ti.object_type = 'MOVIE'
        AND wt.watched_at >= ${start}
        AND wt.watched_at < ${end}
      UNION
      SELECT e.title_id FROM watched_episodes we
      INNER JOIN episodes e ON e.id = we.episode_id
      WHERE we.user_id = ${userId}
        AND we.watched_at >= ${start}
        AND we.watched_at < ${end}
    ) AS watched
    INNER JOIN offers o ON o.title_id = watched.title_id
      AND o.monetization_type = 'FLATRATE'
    INNER JOIN providers p ON p.id = o.provider_id
    GROUP BY p.id
    ORDER BY count DESC
    LIMIT ${limit}
  `);
}

async function queryTopShows(
  userId: string,
  start: string,
  end: string,
  limit = 5,
): Promise<YearInReviewShow[]> {
  const db = getDb();
  return db.all<YearInReviewShow>(sql`
    SELECT e.title_id, ti.title, ti.poster_url, COUNT(*) AS count
    FROM watched_episodes we
    INNER JOIN episodes e ON e.id = we.episode_id
    INNER JOIN titles ti ON ti.id = e.title_id
    WHERE we.user_id = ${userId}
      AND we.watched_at >= ${start}
      AND we.watched_at < ${end}
    GROUP BY e.title_id
    ORDER BY count DESC
    LIMIT ${limit}
  `);
}

interface BingeDayRow {
  title_id: string;
  title: string;
  poster_url: string | null;
  watch_date: string;
  episodes: number;
}

async function queryBingeDays(
  userId: string,
  start: string,
  end: string,
): Promise<BingeDayRow[]> {
  const db = getDb();
  return db.all<BingeDayRow>(sql`
    SELECT e.title_id, ti.title, ti.poster_url,
           date(we.watched_at) AS watch_date,
           COUNT(*) AS episodes
    FROM watched_episodes we
    INNER JOIN episodes e ON e.id = we.episode_id
    INNER JOIN titles ti ON ti.id = e.title_id
    WHERE we.user_id = ${userId}
      AND we.watched_at >= ${start}
      AND we.watched_at < ${end}
    GROUP BY e.title_id, watch_date
    ORDER BY e.title_id, watch_date
  `);
}

function longestBinge(rows: BingeDayRow[]): YearInReviewBinge | null {
  if (rows.length === 0) return null;

  let best: YearInReviewBinge | null = null;
  let runTitle = rows[0];
  let runDays = 1;
  let runEpisodes = rows[0].episodes;
  let prevDate = rows[0].watch_date;

  const consider = (title: BingeDayRow, days: number, episodes: number) => {
    if (
      !best ||
      days > best.days ||
      (days === best.days && episodes > best.episodes)
    ) {
      best = {
        title_id: title.title_id,
        title: title.title,
        poster_url: title.poster_url,
        days,
        episodes,
      };
    }
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (
      row.title_id === runTitle.title_id &&
      dateDiffDays(prevDate, row.watch_date) === 1
    ) {
      runDays += 1;
      runEpisodes += row.episodes;
      prevDate = row.watch_date;
      continue;
    }
    consider(runTitle, runDays, runEpisodes);
    runTitle = row;
    runDays = 1;
    runEpisodes = row.episodes;
    prevDate = row.watch_date;
  }
  consider(runTitle, runDays, runEpisodes);
  return best;
}

function dateDiffDays(a: string, b: string): number {
  const aMs = new Date(`${a}T00:00:00Z`).getTime();
  const bMs = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((bMs - aMs) / (1000 * 60 * 60 * 24));
}

async function queryMostRewatched(
  userId: string,
  start: string,
  end: string,
): Promise<YearInReviewRewatch | null> {
  const db = getDb();
  const rows = await db.all<YearInReviewRewatch>(sql`
    SELECT wh.title_id, ti.title, ti.poster_url, COUNT(*) AS plays
    FROM watch_history wh
    INNER JOIN titles ti ON ti.id = wh.title_id
    WHERE wh.user_id = ${userId}
      AND wh.watched_at >= ${start}
      AND wh.watched_at < ${end}
    GROUP BY wh.title_id
    HAVING COUNT(*) > 1
    ORDER BY plays DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function queryEdgeWatches(
  userId: string,
  start: string,
  end: string,
): Promise<{
  first: YearInReviewWatch | null;
  last: YearInReviewWatch | null;
}> {
  const db = getDb();
  const rows = await db.all<YearInReviewWatch>(sql`
    SELECT title_id, title, poster_url, watched_at FROM (
      SELECT wt.title_id, ti.title, ti.poster_url, wt.watched_at
      FROM watched_titles wt
      INNER JOIN titles ti ON ti.id = wt.title_id
      WHERE wt.user_id = ${userId}
        AND wt.watched_at >= ${start}
        AND wt.watched_at < ${end}
      UNION ALL
      SELECT e.title_id, ti.title, ti.poster_url, we.watched_at
      FROM watched_episodes we
      INNER JOIN episodes e ON e.id = we.episode_id
      INNER JOIN titles ti ON ti.id = e.title_id
      WHERE we.user_id = ${userId}
        AND we.watched_at >= ${start}
        AND we.watched_at < ${end}
    )
    ORDER BY watched_at ASC
  `);
  if (rows.length === 0) return { first: null, last: null };
  return { first: rows[0], last: rows[rows.length - 1] };
}

async function queryYears(userId: string): Promise<number[]> {
  const db = getDb();
  const rows = await db.all<{ year: string }>(sql`
    SELECT DISTINCT year FROM (
      SELECT strftime('%Y', watched_at) AS year
      FROM watched_titles
      WHERE user_id = ${userId} AND watched_at IS NOT NULL
      UNION
      SELECT strftime('%Y', watched_at) AS year
      FROM watched_episodes
      WHERE user_id = ${userId} AND watched_at IS NOT NULL
      UNION
      SELECT strftime('%Y', watched_at) AS year
      FROM watch_history
      WHERE user_id = ${userId} AND watched_at IS NOT NULL
    )
    WHERE year IS NOT NULL
    ORDER BY year DESC
  `);
  return rows.map((r) => Number(r.year)).filter((y) => Number.isFinite(y));
}
