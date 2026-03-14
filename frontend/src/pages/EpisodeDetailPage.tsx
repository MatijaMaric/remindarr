import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import * as api from "../api";
import type { EpisodeDetailsResponse, CastMember, CrewMember } from "../types";
import PersonCard from "../components/PersonCard";

const TMDB_IMG = "https://image.tmdb.org/t/p";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function EpisodeDetailPage() {
  const { id, season, episode } = useParams<{ id: string; season: string; episode: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EpisodeDetailsResponse | null>(null);

  useEffect(() => {
    if (!id || !season || !episode) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getEpisodeDetails(id!, Number(season), Number(episode));
        if (!cancelled) setData(result);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load episode details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id, season, episode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">Loading episode details...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">{error || "Episode not found"}</div>
      </div>
    );
  }

  const { title, tmdb, seasonNumber, episodeNumber } = data;
  const stillUrl = tmdb?.still_path ? `${TMDB_IMG}/w780${tmdb.still_path}` : null;

  // Merge guest_stars and credits.cast, deduplicating by id
  const allCast: CastMember[] = [];
  const seenIds = new Set<number>();
  for (const c of [...(tmdb?.guest_stars || []), ...(tmdb?.credits?.cast || [])]) {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      allCast.push(c);
    }
  }

  // Key crew from the episode
  const directors = tmdb?.crew?.filter((c: CrewMember) => c.job === "Director") || [];
  const writers = tmdb?.crew?.filter((c: CrewMember) => c.department === "Writing") || [];

  return (
    <div className="space-y-8 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
        <Link to={`/title/${title.id}`} className="hover:text-white transition-colors">{title.title}</Link>
        <span className="text-gray-600">/</span>
        <Link to={`/title/${title.id}/season/${seasonNumber}`} className="hover:text-white transition-colors">
          Season {seasonNumber}
        </Link>
        <span className="text-gray-600">/</span>
        <span className="text-white">Episode {episodeNumber}</span>
      </div>

      {/* Still image */}
      {stillUrl && (
        <div className="rounded-xl overflow-hidden">
          <img src={stillUrl} alt={tmdb?.name || `Episode ${episodeNumber}`} className="w-full" />
        </div>
      )}

      {/* Episode header */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-white">
          <span className="text-gray-500">S{String(seasonNumber).padStart(2, "0")}E{String(episodeNumber).padStart(2, "0")}</span>
          {" "}
          {tmdb?.name || `Episode ${episodeNumber}`}
        </h1>

        <div className="flex items-center gap-3 text-sm text-gray-400">
          {tmdb?.air_date && <span>{formatDate(tmdb.air_date)}</span>}
          {tmdb?.runtime && (
            <>
              <span className="text-gray-600">·</span>
              <span>{tmdb.runtime}m</span>
            </>
          )}
          {tmdb?.vote_average ? (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-yellow-500 font-medium">{tmdb.vote_average.toFixed(1)}</span>
              {tmdb.vote_count > 0 && (
                <span className="text-gray-600 text-xs">({tmdb.vote_count} votes)</span>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Overview */}
      {tmdb?.overview && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Overview</h2>
          <p className="text-gray-300 leading-relaxed">{tmdb.overview}</p>
        </section>
      )}

      {/* Key Crew */}
      {(directors.length > 0 || writers.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Crew</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {directors.length > 0 && (
              <div>
                <span className="text-gray-400">Directed by: </span>
                <span className="text-white">{directors.map(d => d.name).join(", ")}</span>
              </div>
            )}
            {writers.length > 0 && (
              <div>
                <span className="text-gray-400">Written by: </span>
                <span className="text-white">{writers.map(w => w.name).join(", ")}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Guest Stars / Cast */}
      {allCast.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Cast</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {allCast.slice(0, 20).map((c) => (
              <PersonCard key={c.id} id={c.id} name={c.name} role={c.character} profilePath={c.profile_path} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
