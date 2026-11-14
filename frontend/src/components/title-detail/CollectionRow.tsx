import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import * as api from "../../api";
import { posterUrl } from "../../lib/tmdb-images";
import ScrollableRow from "../ScrollableRow";
import { TitleCardSkeleton } from "../SkeletonComponents";
import { Section } from "./Section";
import SectionErrorBoundary from "../SectionErrorBoundary";

interface CollectionRowProps {
  collectionId: number;
  collectionName: string;
  currentTitleId: string;
}

function CollectionRowInner({
  collectionId,
  collectionName,
  currentTitleId,
}: CollectionRowProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: ({ signal }) => api.getCollection(collectionId, signal),
  });

  const parts = useMemo(() => {
    const list = data?.parts ?? [];
    return [...list].sort((a, b) => {
      if (!a.release_date) return 1;
      if (!b.release_date) return -1;
      return a.release_date.localeCompare(b.release_date);
    });
  }, [data]);

  if (!isLoading && parts.length === 0) return null;

  return (
    <Section title={collectionName}>
      {isLoading ? (
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-28 flex-shrink-0">
              <TitleCardSkeleton />
            </div>
          ))}
        </div>
      ) : (
        <ScrollableRow className="gap-3 py-1">
          {parts.map((part) => {
            const isCurrent = `movie-${part.id}` === currentTitleId;
            const imgSrc = posterUrl(part.poster_path, "w185");
            return (
              <Link
                key={part.id}
                to={`/title/movie-${part.id}`}
                aria-current={isCurrent ? "true" : undefined}
                className={`w-28 flex-shrink-0 group${isCurrent ? " pointer-events-none" : ""}`}
              >
                <div
                  className={`aspect-[2/3] rounded-md overflow-hidden bg-muted${
                    isCurrent ? " ring-2 ring-primary" : ""
                  }`}
                >
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={part.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                      width={112}
                      height={168}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      N/A
                    </div>
                  )}
                </div>
                <p
                  className={`text-xs mt-1.5 line-clamp-2 transition-colors${
                    isCurrent
                      ? " text-primary-text"
                      : " text-foreground-secondary group-hover:text-primary-text"
                  }`}
                >
                  {part.title}
                </p>
                {part.release_date && (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {part.release_date.slice(0, 4)}
                  </p>
                )}
              </Link>
            );
          })}
        </ScrollableRow>
      )}
    </Section>
  );
}

export default function CollectionRow(props: CollectionRowProps) {
  return (
    <SectionErrorBoundary label="collection">
      <CollectionRowInner {...props} />
    </SectionErrorBoundary>
  );
}
