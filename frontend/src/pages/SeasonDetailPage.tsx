import { useParams, Link } from "react-router";
import * as api from "../api";
import type { SeasonDetailsResponse } from "../types";
import PersonCard from "../components/PersonCard";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";

const TMDB_IMG = "https://image.tmdb.org/t/p";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function SeasonDetailPage() {
  const { id, season } = useParams<{ id: string; season: string }>();

  const { data, loading, error } = useApiCall<SeasonDetailsResponse>(
    () => api.getSeasonDetails(id!, Number(season)),
    [id, season],
  );

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

  return (
    <div className="space-y-8 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link to={`/title/${title.id}`} className="hover:text-white transition-colors">{title.title}</Link>
        <span className="text-gray-600">/</span>
        <span className="text-white">{tmdb?.name || `Season ${seasonNumber}`}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="w-40 shrink-0 mx-auto sm:mx-0">
          {posterUrl ? (
            <img src={posterUrl} alt={tmdb?.name || `Season ${seasonNumber}`} className="w-full rounded-xl shadow-xl" />
          ) : (
            <div className="aspect-[2/3] bg-gray-800 rounded-xl flex items-center justify-center text-gray-600">
              Season {seasonNumber}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <h1 className="text-2xl font-bold text-white">{tmdb?.name || `Season ${seasonNumber}`}</h1>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {tmdb?.air_date && <span>{formatDate(tmdb.air_date)}</span>}
            {episodes.length > 0 && (
              <>
                <span className="text-gray-600">·</span>
                <span>{episodes.length} episode{episodes.length !== 1 ? "s" : ""}</span>
              </>
            )}
            {tmdb?.vote_average ? (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-yellow-500">{tmdb.vote_average.toFixed(1)}</span>
              </>
            ) : null}
          </div>

          {tmdb?.overview && (
            <p className="text-gray-300 leading-relaxed">{tmdb.overview}</p>
          )}
        </div>
      </div>

      {/* Episode List */}
      {episodes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Episodes</h2>
          <div className="space-y-2">
            {episodes.map((ep) => (
              <Link
                key={ep.episode_number}
                to={`/title/${title.id}/season/${seasonNumber}/episode/${ep.episode_number}`}
                className="flex gap-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-indigo-500 transition-colors p-3 group"
              >
                {/* Episode still */}
                <div className="w-36 shrink-0 aspect-video bg-gray-800 rounded-lg overflow-hidden">
                  {ep.still_path ? (
                    <img
                      src={`${TMDB_IMG}/w300${ep.still_path}`}
                      alt={ep.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                      E{String(ep.episode_number).padStart(2, "0")}
                    </div>
                  )}
                </div>

                {/* Episode info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">
                        <span className="text-gray-500 mr-1">{ep.episode_number}.</span>
                        {ep.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        {ep.air_date && <span>{formatDate(ep.air_date)}</span>}
                        {ep.runtime && (
                          <>
                            <span className="text-gray-700">·</span>
                            <span>{ep.runtime}m</span>
                          </>
                        )}
                        {ep.vote_average > 0 && (
                          <>
                            <span className="text-gray-700">·</span>
                            <span className="text-yellow-500">{ep.vote_average.toFixed(1)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {ep.overview && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ep.overview}</p>
                  )}
                </div>
              </Link>
            ))}
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
