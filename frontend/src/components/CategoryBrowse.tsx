import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as api from "../api";
import type { Title } from "../types";
import { normalizeSearchTitle } from "../types";
import TitleList from "./TitleList";
import type { BrowseCategory } from "./CategoryBar";

/** Flatten pages, keeping the first copy of a title TMDB repeats on a later page. */
export function uniqueTitles(pages: { titles: Title[] }[]): Title[] {
  const seen = new Set<string>();
  const out: Title[] = [];
  for (const page of pages) {
    for (const title of page.titles) {
      if (seen.has(title.id)) continue;
      seen.add(title.id);
      out.push(title);
    }
  }
  return out;
}

interface Props {
  category: Exclude<BrowseCategory, "new_releases">;
  type: string[];
  genre: string[];
  provider: string[];
  language: string[];
  yearMin?: string;
  yearMax?: string;
  minRating?: string;
  hideTracked?: boolean;
  showProviderBadge?: boolean;
  showRating?: boolean;
  onResultsCount?: (count: number | null) => void;
  onlyMine?: boolean;
}

export default function CategoryBrowse({
  category,
  type,
  genre,
  provider,
  language,
  yearMin,
  yearMax,
  minRating,
  hideTracked,
  showProviderBadge,
  showRating,
  onResultsCount,
  onlyMine,
}: Props) {
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    refetch,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "browse",
      category,
      type,
      genre,
      provider,
      language,
      yearMin,
      yearMax,
      minRating,
      onlyMine,
    ],
    queryFn: ({ pageParam, signal }) =>
      api.browseTitles(
        {
          category,
          type: type.length ? type.join(",") : undefined,
          page: pageParam as number,
          genre: genre.length ? genre.join(",") : undefined,
          provider: provider.length ? provider.join(",") : undefined,
          language: language.length ? language.join(",") : undefined,
          yearMin: yearMin ? parseInt(yearMin, 10) : undefined,
          yearMax: yearMax ? parseInt(yearMax, 10) : undefined,
          minRating: minRating ? parseFloat(minRating) : undefined,
          onlyMine: onlyMine || undefined,
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last: { page: number; totalPages: number }) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    staleTime: 60_000,
  });

  const titles = useMemo(
    () =>
      uniqueTitles(
        data?.pages.map((p) => ({
          titles: p.titles.map(normalizeSearchTitle),
        })) ?? [],
      ),
    [data],
  );

  const lastPage = data?.pages[data.pages.length - 1];
  const totalPages = lastPage?.totalPages ?? 1;
  const page = lastPage?.page ?? 1;

  // Report the total on first page load; none while loading or failed, so the
  // header never keeps the previous list's count.
  useEffect(() => {
    onResultsCount?.(data?.pages[0]?.totalResults ?? null);
  }, [data?.pages, onResultsCount]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Keep a ref so the observer callback reads the latest isFetchingNextPage
  // without re-creating the observer on every state flip. Re-creating on each
  // isFetchingNextPage change caused it to fire immediately (sentinel still
  // visible) → auto-chaining pages 1→6 in a single burst.
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  useLayoutEffect(() => {
    isFetchingNextPageRef.current = isFetchingNextPage;
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasNextPage &&
          !isFetchingNextPageRef.current
        ) {
          void fetchNextPage();
        }
      },
      { rootMargin: "0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  // Stabilize the titles array passed into TitleList so React.memo can short-
  // circuit re-renders when neither `titles` nor `hideTracked` changed.
  const visibleTitles = useMemo(
    () => (hideTracked ? titles.filter((t) => !t.is_tracked) : titles),
    [titles, hideTracked],
  );

  const errorMessage =
    isError && error instanceof Error
      ? error.message
      : isError
        ? "Failed to load titles"
        : null;

  if (isLoading && titles.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* A failed first page has nothing to list: show the error alone. */}
      {!(errorMessage && titles.length === 0) && (
        <TitleList
          titles={visibleTitles}
          showProviderBadge={showProviderBadge}
          showRating={showRating}
          applyContentAdvisory
        />
      )}
      {errorMessage && (
        <div role="alert" className="text-center py-4 text-destructive">
          <p>{errorMessage}</p>
          <button
            onClick={() =>
              void (titles.length > 0 ? fetchNextPage() : refetch())
            }
            className="mt-2 text-sm underline hover:text-destructive"
          >
            Retry
          </button>
        </div>
      )}
      {!errorMessage && page < totalPages && (
        <div ref={sentinelRef} className="text-center py-4">
          {isFetchingNextPage ? (
            <div className="text-muted-foreground text-sm">Loading...</div>
          ) : (
            <button
              onClick={() => void fetchNextPage()}
              className="bg-fill-subtle border border-border text-foreground-secondary px-6 py-2.5 rounded-lg text-[13px] font-semibold sm:hidden"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
