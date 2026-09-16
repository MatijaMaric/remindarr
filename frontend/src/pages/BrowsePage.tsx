import { useCallback, useState, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import SearchBar from "../components/SearchBar";
import NewReleases from "../components/NewReleases";
import CategoryBar, { type BrowseCategory } from "../components/CategoryBar";
import CategoryBrowse from "../components/CategoryBrowse";
import FilterBar from "../components/FilterBar";
import BrowseFilterCard from "../components/BrowseFilterCard";
import TitleList from "../components/TitleList";
import { loadFilters } from "../components/loadFilters";
import * as api from "../api";
import { normalizeSearchTitle } from "../types";
import { useGridNavigation } from "../hooks/useGridNavigation";
import { useIsMobile } from "../hooks/useIsMobile";
import { PageHeader } from "../components/design";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { Card } from "../components/ui/card";
import { useAuth } from "../context/AuthContext";

const VALID_CATEGORIES: BrowseCategory[] = [
  "new_releases",
  "popular",
  "upcoming",
  "top_rated",
];

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
  defaultValue = "",
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
        { replace: true },
      );
    },
    [setSearchParams, key, defaultValue],
  );
  return [value, setValue];
}

function useQueryParamArray(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  key: string,
): [string[], (values: string[]) => void] {
  const raw = searchParams.get(key) || "";
  const value = useMemo(() => (raw ? raw.split(",") : []), [raw]);
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
        { replace: true },
      );
    },
    [setSearchParams, key],
  );
  return [value, setValue];
}

export const FILTER_KEYS = [
  "type",
  "genre",
  "provider",
  "language",
  "daysBack",
  "yearMin",
  "yearMax",
  "minRating",
] as const;

const SEARCH_FILTER_KEYS = [
  "searchType",
  "searchYearMin",
  "searchYearMax",
  "searchMinRating",
  "searchLanguage",
] as const;

export function buildCategoryParams(
  prev: URLSearchParams,
  cat: BrowseCategory,
): URLSearchParams {
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
  const location = useLocation();
  const [resultsCount, setResultsCount] = useState<number | null>(null);
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const {
    user,
    subscriptions,
    subscriptionsStatus,
    refreshSubscriptions,
    loading: authLoading,
  } = useAuth();
  // Resolve the saved default before the first catalog request. A failed load
  // has an explicit retry; existing preferences stay usable during refresh.
  const subscriptionsReady = !authLoading && (!user || subscriptions !== null);
  useGridNavigation();

  // ── Browse filter data (shared cache, loaded once across pages) ──────────────
  const { data: filters } = useQuery({
    queryKey: ["filters"],
    queryFn: ({ signal }) => loadFilters(signal),
    staleTime: Infinity,
  });
  const filterGenres = filters?.genres ?? [];
  const filterProviders = filters?.providers ?? [];
  const filterLanguages = filters?.languages ?? [];
  const filterRegionProviderIds = filters?.regionProviderIds ?? [];
  const filterPriorityLanguageCodes = filters?.priorityLanguageCodes ?? [];

  // ── Derived search state ────────────────────────────────────────────────────
  const lastQuery = searchParams.get("q")?.trim() ?? "";
  const isSearch = lastQuery !== "";
  const [searchType, setSearchType] = useQueryParam(
    searchParams,
    setSearchParams,
    "searchType",
  );
  const [yearMin, setYearMin] = useQueryParam(
    searchParams,
    setSearchParams,
    "searchYearMin",
  );
  const [yearMax, setYearMax] = useQueryParam(
    searchParams,
    setSearchParams,
    "searchYearMax",
  );
  const [minRating, setMinRating] = useQueryParam(
    searchParams,
    setSearchParams,
    "searchMinRating",
  );
  const [searchLanguage, setSearchLanguage] = useQueryParam(
    searchParams,
    setSearchParams,
    "searchLanguage",
  );
  const isImdb = /imdb\.com\/title\/tt\d+|^tt\d+$/i.test(lastQuery);
  const {
    data: searchResults,
    isLoading: searchLoading,
    error: searchError,
    refetch: retrySearch,
  } = useQuery({
    queryKey: [
      "search",
      lastQuery,
      searchType,
      yearMin,
      yearMax,
      minRating,
      searchLanguage,
    ],
    enabled: isSearch,
    queryFn: async ({ signal }) => {
      if (isImdb) {
        const result = await api.resolveImdb(lastQuery);
        return result.title ? [normalizeSearchTitle(result.title)] : [];
      }
      const result = await api.searchTitles(
        lastQuery,
        {
          type:
            searchType === "MOVIE" || searchType === "SHOW"
              ? searchType
              : undefined,
          yearMin: yearMin ? Number(yearMin) : undefined,
          yearMax: yearMax ? Number(yearMax) : undefined,
          minRating: minRating ? Number(minRating) : undefined,
          language: searchLanguage || undefined,
        },
        signal,
      );
      return result.titles.map(normalizeSearchTitle);
    },
    staleTime: 60_000,
  });
  useScrollRestoration(
    `browse:${location.key}`,
    isSearch && !searchLoading,
    true,
  );

  const availableLanguages = filterLanguages
    .map((code) => {
      let label = code;
      try {
        label =
          new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
      } catch {
        /* Display unsupported language codes as-is. */
      }
      return { code, label };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const rawCategory = searchParams.get("category") || "popular";
  const category: BrowseCategory = VALID_CATEGORIES.includes(
    rawCategory as BrowseCategory,
  )
    ? (rawCategory as BrowseCategory)
    : "popular";

  const setCategory = useCallback(
    (cat: BrowseCategory) => {
      setSearchParams((prev) => {
        const next = buildCategoryParams(prev, cat);
        next.delete("q");
        for (const key of SEARCH_FILTER_KEYS) next.delete(key);
        return next;
      });
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of FILTER_KEYS) {
          next.delete(key);
        }
        // Clear filters overrides the saved default for this URL only.
        next.set("onlyMine", "false");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const [type, setType] = useQueryParamArray(
    searchParams,
    setSearchParams,
    "type",
  );
  const [genre, setGenre] = useQueryParamArray(
    searchParams,
    setSearchParams,
    "genre",
  );
  const [provider, setProvider] = useQueryParamArray(
    searchParams,
    setSearchParams,
    "provider",
  );
  const [language, setLanguage] = useQueryParamArray(
    searchParams,
    setSearchParams,
    "language",
  );
  const [browseYearMin, setBrowseYearMin] = useQueryParam(
    searchParams,
    setSearchParams,
    "yearMin",
  );
  const [browseYearMax, setBrowseYearMax] = useQueryParam(
    searchParams,
    setSearchParams,
    "yearMax",
  );
  const [browseMinRating, setBrowseMinRating] = useQueryParam(
    searchParams,
    setSearchParams,
    "minRating",
  );
  const setBrowseYearRange = useCallback(
    (min: string, max: string) => {
      setBrowseYearMin(min);
      setBrowseYearMax(max);
    },
    [setBrowseYearMin, setBrowseYearMax],
  );
  const [daysBackStr, setDaysBackStr] = useQueryParam(
    searchParams,
    setSearchParams,
    "daysBack",
    "30",
  );
  const daysBack = parseInt(daysBackStr, 10) || 30;
  const setDaysBack = useCallback(
    (days: number) => setDaysBackStr(String(days)),
    [setDaysBackStr],
  );
  const [hideTrackedStr, setHideTrackedStr] = useQueryParam(
    searchParams,
    setSearchParams,
    "hideTracked",
  );
  const hideTracked = hideTrackedStr === "1";
  const setHideTracked = useCallback(
    (value: boolean) => setHideTrackedStr(value ? "1" : ""),
    [setHideTrackedStr],
  );

  const [onlyMineStr, setOnlyMineStr] = useQueryParam(
    searchParams,
    setSearchParams,
    "onlyMine",
  );
  const onlyMine =
    Boolean(subscriptions?.providerIds.length) &&
    (searchParams.has("onlyMine")
      ? onlyMineStr === "true"
      : subscriptions?.onlyMine === true);
  const setOnlyMine = useCallback(
    (value: boolean) => setOnlyMineStr(String(value)),
    [setOnlyMineStr],
  );

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const activeFilterCount =
    type.length +
    genre.length +
    provider.length +
    language.length +
    (browseYearMin !== "" || browseYearMax !== "" ? 1 : 0) +
    (browseMinRating !== "" ? 1 : 0) +
    (onlyMine ? 1 : 0);

  function handleSearch(query: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("q", query.trim());
      return next;
    });
  }

  function clearSearch() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("q");
      for (const key of SEARCH_FILTER_KEYS) next.delete(key);
      return next;
    });
  }

  const RATING_OPTIONS = [
    "5",
    "5.5",
    "6",
    "6.5",
    "7",
    "7.5",
    "8",
    "8.5",
    "9",
    "9.5",
  ] as const;
  const inputCls =
    "bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900";
  const selectCls =
    "bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 w-full";
  const pillBase =
    "px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer";
  const pillActive = "bg-white text-black border-white";
  const pillInactive =
    "bg-transparent text-zinc-300 border-zinc-600 hover:border-zinc-400";

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHeader
        kicker={
          isSearch
            ? searchResults
              ? `Search · ${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
              : "Search"
            : resultsCount !== null
              ? `Catalog · ${resultsCount.toLocaleString()} titles`
              : "Catalog · discover titles"
        }
        title="Browse"
      />
      <SearchBar
        key={lastQuery}
        initialQuery={lastQuery}
        onSearch={handleSearch}
        onImdb={handleSearch}
        loading={searchLoading}
      />

      {/* Advanced search filters shown only while search results are displayed */}
      {isSearch && !isImdb && (
        <div className="space-y-3 rounded-xl bg-zinc-900/60 border border-zinc-800 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {t("search.advancedFilters")}
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            {/* Type toggle */}
            <div className="flex items-center gap-1">
              <button
                className={`${pillBase} ${searchType === "" ? pillActive : pillInactive}`}
                onClick={() => setSearchType("")}
              >
                {t("filter.all")}
              </button>
              <button
                className={`${pillBase} ${searchType === "MOVIE" ? pillActive : pillInactive}`}
                onClick={() => setSearchType("MOVIE")}
              >
                {t("filter.movies")}
              </button>
              <button
                className={`${pillBase} ${searchType === "SHOW" ? pillActive : pillInactive}`}
                onClick={() => setSearchType("SHOW")}
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
                key={"min:" + lastQuery + yearMin}
                defaultValue={yearMin}
                min={1900}
                max={2100}
                onBlur={(e) => setYearMin(e.target.value)}
              />
              <span className="text-zinc-500 text-sm">–</span>
              <input
                type="number"
                className={inputCls + " w-24"}
                placeholder={t("filter.yearTo")}
                key={"max:" + lastQuery + yearMax}
                defaultValue={yearMax}
                min={1900}
                max={2100}
                onBlur={(e) => setYearMax(e.target.value)}
              />
            </div>
            {/* Min rating */}
            <div className="w-36">
              <select
                className={selectCls}
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
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
                  onChange={(e) => setSearchLanguage(e.target.value)}
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

      {/* Persistent browse filter — desktop full card / mobile collapsible (same card content) */}
      {!isSearch && (
        <div className="space-y-2">
          {isMobile && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((v) => !v)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="mobile-filter-panel"
                aria-label={mobileFiltersOpen ? "Hide filters" : "Show filters"}
                className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border bg-white/[0.06] text-zinc-300 border-white/[0.08] hover:border-zinc-500 transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M6 12h12M10 18h4" />
                </svg>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-amber-400 text-black text-[10px] font-bold leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  aria-label="Clear all filters"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full border bg-white/[0.06] text-zinc-300 border-white/[0.08] hover:border-zinc-500 hover:text-white transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {(!isMobile || mobileFiltersOpen) && (
            <div id={isMobile ? "mobile-filter-panel" : undefined}>
              {category === "new_releases" ? (
                // new_releases keeps the legacy FilterBar so the daysBack toggle stays available.
                <Card>
                  <FilterBar
                    onlyMine={onlyMine}
                    type={type}
                    onTypeChange={setType}
                    showDaysFilter
                    daysBack={daysBack}
                    onDaysBackChange={setDaysBack}
                    genre={genre}
                    onGenreChange={setGenre}
                    genres={filterGenres}
                    provider={provider}
                    onProviderChange={setProvider}
                    providers={filterProviders}
                    regionProviderIds={filterRegionProviderIds}
                    language={language}
                    onLanguageChange={setLanguage}
                    languages={filterLanguages}
                    priorityLanguageCodes={filterPriorityLanguageCodes}
                    onClearFilters={clearFilters}
                    hideTracked={hideTracked}
                    onHideTrackedChange={setHideTracked}
                  />
                </Card>
              ) : (
                <BrowseFilterCard
                  onlyMine={onlyMine}
                  genre={genre}
                  onGenreChange={setGenre}
                  genres={filterGenres}
                  provider={provider}
                  onProviderChange={setProvider}
                  providers={filterProviders.map((p) => ({
                    id: p.id,
                    name: p.name,
                    iconUrl: p.icon_url,
                  }))}
                  regionProviderIds={filterRegionProviderIds}
                  yearMin={browseYearMin}
                  yearMax={browseYearMax}
                  onYearChange={setBrowseYearRange}
                  minRating={browseMinRating}
                  onMinRatingChange={setBrowseMinRating}
                  type={type}
                  onTypeChange={setType}
                  language={language}
                  onLanguageChange={setLanguage}
                  languages={filterLanguages}
                  priorityLanguageCodes={filterPriorityLanguageCodes}
                  hideTracked={hideTracked}
                  onHideTrackedChange={setHideTracked}
                  onClearFilters={clearFilters}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* On my services toggle chip — shown when user has subscribed providers */}
      {!isSearch &&
        subscriptions &&
        subscriptions.providerIds.length > 0 &&
        (!isMobile || mobileFiltersOpen) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyMine(!onlyMine)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold font-mono border transition-colors ${
                onlyMine
                  ? "bg-amber-400 text-black border-amber-400"
                  : "bg-white/[0.06] text-zinc-300 border-white/[0.08] hover:border-zinc-500"
              }`}
              aria-pressed={onlyMine}
            >
              {onlyMine ? "✓ " : ""}On my services
            </button>
          </div>
        )}

      {/* Active filter chips */}
      {!isSearch &&
        (!isMobile || mobileFiltersOpen) &&
        (onlyMine ||
          type.length > 0 ||
          genre.length > 0 ||
          provider.length > 0 ||
          language.length > 0 ||
          browseYearMin !== "" ||
          browseYearMax !== "" ||
          browseMinRating !== "") && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mr-1">
              Active
            </span>
            {onlyMine && (
              <button
                type="button"
                onClick={() => setOnlyMine(false)}
                aria-label="Remove 'On my services' filter"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-400/[0.12] text-amber-400 border border-amber-400/[0.25] cursor-pointer hover:bg-amber-400/20 transition-colors"
              >
                On my services ×
              </button>
            )}
            {type.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(type.filter((v) => v !== t))}
                aria-label={`Remove ${t === "MOVIE" ? "Movies" : "Shows"} filter`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-400/[0.12] text-amber-400 border border-amber-400/[0.25] cursor-pointer hover:bg-amber-400/20 transition-colors"
              >
                {t === "MOVIE" ? "Movies" : "Shows"} ×
              </button>
            ))}
            {genre.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(genre.filter((v) => v !== g))}
                aria-label={`Remove ${g} filter`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-400/[0.12] text-amber-400 border border-amber-400/[0.25] cursor-pointer hover:bg-amber-400/20 transition-colors"
              >
                {g} ×
              </button>
            ))}
            {provider.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(provider.filter((v) => v !== p))}
                aria-label={`Remove ${filterProviders.find((fp) => String(fp.id) === p)?.name ?? p} filter`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-400/[0.12] text-amber-400 border border-amber-400/[0.25] cursor-pointer hover:bg-amber-400/20 transition-colors"
              >
                {filterProviders.find((fp) => String(fp.id) === p)?.name ?? p} ×
              </button>
            ))}
            {language.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(language.filter((v) => v !== l))}
                aria-label={`Remove ${l} language filter`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-400/[0.12] text-amber-400 border border-amber-400/[0.25] cursor-pointer hover:bg-amber-400/20 transition-colors"
              >
                {l} ×
              </button>
            ))}
            {(browseYearMin !== "" || browseYearMax !== "") && (
              <button
                type="button"
                onClick={() => setBrowseYearRange("", "")}
                aria-label="Remove year range filter"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-400/[0.12] text-amber-400 border border-amber-400/[0.25] cursor-pointer hover:bg-amber-400/20 transition-colors"
              >
                {browseYearMin || "…"}–{browseYearMax || "…"} ×
              </button>
            )}
            {browseMinRating !== "" && (
              <button
                type="button"
                onClick={() => setBrowseMinRating("")}
                aria-label="Remove minimum rating filter"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-400/[0.12] text-amber-400 border border-amber-400/[0.25] cursor-pointer hover:bg-amber-400/20 transition-colors"
              >
                ★ {browseMinRating}+ ×
              </button>
            )}
          </div>
        )}

      {isSearch ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-[-0.01em]">
              {t("browse.searchResults", { count: searchResults?.length ?? 0 })}
            </h2>
            <button
              onClick={clearSearch}
              className="text-sm text-zinc-400 hover:text-white cursor-pointer"
            >
              {t("browse.clear")}
            </button>
          </div>
          {searchLoading ? (
            <p role="status">{t("browse.searchLoading")}</p>
          ) : searchError ? (
            <div role="alert" className="space-y-2 text-red-200">
              <p>
                {t("browse.searchError")} {searchError.message}
              </p>
              <button
                type="button"
                onClick={() => void retrySearch()}
                className="underline"
              >
                {t("browse.searchRetry")}
              </button>
            </div>
          ) : (
            <TitleList
              titles={searchResults ?? []}
              emptyMessage={t("browse.noResults")}
              applyContentAdvisory
            />
          )}
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold tracking-[-0.01em] mb-4">
            {t(CATEGORY_LABEL_KEYS[category])}
          </h2>
          {user && subscriptionsStatus === "error" && (
            <div role="alert" className="space-y-2 text-amber-200">
              <p>{t("browse.preferencesError")}</p>
              <button
                type="button"
                onClick={() => void refreshSubscriptions()}
                className="underline"
              >
                {t("browse.preferencesRetry")}
              </button>
            </div>
          )}
          {!subscriptionsReady ? (
            subscriptionsStatus !== "error" && (
              <p role="status">{t("browse.preferencesLoading")}</p>
            )
          ) : category === "new_releases" ? (
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
              hideFilterBar
              showProviderBadge
              showRating
              onResultsCount={setResultsCount}
              onlyMine={onlyMine}
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
              yearMin={browseYearMin}
              yearMax={browseYearMax}
              minRating={browseMinRating}
              onClearFilters={clearFilters}
              hideTracked={hideTracked}
              onHideTrackedChange={setHideTracked}
              hideFilterBar
              showProviderBadge
              showRating
              onResultsCount={setResultsCount}
              onlyMine={onlyMine}
            />
          )}
        </div>
      )}
    </div>
  );
}
