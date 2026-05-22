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
      // one-shot: amber-400 fallback
      ringClass = "ring-2 ring-amber-400/50";
      bgClass = "bg-amber-400/10";
      iconColorClass = "text-amber-400";
      textColorClass = "text-amber-400";
    }
  }

  const iconSize = compact ? 14 : 18;
  const href = `${baseHref}/${key}`;

  return (
    <Link
      to={href}
      className={cn(
        "relative flex flex-col gap-1.5 rounded-lg border transition-opacity",
        compact ? "p-2" : "p-3",
        earned
          ? cn("border-white/10", bgClass, ringClass)
          : "bg-white/[0.03] border-white/[0.06] opacity-60",
      )}
      title={achievement.description}
    >
      {/* earnedCount chip — shown when earned more than once */}
      {earnedCount > 1 && (
        <span className="absolute top-1 right-1 text-[9px] font-mono font-semibold bg-white/10 text-zinc-300 rounded px-1 leading-4">
          ×{earnedCount}
        </span>
      )}

      {/* Icon */}
      <div className={cn(earned ? iconColorClass : "text-zinc-500")}>
        <BadgeIcon name={icon} size={iconSize} />
      </div>

      {/* Title */}
      <span
        className={cn(
          "font-semibold leading-tight truncate",
          compact ? "text-[10px]" : "text-[12px]",
          earned ? textColorClass || "text-zinc-200" : "text-zinc-400",
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
