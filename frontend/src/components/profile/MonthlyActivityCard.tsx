import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DossierCard } from "./atoms/DossierCard";
import { Kicker } from "../design/Kicker";
import { MonthlyBars } from "./atoms/MonthlyBars";
import type { ProfileMonthlyActivity } from "../../types";

interface MonthlyActivityCardProps {
  monthly: ProfileMonthlyActivity[];
}

const EPISODE_COLOR = "#fbbf24";
const MOVIE_COLOR = "oklch(0.68 0.13 240)";

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-sm"
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export default function MonthlyActivityCard({ monthly }: MonthlyActivityCardProps) {
  const { t } = useTranslation();
  const totals = useMemo(() => {
    let episodes = 0;
    let movies = 0;
    for (const m of monthly) {
      episodes += m.episodes_watched;
      movies += m.movies_watched;
    }
    return { episodes, movies };
  }, [monthly]);

  if (monthly.length === 0) return null;

  return (
    <DossierCard padding="lg">
      <div className="flex items-baseline justify-between mb-3.5 gap-4">
        <div>
          <Kicker color="zinc">{t("userProfile.dossier.activity12m")}</Kicker>
          <div className="text-base font-bold text-zinc-100">
            {t("userProfile.dossier.activitySummary", {
              episodes: totals.episodes,
              movies: totals.movies,
            })}
          </div>
        </div>
        <div className="flex gap-3.5 text-[11px] text-zinc-400">
          <Legend color={EPISODE_COLOR} label={t("userProfile.dossier.legendEpisodes")} />
          <Legend color={MOVIE_COLOR} label={t("userProfile.dossier.legendMovies")} />
        </div>
      </div>
      <MonthlyBars monthly={monthly} episodeColor={EPISODE_COLOR} movieColor={MOVIE_COLOR} />
    </DossierCard>
  );
}
