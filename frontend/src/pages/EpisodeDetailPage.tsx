import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ScrollableRow from "../components/ScrollableRow";
import * as api from "../api";
import type { CastMember, CrewMember } from "../types";
import PersonCard from "../components/PersonCard";
import { DetailPageSkeleton } from "../components/SkeletonComponents";

import { useAuth } from "../context/AuthContext";
import { WatchedIcon } from "../components/EpisodeComponents";
import ShareButton from "../components/ShareButton";
import EpisodeRatingButtons from "../components/EpisodeRatingButtons";
import { stillUrl as mkStillUrl } from "../lib/tmdb-images";
import SectionErrorBoundary from "../components/SectionErrorBoundary";
import EditWatchedAtDialog from "../components/EditWatchedAtDialog";
import { formatDate } from "../components/title-detail/utils";

function isReleased(airDate: string | null | undefined): boolean {
  if (!airDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return airDate <= today;
}

export default function EpisodeDetailPage() {
  const { id, season, episode } = useParams<{
    id: string;
    season: string;
    episode: string;
  }>();
  const { user } = useAuth();
  const { t } = useTranslation();

  const {
    data,
    isLoading: loading,
    isError: error,
  } = useQuery({
    queryKey: ["episode-detail", id, season, episode],
    queryFn: ({ signal }) =>
      api.getEpisodeDetails(id!, Number(season), Number(episode), signal),
    enabled: !!id && !!season && !!episode,
  });

  const [editHistoryEntry, setEditHistoryEntry] = useState<string | null>(null);
  const qc = useQueryClient();

  type SeasonStatusEntry = {
    episode_number: number;
    id: number;
    is_watched: boolean;
  };
  type SeasonStatusData = { episodes: SeasonStatusEntry[] };

  const { data: statusData } = useQuery({
    queryKey: ["season-status", id, season],
    queryFn: ({ signal }) =>
      user && id && season
        ? api.getSeasonEpisodeStatus(id, Number(season), signal)
        : Promise.resolve({ episodes: [] as SeasonStatusEntry[] }),
    enabled: !!user && !!id && !!season,
  });

  const episodeStatus = useMemo(() => {
    const match = statusData?.episodes.find(
      (ep) => ep.episode_number === Number(episode),
    );
    return match ? { id: match.id, is_watched: match.is_watched } : null;
  }, [statusData, episode]);

  const { data: historyData } = useQuery({
    queryKey: ["watch-history", id, episodeStatus?.id],
    queryFn: ({ signal }) =>
      api.getWatchHistory(id!, { episodeId: episodeStatus!.id }, signal),
    enabled: !!id && !!episodeStatus?.id && !!episodeStatus?.is_watched,
  });
  const watchHistoryEntries = useMemo(
    () => historyData?.history ?? [],
    [historyData],
  );

  const toggleMutation = useMutation({
    mutationFn: (status: { id: number; is_watched: boolean }) =>
      status.is_watched
        ? api.unwatchEpisode(status.id)
        : api.watchEpisode(status.id),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ["season-status", id, season] });
      const snapshot = qc.getQueryData<SeasonStatusData>([
        "season-status",
        id,
        season,
      ]);
      qc.setQueryData<SeasonStatusData>(
        ["season-status", id, season],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            episodes: old.episodes.map((ep) =>
              ep.id === status.id
                ? { ...ep, is_watched: !status.is_watched }
                : ep,
            ),
          };
        },
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        qc.setQueryData(["season-status", id, season], context.snapshot);
      }
      toast.error(
        t("episodes.watchedError", "Failed to update watched status"),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["season-status", id, season] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const toggleWatched = () => {
    if (!episodeStatus) return;
    toggleMutation.mutate(episodeStatus);
  };

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400 select-text">Episode not found</div>
      </div>
    );
  }

  const { title, tmdb, seasonNumber, episodeNumber } = data;
  const stillUrl = mkStillUrl(tmdb?.still_path, "w780");
  const released = isReleased(tmdb?.air_date);

  // Merge guest_stars and credits.cast, deduplicating by id
  const allCast: CastMember[] = [];
  const seenIds = new Set<number>();
  for (const c of [
    ...(tmdb?.guest_stars || []),
    ...(tmdb?.credits?.cast || []),
  ]) {
    if (!seenIds.has(c.id)) {
      seenIds.add(c.id);
      allCast.push(c);
    }
  }

  // Key crew from the episode
  const directors =
    tmdb?.crew?.filter((c: CrewMember) => c.job === "Director") || [];
  const writers =
    tmdb?.crew?.filter((c: CrewMember) => c.department === "Writing") || [];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-400 flex-wrap">
        <Link
          to={`/title/${title.id}`}
          className="hover:text-white transition-colors"
        >
          {title.title}
        </Link>
        <span className="text-zinc-600">/</span>
        <Link
          to={`/title/${title.id}/season/${seasonNumber}`}
          className="hover:text-white transition-colors"
        >
          Season {seasonNumber}
        </Link>
        <span className="text-zinc-600">/</span>
        <span className="text-white">Episode {episodeNumber}</span>
      </div>

      {/* Still image */}
      <div className="rounded-xl overflow-hidden">
        {stillUrl ? (
          <img
            src={stillUrl}
            alt={tmdb?.name || `Episode ${episodeNumber}`}
            className="w-full"
            width={780}
            height={439}
            loading="eager"
          />
        ) : (
          <div className="w-full aspect-video bg-zinc-800 flex items-center justify-center">
            <span className="text-zinc-400 text-sm">No preview available</span>
          </div>
        )}
      </div>

      {/* Episode header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white select-text">
            <span className="text-zinc-500">
              S{String(seasonNumber).padStart(2, "0")}E
              {String(episodeNumber).padStart(2, "0")}
            </span>{" "}
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
          <ShareButton
            title={`${title.title} — ${tmdb?.name || `Episode ${episodeNumber}`}`}
          />
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
              <span className="text-yellow-500 font-medium">
                {tmdb.vote_average.toFixed(1)}
              </span>
              {tmdb.vote_count > 0 && (
                <span className="text-zinc-600 text-xs">
                  ({tmdb.vote_count} votes)
                </span>
              )}
            </>
          ) : null}
        </div>

        {episodeStatus?.is_watched && watchHistoryEntries.length > 0 && (
          <button
            onClick={() => setEditHistoryEntry(watchHistoryEntries[0].id)}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors underline-offset-2 hover:underline cursor-pointer"
          >
            Watched{" "}
            {new Date(
              watchHistoryEntries[0].watchedAt.replace(" ", "T") + "Z",
            ).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </button>
        )}
      </div>

      {/* Rating */}
      {released && episodeStatus && (
        <SectionErrorBoundary label="ratings">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">
              Rate this episode
            </h2>
            <EpisodeRatingButtons episodeId={episodeStatus.id} />
          </section>
        </SectionErrorBoundary>
      )}

      {/* Overview */}
      {tmdb?.overview && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Overview</h2>
          <p className="text-zinc-300 leading-relaxed select-text">
            {tmdb.overview}
          </p>
        </section>
      )}

      {/* Key Crew */}
      {(directors.length > 0 || writers.length > 0) && (
        <SectionErrorBoundary label="crew">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-white">Crew</h2>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {directors.length > 0 && (
                <div>
                  <span className="text-zinc-400">Directed by: </span>
                  <span className="text-white">
                    {directors.map((d) => d.name).join(", ")}
                  </span>
                </div>
              )}
              {writers.length > 0 && (
                <div>
                  <span className="text-zinc-400">Written by: </span>
                  <span className="text-white">
                    {writers.map((w) => w.name).join(", ")}
                  </span>
                </div>
              )}
            </div>
          </section>
        </SectionErrorBoundary>
      )}

      {/* Guest Stars / Cast */}
      {allCast.length > 0 && (
        <SectionErrorBoundary label="cast">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Cast</h2>
            <ScrollableRow className="gap-4 pb-2">
              {allCast.slice(0, 20).map((c) => (
                <PersonCard
                  key={c.id}
                  id={c.id}
                  name={c.name}
                  role={c.character}
                  profilePath={c.profile_path}
                />
              ))}
            </ScrollableRow>
          </section>
        </SectionErrorBoundary>
      )}

      {editHistoryEntry && (
        <EditWatchedAtDialog
          open={true}
          onClose={() => setEditHistoryEntry(null)}
          entryId={editHistoryEntry}
          currentWatchedAt={
            watchHistoryEntries.find((e) => e.id === editHistoryEntry)
              ?.watchedAt ?? ""
          }
          anchorDate={data?.tmdb?.air_date ?? null}
          onUpdated={() => {
            void qc.invalidateQueries({ queryKey: ["watch-history", id] });
            setEditHistoryEntry(null);
          }}
        />
      )}
    </div>
  );
}
