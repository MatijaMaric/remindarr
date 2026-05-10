import type { Achievement } from "../definitions";

export const specialAchievements: Achievement[] = [
  { key: "completionist_first", kind: "completionist",     threshold: 1, points: 30, title: "Completionist", description: "Finish every released episode of a show",               icon: "CheckCircle2" },
  { key: "binge_season_24h",    kind: "speed_binge_season", threshold: 8, windowHours: 24, points: 50, title: "Speedrun", description: "Watch 8 episodes of one season in 24 hours", icon: "Zap" },
];
