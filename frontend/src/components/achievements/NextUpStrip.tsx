import ScrollableRow from "../ScrollableRow";
import { BadgeTile } from "./BadgeTile";
import type { UserAchievement } from "../../types";

export interface NextUpStripProps {
  achievements: UserAchievement[];
  mode: "self" | "other";
  baseHref?: string;
}

export function NextUpStrip({ achievements, mode, baseHref }: NextUpStripProps) {
  const inProgress = achievements
    .filter((a) => !a.earned && a.progress > 0)
    .sort((a, b) => b.progress / b.threshold - a.progress / a.threshold)
    .slice(0, 6);

  if (inProgress.length === 0) {
    return null;
  }

  return (
    <ScrollableRow className="gap-2 pb-1">
      {inProgress.map((a) => (
        <div key={a.key} className="flex-none w-28">
          <BadgeTile achievement={a} mode={mode} compact baseHref={baseHref} />
        </div>
      ))}
    </ScrollableRow>
  );
}
