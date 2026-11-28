import {
  ACHIEVEMENTS,
  type AchievementKind,
} from "../achievements/definitions";
import {
  evaluateAchievement,
  type AchievementEvaluation,
} from "../achievements/evaluate";
import {
  upsertUserAchievements,
  appendUserAchievementEarns,
  type UserAchievementUpsert,
} from "../db/repository/achievements";
import { logger } from "../logger";
import { recomputeStreakFromHistory } from "../db/repository/streaks";

const log = logger.child({ module: "evaluate-achievements" });

/**
 * Core handler logic — shared between Bun (registerHandler) and CF Workers (processor.ts).
 */
export async function runEvaluateAchievements(
  data: string | null,
): Promise<void> {
  const raw = typeof data === "string" ? JSON.parse(data) : data;
  const { userId, kinds, titleId } = (raw ?? {}) as {
    userId: string;
    kinds: unknown[];
    titleId?: string;
  };

  if (!userId || !Array.isArray(kinds)) {
    log.warn("evaluate-achievements: invalid job data");
    return;
  }

  const pending: Array<
    UserAchievementUpsert & {
      kind: AchievementKind;
      newEarns?: AchievementEvaluation["newEarns"];
    }
  > = [];

  for (const kind of new Set(kinds)) {
    const matchingAchievements = ACHIEVEMENTS.filter((a) => a.kind === kind);

    for (const a of matchingAchievements) {
      try {
        const result = await evaluateAchievement(userId, a, { titleId });
        if (result) pending.push({ key: a.key, kind: a.kind, ...result });
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

  if (pending.length === 0) return;

  try {
    const results = await upsertUserAchievements(userId, pending);
    for (const item of pending) {
      try {
        if (item.newEarns && item.newEarns.length > 0) {
          await appendUserAchievementEarns(userId, item.key, item.newEarns);
          log.info("Repeatable achievement newly earned (deferred)", {
            userId,
            key: item.key,
            kind: item.kind,
            newEarns: item.newEarns.length,
          });
          continue;
        }
        if (results.get(item.key)?.newlyEarned) {
          log.info("Achievement newly earned (deferred)", {
            userId,
            key: item.key,
            kind: item.kind,
          });
        }
      } catch (err) {
        log.error("evaluate-achievements: error evaluating achievement", {
          userId,
          key: item.key,
          kind: item.kind,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    log.error("evaluate-achievements: error persisting achievements", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const backfillLog = logger.child({ module: "backfill-achievements" });

export async function backfillUserAchievements(userId: string): Promise<void> {
  await recomputeStreakFromHistory(userId);

  const pending: Array<UserAchievementUpsert & AchievementEvaluation> = [];
  for (const def of ACHIEVEMENTS) {
    try {
      const result = await evaluateAchievement(userId, def, { backfill: true });
      if (result) pending.push({ key: def.key, ...result, earnedNotified: 1 });
    } catch (err) {
      backfillLog.warn("Backfill: error evaluating achievement for user", {
        userId,
        key: def.key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (pending.length === 0) return;

  await upsertUserAchievements(userId, pending);
  for (const { key, newEarns } of pending) {
    if (!newEarns?.length) continue;
    try {
      await appendUserAchievementEarns(userId, key, newEarns);
    } catch (err) {
      backfillLog.warn(
        "Backfill: error persisting repeatable achievement earns",
        {
          userId,
          key,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
  }
}
