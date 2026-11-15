import type { Category } from "../../types";

export const CATEGORY_ORDER: Category[] = [
  "watching",
  "streaks",
  "genres",
  "social",
  "special",
  "explorer",
  "habit",
  "long-haul",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  watching: "Watching",
  streaks: "Streaks",
  genres: "Genres",
  social: "Social",
  special: "Special",
  explorer: "Explorer",
  habit: "Habit",
  "long-haul": "Long Haul",
};
