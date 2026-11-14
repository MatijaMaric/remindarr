import { Flame } from "lucide-react";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import type { StreakData } from "../../types";

interface StreakCounterProps {
  streak: StreakData;
  variant: "sidebar" | "home" | "inline";
}

const TOOLTIP = "Streak resets at midnight UTC";

function StreakDisplay({ streak }: { streak: StreakData }) {
  return (
    <div className="flex items-center gap-2" title={TOOLTIP}>
      <Flame className="text-primary-text shrink-0" size={20} />
      <span className="text-2xl font-extrabold text-primary-text tabular-nums">
        {streak.currentStreak}
      </span>
      <span className="text-sm text-muted-foreground font-medium">
        day streak
      </span>
    </div>
  );
}

export default function StreakCounter({ streak, variant }: StreakCounterProps) {
  if (variant === "sidebar") {
    return (
      <DossierCard>
        <Kicker>Streak</Kicker>
        <StreakDisplay streak={streak} />
        {streak.longestStreak > 0 && (
          <p className="text-xs text-muted-foreground font-mono mt-1.5">
            Longest: {streak.longestStreak} days
          </p>
        )}
      </DossierCard>
    );
  }

  if (variant === "home") {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary-soft border border-primary-border"
        title={TOOLTIP}
      >
        <Flame className="text-primary-text shrink-0" size={22} />
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-primary-text tabular-nums">
              {streak.currentStreak}
            </span>
            <span className="text-sm text-foreground-secondary font-medium">
              day streak
            </span>
          </div>
          {streak.longestStreak > 0 && (
            <p className="text-[11px] text-muted-foreground font-mono">
              Longest: {streak.longestStreak} days
            </p>
          )}
        </div>
      </div>
    );
  }

  // inline variant
  return (
    <span
      className="inline-flex items-center gap-1.5 text-primary-text font-bold"
      title={TOOLTIP}
    >
      <Flame size={16} />
      <span className="text-base tabular-nums">{streak.currentStreak}</span>
      <span className="text-xs text-muted-foreground font-medium">
        day streak
      </span>
    </span>
  );
}
