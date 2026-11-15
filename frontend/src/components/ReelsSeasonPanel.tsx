import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import * as api from "../api";
import WatchedToggleButton from "./WatchedToggleButton";

interface ReelsSeasonPanelProps {
  titleId: string;
  showTitle: string;
  seasonNumber: number;
  onClose: () => void;
  onBulkWatch: (episodeIds: number[]) => void;
  onToggleWatched: (episodeId: number, currentlyWatched: boolean) => void;
}

export default function ReelsSeasonPanel({
  titleId,
  showTitle,
  seasonNumber,
  onClose,
  onBulkWatch,
  onToggleWatched,
}: ReelsSeasonPanelProps) {
  // The whole season, with watched state. Same key as the episode page, and
  // invalidateLibrary refreshes it after every toggle.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["season-status", titleId, String(seasonNumber)],
    queryFn: ({ signal }) =>
      api.getSeasonEpisodeStatus(titleId, seasonNumber, signal),
  });

  // Close on swipe right or tap outside
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onClose();
      }
    },
    [onClose],
  );

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const today = new Date().toISOString().slice(0, 10);
  const episodes = data?.episodes ?? [];
  const aired = (ep: { air_date?: string | null }) =>
    !!ep.air_date && ep.air_date <= today;
  const unwatchedIds = episodes
    .filter((ep) => !ep.is_watched && aired(ep))
    .map((ep) => ep.id);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-scrim"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${showTitle} — Season ${seasonNumber}`}
        className="select-none dark-section fixed top-0 right-0 bottom-0 z-[80] w-[85vw] max-w-sm bg-card/95 backdrop-blur-sm border-l border-border overflow-y-auto animate-slide-in-right safe-top"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border p-4 z-10">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-foreground truncate pr-2">
              {showTitle}
            </h3>
            <button
              onClick={onClose}
              aria-label="Close season panel"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex-shrink-0"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Season {seasonNumber}</p>
          {unwatchedIds.length > 0 && (
            <button
              onClick={() => onBulkWatch(unwatchedIds)}
              className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
            >
              Mark Season Watched ({unwatchedIds.length} episodes)
            </button>
          )}
        </div>

        {/* Episode list */}
        <div className="p-4 space-y-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading episodes…</p>
          )}
          {isError && (
            <p className="text-sm text-destructive">
              Could not load this season.
            </p>
          )}
          {episodes.map((ep) => (
            <div
              key={ep.id}
              className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
                ep.is_watched
                  ? "bg-muted/30 border-border opacity-60"
                  : "bg-muted/60 border-border"
              }`}
            >
              <WatchedToggleButton
                watched={ep.is_watched}
                disabled={!aired(ep)}
                onClick={() => onToggleWatched(ep.id, ep.is_watched)}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <Link
                  to={`/title/${titleId}/season/${seasonNumber}/episode/${ep.episode_number}`}
                  className="hover:text-primary-text transition-colors"
                >
                  <p className="text-sm font-medium text-foreground">
                    E{String(ep.episode_number).padStart(2, "0")}
                    {ep.name && ` · ${ep.name}`}
                  </p>
                </Link>
                {ep.air_date && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ep.air_date}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
