import ScrollableRow from "../ScrollableRow";
import { BadgeTile } from "./BadgeTile";
import type { UserAchievement } from "../../types";

/** Format an ISO date string as a relative label like "3d ago" or "just now". */
function formatRelative(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
}

export interface RecentlyEarnedStripProps {
  achievements: UserAchievement[];
  mode: "self" | "other";
  baseHref?: string;
}

export function RecentlyEarnedStrip({ achievements, mode, baseHref }: RecentlyEarnedStripProps) {
  const recent = achievements
    .filter((a) => a.earned)
    .sort((a, b) => {
      const aTime = a.earnedAt ? new Date(a.earnedAt).getTime() : 0;
      const bTime = b.earnedAt ? new Date(b.earnedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 8);

  if (recent.length === 0) {
    return null;
  }

  return (
    <ScrollableRow className="gap-2 pb-1">
      {recent.map((a) => (
        <div key={a.key} className="flex-none w-28 flex flex-col gap-1">
          <BadgeTile achievement={a} mode={mode} compact baseHref={baseHref} />
          {a.earnedAt && (
            <span className="text-[10px] text-zinc-500 text-center font-mono">
              {formatRelative(a.earnedAt)}
            </span>
          )}
        </div>
      ))}
    </ScrollableRow>
  );
}
