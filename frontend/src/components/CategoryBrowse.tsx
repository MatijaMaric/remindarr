import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as api from "../api";
import type { Title } from "../types";
import { normalizeSearchTitle } from "../types";
import TitleList from "./TitleList";
import FilterBar from "./FilterBar";
import type { BrowseCategory } from "./CategoryBar";

export function filterBrowseTitles(
  titles: Title[],
  filters: { genre: string[]; provider: string[]; language: string[] }
): Title[] {
  return titles.filter((t) => {
    if (filters.genre.length > 0 && !filters.genre.some((g) => t.genres.includes(g))) return false;
    if (filters.provider.length > 0 && !t.offers.some((o) => filters.provider.includes(o.provider_technical_name)))
      return false;
    if (filters.language.length > 0 && !filters.language.includes(t.original_language ?? "")) return false;
    return true;
  });
}

export function extractBrowseGenres(titles: Title[]): string[] {
  const set = new Set<string>();
  titles.forEach((t) => t.genres.forEach((g) => set.add(g)));
  return Array.from(set).sort();
}

interface Provider {
  id: number;
  name: string;
  technical_name: string;
  icon_url: string;
}

export function extractBrowseProviders(titles: Title[]): Provider[] {
  const map = new Map<string, Provider>();
  titles.forEach((t) =>
    t.offers.forEach((o) => {
      if (!map.has(o.provider_technical_name)) {
        map.set(o.provider_technical_name, {
          id: o.provider_id,
          name: o.provider_name,
          technical_name: o.provider_technical_name,
          icon_url: o.provider_icon_url,
        });
      }
    })
  );
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function extractBrowseLanguages(titles: Title[]): string[] {
  const set = new Set<string>();
  titles.forEach((t) => {
    if (t.original_language) set.add(t.original_language);
  });
  return Array.from(set).sort();
}

interface Props {
  category: Exclude<BrowseCategory, "new_releases">;
  type: string[];
  onTypeChange: (type: string[]) => void;
  genre: string[];
  onGenreChange: (genre: string[]) => void;
  provider: string[];
  onProviderChange: (provider: string[]) => void;
  language: string[];
  onLanguageChange: (language: string[]) => void;
  yearMin?: string;
  yearMax?: string;
  minRating?: string;
  onClearFilters?: () => void;
  hideTracked?: boolean;
  onHideTrackedChange?: (value: boolean) => void;
  hideFilterBar?: boolean;
  showProviderBadge?: boolean;
  showRating?: boolean;
  onResultsCount?: (count: number) => void;
  onlyMine?: boolean;
}

export default function CategoryBrowse({
  category,
  type,
  onTypeChange,
  genre,
  onGenreChange,
  provider,
  onProviderChange,
  language,
  onLanguageChange,
  yearMin,
  yearMax,
  minRating,
  onClearFilters,
  hideTracked,
  onHideTrackedChange,
  hideFilterBar,
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
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["browse", category, type, genre, provider, language, yearMin, yearMax, minRating, onlyMine],
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
    () => data?.pages.flatMap((p) => p.titles.map(normalizeSearchTitle)) ?? [],
    [data],
  );

  const lastPage = data?.pages[data.pages.length - 1];
  const totalPages = lastPage?.totalPages ?? 1;
  const page = lastPage?.page ?? 1;

  // Report total results count on first page load
  useEffect(() => {
    const firstPage = data?.pages[0];
    if (firstPage) {
      onResultsCount?.(firstPage.totalResults);
    }
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
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPageRef.current) {
          void fetchNextPage();
        }
      },
      { rootMargin: "0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  // Stabilize the titles array passed into TitleList so React.memo can short-
  // circuit re-renders when neither `titles` nor `hideTracked` changed.
  const visibleTitles = useMemo(
    () => (hideTracked ? titles.filter((t) => !t.is_tracked) : titles),
    [titles, hideTracked]
  );

  const errorMessage = isError && error instanceof Error ? error.message : isError ? "Failed to load titles" : null;

  return (
    <div className="space-y-4">
      {!hideFilterBar && (
        <FilterBar
          type={type}
          onTypeChange={onTypeChange}
          showDaysFilter={false}
          genre={genre}
          onGenreChange={onGenreChange}
          genres={[]}
          provider={provider}
          onProviderChange={onProviderChange}
          providers={[]}
          regionProviderIds={[]}
          language={language}
          onLanguageChange={onLanguageChange}
          languages={[]}
          priorityLanguageCodes={[]}
          onClearFilters={onClearFilters}
          hideTracked={hideTracked}
          onHideTrackedChange={onHideTrackedChange}
        />
      )}

      {errorMessage && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {errorMessage}
        </div>
      )}

      {isLoading && titles.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : (
        <>
          <TitleList
            titles={visibleTitles}
            emptyMessage="No titles found."
            showProviderBadge={showProviderBadge}
            showRating={showRating}
          />
          {errorMessage && (
            <div className="text-center py-4 text-red-400">
              <p>{errorMessage}</p>
              <button
                onClick={() => void fetchNextPage()}
                className="mt-2 text-sm underline hover:text-red-300"
              >
                Retry
              </button>
            </div>
          )}
          {!errorMessage && page < totalPages && (
            <div ref={sentinelRef} className="text-center py-4">
              {isFetchingNextPage ? (
                <div className="text-zinc-500 text-sm">Loading...</div>
              ) : (
                <button
                  onClick={() => void fetchNextPage()}
                  className="bg-white/[0.05] border border-white/[0.08] text-zinc-300 px-6 py-2.5 rounded-xl text-[13px] font-semibold sm:hidden"
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
