import { memo, useCallback } from "react";
import { Link } from "react-router";
import { CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import FullBleedCarousel from "./FullBleedCarousel";
import { posterUrl as buildPosterUrl } from "../lib/tmdb-images";
import type { UpNextItem } from "../api";

// ─── Individual cards ──────────────────────────────────────────────────────

function EpisodeCard({
  item,
  onMarkWatched,
}: {
  item: UpNextItem;
  onMarkWatched: (episodeId: number) => void;
}) {
  const { t } = useTranslation();
  const posterSrc = buildPosterUrl(item.posterUrl, "w342");

  const hasEpisode = item.nextEpisodeId != null;

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden flex flex-col h-full border border-white/[0.06]">
      {/* Poster */}
      <Link to={`/title/${item.titleId}`} className="block relative">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={item.title}
            className="w-full aspect-[2/3] object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-gradient-to-b from-zinc-800 to-zinc-950 flex items-center justify-center text-zinc-600 text-xs">
            N/A
          </div>
        )}
        {/* Kind badge */}
        <span className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-[10px] font-bold font-mono px-2 py-0.5 rounded-full text-amber-400">
          {item.kind === "in_progress" ? t("home.upNext.inProgress") : t("home.upNext.newEpisodes")}
        </span>
        {/* Unwatched count badge */}
        {item.unwatchedCount != null && item.unwatchedCount > 1 && (
          <span className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-zinc-100 font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full">
            +{item.unwatchedCount}
          </span>
        )}
      </Link>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <Link to={`/title/${item.titleId}`} className="hover:text-amber-400 transition-colors">
          <h3 className="font-semibold text-white text-sm truncate">{item.title}</h3>
        </Link>
        {hasEpisode && (
          <p className="text-xs mt-0.5">
            <span className="text-amber-400 font-medium">
              S{String(item.nextEpisodeSeason).padStart(2, "0")}·E{String(item.nextEpisodeNumber).padStart(2, "0")}
            </span>
            {item.nextEpisodeTitle && (
              <span className="text-zinc-400"> · {item.nextEpisodeTitle}</span>
            )}
          </p>
        )}

        {/* Mark watched button */}
        {hasEpisode && (
          <div className="mt-auto pt-3">
            <button
              onClick={() => onMarkWatched(item.nextEpisodeId!)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <CheckCircle size={14} />
              {t("home.markWatched")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationCard({ item }: { item: UpNextItem }) {
  const posterSrc = buildPosterUrl(item.posterUrl, "w185");

  return (
    <Link
      to={`/title/${item.titleId}`}
      className="flex flex-col group"
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 ring-2 ring-amber-500/60 border border-white/[0.06]">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
            width={185}
            height={278}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
            N/A
          </div>
        )}
        {/* Recommended badge */}
        <span className="absolute top-2 left-2 bg-amber-500/90 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
          Rec
        </span>
      </div>
      <p className="text-sm text-white mt-1.5 line-clamp-2 group-hover:text-amber-400 transition-colors">
        {item.title}
      </p>
      {item.recommendedBy && (
        <p className="text-xs text-zinc-400 truncate">from @{item.recommendedBy}</p>
      )}
    </Link>
  );
}

// ─── UpNextRow ─────────────────────────────────────────────────────────────

interface UpNextRowProps {
  items: UpNextItem[];
  onMarkWatched: (episodeId: number) => void;
}

export const UpNextRow = memo(function UpNextRow({ items, onMarkWatched }: UpNextRowProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <p className="text-zinc-500 text-sm">{t("home.upNext.empty")}</p>
    );
  }

  return (
    <FullBleedCarousel>
      {items.map((item, idx) => {
        const key = `${item.kind}-${item.titleId}-${idx}`;
        if (item.kind === "recommendation") {
          return (
            <div key={key} className="w-32 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
              <RecommendationCard item={item} />
            </div>
          );
        }
        return (
          <div key={key} className="w-52 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
            <EpisodeCard item={item} onMarkWatched={onMarkWatched} />
          </div>
        );
      })}
    </FullBleedCarousel>
  );
});

/**
 * Hook for handling mark-watched from UpNextRow cards. Returns a stable
 * callback that can be passed to UpNextRow and internally delegates to the
 * watchEpisode API + calls the provided refresh function.
 */
export function useUpNextMarkWatched(
  onWatched: (episodeId: number) => void,
): (episodeId: number) => void {
  const { t: _t } = useTranslation();
  return useCallback(
    (episodeId: number) => {
      onWatched(episodeId);
    },
    [onWatched],
  );
}

export default UpNextRow;
