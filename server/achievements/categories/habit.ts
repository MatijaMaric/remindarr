import type { Achievement } from "../definitions";

export const habitAchievements: Achievement[] = [
  {
    key: "monthly_centurion",
    kind: "monthly_count_repeatable",
    threshold: 100,
    points: 75,
    title: "Centurion",
    description: "Watch 100 episodes in a calendar month",
    icon: "Trophy",
    repeatable: true,
    repeatPeriod: "monthly",
  },
  {
    key: "weekend_warrior",
    kind: "weekend_warrior_repeatable",
    threshold: 20,
    points: 30,
    title: "Weekend Warrior",
    description: "Watch 20 episodes on a single weekend (Sat + Sun)",
    icon: "CalendarDays",
    repeatable: true,
    repeatPeriod: "weekly",
  },
];
