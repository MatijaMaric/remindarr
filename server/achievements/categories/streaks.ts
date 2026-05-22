import type { Achievement } from "../definitions";

export const streakAchievements: Achievement[] = [
  {
    key: "streak_3",
    kind: "streak_days",
    threshold: 3,
    points: 10,
    title: "3-Day Streak",
    description: "Watch 3 days in a row",
    icon: "Flame",
  },
  {
    key: "streak_7",
    kind: "streak_days",
    threshold: 7,
    points: 25,
    title: "Week Warrior",
    description: "Watch 7 days in a row",
    icon: "Flame",
  },
  {
    key: "streak_14",
    kind: "streak_days",
    threshold: 14,
    points: 60,
    title: "Fortnight Fan",
    description: "Watch 14 days in a row",
    icon: "Flame",
  },
  {
    key: "streak_30",
    kind: "streak_days",
    threshold: 30,
    points: 150,
    title: "Month Master",
    description: "Watch 30 days in a row",
    icon: "Flame",
  },
];
