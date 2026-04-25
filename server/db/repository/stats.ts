import { sql } from "drizzle-orm";
import { getDb } from "../schema";
import { traceDbQuery } from "../../tracing";

export interface StatsOverview {
  tracked_movies: number;
  tracked_shows: number;
  watched_movies: number;
  watched_episodes: number;
  watch_time_minutes: number;
  watch_time_minutes_movies: number;
  watch_time_minutes_shows: number;
}

export interface GenreCount {
  genre: string;
  count: number;
}

export interface LanguageCount {
  language: string;
  count: number;
}

export interface MonthlyActivity {
  month: string;
  movies_watched: number;
  episodes_watched: number;
}

export interface ShowsByStatus {
  watching: number;
  caught_up: number;
  completed: number;
  not_started: number;
  unreleased: number;
  on_hold: number;
  dropped: number;
  plan_to_watch: number;
}

export async function getStatsOverview(userId: string): Promise<StatsOverview> {
  return traceDbQuery("getStatsOverview", async () => {
    const db = getDb();
    const rows = await db.all<Omit<StatsOverview, "watch_time_minutes">>(sql`
      SELECT
        (SELECT COUNT(*) FROM tracked t INNER JOIN titles ti ON ti.id = t.title_id
         WHERE t.user_id = ${userId} AND ti.object_type = 'MOVIE') AS tracked_movies,
        (SELECT COUNT(*) FROM tracked t INNER JOIN titles ti ON ti.id = t.title_id
         WHERE t.user_id = ${userId} AND ti.object_type = 'SHOW') AS tracked_shows,
        (SELECT COUNT(*) FROM watched_titles WHERE user_id = ${userId}) AS watched_movies,
        (SELECT COUNT(*) FROM watched_episodes WHERE user_id = ${userId}) AS watched_episodes,
        (SELECT COALESCE(SUM(ti.runtime_minutes), 0) FROM watched_titles wt
         INNER JOIN titles ti ON ti.id = wt.title_id
         WHERE wt.user_id = ${userId} AND ti.runtime_minutes IS NOT NULL) AS watch_time_minutes_movies,
        (SELECT COALESCE(SUM(ti.runtime_minutes), 0) FROM watched_episodes we
         INNER JOIN episodes e ON e.id = we.episode_id
         INNER JOIN titles ti ON ti.id = e.title_id
         WHERE we.user_id = ${userId} AND ti.runtime_minutes IS NOT NULL) AS watch_time_minutes_shows
    `);
    const row = rows[0] ?? {
      tracked_movies: 0,
      tracked_shows: 0,
      watched_movies: 0,
      watched_episodes: 0,
      watch_time_minutes_movies: 0,
      watch_time_minutes_shows: 0,
    };
    return {
      ...row,
      watch_time_minutes: row.watch_time_minutes_movies + row.watch_time_minutes_shows,
    };
  });
}

export async function getUserGenreBreakdown(userId: string, limit = 10): Promise<GenreCount[]> {
  return traceDbQuery("getUserGenreBreakdown", async () => {
    const db = getDb();
    return db.all<GenreCount>(sql`
      SELECT tg.genre, COUNT(*) AS count
      FROM (
        SELECT wt.title_id FROM watched_titles wt WHERE wt.user_id = ${userId}
        UNION
        SELECT e.title_id FROM watched_episodes we
        INNER JOIN episodes e ON e.id = we.episode_id
        WHERE we.user_id = ${userId}
      ) AS watched
      INNER JOIN title_genres tg ON tg.title_id = watched.title_id
      GROUP BY tg.genre
      ORDER BY count DESC
      LIMIT ${limit}
    `);
  });
}

export async function getUserLanguageBreakdown(userId: string, limit = 10): Promise<LanguageCount[]> {
  return traceDbQuery("getUserLanguageBreakdown", async () => {
    const db = getDb();
    return db.all<LanguageCount>(sql`
      SELECT ti.original_language AS language, COUNT(*) AS count
      FROM (
        SELECT wt.title_id FROM watched_titles wt WHERE wt.user_id = ${userId}
        UNION
        SELECT e.title_id FROM watched_episodes we
        INNER JOIN episodes e ON e.id = we.episode_id
        WHERE we.user_id = ${userId}
      ) AS watched
      INNER JOIN titles ti ON ti.id = watched.title_id
      WHERE ti.original_language IS NOT NULL
      GROUP BY ti.original_language
      ORDER BY count DESC
      LIMIT ${limit}
    `);
  });
}

export async function getMonthlyActivity(userId: string, months = 13): Promise<MonthlyActivity[]> {
  return traceDbQuery("getMonthlyActivity", async () => {
    const db = getDb();
    const cutoff = `-${months} months`;
    const [monthlyMovieRows, monthlyEpisodeRows] = await Promise.all([
      db.all<{ month: string; count: number }>(sql`
        SELECT strftime('%Y-%m', watched_at) AS month, COUNT(*) AS count
        FROM watched_titles
        WHERE user_id = ${userId}
          AND watched_at >= date('now', ${cutoff})
        GROUP BY month
        ORDER BY month ASC
      `),
      db.all<{ month: string; count: number }>(sql`
        SELECT strftime('%Y-%m', watched_at) AS month, COUNT(*) AS count
        FROM watched_episodes
        WHERE user_id = ${userId}
          AND watched_at >= date('now', ${cutoff})
        GROUP BY month
        ORDER BY month ASC
      `),
    ]);
    const moviesByMonth = new Map(monthlyMovieRows.map((r) => [r.month, r.count]));
    const episodesByMonth = new Map(monthlyEpisodeRows.map((r) => [r.month, r.count]));
    return buildMonthRange(months).map((month) => ({
      month,
      movies_watched: moviesByMonth.get(month) ?? 0,
      episodes_watched: episodesByMonth.get(month) ?? 0,
    }));
  });
}

export async function getShowsByStatus(userId: string): Promise<ShowsByStatus> {
  return traceDbQuery("getShowsByStatus", async () => {
    const db = getDb();
    const rows = await db.all<{
      total_episodes: number;
      watched_episodes_count: number;
      released_episodes_count: number;
      user_status: string | null;
    }>(sql`
      SELECT
        (SELECT COUNT(*) FROM episodes e WHERE e.title_id = t.title_id) AS total_episodes,
        (SELECT COUNT(*) FROM watched_episodes we
         INNER JOIN episodes e ON e.id = we.episode_id
         WHERE e.title_id = t.title_id AND we.user_id = ${userId}) AS watched_episodes_count,
        (SELECT COUNT(*) FROM episodes e WHERE e.title_id = t.title_id AND e.air_date <= date('now')) AS released_episodes_count,
        t.user_status
      FROM tracked t
      INNER JOIN titles ti ON ti.id = t.title_id
      WHERE t.user_id = ${userId} AND ti.object_type = 'SHOW'
    `);

    const byStatus: ShowsByStatus = {
      watching: 0, caught_up: 0, completed: 0, not_started: 0,
      unreleased: 0, on_hold: 0, dropped: 0, plan_to_watch: 0,
    };
    for (const row of rows) {
      if (row.user_status && row.user_status in byStatus) {
        byStatus[row.user_status as keyof ShowsByStatus]++;
        continue;
      }
      if (row.released_episodes_count === 0) {
        byStatus.unreleased++;
      } else if (row.watched_episodes_count === 0) {
        byStatus.not_started++;
      } else if (
        row.total_episodes > 0 &&
        row.total_episodes === row.watched_episodes_count &&
        row.total_episodes === row.released_episodes_count
      ) {
        byStatus.completed++;
      } else if (
        row.released_episodes_count > 0 &&
        row.released_episodes_count === row.watched_episodes_count &&
        row.total_episodes > row.released_episodes_count
      ) {
        byStatus.caught_up++;
      } else if (row.released_episodes_count > row.watched_episodes_count) {
        byStatus.watching++;
      }
    }
    return byStatus;
  });
}

/** Returns an array of YYYY-MM strings for the last N months (oldest first). */
export function buildMonthRange(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}
