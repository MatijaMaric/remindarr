import { CheckCircle, Check, Share2, Info } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { Episode, RatingValue } from "../types";
import WatchButtonGroup from "./WatchButtonGroup";
import ReelsUndoBar from "./ReelsUndoBar";
import { backdropUrl as mkBackdropUrl } from "../lib/tmdb-images";

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

function getCountdownLabel(airDate: string | null): string | null {
  if (!airDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (airDate === today) return null; // handled as live
  const diff = Math.ceil((new Date(airDate + "T00:00:00").getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  if (diff === 1) return "TOMORROW";
  if (diff <= 6) return new Date(airDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  return new Date(airDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function shareEpisode(episode: Episode) {
  const url = `${window.location.origin}/title/${episode.title_id}`;
  const text = episode.name ? `${episode.show_title} — ${episode.name}` : episode.show_title;
  try {
    if (navigator.share) {
      await navigator.share({ title: text, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  } catch { /* user cancelled */ }
}

export function getBackgroundImageUrl(episode: Episode): string | null {
  if (episode.still_path) {
    return mkBackdropUrl(episode.still_path, "w1280");
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
  const isLive = isToday(episode.air_date);
  const countdownLabel = getCountdownLabel(episode.air_date);

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
          width={1280}
          height={720}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950" />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-transparent to-transparent" style={{ height: 180 }} />
      <div className="absolute bottom-0 left-0 right-0" style={{
        height: 420,
        background: "linear-gradient(0deg, rgba(9,9,11,1) 0%, rgba(9,9,11,0.93) 25%, rgba(9,9,11,0.65) 55%, transparent 100%)",
      }} />
      {/* Right-edge vignette behind action rail */}
      <div className="absolute top-0 bottom-0 right-0 w-28 bg-gradient-to-l from-black/40 to-transparent" />

      {/* Top-left chips: Live/Countdown + Provider */}
      {!caughtUp && (
        <div
          className="absolute z-10 flex items-center gap-1.5"
          style={{
            top: "calc(var(--reels-chrome-h, 56px) + 8px + env(safe-area-inset-top, 0px))",
            left: 20,
          }}
        >
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 bg-amber-400 text-black text-[10px] font-extrabold font-mono px-2.5 py-1.5 rounded-full tracking-[0.12em]">
              <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
              AIRING NOW
            </span>
          ) : countdownLabel ? (
            <span className="inline-flex items-center gap-1.5 bg-black/55 backdrop-blur text-amber-400 border border-amber-400/30 text-[10px] font-bold font-mono px-2.5 py-1.5 rounded-full tracking-[0.12em]">
              ◷ {countdownLabel}
            </span>
          ) : null}
          {providerName && (
            <span className="bg-black/55 backdrop-blur text-zinc-300 border border-white/10 text-[10px] font-bold font-mono px-2.5 py-1.5 rounded-full tracking-[0.12em] uppercase">
              {providerName}
            </span>
          )}
        </div>
      )}

      {/* Right-edge action rail */}
      {!caughtUp && (
        <div className="absolute z-10 flex flex-col gap-3.5 items-center" style={{ right: 14, bottom: 240 }}>
          <button
            onClick={() => shareEpisode(episode)}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur border border-white/12 flex items-center justify-center text-white">
              <Share2 size={18} />
            </div>
            <span className="text-[9px] text-white/75 font-semibold tracking-[0.05em]">Share</span>
          </button>
          <Link to={`/title/${episode.title_id}`} className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 rounded-full bg-black/45 backdrop-blur border border-white/12 flex items-center justify-center text-white">
              <Info size={18} />
            </div>
            <span className="text-[9px] text-white/75 font-semibold tracking-[0.05em]">Info</span>
          </Link>
        </div>
      )}

      {/* Reel index dots — right-center */}
      <div className="absolute z-10 flex flex-col gap-1 items-center" style={{ right: 6, top: "50%", transform: "translateY(-50%)" }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="rounded-sm transition-all duration-300"
            style={{
              width: 3,
              height: i === index ? 14 : 3,
              background: i === index ? "#fbbf24" : "rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </div>

      {/* Swipe hint on first card */}
      {index === 0 && !caughtUp && (
        <div className="absolute z-10 text-right" style={{ right: 20, top: 160 }}>
          <div className="font-mono text-[10px] text-zinc-400 tracking-[0.12em] uppercase leading-relaxed">
            ↑ SWIPE<br />FOR NEXT
          </div>
        </div>
      )}

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 z-10 pb-24 sm:pb-6" style={{ right: caughtUp ? 0 : 84, padding: "0 20px 96px" }}>
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
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-400 font-semibold mb-1.5 drop-shadow hover:opacity-80 transition-opacity">
                <span>{episode.show_title}</span>
                <span> · {formatEpisodeCode(episode)}</span>
              </div>
            </Link>

            {/* Episode name — large */}
            <Link to={`/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`}>
              <h2 className="text-[30px] font-extrabold tracking-[-0.02em] leading-[1.02] text-white mb-2.5 drop-shadow-lg hover:text-amber-300 transition-colors select-text">
                {episode.name ?? formatEpisodeCode(episode)}
              </h2>
            </Link>

            {/* Meta line */}
            {airDateFormatted && (
              <div className="font-mono text-[12px] text-zinc-300 mb-3.5 drop-shadow">
                {airDateFormatted}{providerName ? ` · ${providerName}` : ""}
              </div>
            )}

            {/* Overview */}
            {episode.overview && (
              <p className="text-sm text-white/70 line-clamp-3 mb-4 drop-shadow select-text">
                {episode.overview}
              </p>
            )}

            {/* Continue-watching progress */}
            {(() => {
              const total = episode.total_episodes ?? 0;
              const watched = episode.watched_episodes_count ?? 0;
              if (total <= 0) return null;
              const pct = Math.max(0, Math.min(100, Math.round((watched / total) * 100)));
              return (
                <div className="mb-4">
                  <div className="flex justify-between mb-1.5 font-mono text-[10px] text-zinc-500 tracking-[0.1em]">
                    <span>{pct}% CAUGHT UP</span>
                    <span>{watched} OF {total}</span>
                  </div>
                  <div className="h-[3px] bg-white/[0.15] rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}

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
