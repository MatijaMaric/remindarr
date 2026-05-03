import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as api from "../api";
import type { Title } from "../types";
import { normalizeSearchTitle } from "../types";
import TitleList from "./TitleList";
import FilterBar from "./FilterBar";
import type { BrowseCategory } from "./CategoryBar";
import { useAsyncError } from "../hooks/useAsyncError";

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
  const [titles, setTitles] = useState<Title[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { run, error, pending: loading } = useAsyncError();
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);

  const [availableProviders, setAvailableProviders] = useState<{ id: number; name: string; iconUrl: string }[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<{ code: string; name: string }[]>([]);
  const [regionProviderIds, setRegionProviderIds] = useState<number[]>([]);
  const [priorityLanguageCodes, setPriorityLanguageCodes] = useState<string[]>([]);

  const fetchTitles = useCallback((pageNum: number, append: boolean) => {
    return run(async () => {
      if (append) {
        setLoadingMore(true);
      }
      try {
        const yearMinNum = yearMin ? parseInt(yearMin, 10) : undefined;
        const yearMaxNum = yearMax ? parseInt(yearMax, 10) : undefined;
        const minRatingNum = minRating ? parseFloat(minRating) : undefined;
        const res = await api.browseTitles({
          category,
          type: type.length ? type.join(",") : undefined,
          page: pageNum,
          genre: genre.length ? genre.join(",") : undefined,
          provider: provider.length ? provider.join(",") : undefined,
          language: language.length ? language.join(",") : undefined,
          yearMin: yearMinNum != null && Number.isFinite(yearMinNum) ? yearMinNum : undefined,
          yearMax: yearMaxNum != null && Number.isFinite(yearMaxNum) ? yearMaxNum : undefined,
          minRating: minRatingNum != null && Number.isFinite(minRatingNum) ? minRatingNum : undefined,
          onlyMine: onlyMine || undefined,
        });
        const normalized = res.titles.map(normalizeSearchTitle);
        if (append) {
          setTitles((prev) => [...prev, ...normalized]);
        } else {
          setTitles(normalized);
        }
        if (res.availableGenres) {
          setAvailableGenres(res.availableGenres);
        }
        if (res.availableProviders) {
          setAvailableProviders(res.availableProviders);
        }
        if (res.availableLanguages) {
          setAvailableLanguages(res.availableLanguages);
        }
        if (res.regionProviderIds) {
          setRegionProviderIds(res.regionProviderIds);
        }
        if (res.priorityLanguageCodes) {
          setPriorityLanguageCodes(res.priorityLanguageCodes);
        }
        setTotalPages(res.totalPages);
        if (!append) {
          onResultsCount?.(res.totalResults);
        }
        setPage(pageNum);
      } finally {
        setLoadingMore(false);
      }
    });
  }, [run, category, type, genre, provider, language, yearMin, yearMax, minRating, onlyMine, onResultsCount]);

  useEffect(() => {
    fetchTitles(1, false);
  }, [fetchTitles]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && page < totalPages && !loadingMore) {
          fetchTitles(page + 1, true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [page, totalPages, loadingMore, fetchTitles]);

  // Stabilize the titles array passed into TitleList so React.memo can short-
  // circuit re-renders when neither `titles` nor `hideTracked` changed.
  const visibleTitles = useMemo(
    () => (hideTracked ? titles.filter((t) => !t.is_tracked) : titles),
    [titles, hideTracked]
  );

  return (
    <div className="space-y-4">
      {!hideFilterBar && (
        <FilterBar
          type={type}
          onTypeChange={onTypeChange}
          showDaysFilter={false}
          genre={genre}
          onGenreChange={onGenreChange}
          genres={availableGenres}
          provider={provider}
          onProviderChange={onProviderChange}
          providers={availableProviders}
          regionProviderIds={regionProviderIds}
          language={language}
          onLanguageChange={onLanguageChange}
          languages={availableLanguages}
          priorityLanguageCodes={priorityLanguageCodes}
          onClearFilters={onClearFilters}
          hideTracked={hideTracked}
          onHideTrackedChange={onHideTrackedChange}
        />
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading && titles.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">Loading...</div>
      ) : (
        <>
          <TitleList
            titles={visibleTitles}
            emptyMessage="No titles found."
            showProviderBadge={showProviderBadge}
            showRating={showRating}
          />
          {error && (
            <div className="text-center py-4 text-red-400">
              <p>{error}</p>
              <button
                onClick={() => fetchTitles(page + 1, true)}
                className="mt-2 text-sm underline hover:text-red-300"
              >
                Retry
              </button>
            </div>
          )}
          {!error && page < totalPages && (
            <div ref={sentinelRef} className="text-center py-4">
              {loadingMore ? (
                <div className="text-zinc-500 text-sm">Loading...</div>
              ) : (
                <button
                  onClick={() => fetchTitles(page + 1, true)}
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
