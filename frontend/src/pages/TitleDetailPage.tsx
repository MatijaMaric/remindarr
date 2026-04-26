import { useEffect, useState } from "react";
import { useParams } from "react-router";
import * as api from "../api";
import type { MovieDetailsResponse, ShowDetailsResponse } from "../types";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import MovieDetail from "./title/MovieDetail";
import ShowDetail from "./title/ShowDetail";

export default function TitleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movieData, setMovieData] = useState<MovieDetailsResponse | null>(null);
  const [showData, setShowData] = useState<ShowDetailsResponse | null>(null);

  useEffect(() => {
    if (!id) return;
    const titleId = id;
    const controller = new AbortController();
    const { signal } = controller;

    // Determine type from the ID prefix (e.g. "movie-123" or "tv-456")
    // to avoid making two API calls for shows.
    const isShow = titleId.startsWith("tv-");

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isShow) {
          const data = await api.getShowDetails(titleId, signal);
          if (!signal.aborted) setShowData(data);
        } else {
          const data = await api.getMovieDetails(titleId, signal);
          if (!signal.aborted) setMovieData(data);
        }
      } catch (e: unknown) {
        if (!signal.aborted) setError(e instanceof Error ? e.message : "Failed to load details");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => {
      controller.abort();
    };
  }, [id]);

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (movieData) return <MovieDetail data={movieData} />;
  if (showData) return <ShowDetail data={showData} />;

  return <div className="text-zinc-400 text-center py-20">Title not found</div>;
}
