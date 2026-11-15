import { CheckCircle, Check, Share2, ListVideo } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Episode, RatingValue } from "../types";
import WatchButtonGroup from "./WatchButtonGroup";
import TrackButton from "./TrackButton";
import ReelsUndoBar from "./ReelsUndoBar";
import { backdropUrl as mkBackdropUrl } from "../lib/tmdb-images";

/** episode: next unwatched episode · movie: tracked movie · title: anything to discover */
export type ReelsCardKind = "episode" | "movie" | "title";

function formatEpisodeCode(ep: Episode): string {
  const s = String(ep.season_number).padStart(2, "0");
  const e = String(ep.episode_number).padStart(2, "0");
  return `S${s}·E${e}`;
}

function formatAirDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

/** Countdown chip text for a future date; null for today, past or missing dates. */
export function getCountdownLabel(
  airDate: string | null,
  now: Date = new Date(),
): string | null {
  if (!airDate) return null;
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (new Date(airDate + "T00:00:00").getTime() - midnight.getTime()) / 86400000,
  );
  if (diff < 1) return null;
  if (diff === 1) return "TOMORROW";
  if (diff <= 6)
    return new Date(airDate + "T00:00:00")
      .toLocaleDateString(undefined, { weekday: "short" })
      .toUpperCase();
  return new Date(airDate + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

async function shareEpisode(episode: Episode) {
  const url = `${window.location.origin}/title/${episode.title_id}`;
  const text = episode.name
    ? `${episode.show_title} — ${episode.name}`
    : episode.show_title;
  try {
    if (navigator.share) {
      await navigator.share({ title: text, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  } catch {
    /* user cancelled */
  }
}

export function getBackgroundImageUrl(episode: Episode): string | null {
  if (episode.still_path) {
    return mkBackdropUrl(episode.still_path, "w780");
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
  kind: ReelsCardKind;
  caughtUp: boolean;
  onMarkWatched: () => void;
  index: number;
  total: number;
  undoInfo?: UndoInfo;
  blurred?: boolean;
  /** Small line above the headline, e.g. who recommended it (title cards). */
  kicker?: string;
  /** "Movie" / "Show", shown after the date. */
  typeLabel?: string;
  /** Title cards: whether the title is on the watchlist. */
  tracked?: boolean;
  /** Episode cards: opens the season panel. */
  onOpenSeason?: () => void;
}

const actionCircle =
  "w-11 h-11 rounded-full bg-black/45 backdrop-blur border border-border flex items-center justify-center text-foreground";
const actionLabel =
  "text-[11px] text-foreground/75 font-semibold tracking-[0.05em]";

export default function ReelsCard({
  episode,
  kind,
  caughtUp,
  onMarkWatched,
  index,
  total,
  undoInfo,
  blurred,
  kicker,
  typeLabel,
  tracked,
  onOpenSeason,
}: ReelsCardProps) {
  const { t } = useTranslation();
  const bgUrl = getBackgroundImageUrl(episode);
  const airDateFormatted = formatAirDate(episode.air_date);
  const isLive = isToday(episode.air_date);
  const countdownLabel = getCountdownLabel(episode.air_date);
  const meta = [airDateFormatted, typeLabel].filter(Boolean).join(" · ");
  const isEpisode = kind === "episode";

  return (
    <div
      className="dark-section snap-start snap-always w-full relative flex-shrink-0 overflow-hidden"
      style={{ height: "var(--reels-h, 100dvh)" }}
    >
      {/* Background image */}
      {bgUrl ? (
        <img
          src={bgUrl}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover${blurred ? " blur-xl scale-110" : ""}`}
          loading="lazy"
          width={1280}
          height={720}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-muted to-background" />
      )}
      {blurred && (
        <div
          data-testid="advisory-blur"
          className="absolute inset-0 bg-background/40 flex items-center justify-center pointer-events-none z-[1]"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-scrim-foreground bg-scrim px-3 py-1.5 rounded-sm">
            {episode.age_certification ?? t("titleCard.sensitive")}
          </span>
        </div>
      )}

      {/* Gradient overlays */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/85 via-transparent to-transparent"
        style={{ height: 180 }}
      />
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: 420,
          background:
            "linear-gradient(0deg, rgba(9,9,11,1) 0%, rgba(9,9,11,0.93) 25%, rgba(9,9,11,0.65) 55%, transparent 100%)",
        }}
      />
      {/* Right-edge vignette behind action rail */}
      <div className="absolute top-0 bottom-0 right-0 w-28 bg-gradient-to-l from-black/40 to-transparent" />

      {/* Top-left chip: airing today or a countdown to a future date */}
      {!caughtUp && (isLive || countdownLabel) && (
        <div
          className="absolute z-10 flex items-center gap-1.5"
          style={{
            top: "calc(var(--reels-chrome-h, 56px) + 8px + env(safe-area-inset-top, 0px))",
            left: 20,
          }}
        >
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-[11px] font-extrabold font-mono px-2.5 py-1.5 rounded-full tracking-[0.12em]">
              <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
              {isEpisode ? "AIRED TODAY" : "OUT TODAY"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-scrim backdrop-blur text-primary-text border border-primary-border text-[11px] font-bold font-mono px-2.5 py-1.5 rounded-full tracking-[0.12em]">
              ◷ {countdownLabel}
            </span>
          )}
        </div>
      )}

      {/* Right-edge action rail */}
      {!caughtUp && (
        <div
          className="absolute z-10 flex flex-col gap-3.5 items-center"
          style={{ right: 14, bottom: 240 }}
        >
          <button
            onClick={() => shareEpisode(episode)}
            className="flex flex-col items-center gap-1"
          >
            <div className={actionCircle}>
              <Share2 size={18} aria-hidden="true" />
            </div>
            <span className={actionLabel}>Share</span>
          </button>
          {onOpenSeason && (
            <button
              onClick={onOpenSeason}
              className="flex flex-col items-center gap-1"
            >
              <div className={actionCircle}>
                <ListVideo size={18} aria-hidden="true" />
              </div>
              <span className={actionLabel}>Season</span>
            </button>
          )}
        </div>
      )}

      {/* Position in the feed */}
      <div
        className="absolute z-10 font-mono text-[11px] text-foreground/70 bg-black/45 backdrop-blur rounded-full px-2 py-0.5"
        style={{ right: 14, top: "50%", transform: "translateY(-50%)" }}
        aria-label={`Card ${index + 1} of ${total}`}
      >
        {index + 1} / {total}
      </div>

      {/* Swipe hint on first card — mobile only (irrelevant on pointer devices) */}
      {index === 0 && !caughtUp && (
        <div
          className="absolute z-10 text-right sm:hidden"
          style={{ right: 20, top: 160 }}
        >
          <div className="text-[11px] text-muted-foreground tracking-[0.12em] leading-relaxed">
            ↑ SWIPE
            <br />
            FOR NEXT
          </div>
        </div>
      )}

      {/* Bottom content */}
      <div
        className="absolute bottom-0 left-0 z-10 pb-24 sm:pb-6"
        style={{ right: caughtUp ? 0 : 84, padding: "0 20px 96px" }}
      >
        {caughtUp ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 bg-success/20 text-success px-4 py-2 rounded-full text-lg font-semibold mb-2">
              <Check size={20} />
              All caught up!
            </div>
            <p className="text-muted-foreground text-sm mb-3">
              {episode.show_title}
            </p>
            {undoInfo && (
              <div className="flex justify-center">
                <ReelsUndoBar {...undoInfo} />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Episodes: the show, linked. Other cards: an optional note. */}
            {isEpisode ? (
              <Link to={`/title/${episode.title_id}`}>
                <div className="text-xs text-foreground-secondary font-medium mb-1.5 drop-shadow hover:opacity-80 transition-opacity">
                  <span>{episode.show_title}</span>
                  <span> · {formatEpisodeCode(episode)}</span>
                </div>
              </Link>
            ) : (
              kicker && (
                <div className="text-xs text-foreground-secondary font-medium mb-1.5 drop-shadow">
                  {kicker}
                </div>
              )
            )}

            <Link
              to={
                isEpisode
                  ? `/title/${episode.title_id}/season/${episode.season_number}/episode/${episode.episode_number}`
                  : `/title/${episode.title_id}`
              }
            >
              <h2 className="text-[30px] font-extrabold tracking-[-0.02em] leading-[1.02] text-foreground mb-2.5 drop-shadow-lg hover:text-primary-text transition-colors select-text">
                {episode.name ??
                  (isEpisode ? formatEpisodeCode(episode) : episode.show_title)}
              </h2>
            </Link>

            {meta && (
              <div className="font-mono text-[12px] text-foreground-secondary mb-3.5 drop-shadow">
                {meta}
              </div>
            )}

            {episode.overview && (
              <p className="text-sm text-foreground/70 line-clamp-3 mb-4 drop-shadow select-text">
                {episode.overview}
              </p>
            )}

            {/* Continue-watching progress */}
            {(() => {
              const total = episode.total_episodes ?? 0;
              const watched = episode.watched_episodes_count ?? 0;
              if (total <= 0) return null;
              const pct = Math.max(
                0,
                Math.min(100, Math.round((watched / total) * 100)),
              );
              return (
                <div className="mb-4">
                  <div className="flex justify-between mb-1.5 font-mono text-[11px] text-muted-foreground tracking-[0.1em]">
                    <span>{pct}% CAUGHT UP</span>
                    <span>
                      {watched} OF {total}
                    </span>
                  </div>
                  <div className="h-[3px] bg-accent rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="mb-2">
              <WatchButtonGroup
                offers={episode.offers ?? []}
                variant="dropdown"
                size="lg"
                fullWidth
              />
            </div>

            {undoInfo && <ReelsUndoBar {...undoInfo} />}

            {kind === "title" ? (
              <TrackButton
                titleId={episode.title_id}
                isTracked={!!tracked}
                className="w-full min-h-12 px-6 py-3 rounded-lg text-base font-semibold"
              />
            ) : (
              <button
                onClick={onMarkWatched}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 active:bg-primary/90 text-primary-foreground px-6 py-3 rounded-lg text-base font-semibold transition-colors cursor-pointer w-full justify-center"
              >
                <CheckCircle size={20} />
                Mark as Watched
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
