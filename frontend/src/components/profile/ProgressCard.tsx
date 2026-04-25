import { useTranslation } from "react-i18next";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import { ThinProgress } from "./atoms/ThinProgress";
import { StatBlock } from "./atoms/StatBlock";
import type { UserProfileOverview } from "../../types";

interface ProgressCardProps {
  overview: UserProfileOverview;
}

function LabeledProgress({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1.5">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-zinc-200">
          {value}/{max}
        </span>
      </div>
      <ThinProgress value={value} max={max} />
    </div>
  );
}

function formatWatchTime(minutes: number): string {
  if (!minutes) return "0h";
  const hours = Math.round(minutes / 60);
  if (hours < 1000) return `${hours}h`;
  return `${Math.round(hours / 100) / 10}kh`;
}

export default function ProgressCard({ overview }: ProgressCardProps) {
  const { t } = useTranslation();
  return (
    <DossierCard>
      <Kicker color="zinc">{t("userProfile.dossier.progress")}</Kicker>
      <div className="flex flex-col gap-3.5">
        <LabeledProgress
          label={t("userProfile.showsCompleted")}
          value={overview.shows_completed}
          max={Math.max(overview.shows_total, overview.shows_completed, 1)}
        />
        <LabeledProgress
          label={t("userProfile.episodesWatched")}
          value={overview.total_watched_episodes}
          max={Math.max(overview.total_released_episodes, overview.total_watched_episodes, 1)}
        />
        <div className="grid grid-cols-2 gap-3.5 pt-2.5 border-t border-white/[0.04]">
          <StatBlock
            value={formatWatchTime(overview.watch_time_minutes)}
            label={t("userProfile.dossier.watchTime")}
            sub={t("userProfile.dossier.watchTimeSub")}
          />
          <StatBlock value={overview.watched_movies} label={t("userProfile.movies")} />
          <StatBlock value={overview.tracked_count} label={t("userProfile.trackedTitles")} />
          <StatBlock value={overview.watched_episodes} label={t("userProfile.dossier.legendEpisodes")} />
        </div>
      </div>
    </DossierCard>
  );
}
