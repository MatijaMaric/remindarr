import { memo } from "react";
import { CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Episode } from "../types";
import {
  formatEpisodeCode,
  getEpisodeCardImageUrl,
  isEpisodeReleased,
} from "./EpisodeComponents";
import WatchButtonGroup from "./WatchButtonGroup";
import EpisodeCountdown from "./EpisodeCountdown";
import { MediaCard } from "./MediaCard";

/** Shared card component used across Unwatched, Today, Coming Up, and Calendar sections */
export const EpisodeShowCard = memo(function EpisodeShowCard({
  episode,
  episodeCount,
  showActions,
  showCountdown,
  allEpisodeIds,
  onToggleWatched,
  onMarkAllWatched,
  isConfirming,
}: {
  episode: Episode;
  episodeCount: number;
  showActions?: boolean;
  showCountdown?: boolean;
  allEpisodeIds?: number[];
  onToggleWatched?: (id: number, current: boolean) => void;
  onMarkAllWatched?: (episodeIds: number[]) => void;
  isConfirming?: boolean;
}) {
  const { t } = useTranslation();
  const episodeLink = `/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`;

  return (
    <MediaCard
      aspect="video"
      hoverZoom={false}
      to={episodeLink}
      imageUrl={getEpisodeCardImageUrl(episode)}
      imageAlt={episode.name || formatEpisodeCode(episode)}
      badge={
        episodeCount > 1
          ? { label: `${episodeCount} new`, tone: "neutral" }
          : undefined
      }
      titleTo={`/title/${episode.title_id}`}
      title={episode.show_title}
      titleClamp={1}
      subtitleTo={episodeLink}
      subtitle={
        <>
          <span className="text-amber-400 font-medium">
            {formatEpisodeCode(episode)}
          </span>
          {episode.name && (
            <span className="text-zinc-400"> · {episode.name}</span>
          )}
        </>
      }
      meta={
        showCountdown ? (
          <EpisodeCountdown airDate={episode.air_date} />
        ) : (
          <>
            {t("home.season", { number: episode.season_number })} ·{" "}
            {t("home.episodesRemaining", { count: episodeCount })}
          </>
        )
      }
      footer={
        <>
          {isEpisodeReleased(episode) && (
            <WatchButtonGroup offers={episode.offers ?? []} variant="dropdown" />
          )}
          {showActions && onToggleWatched && (
            <div className="space-y-1.5">
              <button
                onClick={() => onToggleWatched(episode.id, !!episode.is_watched)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <CheckCircle size={14} />
                {t("home.markWatched")}
              </button>
              {episodeCount > 1 && allEpisodeIds && onMarkAllWatched && (
                <button
                  onClick={() => onMarkAllWatched(allEpisodeIds)}
                  className={`w-full text-center text-xs transition-colors cursor-pointer ${
                    isConfirming
                      ? "text-red-400 hover:text-red-300 font-medium"
                      : "text-zinc-400 hover:text-emerald-400"
                  }`}
                >
                  {isConfirming
                    ? t("home.confirmMarkAllWatched", {
                        count: allEpisodeIds.length,
                      })
                    : t("home.markAllWatched")}
                </button>
              )}
            </div>
          )}
        </>
      }
    />
  );
});

/** Deck-of-cards visual wrapper */
export function DeckCardWrapper({ episodeCount, children }: { episodeCount: number; children: React.ReactNode }) {
  return (
    <div className="relative pb-2">
      {/* Second offset layer (deepest) */}
      {episodeCount > 2 && (
        <div className="absolute inset-0 translate-y-3 scale-[0.96] opacity-35 bg-zinc-800 border border-white/[0.06] rounded-xl pointer-events-none" />
      )}
      {/* First offset layer */}
      {episodeCount > 1 && (
        <div className="absolute inset-0 translate-y-1.5 scale-[0.98] opacity-60 bg-zinc-800 border border-white/[0.06] rounded-xl pointer-events-none" />
      )}
      <div className="relative border border-white/[0.06] rounded-xl overflow-hidden">{children}</div>
    </div>
  );
}
