import type { Achievement } from "../definitions";

export const socialAchievements: Achievement[] = [
  { key: "first_recommendation", kind: "social_first_recommendation", threshold: 1, points: 5, title: "Word of Mouth", description: "Send your first recommendation", icon: "MessageCircle" },
  { key: "first_follow",         kind: "social_first_follow",         threshold: 1, points: 5, title: "Friend Indeed",  description: "Follow your first user",        icon: "UserPlus" },
];
