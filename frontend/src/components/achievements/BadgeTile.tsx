import { Link } from "react-router";
import {
  Film,
  Tv,
  Flame,
  Swords,
  Laugh,
  Skull,
  Sparkles,
  Compass,
  CheckCircle2,
  MessageCircle,
  UserPlus,
  Zap,
  Trophy,
  type LucideProps,
} from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { cn } from "@/lib/utils";
import { ThinProgress } from "../profile/atoms/ThinProgress";
import { tierFromRung, TIER_COLORS } from "./tier";
import type { UserAchievement } from "../../types";

type IconComponent = ForwardRefExoticComponent<
  Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
>;

const ICON_MAP: Record<string, IconComponent> = {
  Film,
  Tv,
  Flame,
  Swords,
  Laugh,
  Skull,
  Sparkles,
  Compass,
  CheckCircle2,
  MessageCircle,
  UserPlus,
  Zap,
};

function BadgeIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name] ?? Trophy;
  return <Icon size={size} />;
}

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
  const {
    key,
    icon,
    title,
    earned,
    progress,
    threshold,
    earnedCount,
    rungIndex,
    tier,
  } = achievement;

  // Other users only see earned badges
  if (!earned && mode === "other") {
    return null;
  }

  // Determine tier styling
  let ringClass = "";
  let bgClass = "";
  let iconColorClass = "";
  let textColorClass = "";

  if (earned) {
    if (tier === "ladder" && rungIndex !== null) {
      const { tier: t } = tierFromRung(rungIndex);
      const style = TIER_COLORS[t];
      ringClass = style.ring;
      bgClass = style.bg;
      iconColorClass = style.icon;
      textColorClass = style.text;
    } else {
      // one-shot: accent fallback
      ringClass = "ring-2 ring-primary-border";
      bgClass = "bg-primary-soft";
      iconColorClass = "text-primary-text";
      textColorClass = "text-primary-text";
    }
  }

  const iconSize = compact ? 14 : 18;
  const href = `${baseHref}/${key}`;

  return (
    <Link
      to={href}
      className={cn(
        "relative flex flex-col gap-1.5 rounded-md border transition-opacity",
        compact ? "p-2" : "p-3",
        earned
          ? cn("border-border", bgClass, ringClass)
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
      <div className={cn(earned ? iconColorClass : "text-muted-foreground")}>
        <BadgeIcon name={icon} size={iconSize} />
      </div>

      {/* Title */}
      <span
        className={cn(
          "font-semibold leading-tight truncate",
          compact ? "text-[11px]" : "text-[12px]",
          earned
            ? textColorClass || "text-foreground-secondary"
            : "text-muted-foreground",
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
