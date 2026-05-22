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
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import { ThinProgress } from "./atoms/ThinProgress";
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

interface BadgesCardProps {
  achievements: UserAchievement[];
  mode: "self" | "other";
}

export default function BadgesCard({ achievements, mode }: BadgesCardProps) {
  const earned = achievements.filter((a) => a.earned);
  const locked = achievements.filter((a) => !a.earned);
  const visible = mode === "self" ? achievements : earned;

  if (visible.length === 0 && mode === "other") return null;

  return (
    <DossierCard>
      <div className="flex items-baseline justify-between mb-3">
        <Kicker color="zinc" className="mb-0">
          Badges
        </Kicker>
        <span className="text-[11px] text-zinc-500 font-mono">
          {earned.length} / {achievements.length} earned
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-zinc-500">No badges yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {earned.map((a) => (
            <div
              key={a.key}
              className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-amber-400/[0.08] border border-amber-400/20"
              title={a.description}
            >
              <div className="flex items-center gap-1.5 text-amber-400">
                <BadgeIcon name={a.icon} size={16} />
                <span className="text-[12px] font-semibold text-zinc-200 truncate leading-tight">
                  {a.title}
                </span>
              </div>
            </div>
          ))}

          {mode === "self" &&
            locked.map((a) => (
              <div
                key={a.key}
                className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] opacity-60"
                title={a.description}
              >
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <BadgeIcon name={a.icon} size={16} />
                  <span className="text-[12px] font-semibold text-zinc-400 truncate leading-tight">
                    {a.title}
                  </span>
                </div>
                <ThinProgress
                  value={a.progress}
                  max={a.threshold}
                  color="#71717a"
                  height={3}
                />
              </div>
            ))}
        </div>
      )}
    </DossierCard>
  );
}
