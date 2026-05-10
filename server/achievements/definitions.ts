export type AchievementKind =
  | "count_movies"
  | "count_episodes"
  | "streak_days"
  | "genre_count"
  | "completionist"
  | "social_first_recommendation"
  | "social_first_follow"
  | "speed_binge_season";

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
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  // Milestone — movies
  { key: "movies_10",   kind: "count_movies",   threshold: 10,  points: 10,  title: "Cinephile I",    description: "Watch 10 movies",           icon: "Film" },
  { key: "movies_50",   kind: "count_movies",   threshold: 50,  points: 40,  title: "Cinephile II",   description: "Watch 50 movies",           icon: "Film" },
  { key: "movies_100",  kind: "count_movies",   threshold: 100, points: 100, title: "Cinephile III",  description: "Watch 100 movies",          icon: "Film" },
  { key: "movies_500",  kind: "count_movies",   threshold: 500, points: 400, title: "Film Fanatic",   description: "Watch 500 movies",          icon: "Film" },
  // Milestone — episodes
  { key: "episodes_100",  kind: "count_episodes", threshold: 100,  points: 20,  title: "Binge Starter",  description: "Watch 100 episodes",   icon: "Tv" },
  { key: "episodes_500",  kind: "count_episodes", threshold: 500,  points: 75,  title: "Couch Captain",  description: "Watch 500 episodes",   icon: "Tv" },
  { key: "episodes_1000", kind: "count_episodes", threshold: 1000, points: 200, title: "Marathon Mind",  description: "Watch 1000 episodes",  icon: "Tv" },
  // Streaks
  { key: "streak_3",   kind: "streak_days", threshold: 3,  points: 10,  title: "3-Day Streak",  description: "Watch 3 days in a row",   icon: "Flame" },
  { key: "streak_7",   kind: "streak_days", threshold: 7,  points: 25,  title: "Week Warrior",   description: "Watch 7 days in a row",   icon: "Flame" },
  { key: "streak_14",  kind: "streak_days", threshold: 14, points: 60,  title: "Fortnight Fan",  description: "Watch 14 days in a row",  icon: "Flame" },
  { key: "streak_30",  kind: "streak_days", threshold: 30, points: 150, title: "Month Master",   description: "Watch 30 days in a row",  icon: "Flame" },
  // Genre
  { key: "genre_action_25",  kind: "genre_count", threshold: 25, points: 40, title: "Action Hero",   description: "Watch 25 action titles",  icon: "Swords",  genre: "Action" },
  { key: "genre_comedy_25",  kind: "genre_count", threshold: 25, points: 40, title: "Laugh Track",   description: "Watch 25 comedy titles",  icon: "Laugh",   genre: "Comedy" },
  { key: "genre_horror_25",  kind: "genre_count", threshold: 25, points: 40, title: "Final Girl",    description: "Watch 25 horror titles",  icon: "Skull",   genre: "Horror" },
  { key: "genre_drama_25",   kind: "genre_count", threshold: 25, points: 40, title: "Drama Queen",   description: "Watch 25 drama titles",   icon: "Sparkles",genre: "Drama" },
  { key: "genre_explorer",   kind: "genre_count", threshold: 10, points: 50, title: "Genre Explorer", description: "Watch titles from 10 different genres", icon: "Compass", genre: "__any__" },
  // Completionist
  { key: "completionist_first", kind: "completionist", threshold: 1, points: 30, title: "Completionist", description: "Finish every released episode of a show", icon: "CheckCircle2" },
  // Social
  { key: "first_recommendation", kind: "social_first_recommendation", threshold: 1, points: 5,  title: "Word of Mouth", description: "Send your first recommendation", icon: "MessageCircle" },
  { key: "first_follow",         kind: "social_first_follow",         threshold: 1, points: 5,  title: "Friend Indeed",  description: "Follow your first user",        icon: "UserPlus" },
  // Speed
  { key: "binge_season_24h", kind: "speed_binge_season", threshold: 8, windowHours: 24, points: 50, title: "Speedrun", description: "Watch 8 episodes of one season in 24 hours", icon: "Zap" },
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
      repeatable: false,
    });
  }
  return result;
}

/** Pre-computed meta map — computed once at module load. */
export const ACHIEVEMENT_META: Map<string, AchievementMeta> = computeAchievementMeta(ACHIEVEMENTS);
