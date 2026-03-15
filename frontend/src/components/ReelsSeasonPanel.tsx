import { useEffect, useRef, useCallback } from "react";
import { X, CheckCircle, Circle } from "lucide-react";
import { Link } from "react-router";
import type { Episode } from "../types";

interface ReelsSeasonPanelProps {
  showTitle: string;
  episodes: Episode[];
  seasonNumber: number;
  onClose: () => void;
  onBulkWatch: (episodeIds: number[]) => void;
  onToggleWatched: (episodeId: number, currentlyWatched: boolean) => void;
}

export default function ReelsSeasonPanel({
  showTitle,
  episodes,
  seasonNumber,
  onClose,
  onBulkWatch,
  onToggleWatched,
}: ReelsSeasonPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on swipe right or tap outside
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onClose();
    }
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const sorted = [...episodes].sort((a, b) => a.episode_number - b.episode_number);
  const unwatchedIds = sorted.filter((ep) => !ep.is_watched).map((ep) => ep.id);
  const allWatched = unwatchedIds.length === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 bottom-0 z-[80] w-[85vw] max-w-sm bg-gray-900 border-l border-gray-800 overflow-y-auto animate-slide-in-right"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 p-4 z-10">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-white truncate pr-2">{showTitle}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors cursor-pointer flex-shrink-0"
            >
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-gray-400">Season {seasonNumber}</p>
          {!allWatched && (
            <button
              onClick={() => onBulkWatch(unwatchedIds)}
              className="mt-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              Mark Season Watched ({unwatchedIds.length} episodes)
            </button>
          )}
        </div>

        {/* Episode list */}
        <div className="p-4 space-y-2">
          {sorted.map((ep) => (
            <div
              key={ep.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                ep.is_watched
                  ? "bg-gray-800/30 border-gray-800/60 opacity-60"
                  : "bg-gray-800/60 border-gray-800"
              }`}
            >
              <button
                onClick={() => onToggleWatched(ep.id, !!ep.is_watched)}
                className={`flex-shrink-0 mt-0.5 cursor-pointer transition-colors ${
                  ep.is_watched
                    ? "text-emerald-400 hover:text-gray-400"
                    : "text-gray-600 hover:text-emerald-400"
                }`}
              >
                {ep.is_watched ? <CheckCircle size={18} /> : <Circle size={18} />}
              </button>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`}
                  className="hover:text-indigo-400 transition-colors"
                >
                  <p className="text-sm font-medium text-white">
                    E{String(ep.episode_number).padStart(2, "0")}
                    {ep.name && ` · ${ep.name}`}
                  </p>
                </Link>
                {ep.air_date && (
                  <p className="text-xs text-gray-500 mt-0.5">{ep.air_date}</p>
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
