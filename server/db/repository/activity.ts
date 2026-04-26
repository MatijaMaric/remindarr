import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../schema";
import {
  episodeRatings,
  episodes,
  ratings,
  recommendations,
  titles,
  tracked,
  watchedEpisodes,
  watchedTitles,
} from "../schema";
import { traceDbQuery } from "../../tracing";
import type { RatingValue } from "./ratings";
import type { UserStatus } from "./tracked";

export type ActivityType =
  | "rating_title"
  | "rating_episode"
  | "watched_title"
  | "watched_episode"
  | "tracked"
  | "recommendation";

export interface ActivityTitleRef {
  id: string;
  title: string;
  object_type: "MOVIE" | "SHOW" | string;
  poster_url: string | null;
  runtime_minutes: number | null;
}

export interface ActivityEpisodeRef {
  id: number;
  season_number: number;
  episode_number: number;
  name: string | null;
}

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  created_at: string;
  title: ActivityTitleRef;
  episode?: ActivityEpisodeRef;
  rating?: RatingValue;
  review?: string | null;
  message?: string | null;
  status?: UserStatus | null;
}

export type ActivityKindVisibilityMap = Partial<Record<ActivityType, "public" | "friends_only" | "private">>;

interface ActivityQueryOptions {
  limit?: number;
  before?: string | null;
  /** Per-kind visibility overrides. Kinds absent from the map are shown to everyone. */
  kindVisibility?: ActivityKindVisibilityMap;
  /** Viewer's relationship to the profile owner: "self" | "friend" | "public" */
  viewerRelation?: "self" | "friend" | "public";
  /** Composite keys ("kind::eventKey") the owner has hidden. */
  hiddenKeys?: Set<string>;
}

// Watch events use watched_titles / watched_episodes (unique watch markers) rather than
// watch_history (append-only play log). This is intentional: the feed shows "watched once"
// semantics, not repeated-play counts. See server/db/repository/watch-history.ts.

/**
 * Builds a chronological mixed-source activity feed for a user.
 *
 * Each underlying source (ratings, watched_titles, watched_episodes, tracked,
 * recommendations, episode_ratings) is queried independently with a `< before`
 * cursor and a limit of `limit + 1` rows. Results are merged in memory, sorted
 * by `created_at DESC`, and trimmed to `limit`. The `+1` row tells us whether
 * there's a next page.
 *
 * Cursor pagination beats OFFSET here because new events get inserted between
 * pages otherwise.
 */
export async function getUserActivity(userId: string, options: ActivityQueryOptions = {}) {
  return traceDbQuery("getUserActivity", async () => {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
    const before = options.before ?? null;
    const fetch = limit + 1;
    const db = getDb();

    const titleRatingFilters = before
      ? and(eq(ratings.userId, userId), lt(ratings.createdAt, before))
      : eq(ratings.userId, userId);
    const titleRatingsRows = await db
      .select({
        titleId: ratings.titleId,
        rating: ratings.rating,
        createdAt: ratings.createdAt,
        titleName: titles.title,
        objectType: titles.objectType,
        posterUrl: titles.posterUrl,
        runtimeMinutes: titles.runtimeMinutes,
      })
      .from(ratings)
      .innerJoin(titles, eq(titles.id, ratings.titleId))
      .where(titleRatingFilters)
      .orderBy(desc(ratings.createdAt))
      .limit(fetch)
      .all();

    const episodeRatingFilters = before
      ? and(eq(episodeRatings.userId, userId), lt(episodeRatings.createdAt, before))
      : eq(episodeRatings.userId, userId);
    const episodeRatingsRows = await db
      .select({
        episodeId: episodeRatings.episodeId,
        rating: episodeRatings.rating,
        review: episodeRatings.review,
        createdAt: episodeRatings.createdAt,
        seasonNumber: episodes.seasonNumber,
        episodeNumber: episodes.episodeNumber,
        episodeName: episodes.name,
        titleId: titles.id,
        titleName: titles.title,
        objectType: titles.objectType,
        posterUrl: titles.posterUrl,
        runtimeMinutes: titles.runtimeMinutes,
      })
      .from(episodeRatings)
      .innerJoin(episodes, eq(episodes.id, episodeRatings.episodeId))
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .where(episodeRatingFilters)
      .orderBy(desc(episodeRatings.createdAt))
      .limit(fetch)
      .all();

    const watchedTitleFilters = before
      ? and(eq(watchedTitles.userId, userId), lt(watchedTitles.watchedAt, before))
      : eq(watchedTitles.userId, userId);
    const watchedTitlesRows = await db
      .select({
        titleId: watchedTitles.titleId,
        watchedAt: watchedTitles.watchedAt,
        titleName: titles.title,
        objectType: titles.objectType,
        posterUrl: titles.posterUrl,
        runtimeMinutes: titles.runtimeMinutes,
      })
      .from(watchedTitles)
      .innerJoin(titles, eq(titles.id, watchedTitles.titleId))
      .where(watchedTitleFilters)
      .orderBy(desc(watchedTitles.watchedAt))
      .limit(fetch)
      .all();

    const watchedEpisodeFilters = before
      ? and(eq(watchedEpisodes.userId, userId), lt(watchedEpisodes.watchedAt, before))
      : eq(watchedEpisodes.userId, userId);
    const watchedEpisodesRows = await db
      .select({
        episodeId: watchedEpisodes.episodeId,
        watchedAt: watchedEpisodes.watchedAt,
        seasonNumber: episodes.seasonNumber,
        episodeNumber: episodes.episodeNumber,
        episodeName: episodes.name,
        titleId: titles.id,
        titleName: titles.title,
        objectType: titles.objectType,
        posterUrl: titles.posterUrl,
        runtimeMinutes: titles.runtimeMinutes,
      })
      .from(watchedEpisodes)
      .innerJoin(episodes, eq(episodes.id, watchedEpisodes.episodeId))
      .innerJoin(titles, eq(titles.id, episodes.titleId))
      .where(watchedEpisodeFilters)
      .orderBy(desc(watchedEpisodes.watchedAt))
      .limit(fetch)
      .all();

    const trackedFilters = before
      ? and(eq(tracked.userId, userId), lt(tracked.trackedAt, before), eq(tracked.public, 1))
      : and(eq(tracked.userId, userId), eq(tracked.public, 1));
    const trackedRows = await db
      .select({
        titleId: tracked.titleId,
        trackedAt: tracked.trackedAt,
        userStatus: tracked.userStatus,
        titleName: titles.title,
        objectType: titles.objectType,
        posterUrl: titles.posterUrl,
        runtimeMinutes: titles.runtimeMinutes,
      })
      .from(tracked)
      .innerJoin(titles, eq(titles.id, tracked.titleId))
      .where(trackedFilters)
      .orderBy(desc(tracked.trackedAt))
      .limit(fetch)
      .all();

    const recommendationFilters = before
      ? and(eq(recommendations.fromUserId, userId), lt(recommendations.createdAt, before))
      : eq(recommendations.fromUserId, userId);
    const recommendationRows = await db
      .select({
        id: recommendations.id,
        titleId: recommendations.titleId,
        message: recommendations.message,
        createdAt: recommendations.createdAt,
        titleName: titles.title,
        objectType: titles.objectType,
        posterUrl: titles.posterUrl,
        runtimeMinutes: titles.runtimeMinutes,
      })
      .from(recommendations)
      .innerJoin(titles, eq(titles.id, recommendations.titleId))
      .where(recommendationFilters)
      .orderBy(desc(recommendations.createdAt))
      .limit(fetch)
      .all();

    const merged: ActivityEvent[] = [];

    for (const row of titleRatingsRows) {
      if (!row.createdAt) continue;
      merged.push({
        id: `rt:${row.titleId}`,
        type: "rating_title",
        created_at: row.createdAt,
        title: {
          id: row.titleId,
          title: row.titleName,
          object_type: row.objectType,
          poster_url: row.posterUrl,
          runtime_minutes: row.runtimeMinutes,
        },
        rating: row.rating as RatingValue,
      });
    }

    for (const row of episodeRatingsRows) {
      if (!row.createdAt) continue;
      merged.push({
        id: `re:${row.episodeId}`,
        type: "rating_episode",
        created_at: row.createdAt,
        title: {
          id: row.titleId,
          title: row.titleName,
          object_type: row.objectType,
          poster_url: row.posterUrl,
          runtime_minutes: row.runtimeMinutes,
        },
        episode: {
          id: row.episodeId,
          season_number: row.seasonNumber,
          episode_number: row.episodeNumber,
          name: row.episodeName,
        },
        rating: row.rating as RatingValue,
        review: row.review,
      });
    }

    for (const row of watchedTitlesRows) {
      if (!row.watchedAt) continue;
      merged.push({
        id: `wt:${row.titleId}`,
        type: "watched_title",
        created_at: row.watchedAt,
        title: {
          id: row.titleId,
          title: row.titleName,
          object_type: row.objectType,
          poster_url: row.posterUrl,
          runtime_minutes: row.runtimeMinutes,
        },
      });
    }

    for (const row of watchedEpisodesRows) {
      if (!row.watchedAt) continue;
      merged.push({
        id: `we:${row.episodeId}`,
        type: "watched_episode",
        created_at: row.watchedAt,
        title: {
          id: row.titleId,
          title: row.titleName,
          object_type: row.objectType,
          poster_url: row.posterUrl,
          runtime_minutes: row.runtimeMinutes,
        },
        episode: {
          id: row.episodeId,
          season_number: row.seasonNumber,
          episode_number: row.episodeNumber,
          name: row.episodeName,
        },
      });
    }

    for (const row of trackedRows) {
      if (!row.trackedAt) continue;
      merged.push({
        id: `tr:${row.titleId}`,
        type: "tracked",
        created_at: row.trackedAt,
        title: {
          id: row.titleId,
          title: row.titleName,
          object_type: row.objectType,
          poster_url: row.posterUrl,
          runtime_minutes: row.runtimeMinutes,
        },
        status: (row.userStatus as UserStatus | null) ?? null,
      });
    }

    for (const row of recommendationRows) {
      if (!row.createdAt) continue;
      merged.push({
        id: `rec:${row.id}`,
        type: "recommendation",
        created_at: row.createdAt,
        title: {
          id: row.titleId,
          title: row.titleName,
          object_type: row.objectType,
          poster_url: row.posterUrl,
          runtime_minutes: row.runtimeMinutes,
        },
        message: row.message,
      });
    }

    merged.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const { kindVisibility, viewerRelation, hiddenKeys } = options;

    const filtered = merged.filter((event) => {
      if (hiddenKeys?.has(`${event.type}::${event.id}`)) return false;
      if (kindVisibility && viewerRelation && viewerRelation !== "self") {
        const kindVis = kindVisibility[event.type];
        if (kindVis === "private") return false;
        if (kindVis === "friends_only" && viewerRelation !== "friend") return false;
      }
      return true;
    });

    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

    return {
      activities: page,
      has_more: hasMore,
      next_cursor: nextCursor,
    };
  });
}
