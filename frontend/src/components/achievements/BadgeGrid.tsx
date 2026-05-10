import { BadgeTile } from "./BadgeTile";
import type { UserAchievement } from "../../types";

export interface BadgeGridProps {
  achievements: UserAchievement[];
  mode: "self" | "other";
  baseHref?: string;
}

export function BadgeGrid({ achievements, mode, baseHref }: BadgeGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {achievements.map((a) => (
        <BadgeTile key={a.key} achievement={a} mode={mode} baseHref={baseHref} />
      ))}
    </div>
  );
}
