import { memo } from "react";
import { Link } from "react-router";
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
  const imageUrl = getEpisodeCardImageUrl(episode);

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden flex flex-col h-full">
      {/* Episode image with badge */}
      <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`} className="block relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={episode.name || formatEpisodeCode(episode)}
            className="w-full aspect-video object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-video bg-gradient-to-b from-zinc-800 to-zinc-950" />
        )}
        {episodeCount > 1 && (
          <span className="absolute top-2 right-2 bg-black/75 backdrop-blur-sm text-zinc-100 font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full">
            {episodeCount} new
          </span>
        )}
      </Link>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <Link to={`/title/${episode.title_id}`} className="hover:text-amber-400 transition-colors">
          <h3 className="font-semibold text-white text-sm truncate">{episode.show_title}</h3>
        </Link>
        <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`} className="hover:text-amber-400 transition-colors">
          <p className="text-xs mt-0.5">
            <span className="text-amber-400 font-medium">{formatEpisodeCode(episode)}</span>
            {episode.name && <span className="text-zinc-400"> · {episode.name}</span>}
          </p>
        </Link>

        {/* Season + progress / countdown */}
        {showCountdown ? (
          <div className="mt-1.5">
            <EpisodeCountdown airDate={episode.air_date} />
          </div>
        ) : (
          <p className="text-xs text-zinc-500 mt-1.5">
            {t("home.season", { number: episode.season_number })} · {t("home.episodesRemaining", { count: episodeCount })}
          </p>
        )}

        {/* Stream button — only for released episodes */}
        {isEpisodeReleased(episode) && (
          <div className="mt-2">
            <WatchButtonGroup offers={episode.offers ?? []} variant="dropdown" />
          </div>
        )}

        {/* Actions (only for Unwatched) */}
        {showActions && onToggleWatched && (
          <div className="mt-auto pt-3 space-y-1.5">
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
                  ? t("home.confirmMarkAllWatched", { count: allEpisodeIds.length })
                  : t("home.markAllWatched")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
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
