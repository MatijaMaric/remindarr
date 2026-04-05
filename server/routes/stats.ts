import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../db/schema";
import { traceDbQuery } from "../tracing";
import type { AppEnv } from "../types";
import { ok } from "./response";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user")!;
  const stats = await getStats(user.id);
  return ok(c, stats);
});

async function getStats(userId: string) {
  return traceDbQuery("getStats", async () => {
    const db = getDb();

    const [
      overviewRows,
      genreRows,
      languageRows,
      monthlyMovieRows,
      monthlyEpisodeRows,
      showStatusRows,
    ] = await Promise.all([
      // Overview: tracked counts and watch counts
      db.all<{
        tracked_movies: number;
        tracked_shows: number;
        watched_movies: number;
        watched_episodes: number;
        watch_time_minutes: number;
      }>(sql`
        SELECT
          (SELECT COUNT(*) FROM tracked t INNER JOIN titles ti ON ti.id = t.title_id
           WHERE t.user_id = ${userId} AND ti.object_type = 'MOVIE') AS tracked_movies,
          (SELECT COUNT(*) FROM tracked t INNER JOIN titles ti ON ti.id = t.title_id
           WHERE t.user_id = ${userId} AND ti.object_type = 'SHOW') AS tracked_shows,
          (SELECT COUNT(*) FROM watched_titles WHERE user_id = ${userId}) AS watched_movies,
          (SELECT COUNT(*) FROM watched_episodes WHERE user_id = ${userId}) AS watched_episodes,
          (SELECT COALESCE(SUM(ti.runtime_minutes), 0) FROM watched_titles wt
           INNER JOIN titles ti ON ti.id = wt.title_id
           WHERE wt.user_id = ${userId} AND ti.runtime_minutes IS NOT NULL) AS watch_time_minutes
      `),

      // Top genres from watched movies + shows with watched episodes
      db.all<{ genre: string; count: number }>(sql`
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
        LIMIT 10
      `),

      // Top languages from watched movies + shows with watched episodes
      db.all<{ language: string; count: number }>(sql`
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
        LIMIT 10
      `),

      // Monthly movie watches (last 13 months)
      db.all<{ month: string; count: number }>(sql`
        SELECT strftime('%Y-%m', watched_at) AS month, COUNT(*) AS count
        FROM watched_titles
        WHERE user_id = ${userId}
          AND watched_at >= date('now', '-13 months')
        GROUP BY month
        ORDER BY month ASC
      `),

      // Monthly episode watches (last 13 months)
      db.all<{ month: string; count: number }>(sql`
        SELECT strftime('%Y-%m', watched_at) AS month, COUNT(*) AS count
        FROM watched_episodes
        WHERE user_id = ${userId}
          AND watched_at >= date('now', '-13 months')
        GROUP BY month
        ORDER BY month ASC
      `),

      // Shows by computed status
      db.all<{
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
      `),
    ]);

    const overview = overviewRows[0] ?? {
      tracked_movies: 0,
      tracked_shows: 0,
      watched_movies: 0,
      watched_episodes: 0,
      watch_time_minutes: 0,
    };

    // Compute show status breakdown
    const showsByStatus = { watching: 0, caught_up: 0, completed: 0, not_started: 0, unreleased: 0, on_hold: 0, dropped: 0, plan_to_watch: 0 };
    for (const row of showStatusRows) {
      // user_status takes precedence
      if (row.user_status && row.user_status in showsByStatus) {
        showsByStatus[row.user_status as keyof typeof showsByStatus]++;
        continue;
      }
      // Compute status from episode counts (mirrors server/db/repository/tracked.ts logic)
      if (row.released_episodes_count === 0) {
        showsByStatus.unreleased++;
      } else if (row.watched_episodes_count === 0) {
        showsByStatus.not_started++;
      } else if (row.total_episodes > 0 && row.total_episodes === row.watched_episodes_count && row.total_episodes === row.released_episodes_count) {
        showsByStatus.completed++;
      } else if (row.released_episodes_count > 0 && row.released_episodes_count === row.watched_episodes_count && row.total_episodes > row.released_episodes_count) {
        showsByStatus.caught_up++;
      } else if (row.released_episodes_count > row.watched_episodes_count) {
        showsByStatus.watching++;
      }
    }

    // Merge monthly data into a unified array covering last 13 months
    const moviesByMonth = new Map(monthlyMovieRows.map((r) => [r.month, r.count]));
    const episodesByMonth = new Map(monthlyEpisodeRows.map((r) => [r.month, r.count]));
    const months = buildMonthRange(13);
    const monthly = months.map((month) => ({
      month,
      movies_watched: moviesByMonth.get(month) ?? 0,
      episodes_watched: episodesByMonth.get(month) ?? 0,
    }));

    return {
      overview: {
        tracked_movies: overview.tracked_movies,
        tracked_shows: overview.tracked_shows,
        watched_movies: overview.watched_movies,
        watched_episodes: overview.watched_episodes,
        watch_time_minutes: overview.watch_time_minutes,
      },
      genres: genreRows,
      languages: languageRows,
      monthly,
      shows_by_status: showsByStatus,
    };
  });
}

/** Returns an array of YYYY-MM strings for the last N months (oldest first). */
function buildMonthRange(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export default app;
