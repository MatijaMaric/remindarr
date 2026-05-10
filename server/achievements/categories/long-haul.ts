import type { Achievement } from "../definitions";

export const longHaulAchievements: Achievement[] = [
  // Long film — one-shot
  { key: "long_film_first", kind: "long_film",            threshold: 1,  points: 30,  title: "The Long Haul",    description: "Watch a film 3+ hours long",             icon: "Timer" },
  // Miniseries completionist ladder
  { key: "miniseries_1",    kind: "miniseries_completed", threshold: 1,  points: 25,  title: "Mini Marathoner I",  description: "Complete 1 miniseries",  icon: "BookCheck" },
  { key: "miniseries_5",    kind: "miniseries_completed", threshold: 5,  points: 75,  title: "Mini Marathoner II", description: "Complete 5 miniseries",  icon: "BookCheck" },
  // Deep show completionist ladder
  { key: "deep_show_1",     kind: "deep_show_completed",  threshold: 1,  points: 50,  title: "Marathon Finisher I",  description: "Complete a show with 10+ seasons",  icon: "Award" },
  { key: "deep_show_3",     kind: "deep_show_completed",  threshold: 3,  points: 150, title: "Marathon Finisher II", description: "Complete 3 shows with 10+ seasons",  icon: "Award" },
];
