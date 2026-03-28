import { eq, sql } from "drizzle-orm";
import { getDb } from "../schema";
import { users, watchedTitles, watchedEpisodes, episodes, titles } from "../schema";
import { traceDbQuery } from "../../tracing";
import { getPublicTrackedTitles, getPublicTrackedCount, getTrackedTitles } from "./tracked";

export async function getUserPublicProfile(username: string, isOwnProfile = false) {
  return traceDbQuery("getUserPublicProfile", async () => {
    const db = getDb();

    const user = await db
      .select({
        id: users.id,
        username: users.username,
        display_name: users.name,
        image: users.image,
        member_since: users.createdAt,
        profile_public: users.profilePublic,
      })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`)
      .get();

    if (!user) return null;

    const showWatchlist = isOwnProfile || Boolean(user.profile_public);

    const [trackedCount, watchedMoviesRow, watchedEpisodesRow, allTitles, backdrops] = await Promise.all([
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
    ]);

    const movies = allTitles.filter(t => t.object_type === "MOVIE");
    const shows = allTitles.filter(t => t.object_type === "SHOW");

    return {
      user: {
        username: user.username,
        display_name: user.display_name,
        image: user.image,
        member_since: user.member_since,
      },
      stats: {
        tracked_count: trackedCount,
        watched_movies: watchedMoviesRow?.count ?? 0,
        watched_episodes: watchedEpisodesRow?.count ?? 0,
      },
      show_watchlist: showWatchlist,
      movies,
      shows,
      backdrops,
    };
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

export async function updateProfilePublic(userId: string, isPublic: boolean) {
  return traceDbQuery("updateProfilePublic", async () => {
    const db = getDb();
    await db.update(users)
      .set({ profilePublic: isPublic ? 1 : 0 })
      .where(eq(users.id, userId))
      .run();
  });
}
