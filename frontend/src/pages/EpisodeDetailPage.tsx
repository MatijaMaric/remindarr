import { useState } from "react";
import { useParams, Link } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ScrollableRow from "../components/ScrollableRow";
import * as api from "../api";
import type { EpisodeDetailsResponse, CastMember, CrewMember } from "../types";
import PersonCard from "../components/PersonCard";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";
import { useAuth } from "../context/AuthContext";
import { WatchedIcon } from "../components/EpisodeComponents";
import ShareButton from "../components/ShareButton";
import EpisodeRatingButtons from "../components/EpisodeRatingButtons";

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

export default function EpisodeDetailPage() {
  const { id, season, episode } = useParams<{ id: string; season: string; episode: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();

  const { data, loading, error } = useApiCall<EpisodeDetailsResponse>(
    () => api.getEpisodeDetails(id!, Number(season), Number(episode)),
    [id, season, episode],
  );

  const [episodeStatus, setEpisodeStatus] = useState<{ id: number; is_watched: boolean } | null>(null);

  useApiCall(
    () => user && id && season
      ? api.getSeasonEpisodeStatus(id, Number(season))
      : Promise.resolve({ episodes: [] }),
    [user, id, season, episode],
    {
      onSuccess: (result) => {
        const match = result.episodes.find((ep) => ep.episode_number === Number(episode));
        setEpisodeStatus(match ? { id: match.id, is_watched: match.is_watched } : null);
      },
    },
  );

  const toggleWatched = async () => {
    if (!episodeStatus) return;

    const wasWatched = episodeStatus.is_watched;
    setEpisodeStatus({ ...episodeStatus, is_watched: !wasWatched });

    try {
      if (wasWatched) {
        await api.unwatchEpisode(episodeStatus.id);
      } else {
        await api.watchEpisode(episodeStatus.id);
      }
    } catch {
      setEpisodeStatus({ ...episodeStatus, is_watched: wasWatched });
      toast.error(t("episodes.watchedError", "Failed to update watched status"));
    }
  };

  if (loading) {
    return <DetailPageSkeleton />;
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
  const released = isReleased(tmdb?.air_date);

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
      <div className="flex items-center gap-2 text-sm text-zinc-400 flex-wrap">
        <Link to={`/title/${title.id}`} className="hover:text-white transition-colors">{title.title}</Link>
        <span className="text-zinc-600">/</span>
        <Link to={`/title/${title.id}/season/${seasonNumber}`} className="hover:text-white transition-colors">
          Season {seasonNumber}
        </Link>
        <span className="text-zinc-600">/</span>
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">
            <span className="text-zinc-500">S{String(seasonNumber).padStart(2, "0")}E{String(episodeNumber).padStart(2, "0")}</span>
            {" "}
            {tmdb?.name || `Episode ${episodeNumber}`}
          </h1>
          {episodeStatus && (
            <WatchedIcon
              watched={episodeStatus.is_watched}
              onClick={toggleWatched}
              disabled={!released}
              size="md"
            />
          )}
          <ShareButton title={`${title.title} — ${tmdb?.name || `Episode ${episodeNumber}`}`} />
        </div>

        <div className="flex items-center gap-3 text-sm text-zinc-400">
          {tmdb?.air_date && <span>{formatDate(tmdb.air_date)}</span>}
          {tmdb?.runtime && (
            <>
              <span className="text-zinc-600">·</span>
              <span>{tmdb.runtime}m</span>
            </>
          )}
          {tmdb?.vote_average ? (
            <>
              <span className="text-zinc-600">·</span>
              <span className="text-yellow-500 font-medium">{tmdb.vote_average.toFixed(1)}</span>
              {tmdb.vote_count > 0 && (
                <span className="text-zinc-600 text-xs">({tmdb.vote_count} votes)</span>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Rating */}
      {released && episodeStatus && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Rate this episode</h2>
          <EpisodeRatingButtons episodeId={episodeStatus.id} />
        </section>
      )}

      {/* Overview */}
      {tmdb?.overview && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Overview</h2>
          <p className="text-zinc-300 leading-relaxed">{tmdb.overview}</p>
        </section>
      )}

      {/* Key Crew */}
      {(directors.length > 0 || writers.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Crew</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {directors.length > 0 && (
              <div>
                <span className="text-zinc-400">Directed by: </span>
                <span className="text-white">{directors.map(d => d.name).join(", ")}</span>
              </div>
            )}
            {writers.length > 0 && (
              <div>
                <span className="text-zinc-400">Written by: </span>
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
          <ScrollableRow className="gap-4 pb-2">
            {allCast.slice(0, 20).map((c) => (
              <PersonCard key={c.id} id={c.id} name={c.name} role={c.character} profilePath={c.profile_path} />
            ))}
          </ScrollableRow>
        </section>
      )}
    </div>
  );
}
