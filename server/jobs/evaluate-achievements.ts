import { ACHIEVEMENTS, type AchievementKind } from "../achievements/definitions";
import {
  evaluateCountMovies,
  evaluateCountEpisodes,
  evaluateStreak,
  evaluateGenreCount,
  evaluateCompletionist,
  evaluateSpeedBingeSeason,
  evaluateSocialFirstFollow,
  evaluateSocialFirstRecommendation,
  evaluateMonthlyCountRepeatable,
  evaluateWeekendWarriorRepeatable,
  evaluateDecadeCount,
  evaluateLanguageCount,
  evaluateLongFilm,
  evaluateMiniseriesCompleted,
  evaluateDeepShowCompleted,
} from "../achievements/evaluate";
import { upsertUserAchievement, appendUserAchievementEarns } from "../db/repository/achievements";
import { logger } from "../logger";
import { registerHandler } from "./worker";

const log = logger.child({ module: "evaluate-achievements" });

/**
 * Core handler logic — shared between Bun (registerHandler) and CF Workers (processor.ts).
 */
export async function runEvaluateAchievements(data: string | null): Promise<void> {
  const raw = typeof data === "string" ? JSON.parse(data) : data;
  const { userId, kinds, titleId } = (raw ?? {}) as {
    userId: string;
    kinds: AchievementKind[];
    titleId?: string;
  };

  if (!userId || !Array.isArray(kinds)) {
    log.warn("evaluate-achievements: invalid job data");
    return;
  }

  for (const kind of kinds) {
    const matchingAchievements = ACHIEVEMENTS.filter((a) => a.kind === kind);

    for (const a of matchingAchievements) {
      try {
        // Handle repeatable kinds separately — they use append logic
        if (kind === "monthly_count_repeatable" || kind === "weekend_warrior_repeatable") {
          const repeatResult = kind === "monthly_count_repeatable"
            ? await evaluateMonthlyCountRepeatable(userId, a.threshold, a.key)
            : await evaluateWeekendWarriorRepeatable(userId, a.threshold, a.key);

          if (repeatResult.newEarns.length > 0) {
            const firstEarnedAt = repeatResult.newEarns.reduce(
              (min, e) => (e.earnedAt < min ? e.earnedAt : min),
              repeatResult.newEarns[0].earnedAt
            );
            await upsertUserAchievement(userId, a.key, repeatResult.progress, firstEarnedAt);
            await appendUserAchievementEarns(userId, a.key, repeatResult.newEarns);
            log.info("Repeatable achievement newly earned (deferred)", {
              userId,
              key: a.key,
              kind,
              newEarns: repeatResult.newEarns.length,
            });
          }
          continue;
        }

        let result: { progress: number; earned: boolean };

        switch (kind) {
          case "count_movies":
            result = await evaluateCountMovies(userId, a.threshold);
            break;
          case "count_episodes":
            result = await evaluateCountEpisodes(userId, a.threshold);
            break;
          case "streak_days":
            result = await evaluateStreak(userId, a.threshold);
            break;
          case "genre_count":
            result = await evaluateGenreCount(userId, a.threshold, a.genre ?? "__any__");
            break;
          case "completionist":
            result = await evaluateCompletionist(userId, a.threshold, titleId);
            break;
          case "speed_binge_season":
            if (!titleId) {
              // speed_binge_season requires a titleId — skip without titleId
              continue;
            }
            result = await evaluateSpeedBingeSeason(userId, a.threshold, a.windowHours ?? 24, titleId);
            break;
          case "social_first_follow":
            result = await evaluateSocialFirstFollow(userId);
            break;
          case "social_first_recommendation":
            result = await evaluateSocialFirstRecommendation(userId);
            break;
          case "decade_count":
            result = await evaluateDecadeCount(userId, a.threshold);
            break;
          case "language_count":
            result = await evaluateLanguageCount(userId, a.threshold);
            break;
          case "long_film":
            result = await evaluateLongFilm(userId);
            break;
          case "miniseries_completed":
            result = await evaluateMiniseriesCompleted(userId, a.threshold);
            break;
          case "deep_show_completed":
            result = await evaluateDeepShowCompleted(userId, a.threshold);
            break;
          default:
            // Unknown kind — skip gracefully
            log.warn("evaluate-achievements: unknown kind, skipping", { kind, userId });
            continue;
        }

        const earnedAt = result.earned ? new Date().toISOString() : null;
        const { newlyEarned } = await upsertUserAchievement(userId, a.key, result.progress, earnedAt);
        if (newlyEarned) {
          log.info("Achievement newly earned (deferred)", { userId, key: a.key, kind });
        }
      } catch (err) {
        log.error("evaluate-achievements: error evaluating achievement", {
          userId,
          key: a.key,
          kind,
          error: err instanceof Error ? err.message : String(err),
        });
        // Continue with other achievements even if one fails
      }
    }
  }
}

registerHandler("evaluate-achievements", (job) => runEvaluateAchievements(job.data));
