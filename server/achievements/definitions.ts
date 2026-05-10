import { watchingAchievements } from "./categories/watching";
import { streakAchievements } from "./categories/streaks";
import { genreAchievements } from "./categories/genres";
import { socialAchievements } from "./categories/social";
import { specialAchievements } from "./categories/special";
import { habitAchievements } from "./categories/habit";

export type AchievementKind =
  | "count_movies"
  | "count_episodes"
  | "streak_days"
  | "genre_count"
  | "completionist"
  | "social_first_recommendation"
  | "social_first_follow"
  | "speed_binge_season"
  | "monthly_count_repeatable"
  | "weekend_warrior_repeatable";

export type Category =
  | "watching"
  | "streaks"
  | "genres"
  | "social"
  | "special"
  | "explorer"
  | "habit"
  | "long-haul";

export interface Achievement {
  key: string;           // immutable PK — NEVER reused (orphan rows in user_achievements if renamed)
  kind: AchievementKind;
  threshold: number;     // movies/episodes/days/genre-count/episodes-per-season
  points: number;        // XP awarded on earn
  title: string;
  description: string;
  icon: string;          // lucide-react icon name
  genre?: string;        // required for kind === "genre_count"
  seasons?: number;      // completionist scope (optional)
  windowHours?: number;  // required for kind === "speed_binge_season"
  repeatable?: boolean;          // true for repeatable badges
  repeatPeriod?: "monthly" | "weekly" | null;  // period for auto-reset
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  ...watchingAchievements,
  ...streakAchievements,
  ...genreAchievements,
  ...socialAchievements,
  ...specialAchievements,
  ...habitAchievements,
];

export interface AchievementMeta {
  category: Category;
  family: string | null;
  rungIndex: number | null;
  tier: "ladder" | "one-shot";
  repeatable: boolean;
}

function deriveCategory(kind: AchievementKind): Category {
  switch (kind) {
    case "count_movies":
    case "count_episodes":
      return "watching";
    case "streak_days":
      return "streaks";
    case "genre_count":
      return "genres";
    case "social_first_recommendation":
    case "social_first_follow":
      return "social";
    case "completionist":
    case "speed_binge_season":
      return "special";
    case "monthly_count_repeatable":
    case "weekend_warrior_repeatable":
      return "habit";
  }
}

function deriveFamily(achievement: Achievement): string | null {
  switch (achievement.kind) {
    case "count_movies":
      return "movies";
    case "count_episodes":
      return "episodes";
    case "streak_days":
      return "streaks";
    case "genre_count":
      if (achievement.genre && achievement.genre !== "__any__") {
        return "genre_" + achievement.genre.toLowerCase();
      }
      return null;
    default:
      return null;
  }
}

/**
 * Pre-computes category, family, rungIndex, tier, and repeatable for each
 * achievement in the registry. Call once at module load; use the returned Map
 * in route handlers.
 */
export function computeAchievementMeta(
  achievements: readonly Achievement[],
): Map<string, AchievementMeta> {
  // Build family → sorted entries (by threshold asc) to assign rungIndex
  const familyBuckets = new Map<string, Achievement[]>();
  for (const a of achievements) {
    const family = deriveFamily(a);
    if (family !== null) {
      const bucket = familyBuckets.get(family) ?? [];
      bucket.push(a);
      familyBuckets.set(family, bucket);
    }
  }
  // Sort each bucket by threshold ascending
  for (const bucket of familyBuckets.values()) {
    bucket.sort((a, b) => a.threshold - b.threshold);
  }
  // Build rungIndex lookup: key → index within its family bucket
  const rungIndexByKey = new Map<string, number>();
  for (const bucket of familyBuckets.values()) {
    bucket.forEach((a, idx) => {
      rungIndexByKey.set(a.key, idx);
    });
  }

  const result = new Map<string, AchievementMeta>();
  for (const a of achievements) {
    const family = deriveFamily(a);
    const rungIndex = family !== null ? (rungIndexByKey.get(a.key) ?? null) : null;
    result.set(a.key, {
      category: deriveCategory(a.kind),
      family,
      rungIndex,
      tier: family !== null ? "ladder" : "one-shot",
      repeatable: a.repeatable ?? false,
    });
  }
  return result;
}

/** Pre-computed meta map — computed once at module load. */
export const ACHIEVEMENT_META: Map<string, AchievementMeta> = computeAchievementMeta(ACHIEVEMENTS);
