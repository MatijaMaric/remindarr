import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import * as api from "../api";
import type { MovieDetailsResponse, ShowDetailsResponse } from "../types";
import { DetailPageSkeleton } from "../components/SkeletonComponents";
import MovieDetail from "./title/MovieDetail";
import ShowDetail from "./title/ShowDetail";

type TitleDetailData = MovieDetailsResponse | ShowDetailsResponse;

export default function TitleDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { isLoading, isError, error, data } = useQuery<TitleDetailData>({
    queryKey: ["title-detail", id],
    enabled: !!id,
    queryFn: ({ signal }) => {
      const isShow = id!.startsWith("tv-");
      return isShow ? api.getShowDetails(id!, signal) : api.getMovieDetails(id!, signal);
    },
  });

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400 select-text">
          {error instanceof Error ? error.message : "Failed to load details"}
        </div>
      </div>
    );
  }

  if (data && data.title.object_type === "MOVIE") {
    return <MovieDetail data={data as MovieDetailsResponse} />;
  }
  if (data && data.title.object_type === "SHOW") {
    return <ShowDetail data={data as ShowDetailsResponse} />;
  }

  return <div className="text-zinc-400 text-center py-20">Title not found</div>;
}
