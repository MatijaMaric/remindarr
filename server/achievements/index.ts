export { ACHIEVEMENTS } from "./definitions";
export type { Achievement, AchievementKind } from "./definitions";
export { syncAchievementRegistry } from "./sync";
export {
  evaluateCountMovies,
  evaluateCountEpisodes,
  evaluateStreak,
  evaluateGenreCount,
  evaluateCompletionist,
  evaluateSocialFirstRecommendation,
  evaluateSocialFirstFollow,
  evaluateSpeedBingeSeason,
} from "./evaluate";
export type { EvalResult } from "./evaluate";
