import { sql, eq, and, count } from "drizzle-orm";
import { getDb } from "../db/schema";
import {
  watchedTitles,
  watchedEpisodes,
  titles,
  titleGenres,
  episodes,
  follows,
  recommendations,
  userStreaks,
  userAchievementEarns,
} from "../db/schema";
import { traceDbQuery } from "../tracing";

export type EvalResult = { progress: number; earned: boolean };

/**
 * count_movies: COUNT watched_titles WHERE title.object_type = 'MOVIE'
 */
export async function evaluateCountMovies(userId: string, threshold: number): Promise<EvalResult> {
  return traceDbQuery("evaluateCountMovies", async () => {
    const db = getDb();
    const row = await db
      .select({ cnt: count() })
      .from(watchedTitles)
      .innerJoin(titles, eq(titles.id, watchedTitles.titleId))
      .where(and(eq(watchedTitles.userId, userId), eq(titles.objectType, "MOVIE")))
      .get();
    const progress = row?.cnt ?? 0;
    return { progress, earned: progress >= threshold };
  });
}

/**
 * count_episodes: COUNT watched_episodes for the user
 */
export async function evaluateCountEpisodes(userId: string, threshold: number): Promise<EvalResult> {
  return traceDbQuery("evaluateCountEpisodes", async () => {
    const db = getDb();
    const row = await db
      .select({ cnt: count() })
      .from(watchedEpisodes)
      .where(eq(watchedEpisodes.userId, userId))
      .get();
    const progress = row?.cnt ?? 0;
    return { progress, earned: progress >= threshold };
  });
}

/**
 * streak_days: read user_streaks.current_streak
 */
export async function evaluateStreak(userId: string, threshold: number): Promise<EvalResult> {
  return traceDbQuery("evaluateStreak", async () => {
    const db = getDb();
    const row = await db
      .select({ currentStreak: userStreaks.currentStreak })
      .from(userStreaks)
      .where(eq(userStreaks.userId, userId))
      .get();
    const progress = row?.currentStreak ?? 0;
    return { progress, earned: progress >= threshold };
  });
}

/**
 * genre_count:
 * - genre === "__any__": count DISTINCT genres the user has watched
 * - specific genre: count DISTINCT watched_titles joined to title_genres WHERE genre = ?
 */
export async function evaluateGenreCount(userId: string, threshold: number, genre: string): Promise<EvalResult> {
  return traceDbQuery("evaluateGenreCount", async () => {
    const db = getDb();
    let progress: number;

    if (genre === "__any__") {
      // Count distinct genres across all watched titles
      const row = await db
        .select({ cnt: sql<number>`COUNT(DISTINCT ${titleGenres.genre})` })
        .from(watchedTitles)
        .innerJoin(titleGenres, eq(titleGenres.titleId, watchedTitles.titleId))
        .where(eq(watchedTitles.userId, userId))
        .get();
      progress = row?.cnt ?? 0;
    } else {
      // Count distinct titles of a specific genre
      const row = await db
        .select({ cnt: sql<number>`COUNT(DISTINCT ${watchedTitles.titleId})` })
        .from(watchedTitles)
        .innerJoin(titleGenres, eq(titleGenres.titleId, watchedTitles.titleId))
        .where(and(eq(watchedTitles.userId, userId), eq(titleGenres.genre, genre)))
        .get();
      progress = row?.cnt ?? 0;
    }

    return { progress, earned: progress >= threshold };
  });
}

/**
 * completionist:
 * - titleId provided: compare watched episodes vs released episodes for that show
 * - titleId null/undefined: count shows where user has completed all released episodes
 */
export async function evaluateCompletionist(userId: string, threshold: number, titleId?: string): Promise<EvalResult> {
  return traceDbQuery("evaluateCompletionist", async () => {
    const db = getDb();

    if (titleId) {
      // Count watched episodes for this show
      const watchedRow = await db
        .select({ cnt: count() })
        .from(watchedEpisodes)
        .innerJoin(episodes, eq(episodes.id, watchedEpisodes.episodeId))
        .where(and(eq(watchedEpisodes.userId, userId), eq(episodes.titleId, titleId)))
        .get();

      // Count released episodes for this show
      const releasedRow = await db
        .select({ cnt: count() })
        .from(episodes)
        .where(and(
          eq(episodes.titleId, titleId),
          sql`${episodes.airDate} <= date('now')`
        ))
        .get();

      const watched = watchedRow?.cnt ?? 0;
      const released = releasedRow?.cnt ?? 0;

      // Earned if all released episodes are watched (and there are released episodes)
      const earned = released > 0 && watched >= released;
      return { progress: earned ? 1 : 0, earned };
    }

    // Find all shows where the user has watched count = released episode count
    // Use a subquery approach: get all titleIds the user has watched episodes from,
    // then count those where their watched count equals the released count
    const completedShows = await db.all<{ title_id: string }>(sql`
      SELECT e.title_id
      FROM watched_episodes we
      JOIN episodes e ON e.id = we.episode_id
      WHERE we.user_id = ${userId}
      GROUP BY e.title_id
      HAVING COUNT(*) = (
        SELECT COUNT(*)
        FROM episodes e2
        WHERE e2.title_id = e.title_id
          AND e2.air_date <= date('now')
      )
        AND (
        SELECT COUNT(*)
        FROM episodes e2
        WHERE e2.title_id = e.title_id
          AND e2.air_date <= date('now')
      ) > 0
    `);

    const progress = completedShows.length;
    return { progress, earned: progress >= threshold };
  });
}

/**
 * social_first_recommendation: COUNT recommendations WHERE from_user_id = userId
 */
export async function evaluateSocialFirstRecommendation(userId: string): Promise<EvalResult> {
  return traceDbQuery("evaluateSocialFirstRecommendation", async () => {
    const db = getDb();
    const row = await db
      .select({ cnt: count() })
      .from(recommendations)
      .where(eq(recommendations.fromUserId, userId))
      .get();
    const progress = Math.min(row?.cnt ?? 0, 1);
    return { progress, earned: progress >= 1 };
  });
}

/**
 * social_first_follow: COUNT follows WHERE follower_id = userId
 */
export async function evaluateSocialFirstFollow(userId: string): Promise<EvalResult> {
  return traceDbQuery("evaluateSocialFirstFollow", async () => {
    const db = getDb();
    const row = await db
      .select({ cnt: count() })
      .from(follows)
      .where(eq(follows.followerId, userId))
      .get();
    const progress = Math.min(row?.cnt ?? 0, 1);
    return { progress, earned: progress >= 1 };
  });
}

/**
 * speed_binge_season:
 * Scan watched_episodes joined to episodes for user+title.
 * Group by season_number, apply sliding window of windowHours.
 * Returns { progress: max episodes in any window, earned: max >= threshold }
 */
export async function evaluateSpeedBingeSeason(
  userId: string,
  threshold: number,
  windowHours: number,
  titleId: string
): Promise<EvalResult> {
  return traceDbQuery("evaluateSpeedBingeSeason", async () => {
    const db = getDb();

    // Get all watched episodes for this user+title with their season and watched_at
    const rows = await db.all<{ season_number: number; watched_at: string }>(sql`
      SELECT e.season_number, we.watched_at
      FROM watched_episodes we
      JOIN episodes e ON e.id = we.episode_id
      WHERE we.user_id = ${userId}
        AND e.title_id = ${titleId}
        AND we.watched_at IS NOT NULL
      ORDER BY e.season_number, we.watched_at
    `);

    if (rows.length === 0) {
      return { progress: 0, earned: false };
    }

    // Group by season
    const bySeason = new Map<number, string[]>();
    for (const row of rows) {
      const bucket = bySeason.get(row.season_number);
      if (bucket) {
        bucket.push(row.watched_at);
      } else {
        bySeason.set(row.season_number, [row.watched_at]);
      }
    }

    const windowMs = windowHours * 60 * 60 * 1000;
    let maxInWindow = 0;

    // Sliding window per season
    for (const timestamps of bySeason.values()) {
      timestamps.sort();
      let left = 0;
      for (let right = 0; right < timestamps.length; right++) {
        const rightMs = new Date(timestamps[right]).getTime();
        // Advance left pointer until window fits
        while (left < right) {
          const leftMs = new Date(timestamps[left]).getTime();
          if (rightMs - leftMs > windowMs) {
            left++;
          } else {
            break;
          }
        }
        const inWindow = right - left + 1;
        if (inWindow > maxInWindow) {
          maxInWindow = inWindow;
        }
      }
    }

    return { progress: maxInWindow, earned: maxInWindow >= threshold };
  });
}

export type RepeatEvalResult = {
  progress: number;
  newEarns: Array<{ earnedAt: string; context?: Record<string, unknown> }>;
};

/**
 * monthly_count_repeatable: count episodes watched in each calendar month.
 * Returns all months where the user hit the threshold that don't already have
 * an audit row in user_achievement_earns.
 */
export async function evaluateMonthlyCountRepeatable(
  userId: string,
  threshold: number,
  key: string
): Promise<RepeatEvalResult> {
  return traceDbQuery("evaluateMonthlyCountRepeatable", async () => {
    const db = getDb();

    // Count episodes per calendar month
    const monthRows = await db.all<{ month: string; cnt: number }>(sql`
      SELECT strftime('%Y-%m', we.watched_at) AS month, COUNT(*) AS cnt
      FROM watched_episodes we
      WHERE we.user_id = ${userId}
        AND we.watched_at IS NOT NULL
      GROUP BY month
      HAVING cnt >= ${threshold}
    `);

    if (monthRows.length === 0) return { progress: 0, newEarns: [] };

    // Get already-stamped months for this achievement
    const existingRows = await db.all<{ earned_at: string }>(sql`
      SELECT earned_at FROM user_achievement_earns
      WHERE user_id = ${userId} AND achievement_key = ${key}
    `);
    const stampedMonths = new Set(
      existingRows.map((r) => r.earned_at.slice(0, 7)) // 'YYYY-MM'
    );

    const newEarns = monthRows
      .filter((r) => !stampedMonths.has(r.month))
      .map((r) => ({
        earnedAt: `${r.month}-01T00:00:00.000Z`,
        context: { month: r.month, count: r.cnt },
      }));

    return { progress: monthRows.length, newEarns };
  });
}

/**
 * weekend_warrior_repeatable: count episodes watched on Sat+Sun within the same
 * calendar weekend (ISO week). Returns all weekends that hit the threshold that
 * don't already have an audit row.
 */
export async function evaluateWeekendWarriorRepeatable(
  userId: string,
  threshold: number,
  key: string
): Promise<RepeatEvalResult> {
  return traceDbQuery("evaluateWeekendWarriorRepeatable", async () => {
    const db = getDb();

    // Group episodes by ISO year-week, only counting Sat (6) and Sun (0)
    const weekRows = await db.all<{ week: string; cnt: number }>(sql`
      SELECT strftime('%Y-W%W', we.watched_at) AS week, COUNT(*) AS cnt
      FROM watched_episodes we
      WHERE we.user_id = ${userId}
        AND we.watched_at IS NOT NULL
        AND CAST(strftime('%w', we.watched_at) AS INTEGER) IN (0, 6)
      GROUP BY week
      HAVING cnt >= ${threshold}
    `);

    if (weekRows.length === 0) return { progress: 0, newEarns: [] };

    const existingRows = await db.all<{ earned_at: string }>(sql`
      SELECT earned_at FROM user_achievement_earns
      WHERE user_id = ${userId} AND achievement_key = ${key}
    `);
    const stampedWeeks = new Set(
      existingRows.map((r) => {
        const d = new Date(r.earned_at);
        return `${d.getUTCFullYear()}-W${String(Math.ceil(d.getUTCDate() / 7)).padStart(2, "0")}`;
      })
    );

    const newEarns = weekRows
      .filter((r) => !stampedWeeks.has(r.week))
      .map((r) => ({
        earnedAt: new Date().toISOString(),
        context: { week: r.week, count: r.cnt },
      }));

    return { progress: weekRows.length, newEarns };
  });
}
