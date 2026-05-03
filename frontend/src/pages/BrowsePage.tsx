import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import { useSearchParams } from "react-router";
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
import type { Title, Provider } from "../types";
import { normalizeSearchTitle } from "../types";
import { useGridNavigation } from "../hooks/useGridNavigation";
import { useIsMobile } from "../hooks/useIsMobile";
import { PageHeader } from "../components/design";
import { useAsyncError } from "../hooks/useAsyncError";
import { Card } from "../components/ui/card";
import { useAuth } from "../context/AuthContext";

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

export const FILTER_KEYS = ["type", "genre", "provider", "language", "daysBack", "yearMin", "yearMax", "minRating"] as const;

type SearchAdvanced = { type: "" | "MOVIE" | "SHOW"; yearMin: string; yearMax: string; minRating: string; language: string };
type SearchState = { status: "idle" | "loading" | "done"; results: Title[] | null; lastQuery: string | null; advanced: SearchAdvanced };
type SearchAction =
  | { type: "SEARCH_START"; query: string }
  | { type: "SEARCH_SUCCESS"; results: Title[] }
  | { type: "SEARCH_ERROR" }
  | { type: "CLEAR_SEARCH" }
  | { type: "SET_ADVANCED"; key: keyof SearchAdvanced; value: string };

const SEARCH_INIT: SearchState = { status: "idle", results: null, lastQuery: null, advanced: { type: "", yearMin: "", yearMax: "", minRating: "", language: "" } };

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "SEARCH_START": return { ...state, status: "loading", lastQuery: action.query };
    case "SEARCH_SUCCESS": return { ...state, status: "done", results: action.results };
    case "SEARCH_ERROR": return { ...state, status: "idle" };
    case "CLEAR_SEARCH": return SEARCH_INIT;
    case "SET_ADVANCED": return { ...state, advanced: { ...state.advanced, [action.key]: action.value } };
    default: return state;
  }
}

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
  const [search, searchDispatch] = useReducer(searchReducer, SEARCH_INIT);
  const [resultsCount, setResultsCount] = useState<number | null>(null);
  const { run: runAsync, error: searchError, reset: resetSearchError } = useAsyncError();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { subscriptions } = useAuth();
  useGridNavigation();

  // ── Browse filter data (loaded once) ────────────────────────────────────────
  const [filterGenres, setFilterGenres] = useState<string[]>([]);
  const [filterProviders, setFilterProviders] = useState<Provider[]>([]);
  const [filterLanguages, setFilterLanguages] = useState<string[]>([]);
  const [filterRegionProviderIds, setFilterRegionProviderIds] = useState<number[]>([]);
  const [filterPriorityLanguageCodes, setFilterPriorityLanguageCodes] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    loadFilters(controller.signal).then(({ genres, providers, languages, regionProviderIds, priorityLanguageCodes }) => {
      if (!controller.signal.aborted) {
        setFilterGenres(genres);
        setFilterProviders(providers);
        setFilterLanguages(languages);
        setFilterRegionProviderIds(regionProviderIds);
        setFilterPriorityLanguageCodes(priorityLanguageCodes);
      }
    }).catch(() => { /* ignore */ });
    return () => controller.abort();
  }, []);

  // ── Derived search state ────────────────────────────────────────────────────
  const searchResults = search.results;
  const searchLoading = search.status === "loading";
  const lastQuery = search.lastQuery;
  const { type: searchType, yearMin, yearMax, minRating, language: searchLanguage } = search.advanced;

  // ── Advanced search language options (loaded once) ──────────────────────────
  const [availableLanguages, setAvailableLanguages] = useState<{ code: string; label: string }[]>([]);

  // Load languages once for the dropdown
  useEffect(() => {
    const controller = new AbortController();
    api.getLanguages(controller.signal).then(({ languages }) => {
      if (!controller.signal.aborted) {
        setAvailableLanguages(
          languages.map((code) => {
            let label = code;
            try {
              label = new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
            } catch { /* noop */ }
            return { code, label };
          }).sort((a, b) => a.label.localeCompare(b.label))
        );
      }
    }).catch(() => { /* ignore */ });
    return () => controller.abort();
  }, []);

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
  const [browseYearMin, setBrowseYearMin] = useQueryParam(searchParams, setSearchParams, "yearMin");
  const [browseYearMax, setBrowseYearMax] = useQueryParam(searchParams, setSearchParams, "yearMax");
  const [browseMinRating, setBrowseMinRating] = useQueryParam(searchParams, setSearchParams, "minRating");
  const setBrowseYearRange = useCallback(
    (min: string, max: string) => {
      setBrowseYearMin(min);
      setBrowseYearMax(max);
    },
    [setBrowseYearMin, setBrowseYearMax]
  );
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

  const [onlyMineStr, setOnlyMineStr] = useQueryParam(searchParams, setSearchParams, "onlyMine");
  const onlyMine = onlyMineStr === "true";
  const setOnlyMine = useCallback(
    (value: boolean) => setOnlyMineStr(value ? "true" : ""),
    [setOnlyMineStr]
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

  // Preselect provider filter with subscribed providers on first load (when no provider param is set)
  const preselectedRef = useRef(false);
  useEffect(() => {
    if (preselectedRef.current) return;
    if (!subscriptions || subscriptions.providerIds.length === 0) return;
    if (searchParams.get("provider")) return;
    preselectedRef.current = true;
    setProvider(subscriptions.providerIds.map(String));
  }, [subscriptions, searchParams, setProvider]);

  async function runSearch(
    query: string,
    overrides?: { type?: "" | "MOVIE" | "SHOW"; yearMin?: string; yearMax?: string; minRating?: string; language?: string }
  ) {
    searchDispatch({ type: "SEARCH_START", query });
    let succeeded = false;
    await runAsync(async () => {
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
      searchDispatch({ type: "SEARCH_SUCCESS", results: res.titles.map(normalizeSearchTitle) });
      succeeded = true;
    });
    if (!succeeded) searchDispatch({ type: "SEARCH_ERROR" });
  }

  async function handleSearch(query: string) {
    await runSearch(query);
  }

  async function handleImdb(url: string) {
    searchDispatch({ type: "SEARCH_START", query: "" });
    let succeeded = false;
    await runAsync(async () => {
      const res = await api.resolveImdb(url);
      if (res.title) {
        searchDispatch({ type: "SEARCH_SUCCESS", results: [normalizeSearchTitle(res.title)] });
        succeeded = true;
      }
    });
    if (!succeeded) searchDispatch({ type: "SEARCH_ERROR" });
  }

  function clearSearch() {
    searchDispatch({ type: "CLEAR_SEARCH" });
    resetSearchError();
  }


  const RATING_OPTIONS = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5"] as const;
  const inputCls =
    "bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900";
  const selectCls =
    "bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 w-full";
  const pillBase = "px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer";
  const pillActive = "bg-white text-black border-white";
  const pillInactive = "bg-transparent text-zinc-300 border-zinc-600 hover:border-zinc-400";

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={
          searchResults !== null
            ? `Search · ${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
            : resultsCount !== null
              ? `Catalog · ${resultsCount.toLocaleString()} titles`
              : "Catalog · discover titles"
        }
        title="Browse"
      />
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
                onClick={() => { searchDispatch({ type: "SET_ADVANCED", key: "type", value: "" }); void runSearch(lastQuery!, { type: "" }); }}
              >
                {t("filter.all")}
              </button>
              <button
                className={`${pillBase} ${searchType === "MOVIE" ? pillActive : pillInactive}`}
                onClick={() => { searchDispatch({ type: "SET_ADVANCED", key: "type", value: "MOVIE" }); void runSearch(lastQuery!, { type: "MOVIE" }); }}
              >
                {t("filter.movies")}
              </button>
              <button
                className={`${pillBase} ${searchType === "SHOW" ? pillActive : pillInactive}`}
                onClick={() => { searchDispatch({ type: "SET_ADVANCED", key: "type", value: "SHOW" }); void runSearch(lastQuery!, { type: "SHOW" }); }}
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
                onChange={(e) => searchDispatch({ type: "SET_ADVANCED", key: "yearMin", value: e.target.value })}
                onBlur={() => void runSearch(lastQuery!)}
              />
              <span className="text-zinc-500 text-sm">–</span>
              <input
                type="number"
                className={inputCls + " w-24"}
                placeholder={t("filter.yearTo")}
                value={yearMax}
                min={1900}
                max={2100}
                onChange={(e) => searchDispatch({ type: "SET_ADVANCED", key: "yearMax", value: e.target.value })}
                onBlur={() => void runSearch(lastQuery!)}
              />
            </div>
            {/* Min rating */}
            <div className="w-36">
              <select
                className={selectCls}
                value={minRating}
                onChange={(e) => { searchDispatch({ type: "SET_ADVANCED", key: "minRating", value: e.target.value }); void runSearch(lastQuery!, { minRating: e.target.value }); }}
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
                  onChange={(e) => { searchDispatch({ type: "SET_ADVANCED", key: "language", value: e.target.value }); void runSearch(lastQuery!, { language: e.target.value }); }}
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

      {/* Persistent browse filter — desktop 4-field card / mobile collapsible chip strip */}
      {searchResults === null && (
        isMobile ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((v) => !v)}
                aria-expanded={mobileFiltersOpen}
                aria-controls="mobile-filter-strip"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-[11px] font-semibold font-mono border bg-white/[0.06] text-zinc-300 border-white/[0.08] hover:border-zinc-500 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18M6 12h12M10 18h4" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-black text-[10px] font-bold leading-none">
                    {activeFilterCount}
                  </span>
                )}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`transition-transform ${mobileFiltersOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11px] font-semibold font-mono text-zinc-400 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            {mobileFiltersOpen && (
              <div id="mobile-filter-strip" className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
                {/* Type chips */}
                {[
                  { label: "All", value: "" },
                  { label: "Shows", value: "SHOW" },
                  { label: "Movies", value: "MOVIE" },
                ].map(({ label, value }) => {
                  const isActive = value === "" ? type.length === 0 : type.includes(value);
                  return (
                    <button
                      key={label}
                      onClick={() => value === "" ? setType([]) : setType(isActive ? [] : [value])}
                      className={`shrink-0 inline-flex items-center text-[11px] font-semibold font-mono px-3 py-2 rounded-full border transition-colors ${
                        isActive
                          ? "bg-amber-400 text-black border-amber-400"
                          : "bg-white/[0.06] text-zinc-300 border-white/[0.08]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                {/* Provider chips */}
                {filterProviders.filter((_, i) => i < 6).map((p) => {
                  const isActive = provider.includes(String(p.id));
                  return (
                    <button
                      key={p.id}
                      onClick={() => setProvider(isActive ? provider.filter((v) => v !== String(p.id)) : [...provider, String(p.id)])}
                      className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold font-mono px-3 py-2 rounded-full border transition-colors ${
                        isActive
                          ? "bg-amber-400/[0.12] text-amber-400 border-amber-400/[0.25]"
                          : "bg-white/[0.06] text-zinc-300 border-white/[0.08]"
                      }`}
                    >
                      {p.icon_url && <img src={p.icon_url} alt="" className="w-3.5 h-3.5 rounded-sm" />}
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : category === "new_releases" ? (
          // new_releases keeps the legacy FilterBar so the daysBack toggle stays available.
          <Card>
            <FilterBar
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
            genre={genre}
            onGenreChange={setGenre}
            genres={filterGenres}
            provider={provider}
            onProviderChange={setProvider}
            providers={filterProviders.map((p) => ({ id: p.id, name: p.name, iconUrl: p.icon_url }))}
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
        )
      )}

      {/* On my services toggle chip — shown when user has subscribed providers */}
      {searchResults === null && subscriptions && subscriptions.providerIds.length > 0 && (!isMobile || mobileFiltersOpen) && (
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
      {searchResults === null && (onlyMine || type.length > 0 || genre.length > 0 || provider.length > 0 || language.length > 0 || browseYearMin !== "" || browseYearMax !== "" || browseMinRating !== "") && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mr-1">Active</span>
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

      {searchError && (
        <div className="bg-red-900/50 border border-red-800 text-red-200 px-4 py-2 rounded-lg text-sm select-text">
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
