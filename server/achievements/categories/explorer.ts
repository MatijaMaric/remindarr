import type { Achievement } from "../definitions";

export const explorerAchievements: Achievement[] = [
  // Decade explorer ladder
  { key: "decade_1",  kind: "decade_count",   threshold: 1,  points: 20,  title: "Time Traveler I",   description: "Watch titles from 1 different decade",   icon: "Clock" },
  { key: "decade_3",  kind: "decade_count",   threshold: 3,  points: 50,  title: "Time Traveler II",  description: "Watch titles from 3 different decades",  icon: "Clock" },
  { key: "decade_5",  kind: "decade_count",   threshold: 5,  points: 100, title: "Time Traveler III", description: "Watch titles from 5 different decades",  icon: "Clock" },
  { key: "decade_8",  kind: "decade_count",   threshold: 8,  points: 200, title: "Chrono Master",     description: "Watch titles from 8 different decades",  icon: "Clock" },
  // Language explorer ladder
  { key: "language_2",  kind: "language_count", threshold: 2,  points: 20,  title: "Polyglot I",   description: "Watch titles in 2 different languages",   icon: "Globe" },
  { key: "language_5",  kind: "language_count", threshold: 5,  points: 50,  title: "Polyglot II",  description: "Watch titles in 5 different languages",   icon: "Globe" },
  { key: "language_10", kind: "language_count", threshold: 10, points: 100, title: "Polyglot III", description: "Watch titles in 10 different languages",  icon: "Globe" },
];
