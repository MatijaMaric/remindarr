import { Link } from "react-router";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import { BadgeTile } from "../achievements/BadgeTile";
import type { UserAchievement } from "../../types";

interface ProfileBadgesSummaryProps {
  achievements: UserAchievement[];
  mode: "self" | "other";
  viewAllHref: string;
}

export default function ProfileBadgesSummary({
  achievements,
  mode,
  viewAllHref,
}: ProfileBadgesSummaryProps) {
  if (achievements.length === 0) return null;

  const earned = achievements.filter((a) => a.earned);

  if (mode === "other" && earned.length === 0) return null;

  const totalXp = earned.reduce((sum, a) => sum + a.points, 0);

  const top3 = [...earned]
    .sort((a, b) => {
      const aTime = a.earnedAt ? new Date(a.earnedAt).getTime() : 0;
      const bTime = b.earnedAt ? new Date(b.earnedAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 3);

  return (
    <DossierCard>
      <div className="flex items-baseline justify-between mb-3">
        <Kicker color="zinc" className="mb-0">
          Achievements
        </Kicker>
        <span className="text-[11px] text-zinc-500 font-mono">
          {earned.length}/{achievements.length} · {totalXp} XP
        </span>
      </div>

      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {top3.map((a) => (
            <BadgeTile
              key={a.key}
              achievement={a}
              mode={mode}
              compact
              baseHref={viewAllHref}
            />
          ))}
        </div>
      )}

      <Link
        to={viewAllHref}
        className="text-xs text-zinc-400 hover:text-white transition-colors"
      >
        View all achievements →
      </Link>
    </DossierCard>
  );
}
