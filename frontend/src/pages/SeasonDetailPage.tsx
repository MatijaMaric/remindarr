import { useState } from "react";
import { useParams, Link } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { SeasonDetailsResponse } from "../types";
import PersonCard from "../components/PersonCard";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";
import { useAuth } from "../context/AuthContext";
import { WatchedIcon } from "../components/EpisodeComponents";
import ShareButton from "../components/ShareButton";

const TMDB_IMG = "https://image.tmdb.org/t/p";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function isReleased(airDate: string | null | undefined): boolean {
  if (!airDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return airDate <= today;
}

type EpisodeStatus = { id: number; is_watched: boolean };

export default function SeasonDetailPage() {
  const { id, season } = useParams<{ id: string; season: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();

  const { data, loading, error } = useApiCall<SeasonDetailsResponse>(
    () => api.getSeasonDetails(id!, Number(season)),
    [id, season],
  );

  const [statusMap, setStatusMap] = useState<Map<number, EpisodeStatus>>(new Map());

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

  const { title, tmdb, seasonNumber } = data;
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{t("season.episodes", "Episodes")}</h2>
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
          <div className="space-y-2">
            {episodes.map((ep) => {
              const status = statusMap.get(ep.episode_number);
              const released = isReleased(ep.air_date);

              return (
                <div
                  key={ep.episode_number}
                  className="flex items-center gap-3 bg-zinc-900 rounded-xl border border-white/[0.06] hover:border-amber-500/50 transition-colors p-3 group"
                >
                  {/* Episode link */}
                  <Link
                    to={`/title/${title.id}/season/${seasonNumber}/episode/${ep.episode_number}`}
                    className="flex gap-3 sm:gap-4 flex-1 min-w-0"
                  >
                    {/* Episode still */}
                    <div className="w-24 sm:w-36 shrink-0 aspect-video bg-zinc-800 rounded-lg overflow-hidden">
                      {ep.still_path ? (
                        <img
                          src={`${TMDB_IMG}/w300${ep.still_path}`}
                          alt={ep.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                          E{String(ep.episode_number).padStart(2, "0")}
                        </div>
                      )}
                    </div>

                    {/* Episode info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-medium text-white group-hover:text-amber-400 transition-colors">
                            <span className="text-zinc-500 mr-1">{ep.episode_number}.</span>
                            {ep.name}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                            {ep.air_date && <span>{formatDate(ep.air_date)}</span>}
                            {ep.runtime && (
                              <>
                                <span className="text-zinc-700">·</span>
                                <span>{ep.runtime}m</span>
                              </>
                            )}
                            {ep.vote_average > 0 && (
                              <>
                                <span className="text-zinc-700">·</span>
                                <span className="text-yellow-500">{ep.vote_average.toFixed(1)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {ep.overview && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{ep.overview}</p>
                      )}
                    </div>
                  </Link>

                  {/* Watched icon */}
                  {hasStatus && (
                    <div className="flex-shrink-0">
                      <WatchedIcon
                        watched={status?.is_watched ?? false}
                        onClick={() => toggleWatched(ep.episode_number)}
                        disabled={!released || !status}
                        size="md"
                        compactOnMobile
                      />
                    </div>
                  )}
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
          <div className="flex gap-4 overflow-x-auto pb-2">
            {tmdb.credits.cast.slice(0, 15).map((c) => (
              <PersonCard key={c.id} id={c.id} name={c.name} role={c.character} profilePath={c.profile_path} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
