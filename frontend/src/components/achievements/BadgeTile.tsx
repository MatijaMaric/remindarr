import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { ThinProgress } from "../profile/atoms/ThinProgress";
import { BadgeIcon } from "./icons";
import { earnedStyle } from "./tier";
import type { UserAchievement } from "../../types";

export interface BadgeTileProps {
  achievement: UserAchievement;
  mode: "self" | "other";
  compact?: boolean;
  baseHref?: string;
}

export function BadgeTile({
  achievement,
  mode,
  compact = false,
  baseHref = "/achievements",
}: BadgeTileProps) {
  const { key, icon, title, earned, progress, threshold, earnedCount } =
    achievement;

  // Other users only see earned badges
  if (!earned && mode === "other") {
    return null;
  }

  const style = earned ? earnedStyle(achievement) : null;

  const iconSize = compact ? 14 : 18;
  const href = `${baseHref}/${key}`;

  return (
    <Link
      to={href}
      className={cn(
        "relative flex flex-col gap-1.5 rounded-md border transition-opacity",
        compact ? "p-2" : "p-3",
        earned
          ? cn("border-border", style?.bg, style?.ring)
          : "bg-fill-subtle border-border opacity-60",
      )}
      title={achievement.description}
    >
      {/* earnedCount chip — shown when earned more than once */}
      {earnedCount > 1 && (
        <span className="absolute top-1 right-1 text-[11px] font-mono font-semibold bg-accent text-foreground-secondary rounded-sm px-1 leading-4">
          ×{earnedCount}
        </span>
      )}

      {/* Icon */}
      <div className={cn(style?.icon ?? "text-muted-foreground")}>
        <BadgeIcon name={icon} size={iconSize} />
      </div>

      {/* Title */}
      <span
        className={cn(
          "font-semibold leading-tight truncate",
          compact ? "text-[11px]" : "text-[12px]",
          earned ? style?.text : "text-muted-foreground",
        )}
      >
        {title}
      </span>

      {/* Progress bar for locked self-view */}
      {!earned && mode === "self" && (
        <ThinProgress
          value={progress}
          max={threshold}
          color="#71717a"
          height={3}
        />
      )}
    </Link>
  );
}
