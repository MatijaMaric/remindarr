import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CheckCircle, Circle, MoreHorizontal, Share2 } from "lucide-react";
import ScrollableRow from "../components/ScrollableRow";
import * as api from "../api";
import type { SeasonDetailsResponse, RatingValue } from "../types";
import PersonCard from "../components/PersonCard";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";
import { useAuth } from "../context/AuthContext";
import ShareButton from "../components/ShareButton";

const TMDB_IMG = "https://image.tmdb.org/t/p";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isReleased(airDate: string | null | undefined): boolean {
  if (!airDate) return false;
  return airDate <= todayISO();
}

function isAiringToday(airDate: string | null | undefined): boolean {
  return !!airDate && airDate === todayISO();
}

type EpisodeStatus = { id: number; is_watched: boolean };

export default function SeasonDetailPage() {
  const { id, season } = useParams<{ id: string; season: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, loading, error } = useApiCall<SeasonDetailsResponse>(
    () => api.getSeasonDetails(id!, Number(season)),
    [id, season],
  );

  const [statusMap, setStatusMap] = useState<Map<number, EpisodeStatus>>(new Map());
  const [episodeRatings, setEpisodeRatings] = useState<Record<number, Record<RatingValue, number>>>({});

  useApiCall(
    () => user && id && season
      ? api.getSeasonEpisodeStatus(id, Number(season))
      : Promise.resolve({ episodes: [] }),
    [user, id, season],
    {
      onSuccess: (result) => {
        const map = new Map<number, EpisodeStatus>();
        for (const ep of result.episodes) {
          map.set(ep.episode_number, { id: ep.id, is_watched: ep.is_watched });
        }
        setStatusMap(map);
      },
    },
  );

  useApiCall(
    () => id && season
      ? api.getSeasonEpisodeRatings(id, Number(season))
      : Promise.resolve({ ratings: {} }),
    [id, season],
    {
      onSuccess: (result) => setEpisodeRatings(result.ratings),
    },
  );

  const toggleWatched = async (episodeNumber: number) => {
    const status = statusMap.get(episodeNumber);
    if (!status) return;

    const wasWatched = status.is_watched;
    setStatusMap((prev) => {
      const next = new Map(prev);
      next.set(episodeNumber, { ...status, is_watched: !wasWatched });
      return next;
    });

    try {
      if (wasWatched) {
        await api.unwatchEpisode(status.id);
      } else {
        await api.watchEpisode(status.id);
      }
    } catch {
      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(episodeNumber, { ...status, is_watched: wasWatched });
        return next;
      });
      toast.error(t("episodes.watchedError", "Failed to update watched status"));
    }
  };

  const toggleAllWatched = async () => {
    const episodes = data?.tmdb?.episodes || [];
    const releasedEps = episodes.filter((ep) => isReleased(ep.air_date));
    const releasedStatuses = releasedEps
      .map((ep) => ({ episodeNumber: ep.episode_number, status: statusMap.get(ep.episode_number) }))
      .filter((e): e is { episodeNumber: number; status: EpisodeStatus } => !!e.status);

    if (releasedStatuses.length === 0) return;

    const allWatched = releasedStatuses.every((e) => e.status.is_watched);
    const newWatched = !allWatched;
    const ids = releasedStatuses.map((e) => e.status.id);

    // Optimistic update
    const prevMap = new Map(statusMap);
    setStatusMap((prev) => {
      const next = new Map(prev);
      for (const e of releasedStatuses) {
        next.set(e.episodeNumber, { ...e.status, is_watched: newWatched });
      }
      return next;
    });

    try {
      await api.watchEpisodesBulk(ids, newWatched);
    } catch {
      setStatusMap(prevMap);
      toast.error(t("episodes.watchedError", "Failed to update watched status"));
    }
  };

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">{error || "Season not found"}</div>
      </div>
    );
  }

  const { title, tmdb, seasonNumber, seasons } = data;
  const posterUrl = tmdb?.poster_path ? `${TMDB_IMG}/w500${tmdb.poster_path}` : title.poster_url;
  const episodes = tmdb?.episodes || [];

  const hasStatus = statusMap.size > 0;
  const releasedWithStatus = episodes.filter((ep) => isReleased(ep.air_date) && statusMap.has(ep.episode_number));
  const allReleasedWatched = hasStatus && releasedWithStatus.length > 0 && releasedWithStatus.every((ep) => statusMap.get(ep.episode_number)?.is_watched);

  return (
    <div className="space-y-8 pb-12 overflow-x-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Link to={`/title/${title.id}`} className="hover:text-white transition-colors">{title.title}</Link>
        <span className="text-zinc-600">/</span>
        <span className="text-white">{tmdb?.name || `Season ${seasonNumber}`}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="w-40 shrink-0 mx-auto sm:mx-0">
          {posterUrl ? (
            <img src={posterUrl} alt={tmdb?.name || `Season ${seasonNumber}`} className="w-full rounded-xl shadow-xl" />
          ) : (
            <div className="aspect-[2/3] bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-600">
              Season {seasonNumber}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <h1 className="text-2xl font-bold text-white">{tmdb?.name || `Season ${seasonNumber}`}</h1>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            {tmdb?.air_date && <span>{formatDate(tmdb.air_date)}</span>}
            {episodes.length > 0 && (
              <>
                <span className="text-zinc-600">·</span>
                <span>{episodes.length} episode{episodes.length !== 1 ? "s" : ""}</span>
              </>
            )}
            {tmdb?.vote_average ? (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-yellow-500">{tmdb.vote_average.toFixed(1)}</span>
              </>
            ) : null}
          </div>

          {tmdb?.overview && (
            <p className="text-zinc-300 leading-relaxed">{tmdb.overview}</p>
          )}

          <div className="pt-2">
            <ShareButton title={`${title.title} — ${tmdb?.name || `Season ${seasonNumber}`}`} />
          </div>
        </div>
      </div>

      {/* Episode List */}
      {episodes.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-white">{t("season.episodes", "Episodes")}</h2>
              {seasons && seasons.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {seasons.map((s) => {
                    const active = s.season_number === seasonNumber;
                    return (
                      <button
                        key={s.season_number}
                        onClick={() => navigate(`/title/${title.id}/season/${s.season_number}`)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? "bg-amber-400 text-black"
                            : "bg-white/[0.04] text-zinc-300 border border-white/[0.08] hover:border-white/20"
                        }`}
                        aria-pressed={active}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {hasStatus && releasedWithStatus.length > 0 && (
                <span className="text-[11px] font-mono text-zinc-500 tracking-wide whitespace-nowrap">
                  {releasedWithStatus.filter((ep) => statusMap.get(ep.episode_number)?.is_watched).length} of {episodes.length} watched · {episodes.length - releasedWithStatus.filter((ep) => statusMap.get(ep.episode_number)?.is_watched).length} remaining
                </span>
              )}
              {hasStatus && releasedWithStatus.length > 0 && (
                <button
                  onClick={toggleAllWatched}
                  className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {allReleasedWatched
                    ? t("episodes.markAllUnwatched", "Mark all unwatched")
                    : t("episodes.markAllWatched", "Mark all watched")}
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {episodes.map((ep) => {
              const status = statusMap.get(ep.episode_number);
              const released = isReleased(ep.air_date);
              const airingToday = isAiringToday(ep.air_date);
              const watched = status?.is_watched ?? false;
              const ratingCounts = episodeRatings[ep.episode_number];
              const totalRatings = ratingCounts
                ? ratingCounts.HATE + ratingCounts.DISLIKE + ratingCounts.LIKE + ratingCounts.LOVE
                : 0;

              return (
                <div
                  key={ep.episode_number}
                  className={`rounded-[10px] border transition-colors group ${
                    airingToday
                      ? "bg-amber-400/[0.06] border-amber-400/25"
                      : "bg-zinc-900 border-white/[0.05] hover:border-white/10"
                  }`}
                >
                  <div className="flex items-stretch sm:items-center gap-3 sm:gap-5 p-3 sm:p-4">
                    {/* Episode number */}
                    <div
                      className={`shrink-0 w-8 sm:w-10 self-center text-[22px] leading-none font-mono font-extrabold tabular-nums tracking-tight text-center ${
                        watched ? "text-zinc-600" : "text-zinc-100"
                      }`}
                    >
                      {String(ep.episode_number).padStart(2, "0")}
                    </div>

                    <Link
                      to={`/title/${title.id}/season/${seasonNumber}/episode/${ep.episode_number}`}
                      className="flex flex-1 min-w-0 gap-3 sm:gap-5 items-stretch sm:items-center"
                    >
                      {/* Still */}
                      <div className="shrink-0 w-24 sm:w-[180px] aspect-video bg-zinc-800 rounded-md overflow-hidden self-center">
                        {ep.still_path ? (
                          <img
                            src={`${TMDB_IMG}/w300${ep.still_path}`}
                            alt={ep.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[11px] font-mono">
                            E{String(ep.episode_number).padStart(2, "0")}
                          </div>
                        )}
                      </div>

                      {/* Title + description */}
                      <div className="flex-1 min-w-0 self-center">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className={`text-sm font-semibold transition-colors group-hover:text-amber-400 ${
                              watched ? "text-zinc-400" : "text-zinc-100"
                            }`}
                          >
                            {ep.name}
                          </h3>
                          {airingToday && (
                            <span className="text-[10px] font-mono font-semibold tracking-[0.15em] text-amber-400">
                              AIRING NOW
                            </span>
                          )}
                        </div>
                        {ep.overview && (
                          <p className="hidden sm:block text-xs text-zinc-500 mt-1 line-clamp-2 leading-snug">
                            {ep.overview}
                          </p>
                        )}
                        {/* Mobile-only meta row */}
                        <div className="sm:hidden flex items-center gap-2 mt-1 text-[11px] font-mono text-zinc-400">
                          {ep.air_date && <span>{formatDate(ep.air_date)}</span>}
                          {ep.runtime && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span>{ep.runtime} min</span>
                            </>
                          )}
                          {ep.vote_average > 0 && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span className="text-amber-400">★ {ep.vote_average.toFixed(1)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Desktop: air date column */}
                    <div className="hidden sm:block shrink-0 w-[110px] text-xs font-mono text-zinc-400">
                      {ep.air_date ? formatDate(ep.air_date) : "—"}
                    </div>

                    {/* Desktop: runtime + rating column */}
                    <div className="hidden sm:block shrink-0 w-[100px] text-xs font-mono text-zinc-400">
                      <div>{ep.runtime ? `${ep.runtime} min` : "—"}</div>
                      {ep.vote_average > 0 && (
                        <div className="text-amber-400 mt-0.5">★ {ep.vote_average.toFixed(1)}</div>
                      )}
                      {totalRatings > 0 && (
                        <div className="text-pink-400 mt-0.5">
                          {totalRatings} {totalRatings === 1 ? "rating" : "ratings"}
                        </div>
                      )}
                    </div>

                    {/* Watched pill */}
                    {hasStatus && (
                      <div className="shrink-0 self-center">
                        <EpisodeWatchedPill
                          watched={watched}
                          released={released}
                          hasStatus={!!status}
                          onToggle={() => toggleWatched(ep.episode_number)}
                        />
                      </div>
                    )}

                    {/* Overflow menu */}
                    <div className="shrink-0 self-center">
                      <EpisodeOverflowMenu
                        titleId={title.id}
                        seasonNumber={seasonNumber}
                        episodeNumber={ep.episode_number}
                        episodeName={ep.name}
                        showTitle={title.title}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Season Cast */}
      {tmdb?.credits?.cast && tmdb.credits.cast.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Season Cast</h2>
          <ScrollableRow className="gap-4 pb-2">
            {tmdb.credits.cast.slice(0, 15).map((c) => (
              <PersonCard key={c.id} id={c.id} name={c.name} role={c.character} profilePath={c.profile_path} />
            ))}
          </ScrollableRow>
        </section>
      )}
    </div>
  );
}

function EpisodeWatchedPill({
  watched,
  released,
  hasStatus,
  onToggle,
}: {
  watched: boolean;
  released: boolean;
  hasStatus: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const disabled = !released || !hasStatus;

  if (disabled) {
    return (
      <span
        role="img"
        aria-label={t("episodes.notYetReleased", "Not yet released")}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold bg-zinc-800/50 text-zinc-600 border-zinc-800 cursor-not-allowed opacity-60 sm:w-[108px] sm:justify-center"
      >
        <Circle size={12} aria-hidden="true" />
        <span className="hidden sm:inline">{t("episodes.watch", "Watch")}</span>
      </span>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={watched}
      aria-label={
        watched
          ? t("episodes.markAsUnwatched", "Mark as unwatched")
          : t("episodes.markAsWatched", "Mark as watched")
      }
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer transition-colors sm:w-[108px] sm:justify-center ${
        watched
          ? "bg-amber-400/15 text-amber-400 border-amber-400/30 hover:bg-amber-400/25"
          : "bg-white/[0.06] text-zinc-300 border-white/[0.08] hover:bg-white/10 hover:text-white"
      }`}
    >
      {watched ? <CheckCircle size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
      <span className="hidden sm:inline">
        {watched ? t("episodes.watched", "Watched") : t("episodes.markWatchedShort", "Mark")}
      </span>
    </button>
  );
}

function EpisodeOverflowMenu({
  titleId,
  seasonNumber,
  episodeNumber,
  episodeName,
  showTitle,
}: {
  titleId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  showTitle: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleShare = async () => {
    setOpen(false);
    const shareUrl = `${window.location.origin}/title/${titleId}/season/${seasonNumber}/episode/${episodeNumber}`;
    const shareTitle = `${showTitle} — S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")} · ${episodeName}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t("share.copied", "Link copied"));
      }
    } catch {
      // user cancelled or copy failed — stay quiet
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("episodes.moreActions", "More actions")}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-white/[0.08] bg-zinc-900 shadow-xl py-1"
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate(`/title/${titleId}/season/${seasonNumber}/episode/${episodeNumber}`);
            }}
            className="w-full text-left px-3 py-2 text-[13px] text-zinc-200 hover:bg-white/[0.06] cursor-pointer transition-colors"
          >
            {t("episodes.viewDetails", "View details")}
          </button>
          <button
            role="menuitem"
            onClick={handleShare}
            className="w-full flex items-center gap-2 text-left px-3 py-2 text-[13px] text-zinc-200 hover:bg-white/[0.06] cursor-pointer transition-colors"
          >
            <Share2 size={13} aria-hidden="true" />
            {t("share.share", "Share")}
          </button>
        </div>
      )}
    </div>
  );
}
