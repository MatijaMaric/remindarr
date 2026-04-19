import { CheckCircle, Check } from "lucide-react";
import { Link } from "react-router";
import type { Episode, RatingValue } from "../types";
import WatchButtonGroup from "./WatchButtonGroup";
import ReelsUndoBar from "./ReelsUndoBar";

function formatEpisodeCode(ep: Episode): string {
  const s = String(ep.season_number).padStart(2, "0");
  const e = String(ep.episode_number).padStart(2, "0");
  return `S${s}·E${e}`;
}

function formatAirDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

export function getBackgroundImageUrl(episode: Episode): string | null {
  if (episode.still_path) {
    return `https://image.tmdb.org/t/p/w1280${episode.still_path}`;
  }
  if (episode.poster_url) {
    return episode.poster_url;
  }
  return null;
}

export interface UndoInfo {
  episodeCode: string;
  currentRating: RatingValue | null;
  onRate: (value: RatingValue) => void;
  onUndo: () => void;
}

interface ReelsCardProps {
  episode: Episode;
  caughtUp: boolean;
  onMarkWatched: () => void;
  index: number;
  total: number;
  undoInfo?: UndoInfo;
}

export default function ReelsCard({ episode, caughtUp, onMarkWatched, index, total, undoInfo }: ReelsCardProps) {
  const bgUrl = getBackgroundImageUrl(episode);
  const airDateFormatted = formatAirDate(episode.air_date);
  const isNew = isToday(episode.air_date);

  // Pick first provider name from offers for the chip
  const providerName = episode.offers && episode.offers.length > 0
    ? episode.offers[0].provider_name
    : null;

  return (
    <div className="dark-section snap-start snap-always w-full relative flex-shrink-0 overflow-hidden" style={{ height: "calc(100dvh - env(safe-area-inset-top, 0px))" }}>
      {/* Background image */}
      {bgUrl ? (
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90" />

      {/* Top-left: episode/provider/runtime chips */}
      {!caughtUp && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 flex-wrap">
          <span className="bg-amber-400 text-black text-[10px] font-bold font-mono px-2 py-0.5 rounded-full leading-tight tracking-wide">
            {formatEpisodeCode(episode)}
          </span>
          {providerName && (
            <span className="bg-white/[0.12] text-white text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full leading-tight border border-white/[0.1]">
              {providerName.toUpperCase()}
            </span>
          )}
          {isNew && (
            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full leading-tight">
              NEW
            </span>
          )}
        </div>
      )}

      {/* Top-right: position indicator */}
      <div className="absolute top-4 right-4 z-10 bg-black/50 px-3 py-1 rounded-full text-xs text-white/80">
        {index + 1} / {total}
      </div>

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pb-24 sm:pb-6 z-10">
        {caughtUp ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-2 rounded-full text-lg font-semibold mb-2">
              <Check size={20} />
              All caught up!
            </div>
            <p className="text-zinc-400 text-sm mb-3">{episode.show_title}</p>
            {undoInfo && (
              <div className="flex justify-center">
                <ReelsUndoBar {...undoInfo} />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Show title — mono amber kicker */}
            <Link to={`/title/${episode.title_id}`}>
              <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-amber-400 font-semibold mb-2 drop-shadow hover:opacity-80 transition-opacity">
                {episode.show_title}
              </div>
            </Link>

            {/* Episode name — large */}
            <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`}>
              <h2 className="text-[30px] font-extrabold tracking-[-0.02em] leading-[1.05] text-white mb-2 drop-shadow-lg hover:text-amber-300 transition-colors">
                {episode.name ?? formatEpisodeCode(episode)}
              </h2>
            </Link>

            {/* Meta line */}
            {airDateFormatted && (
              <div className="font-mono text-[12px] text-zinc-300 mb-3 drop-shadow">
                {airDateFormatted}
              </div>
            )}

            {/* Overview */}
            {episode.overview && (
              <p className="text-sm text-white/70 line-clamp-3 mb-4 drop-shadow">
                {episode.overview}
              </p>
            )}

            {/* 3px progress bar (placeholder — no progress data on Episode type) */}
            <div className="h-[3px] bg-white/[0.1] rounded-full mb-4 overflow-hidden">
              <div className="h-full w-0 bg-amber-400 rounded-full" />
            </div>

            {/* Watch on provider button */}
            <div className="mb-2">
              <WatchButtonGroup offers={episode.offers ?? []} variant="dropdown" size="lg" fullWidth />
            </div>

            {/* Undo/rating bar for previously marked episode */}
            {undoInfo && <ReelsUndoBar {...undoInfo} />}

            {/* Mark as watched button */}
            <button
              onClick={onMarkWatched}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 px-6 py-3 rounded-xl text-base font-semibold transition-colors cursor-pointer w-full justify-center"
            >
              <CheckCircle size={20} />
              Mark as Watched
            </button>
          </>
        )}
      </div>
    </div>
  );
}
