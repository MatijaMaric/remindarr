import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import SearchBar from "../components/SearchBar";
import NewReleases from "../components/NewReleases";
import CategoryBar, { type BrowseCategory } from "../components/CategoryBar";
import CategoryBrowse from "../components/CategoryBrowse";
import TitleList from "../components/TitleList";
import * as api from "../api";
import type { Title } from "../types";
import { normalizeSearchTitle } from "../types";
import { useState } from "react";

const VALID_CATEGORIES: BrowseCategory[] = ["new_releases", "popular", "upcoming", "top_rated"];

const CATEGORY_LABEL_KEYS: Record<BrowseCategory, string> = {
  new_releases: "browse.categories.new_releases",
  popular: "browse.categories.popular",
  upcoming: "browse.categories.upcoming",
  top_rated: "browse.categories.top_rated",
};

function useQueryParam(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  key: string,
  defaultValue = ""
): [string, (value: string) => void] {
  const value = searchParams.get(key) || defaultValue;
  const setValue = useCallback(
    (newValue: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newValue && newValue !== defaultValue) {
            next.set(key, newValue);
          } else {
            next.delete(key);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, key, defaultValue]
  );
  return [value, setValue];
}

function useQueryParamArray(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  key: string
): [string[], (values: string[]) => void] {
  const raw = searchParams.get(key) || "";
  const value = raw ? raw.split(",") : [];
  const setValue = useCallback(
    (newValues: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newValues.length > 0) {
            next.set(key, newValues.join(","));
          } else {
            next.delete(key);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, key]
  );
  return [value, setValue];
}

export const FILTER_KEYS = ["type", "genre", "provider", "language", "daysBack"] as const;

export function buildCategoryParams(prev: URLSearchParams, cat: BrowseCategory): URLSearchParams {
  const next = new URLSearchParams(prev);
  if (cat === "popular") {
    next.delete("category");
  } else {
    next.set("category", cat);
  }
  return next;
}

export default function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchResults, setSearchResults] = useState<Title[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const { t } = useTranslation();

  const rawCategory = searchParams.get("category") || "popular";
  const category: BrowseCategory = VALID_CATEGORIES.includes(rawCategory as BrowseCategory)
    ? (rawCategory as BrowseCategory)
    : "popular";

  const setCategory = useCallback(
    (cat: BrowseCategory) => {
      setSearchParams((prev) => buildCategoryParams(prev, cat), { replace: true });
    },
    [setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of FILTER_KEYS) {
          next.delete(key);
        }
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const [type, setType] = useQueryParamArray(searchParams, setSearchParams, "type");
  const [genre, setGenre] = useQueryParamArray(searchParams, setSearchParams, "genre");
  const [provider, setProvider] = useQueryParamArray(searchParams, setSearchParams, "provider");
  const [language, setLanguage] = useQueryParamArray(searchParams, setSearchParams, "language");
  const [daysBackStr, setDaysBackStr] = useQueryParam(searchParams, setSearchParams, "daysBack", "30");
  const daysBack = parseInt(daysBackStr, 10) || 30;
  const setDaysBack = useCallback(
    (days: number) => setDaysBackStr(String(days)),
    [setDaysBackStr]
  );
  const [hideTrackedStr, setHideTrackedStr] = useQueryParam(searchParams, setSearchParams, "hideTracked");
  const hideTracked = hideTrackedStr === "1";
  const setHideTracked = useCallback(
    (value: boolean) => setHideTrackedStr(value ? "1" : ""),
    [setHideTrackedStr]
  );

  async function handleSearch(query: string) {
    setSearchLoading(true);
    setSearchError("");
    try {
      const res = await api.searchTitles(query);
      setSearchResults(res.titles.map(normalizeSearchTitle));
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleImdb(url: string) {
    setSearchLoading(true);
    setSearchError("");
    try {
      const res = await api.resolveImdb(url);
      if (res.title) {
        setSearchResults([normalizeSearchTitle(res.title)]);
      }
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  }

  function clearSearch() {
    setSearchResults(null);
    setSearchError("");
  }

  return (
    <div className="space-y-6">
      <SearchBar onSearch={handleSearch} onImdb={handleImdb} loading={searchLoading} />

      <CategoryBar category={category} onCategoryChange={setCategory} />

      {searchError && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {searchError}
        </div>
      )}

      {searchResults !== null ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("browse.searchResults", { count: searchResults.length })}</h2>
            <button
              onClick={clearSearch}
              className="text-sm text-zinc-400 hover:text-white cursor-pointer"
            >
              {t("browse.clear")}
            </button>
          </div>
          <TitleList titles={searchResults} emptyMessage={t("browse.noResults")} />
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold mb-4">{t(CATEGORY_LABEL_KEYS[category])}</h2>
          {category === "new_releases" ? (
            <NewReleases
              type={type}
              onTypeChange={setType}
              daysBack={daysBack}
              onDaysBackChange={setDaysBack}
              genre={genre}
              onGenreChange={setGenre}
              provider={provider}
              onProviderChange={setProvider}
              language={language}
              onLanguageChange={setLanguage}
              onClearFilters={clearFilters}
              hideTracked={hideTracked}
              onHideTrackedChange={setHideTracked}
            />
          ) : (
            <CategoryBrowse
              key={category}
              category={category}
              type={type}
              onTypeChange={setType}
              genre={genre}
              onGenreChange={setGenre}
              provider={provider}
              onProviderChange={setProvider}
              language={language}
              onLanguageChange={setLanguage}
              onClearFilters={clearFilters}
              hideTracked={hideTracked}
              onHideTrackedChange={setHideTracked}
            />
          )}
        </div>
      )}
    </div>
  );
}
