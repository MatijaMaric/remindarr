import { memo } from "react";
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
    <div className="bg-card rounded-lg overflow-hidden flex flex-col h-full border border-border">
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
          <div className="w-full aspect-[2/3] bg-gradient-to-b from-muted to-background flex items-center justify-center text-muted-foreground text-xs">
            N/A
          </div>
        )}
        {/* Kind badge */}
        <span className="absolute top-2 left-2 bg-scrim backdrop-blur-sm text-[11px] font-bold font-mono px-2 py-0.5 rounded-full text-primary">
          {item.kind === "in_progress"
            ? t("home.upNext.inProgress")
            : t("home.upNext.newEpisodes")}
        </span>
        {/* Unwatched count badge */}
        {item.unwatchedCount != null && item.unwatchedCount > 1 && (
          <span className="absolute top-2 right-2 bg-scrim backdrop-blur-sm text-scrim-foreground font-mono text-[11px] font-semibold px-2 py-0.5 rounded-full">
            +{item.unwatchedCount}
          </span>
        )}
      </Link>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <Link
          to={`/title/${item.titleId}`}
          className="hover:text-primary-text transition-colors"
        >
          <h3 className="font-semibold text-foreground text-sm truncate">
            {item.title}
          </h3>
        </Link>
        {hasEpisode && (
          <p className="text-xs mt-0.5">
            <span className="text-primary-text font-medium">
              S{String(item.nextEpisodeSeason).padStart(2, "0")}·E
              {String(item.nextEpisodeNumber).padStart(2, "0")}
            </span>
            {item.nextEpisodeTitle && (
              <span className="text-muted-foreground">
                {" "}
                · {item.nextEpisodeTitle}
              </span>
            )}
          </p>
        )}

        {/* Mark watched button */}
        {hasEpisode && (
          <div className="mt-auto pt-3">
            <button
              onClick={() => onMarkWatched(item.nextEpisodeId!)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-fill-subtle hover:bg-accent text-foreground text-xs font-medium rounded-md transition-colors cursor-pointer"
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
    <Link to={`/title/${item.titleId}`} className="flex flex-col group">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted ring-2 ring-primary/60 border border-border">
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
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            N/A
          </div>
        )}
        {/* Recommended badge */}
        <span className="absolute top-2 left-2 bg-primary/90 text-primary-foreground text-[11px] font-bold px-2 py-0.5 rounded-full">
          Rec
        </span>
      </div>
      <p className="text-sm text-foreground mt-1.5 line-clamp-2 group-hover:text-primary-text transition-colors">
        {item.title}
      </p>
      {item.recommendedBy && (
        <p className="text-xs text-muted-foreground truncate">
          from @{item.recommendedBy}
        </p>
      )}
    </Link>
  );
}

// ─── UpNextRow ─────────────────────────────────────────────────────────────

interface UpNextRowProps {
  items: UpNextItem[];
  onMarkWatched: (episodeId: number) => void;
}

export const UpNextRow = memo(function UpNextRow({
  items,
  onMarkWatched,
}: UpNextRowProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("home.upNext.empty")}</p>
    );
  }

  return (
    <FullBleedCarousel>
      {items.map((item, idx) => {
        const key = `${item.kind}-${item.titleId}-${idx}`;
        if (item.kind === "recommendation") {
          return (
            <div
              key={key}
              className="w-32 flex-shrink-0"
              style={{ scrollSnapAlign: "start" }}
            >
              <RecommendationCard item={item} />
            </div>
          );
        }
        return (
          <div
            key={key}
            className="w-52 flex-shrink-0"
            style={{ scrollSnapAlign: "start" }}
          >
            <EpisodeCard item={item} onMarkWatched={onMarkWatched} />
          </div>
        );
      })}
    </FullBleedCarousel>
  );
});

export default UpNextRow;
