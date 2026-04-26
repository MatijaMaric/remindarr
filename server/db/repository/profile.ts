import { eq, sql } from "drizzle-orm";
import { getDb } from "../schema";
import { users, watchedTitles, watchedEpisodes, episodes, titles, activityKindVisibility } from "../schema";
import type { ActivityType, ActivityKindVisibilityMap } from "./activity";
import { traceDbQuery } from "../../tracing";
import { getPublicTrackedTitles, getPublicTrackedCount, getTrackedTitles } from "./tracked";
import {
  getFollowerCount,
  getFollowingCount,
  isFollowing,
  areMutualFollowers,
  getMutualFollowers,
  type MutualFollower,
} from "./follows";
import {
  getStatsOverview,
  getUserGenreBreakdown,
  getMonthlyActivity,
  getShowsByStatus,
  type GenreCount,
  type MonthlyActivity,
  type ShowsByStatus,
  type StatsOverview,
} from "./stats";

export type ProfileVisibility = "public" | "friends_only" | "private";

export async function getUserPublicProfile(username: string, isOwnProfile = false, viewerId?: string | null) {
  return traceDbQuery("getUserPublicProfile", async () => {
    const db = getDb();

    const user = await db
      .select({
        id: users.id,
        username: users.username,
        display_name: users.name,
        image: users.image,
        member_since: users.createdAt,
        bio: users.bio,
        profile_public: users.profilePublic,
        profile_visibility: users.profileVisibility,
        activity_stream_enabled: users.activityStreamEnabled,
      })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`)
      .get();

    if (!user) return null;

    const visibility = (user.profile_visibility || (user.profile_public ? "public" : "private")) as ProfileVisibility;

    let showWatchlist: boolean;
    if (isOwnProfile) {
      showWatchlist = true;
    } else if (visibility === "public") {
      showWatchlist = true;
    } else if (visibility === "friends_only" && viewerId) {
      showWatchlist = await areMutualFollowers(viewerId, user.id);
    } else {
      showWatchlist = false;
    }

    const emptyStatsOverview: StatsOverview = {
      tracked_movies: 0,
      tracked_shows: 0,
      watched_movies: 0,
      watched_episodes: 0,
      watch_time_minutes: 0,
      watch_time_minutes_movies: 0,
      watch_time_minutes_shows: 0,
    };
    const emptyShowsByStatus: ShowsByStatus = {
      watching: 0, caught_up: 0, completed: 0, not_started: 0,
      unreleased: 0, on_hold: 0, dropped: 0, plan_to_watch: 0,
    };

    const [
      trackedCount,
      watchedMoviesRow,
      watchedEpisodesRow,
      allTitles,
      backdrops,
      followerCount,
      followingCount,
      viewerIsFollowing,
      statsOverview,
      genres,
      monthly,
      showsByStatus,
      friends,
    ] = await Promise.all([
      showWatchlist ? getPublicTrackedCount(user.id) : Promise.resolve(0),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(watchedTitles)
        .where(eq(watchedTitles.userId, user.id))
        .get(),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(watchedEpisodes)
        .where(eq(watchedEpisodes.userId, user.id))
        .get(),
      isOwnProfile
        ? getTrackedTitles(user.id).then(t => t.map(r => ({ ...r, is_public: r.public })))
        : showWatchlist
          ? getPublicTrackedTitles(user.id).then(t => t.map(r => ({ ...r, is_public: true })))
          : Promise.resolve([]),
      showWatchlist
        ? getRecentlyWatchedBackdrops(db, user.id)
        : Promise.resolve([]),
      getFollowerCount(user.id),
      getFollowingCount(user.id),
      viewerId && !isOwnProfile ? isFollowing(viewerId, user.id) : Promise.resolve(false),
      showWatchlist ? getStatsOverview(user.id) : Promise.resolve(emptyStatsOverview),
      showWatchlist ? getUserGenreBreakdown(user.id, 6) : Promise.resolve([] as GenreCount[]),
      showWatchlist ? getMonthlyActivity(user.id, 12) : Promise.resolve([] as MonthlyActivity[]),
      showWatchlist ? getShowsByStatus(user.id) : Promise.resolve(emptyShowsByStatus),
      showWatchlist ? getMutualFollowers(user.id, 4) : Promise.resolve([] as MutualFollower[]),
    ]);

    const shows = allTitles.filter(t => t.object_type === "SHOW");

    // Compute show progress metrics
    let showsCompleted = 0;
    let showsTotal = shows.length;
    let totalWatchedEpisodes = 0;
    let totalReleasedEpisodes = 0;
    for (const show of shows) {
      const total = show.total_episodes ?? 0;
      const watched = show.watched_episodes_count ?? 0;
      const released = show.released_episodes_count ?? 0;
      totalWatchedEpisodes += watched;
      totalReleasedEpisodes += released;
      if (total > 0 && total === watched && total === released) {
        showsCompleted++;
      }
    }

    // Sort movies by most recently watched first, unwatched movies last
    const movieTitles = allTitles.filter(t => t.object_type === "MOVIE");
    const movieIds = movieTitles.map(t => t.id);
    const watchedAtMap = new Map<string, string | null>();
    if (movieIds.length > 0) {
      const watchedRows = await db
        .select({ titleId: watchedTitles.titleId, watchedAt: watchedTitles.watchedAt })
        .from(watchedTitles)
        .where(sql`${watchedTitles.titleId} IN (${sql.join(movieIds.map(id => sql`${id}`), sql`, `)}) AND ${watchedTitles.userId} = ${user.id}`)
        .all();
      for (const row of watchedRows) {
        watchedAtMap.set(row.titleId, row.watchedAt);
      }
    }
    const movies = [...movieTitles].sort((a, b) => {
      const aWatched = watchedAtMap.get(a.id) ?? null;
      const bWatched = watchedAtMap.get(b.id) ?? null;
      if (aWatched && bWatched) return bWatched.localeCompare(aWatched);
      if (aWatched && !bWatched) return -1;
      if (!aWatched && bWatched) return 1;
      return 0;
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        image: user.image,
        member_since: user.member_since,
        bio: user.bio,
      },
      stats: {
        tracked_count: trackedCount,
        watched_movies: watchedMoviesRow?.count ?? 0,
        watched_episodes: watchedEpisodesRow?.count ?? 0,
        shows_completed: showsCompleted,
        shows_total: showsTotal,
        total_watched_episodes: totalWatchedEpisodes,
        total_released_episodes: totalReleasedEpisodes,
      },
      overview: {
        tracked_count: trackedCount,
        tracked_movies: statsOverview.tracked_movies,
        tracked_shows: statsOverview.tracked_shows,
        watched_movies: watchedMoviesRow?.count ?? 0,
        watched_episodes: watchedEpisodesRow?.count ?? 0,
        watch_time_minutes: statsOverview.watch_time_minutes,
        watch_time_minutes_movies: statsOverview.watch_time_minutes_movies,
        watch_time_minutes_shows: statsOverview.watch_time_minutes_shows,
        shows_completed: showsCompleted,
        shows_total: showsTotal,
        total_watched_episodes: totalWatchedEpisodes,
        total_released_episodes: totalReleasedEpisodes,
      },
      genres,
      monthly,
      shows_by_status: showsByStatus,
      friends,
      show_watchlist: showWatchlist,
      profile_visibility: visibility,
      activity_stream_enabled: Boolean(user.activity_stream_enabled),
      follower_count: followerCount,
      following_count: followingCount,
      is_following: viewerIsFollowing,
      movies,
      shows,
      backdrops,
    };
  });
}

export async function getUserVisibilityByUsername(username: string) {
  return traceDbQuery("getUserVisibilityByUsername", async () => {
    const db = getDb();
    const row = await db
      .select({
        id: users.id,
        username: users.username,
        profile_public: users.profilePublic,
        profile_visibility: users.profileVisibility,
        activity_stream_enabled: users.activityStreamEnabled,
      })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`)
      .get();
    if (!row) return null;
    const visibility = (row.profile_visibility
      || (row.profile_public ? "public" : "private")) as ProfileVisibility;
    return {
      id: row.id,
      username: row.username,
      visibility,
      activity_stream_enabled: Boolean(row.activity_stream_enabled),
    };
  });
}

export async function getActivityKindVisibilityMap(userId: string): Promise<ActivityKindVisibilityMap> {
  return traceDbQuery("getActivityKindVisibilityMap", async () => {
    const db = getDb();
    const rows = await db
      .select({ kind: activityKindVisibility.kind, visibility: activityKindVisibility.visibility })
      .from(activityKindVisibility)
      .where(eq(activityKindVisibility.userId, userId))
      .all();
    const map: ActivityKindVisibilityMap = {};
    for (const row of rows) {
      map[row.kind as ActivityType] = row.visibility as "public" | "friends_only" | "private";
    }
    return map;
  });
}

export async function setActivitySettings(
  userId: string,
  data: { enabled?: boolean; kindVisibility?: ActivityKindVisibilityMap },
): Promise<void> {
  return traceDbQuery("setActivitySettings", async () => {
    const db = getDb();
    const ops: Promise<unknown>[] = [];

    if (data.enabled !== undefined) {
      ops.push(
        db.update(users)
          .set({ activityStreamEnabled: data.enabled ? 1 : 0 })
          .where(eq(users.id, userId))
          .run(),
      );
    }

    if (data.kindVisibility) {
      for (const [kind, visibility] of Object.entries(data.kindVisibility)) {
        if (visibility === undefined) continue;
        ops.push(
          db.insert(activityKindVisibility)
            .values({ userId, kind, visibility })
            .onConflictDoUpdate({
              target: [activityKindVisibility.userId, activityKindVisibility.kind],
              set: { visibility },
            })
            .run(),
        );
      }
    }

    await Promise.all(ops);
  });
}

export async function getActivitySettings(userId: string): Promise<{
  enabled: boolean;
  kind_visibility: ActivityKindVisibilityMap;
}> {
  return traceDbQuery("getActivitySettings", async () => {
    const db = getDb();
    const [userRow, kindRows] = await Promise.all([
      db.select({ activity_stream_enabled: users.activityStreamEnabled })
        .from(users)
        .where(eq(users.id, userId))
        .get(),
      db.select({ kind: activityKindVisibility.kind, visibility: activityKindVisibility.visibility })
        .from(activityKindVisibility)
        .where(eq(activityKindVisibility.userId, userId))
        .all(),
    ]);
    const kind_visibility: ActivityKindVisibilityMap = {};
    for (const row of kindRows) {
      kind_visibility[row.kind as ActivityType] = row.visibility as "public" | "friends_only" | "private";
    }
    return {
      enabled: Boolean(userRow?.activity_stream_enabled),
      kind_visibility,
    };
  });
}

export async function updateUserBio(userId: string, bio: string | null) {
  return traceDbQuery("updateUserBio", async () => {
    const db = getDb();
    await db.update(users)
      .set({ bio })
      .where(eq(users.id, userId))
      .run();
  });
}

async function getRecentlyWatchedBackdrops(db: ReturnType<typeof getDb>, userId: string, limit = 5) {
  const rows = await db
    .select({
      id: titles.id,
      title: titles.title,
      backdrop_url: titles.backdropUrl,
    })
    .from(watchedEpisodes)
    .innerJoin(episodes, eq(episodes.id, watchedEpisodes.episodeId))
    .innerJoin(titles, eq(titles.id, episodes.titleId))
    .where(sql`${watchedEpisodes.userId} = ${userId} AND ${titles.backdropUrl} IS NOT NULL`)
    .groupBy(titles.id)
    .orderBy(sql`MAX(${watchedEpisodes.watchedAt}) DESC`)
    .limit(limit)
    .all();

  return rows as { id: string; title: string; backdrop_url: string }[];
}

export async function updateProfilePublic(userId: string, isPublicOrVisibility: boolean | ProfileVisibility) {
  return traceDbQuery("updateProfilePublic", async () => {
    const db = getDb();
    let visibility: ProfileVisibility;
    if (typeof isPublicOrVisibility === "boolean") {
      visibility = isPublicOrVisibility ? "public" : "private";
    } else {
      visibility = isPublicOrVisibility;
    }
    await db.update(users)
      .set({
        profilePublic: visibility === "public" ? 1 : 0,
        profileVisibility: visibility,
      })
      .where(eq(users.id, userId))
      .run();
  });
}
