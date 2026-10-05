import { ACHIEVEMENTS, type AchievementKind } from "./definitions";
import {
  evaluateCountMovies,
  evaluateCountEpisodes,
  evaluateStreak,
  evaluateSocialFirstFollow,
  evaluateSocialFirstRecommendation,
  type RepeatEvalResult,
} from "./evaluate";
import {
  upsertUserAchievement,
  upsertUserAchievements,
  appendUserAchievementEarns,
} from "../db/repository/achievements";
import { bumpStreak } from "../db/repository/streaks";
import { getEpisodeTitleId } from "../db/repository";
import { enqueueAdhoc } from "../jobs/backend";
import { logger } from "../logger";

const log = logger.child({ module: "achievement-triggers" });

type OneShotUpdate = {
  key: string;
  kind: AchievementKind;
  progress: number;
  earnedAt: string | null;
};

async function evaluateOneShot(
  key: string,
  kind: AchievementKind,
  evaluator: () => Promise<{ progress: number; earned: boolean }>,
): Promise<OneShotUpdate> {
  const result = await evaluator();
  return {
    key,
    kind,
    progress: result.progress,
    earnedAt: result.earned ? new Date().toISOString() : null,
  };
}

async function persistOneShots(
  userId: string,
  pending: OneShotUpdate[],
): Promise<void> {
  if (pending.length === 0) return;
  const results = await upsertUserAchievements(
    userId,
    pending.map(({ key, progress, earnedAt }) => ({ key, progress, earnedAt })),
  );
  for (const item of pending) {
    if (!results.get(item.key)?.newlyEarned) continue;
    log.info("Achievement newly earned", {
      userId,
      key: item.key,
      kind: item.kind,
      progress: item.progress,
    });
  }
}

async function evaluateAndPersistRepeatable(
  userId: string,
  key: string,
  kind: AchievementKind,
  evaluator: () => Promise<RepeatEvalResult>,
): Promise<void> {
  const result = await evaluator();
  if (result.newEarns.length === 0) return;

  // Ensure there's a user_achievements row first (earned_at set to first earn)
  const firstEarnedAt = result.newEarns.reduce(
    (min, e) => (e.earnedAt < min ? e.earnedAt : min),
    result.newEarns[0].earnedAt,
  );
  await upsertUserAchievement(userId, key, result.progress, firstEarnedAt);
  await appendUserAchievementEarns(userId, key, result.newEarns);

  log.info("Repeatable achievement newly earned", {
    userId,
    key,
    kind,
    newEarns: result.newEarns.length,
  });
}

/**
 * Called after watchTitle + logWatch (movies only triggers count_movies inline)
 */
export async function onWatchedTitle(
  userId: string,
  titleId: string,
  isMovie?: boolean,
): Promise<void> {
  try {
    await bumpStreak(userId);

    const pending: OneShotUpdate[] = [];

    // Inline: count_movies (only if this is a movie)
    if (isMovie) {
      for (const a of ACHIEVEMENTS.filter((a) => a.kind === "count_movies")) {
        pending.push(
          await evaluateOneShot(a.key, a.kind, () =>
            evaluateCountMovies(userId, a.threshold),
          ),
        );
      }
    }

    // Inline: streak_days
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "streak_days")) {
      pending.push(
        await evaluateOneShot(a.key, a.kind, () =>
          evaluateStreak(userId, a.threshold),
        ),
      );
    }
    await persistOneShots(userId, pending);

    // Deferred: completionist + genre_count + explorer/long-haul
    await enqueueAdhoc("evaluate-achievements", {
      userId,
      kinds: [
        "completionist",
        "genre_count",
        "decade_count",
        "language_count",
        "long_film",
      ] as AchievementKind[],
      titleId,
    });
  } catch (err) {
    log.error("onWatchedTitle trigger failed", { userId, titleId, err });
  }
}

/**
 * Called after watchEpisode + logWatch
 */
export async function onWatchedEpisode(
  userId: string,
  episodeId: string,
  watchedAt?: string,
): Promise<void> {
  try {
    await bumpStreak(userId, watchedAt);

    const pending: OneShotUpdate[] = [];

    // Inline: count_episodes
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "count_episodes")) {
      pending.push(
        await evaluateOneShot(a.key, a.kind, () =>
          evaluateCountEpisodes(userId, a.threshold),
        ),
      );
    }

    // Inline: streak_days
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "streak_days")) {
      pending.push(
        await evaluateOneShot(a.key, a.kind, () =>
          evaluateStreak(userId, a.threshold),
        ),
      );
    }
    await persistOneShots(userId, pending);

    // Deferred: look up titleId then enqueue completionist + genre_count + speed_binge_season + repeatables + series kinds
    const titleId = await getEpisodeTitleId(parseInt(episodeId, 10));
    if (titleId) {
      await enqueueAdhoc("evaluate-achievements", {
        userId,
        kinds: [
          "completionist",
          "genre_count",
          "speed_binge_season",
          "monthly_count_repeatable",
          "weekend_warrior_repeatable",
          "miniseries_completed",
          "deep_show_completed",
        ] as AchievementKind[],
        titleId,
      });
    }
  } catch (err) {
    log.error("onWatchedEpisode trigger failed", { userId, episodeId, err });
  }
}

/**
 * Called after watchEpisodesBulk + logWatchBulk
 */
export async function onWatchedEpisodesBulk(
  userId: string,
  episodeIds: (string | number)[],
  titleIds: Set<string>,
  watchedAt?: string,
): Promise<void> {
  try {
    await bumpStreak(userId, watchedAt);

    const pending: OneShotUpdate[] = [];

    // Inline: count_episodes
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "count_episodes")) {
      pending.push(
        await evaluateOneShot(a.key, a.kind, () =>
          evaluateCountEpisodes(userId, a.threshold),
        ),
      );
    }

    // Inline: streak_days
    for (const a of ACHIEVEMENTS.filter((a) => a.kind === "streak_days")) {
      pending.push(
        await evaluateOneShot(a.key, a.kind, () =>
          evaluateStreak(userId, a.threshold),
        ),
      );
    }
    await persistOneShots(userId, pending);

    // Deferred: one job per distinct titleId
    for (const titleId of titleIds) {
      await enqueueAdhoc("evaluate-achievements", {
        userId,
        kinds: [
          "completionist",
          "genre_count",
          "speed_binge_season",
          "monthly_count_repeatable",
          "weekend_warrior_repeatable",
          "miniseries_completed",
          "deep_show_completed",
        ] as AchievementKind[],
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
    const pending: OneShotUpdate[] = [];
    for (const a of ACHIEVEMENTS.filter(
      (a) => a.kind === "social_first_follow",
    )) {
      pending.push(
        await evaluateOneShot(a.key, a.kind, () =>
          evaluateSocialFirstFollow(followerId),
        ),
      );
    }
    await persistOneShots(followerId, pending);
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
    const pending: OneShotUpdate[] = [];
    for (const a of ACHIEVEMENTS.filter(
      (a) => a.kind === "social_first_recommendation",
    )) {
      pending.push(
        await evaluateOneShot(a.key, a.kind, () =>
          evaluateSocialFirstRecommendation(fromUserId),
        ),
      );
    }
    await persistOneShots(fromUserId, pending);
    // No job enqueued for social triggers
  } catch (err) {
    log.error("onRecommendation trigger failed", { fromUserId, err });
  }
}
