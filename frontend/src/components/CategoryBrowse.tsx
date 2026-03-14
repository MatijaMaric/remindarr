import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as api from "../api";
import type { Title, Provider } from "../types";
import { normalizeSearchTitle } from "../types";
import TitleList from "./TitleList";
import FilterBar from "./FilterBar";
import type { BrowseCategory } from "./CategoryBar";

export function filterBrowseTitles(
  titles: Title[],
  filters: { genre: string; provider: string; language: string }
): Title[] {
  return titles.filter((t) => {
    if (filters.genre && !t.genres.includes(filters.genre)) return false;
    if (filters.provider && !t.offers.some((o) => o.provider_technical_name === filters.provider))
      return false;
    if (filters.language && t.original_language !== filters.language) return false;
    return true;
  });
}

export function extractBrowseGenres(titles: Title[]): string[] {
  const set = new Set<string>();
  titles.forEach((t) => t.genres.forEach((g) => set.add(g)));
  return Array.from(set).sort();
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
  type: string;
  onTypeChange: (type: string) => void;
  genre: string;
  onGenreChange: (genre: string) => void;
  provider: string;
  onProviderChange: (provider: string) => void;
  language: string;
  onLanguageChange: (language: string) => void;
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
}: Props) {
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);

  // Track providers/languages from loaded titles for dropdowns
  const availableProviders = useMemo(() => extractBrowseProviders(titles), [titles]);
  const availableLanguages = useMemo(() => extractBrowseLanguages(titles), [titles]);

  const fetchTitles = useCallback(async (pageNum: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const res = await api.browseTitles({
        category,
        type: type || undefined,
        page: pageNum,
        genre: genre || undefined,
        provider: provider || undefined,
        language: language || undefined,
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
      setTotalPages(res.totalPages);
      setPage(pageNum);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, type, genre, provider, language]);

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

  return (
    <div className="space-y-4">
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
        language={language}
        onLanguageChange={onLanguageChange}
        languages={availableLanguages}
      />

      {error && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          <TitleList titles={titles} emptyMessage="No titles found." />
          {page < totalPages && (
            <div ref={sentinelRef} className="text-center py-4">
              {loadingMore && (
                <div className="text-gray-500 text-sm">Loading...</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
