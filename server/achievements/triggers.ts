import { ACHIEVEMENTS, type AchievementKind } from "./definitions";
import {
  evaluateCountMovies,
  evaluateCountEpisodes,
  evaluateStreak,
  evaluateSocialFirstFollow,
  evaluateSocialFirstRecommendation,
} from "./evaluate";
import { upsertUserAchievement } from "../db/repository/achievements";
import { bumpStreak } from "../db/repository/streaks";
import { getEpisodeTitleId } from "../db/repository";
import { enqueueJob } from "../jobs/queue";
import { logger } from "../logger";

const log = logger.child({ module: "achievement-triggers" });

async function evaluateAndPersist(
  userId: string,
  key: string,
  kind: AchievementKind,
  evaluator: () => Promise<{ progress: number; earned: boolean }>
): Promise<void> {
  const result = await evaluator();
  const earnedAt = result.earned ? new Date().toISOString() : null;
  const { newlyEarned } = await upsertUserAchievement(userId, key, result.progress, earnedAt);
  if (newlyEarned) {
    log.info("Achievement newly earned", { userId, key, kind, progress: result.progress });
  }
}

/**
 * Called after watchTitle + logWatch (movies only triggers count_movies inline)
 */
export async function onWatchedTitle(userId: string, titleId: string, isMovie?: boolean): Promise<void> {
  try {
    await bumpStreak(userId);

    // Inline: count_movies (only if this is a movie)
    if (isMovie) {
      for (const a of ACHIEVEMENTS.filter((a) => a.kind === "count_movies")) {
        await evaluateAndPersist(userId, a.key, a.kind, () =>
          evaluateCountMovies(userId, a.threshold)
        );
      }
    }

    // Inline: streak_days
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "streak_days")) {
      await evaluateAndPersist(userId, a.key, a.kind, () =>
        evaluateStreak(userId, a.threshold)
      );
    }

    // Deferred: completionist + genre_count
    enqueueJob("evaluate-achievements", { userId, kinds: ["completionist", "genre_count"] as AchievementKind[], titleId });
  } catch (err) {
    log.error("onWatchedTitle trigger failed", { userId, titleId, err });
  }
}

/**
 * Called after watchEpisode + logWatch
 */
export async function onWatchedEpisode(userId: string, episodeId: string, watchedAt?: string): Promise<void> {
  try {
    await bumpStreak(userId, watchedAt);

    // Inline: count_episodes
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "count_episodes")) {
      await evaluateAndPersist(userId, a.key, a.kind, () =>
        evaluateCountEpisodes(userId, a.threshold)
      );
    }

    // Inline: streak_days
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "streak_days")) {
      await evaluateAndPersist(userId, a.key, a.kind, () =>
        evaluateStreak(userId, a.threshold)
      );
    }

    // Deferred: look up titleId then enqueue completionist + genre_count + speed_binge_season
    const titleId = await getEpisodeTitleId(parseInt(episodeId, 10));
    if (titleId) {
      enqueueJob("evaluate-achievements", {
        userId,
        kinds: ["completionist", "genre_count", "speed_binge_season"] as AchievementKind[],
        titleId,
      });
    }
  } catch (err) {
    log.error("onWatchedEpisode trigger failed", { userId, episodeId, err });
  }
}

/**
 * Called after watchEpisodesBulk + logWatch loop
 */
export async function onWatchedEpisodesBulk(
  userId: string,
  episodeIds: (string | number)[],
  titleIds: Set<string>,
  watchedAt?: string
): Promise<void> {
  try {
    await bumpStreak(userId, watchedAt);

    // Inline: count_episodes
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "count_episodes")) {
      await evaluateAndPersist(userId, a.key, a.kind, () =>
        evaluateCountEpisodes(userId, a.threshold)
      );
    }

    // Inline: streak_days
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "streak_days")) {
      await evaluateAndPersist(userId, a.key, a.kind, () =>
        evaluateStreak(userId, a.threshold)
      );
    }

    // Deferred: one job per distinct titleId
    for (const titleId of titleIds) {
      enqueueJob("evaluate-achievements", {
        userId,
        kinds: ["completionist", "genre_count", "speed_binge_season"] as AchievementKind[],
        titleId,
      });
    }
  } catch (err) {
    log.error("onWatchedEpisodesBulk trigger failed", { userId, err });
  }
}

/**
 * Called after follow()
 */
export async function onFollow(followerId: string): Promise<void> {
  try {
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "social_first_follow")) {
      await evaluateAndPersist(followerId, a.key, a.kind, () =>
        evaluateSocialFirstFollow(followerId)
      );
    }
    // No job enqueued for social triggers
  } catch (err) {
    log.error("onFollow trigger failed", { followerId, err });
  }
}

/**
 * Called after createRecommendation()
 */
export async function onRecommendation(fromUserId: string): Promise<void> {
  try {
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "social_first_recommendation")) {
      await evaluateAndPersist(fromUserId, a.key, a.kind, () =>
        evaluateSocialFirstRecommendation(fromUserId)
      );
    }
    // No job enqueued for social triggers
  } catch (err) {
    log.error("onRecommendation trigger failed", { fromUserId, err });
  }
}
