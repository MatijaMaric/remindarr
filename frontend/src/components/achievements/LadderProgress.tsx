import { cn } from "@/lib/utils";
import { tierFromRung, TIER_COLORS } from "./tier";

interface Rung {
  key: string;
  title: string;
  threshold: number;
  rungIndex: number;
  earned: boolean;
}

interface LadderProgressProps {
  rungs: Rung[];
  currentKey: string;
}

export function LadderProgress({ rungs, currentKey }: LadderProgressProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {rungs.map((rung) => {
        const { tier } = tierFromRung(rung.rungIndex);
        const colors = TIER_COLORS[tier];
        const isCurrent = rung.key === currentKey;
        return (
          <div
            key={rung.key}
            title={`${rung.title} (${rung.threshold})`}
            className={cn(
              "w-3 h-3 rounded-full border transition-all",
              rung.earned
                ? cn(colors.ring, colors.bg, "border-transparent")
                : "border-zinc-600 bg-zinc-800",
              isCurrent && "ring-2 ring-offset-1 ring-offset-zinc-900 scale-125"
            )}
          />
        );
      })}
    </div>
  );
}
