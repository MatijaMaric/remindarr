import { useCallback, useEffect, useState } from "react";
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
import { useGridNavigation } from "../hooks/useGridNavigation";
import { PageHeader } from "../components/design";

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
  useGridNavigation();

  // ── Advanced search filter state ────────────────────────────────────────────
  const [searchType, setSearchType] = useState<"" | "MOVIE" | "SHOW">("");
  const [yearMin, setYearMin] = useState<string>("");
  const [yearMax, setYearMax] = useState<string>("");
  const [minRating, setMinRating] = useState<string>("");
  const [searchLanguage, setSearchLanguage] = useState<string>("");
  const [availableLanguages, setAvailableLanguages] = useState<{ code: string; label: string }[]>([]);

  // Load languages once for the dropdown
  useEffect(() => {
    api.getLanguages().then(({ languages }) => {
      setAvailableLanguages(
        languages.map((code) => {
          let label = code;
          try {
            label = new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
          } catch { /* noop */ }
          return { code, label };
        }).sort((a, b) => a.label.localeCompare(b.label))
      );
    }).catch(() => { /* ignore */ });
  }, []);

  // Current search query ref so we can re-run when filters change while results are shown
  const [lastQuery, setLastQuery] = useState<string | null>(null);

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

  async function runSearch(
    query: string,
    overrides?: { type?: "" | "MOVIE" | "SHOW"; yearMin?: string; yearMax?: string; minRating?: string; language?: string }
  ) {
    setSearchLoading(true);
    setSearchError("");
    try {
      const effectiveType = overrides?.type !== undefined ? overrides.type : searchType;
      const effectiveYearMin = overrides?.yearMin !== undefined ? overrides.yearMin : yearMin;
      const effectiveYearMax = overrides?.yearMax !== undefined ? overrides.yearMax : yearMax;
      const effectiveMinRating = overrides?.minRating !== undefined ? overrides.minRating : minRating;
      const effectiveLanguage = overrides?.language !== undefined ? overrides.language : searchLanguage;
      const filters = {
        type: (effectiveType || undefined) as "MOVIE" | "SHOW" | undefined,
        yearMin: effectiveYearMin ? parseInt(effectiveYearMin, 10) : undefined,
        yearMax: effectiveYearMax ? parseInt(effectiveYearMax, 10) : undefined,
        minRating: effectiveMinRating ? parseFloat(effectiveMinRating) : undefined,
        language: effectiveLanguage || undefined,
      };
      const res = await api.searchTitles(query, filters);
      setSearchResults(res.titles.map(normalizeSearchTitle));
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSearch(query: string) {
    setLastQuery(query);
    await runSearch(query);
  }

  async function handleImdb(url: string) {
    setSearchLoading(true);
    setSearchError("");
    try {
      const res = await api.resolveImdb(url);
      if (res.title) {
        setSearchResults([normalizeSearchTitle(res.title)]);
      }
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchLoading(false);
    }
  }

  function clearSearch() {
    setSearchResults(null);
    setSearchError("");
    setLastQuery(null);
    setSearchType("");
    setYearMin("");
    setYearMax("");
    setMinRating("");
    setSearchLanguage("");
  }


  const RATING_OPTIONS = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5"] as const;
  const inputCls =
    "bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-500";
  const selectCls =
    "bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-500 w-full";
  const pillBase = "px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer";
  const pillActive = "bg-white text-black border-white";
  const pillInactive = "bg-transparent text-zinc-300 border-zinc-600 hover:border-zinc-400";

  return (
    <div className="space-y-6">
      <PageHeader kicker="Browse catalog" title="Browse" className="px-0 pt-4 pb-4" />
      <SearchBar onSearch={handleSearch} onImdb={handleImdb} loading={searchLoading} />


      {/* Advanced search filters shown only while search results are displayed */}
      {searchResults !== null && lastQuery !== null && (
        <div className="space-y-3 rounded-xl bg-zinc-900/60 border border-zinc-800 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {t("search.advancedFilters")}
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            {/* Type toggle */}
            <div className="flex items-center gap-1">
              <button
                className={`${pillBase} ${searchType === "" ? pillActive : pillInactive}`}
                onClick={() => { setSearchType(""); void runSearch(lastQuery, { type: "" }); }}
              >
                {t("filter.all")}
              </button>
              <button
                className={`${pillBase} ${searchType === "MOVIE" ? pillActive : pillInactive}`}
                onClick={() => { setSearchType("MOVIE"); void runSearch(lastQuery, { type: "MOVIE" }); }}
              >
                {t("filter.movies")}
              </button>
              <button
                className={`${pillBase} ${searchType === "SHOW" ? pillActive : pillInactive}`}
                onClick={() => { setSearchType("SHOW"); void runSearch(lastQuery, { type: "SHOW" }); }}
              >
                {t("filter.shows")}
              </button>
            </div>
            {/* Year range */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                className={inputCls + " w-24"}
                placeholder={t("filter.yearFrom")}
                value={yearMin}
                min={1900}
                max={2100}
                onChange={(e) => setYearMin(e.target.value)}
                onBlur={() => void runSearch(lastQuery)}
              />
              <span className="text-zinc-500 text-sm">–</span>
              <input
                type="number"
                className={inputCls + " w-24"}
                placeholder={t("filter.yearTo")}
                value={yearMax}
                min={1900}
                max={2100}
                onChange={(e) => setYearMax(e.target.value)}
                onBlur={() => void runSearch(lastQuery)}
              />
            </div>
            {/* Min rating */}
            <div className="w-36">
              <select
                className={selectCls}
                value={minRating}
                onChange={(e) => { setMinRating(e.target.value); void runSearch(lastQuery, { minRating: e.target.value }); }}
              >
                <option value="">{t("filter.anyRating")}</option>
                {RATING_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {t("filter.minRating")} {v}+
                  </option>
                ))}
              </select>
            </div>
            {/* Language */}
            {availableLanguages.length > 0 && (
              <div className="w-40">
                <select
                  className={selectCls}
                  value={searchLanguage}
                  onChange={(e) => { setSearchLanguage(e.target.value); void runSearch(lastQuery, { language: e.target.value }); }}
                >
                  <option value="">{t("filter.allLanguages")}</option>
                  {availableLanguages.map(({ code, label }) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
      <CategoryBar category={category} onCategoryChange={setCategory} />

      {searchError && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm">
          {searchError}
        </div>
      )}

      {searchResults !== null ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-[-0.01em]">{t("browse.searchResults", { count: searchResults.length })}</h2>
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
          <h2 className="text-xl font-bold tracking-[-0.01em] mb-4">{t(CATEGORY_LABEL_KEYS[category])}</h2>
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
