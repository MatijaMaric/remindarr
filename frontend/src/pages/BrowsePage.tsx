import { useCallback, useState, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import SearchBar from "../components/SearchBar";
import NewReleases from "../components/NewReleases";
import CategoryBar, { type BrowseCategory } from "../components/CategoryBar";
import CategoryBrowse from "../components/CategoryBrowse";
import BrowseFilterCard from "../components/BrowseFilterCard";
import TitleList from "../components/TitleList";
import PersonCard from "../components/PersonCard";
import FollowButton from "../components/FollowButton";
import { loadFilters } from "../components/loadFilters";
import * as api from "../api";
import { normalizeSearchTitle } from "../types";
import { useGridNavigation } from "../hooks/useGridNavigation";
import { useIsMobile } from "../hooks/useIsMobile";
import { PageHeader } from "../components/design";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { useAuth } from "../context/AuthContext";
import { languageName } from "../lib/languageName";
import type { SearchPerson } from "../types";

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
  if (cat === "new_releases") {
    // New Releases (/api/titles) has no year or rating filter.
    for (const key of ["yearMin", "yearMax", "minRating"]) next.delete(key);
  } else {
    // TMDB discover takes one language; keep the first so the UI matches.
    const first = next.get("language")?.split(",")[0];
    if (first) next.set("language", first);
  }
  return next;
}

function FilterToggle({
  open,
  onToggle,
  count,
  controls,
}: {
  open: boolean;
  onToggle: () => void;
  count: number;
  controls: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? t("browse.hideFilters") : t("browse.showFilters")}
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border bg-accent text-foreground-secondary border-border hover:border-input transition-colors"
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
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-bold leading-none">
          {count}
        </span>
      )}
    </button>
  );
}

function PeopleList({ people }: { people: SearchPerson[] }) {
  return (
    <ul className="flex flex-wrap gap-4">
      {people.map((p) => (
        <li key={p.id} className="flex flex-col items-center gap-2">
          <PersonCard
            id={p.id}
            name={p.name}
            role={p.department ?? ""}
            profilePath={p.profilePath}
          />
          <FollowButton
            key={`${p.id}-${p.isFollowing}`}
            personId={p.id}
            initialIsFollowing={p.isFollowing}
          />
        </li>
      ))}
    </ul>
  );
}

export default function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [resultsCount, setResultsCount] = useState<number | null>(null);
  const { t, i18n } = useTranslation();
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
  const isPeopleSearch = searchType === "PERSON" && !isImdb;
  const {
    data: searchData,
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
        return {
          titles: result.title ? [normalizeSearchTitle(result.title)] : [],
          people: [],
        };
      }
      const result = await api.searchTitles(
        lastQuery,
        {
          type:
            searchType === "MOVIE" ||
            searchType === "SHOW" ||
            searchType === "PERSON"
              ? searchType
              : undefined,
          yearMin: yearMin ? Number(yearMin) : undefined,
          yearMax: yearMax ? Number(yearMax) : undefined,
          minRating: minRating ? Number(minRating) : undefined,
          language: searchLanguage || undefined,
        },
        signal,
      );
      return {
        titles: result.titles.map(normalizeSearchTitle),
        people: result.people ?? [],
      };
    },
    staleTime: 60_000,
  });
  const searchResults = searchData?.titles;
  const searchPeople = searchData?.people;
  const searchCount = isPeopleSearch
    ? searchPeople?.length
    : searchResults && searchResults.length + (searchPeople?.length ?? 0);
  const searchFilterCount =
    (searchType !== "" ? 1 : 0) +
    (yearMin !== "" || yearMax !== "" ? 1 : 0) +
    (minRating !== "" ? 1 : 0) +
    (searchLanguage !== "" ? 1 : 0);
  useScrollRestoration(
    `browse:${location.key}`,
    isSearch && !searchLoading,
    true,
  );

  const availableLanguages = filterLanguages
    .map((code) => ({ code, label: languageName(code, i18n.language) ?? code }))
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
  const [rawLanguage, setLanguage] = useQueryParamArray(
    searchParams,
    setSearchParams,
    "language",
  );
  const isNewReleases = category === "new_releases";
  // Discover takes one language; only New Releases filters by several.
  const language = useMemo(
    () => (isNewReleases ? rawLanguage : rawLanguage.slice(0, 1)),
    [isNewReleases, rawLanguage],
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
    (isNewReleases
      ? daysBack !== 30
        ? 1
        : 0
      : (browseYearMin !== "" || browseYearMax !== "" ? 1 : 0) +
        (browseMinRating !== "" ? 1 : 0)) +
    (onlyMine ? 1 : 0);
  const regionLabel = filters?.country
    ? t("streamingRegion.label", { country: filters.country })
    : null;

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
    "bg-muted border border-border text-foreground text-sm rounded-sm px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
  const selectCls =
    "bg-muted border border-border text-foreground text-sm rounded-sm px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card w-full";
  const pillBase =
    "px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer";
  const pillActive = "bg-primary text-primary-foreground border-transparent";
  const pillInactive =
    "bg-transparent text-foreground-secondary border-input hover:border-input";

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHeader
        kicker={[
          // The search count lives in the results heading, not here.
          isSearch
            ? t("browse.kicker.search")
            : resultsCount !== null
              ? t("browse.kicker.catalogCount", {
                  count: resultsCount,
                  formatted: resultsCount.toLocaleString(),
                })
              : t("browse.kicker.catalog"),
          regionLabel,
        ]
          .filter(Boolean)
          .join(" · ")}
        title={t("browse.title")}
      />
      <SearchBar
        key={lastQuery}
        initialQuery={lastQuery}
        onSearch={handleSearch}
        onImdb={handleSearch}
        loading={searchLoading}
      />

      {/* Search filters: on phones behind the same toggle as browse filters */}
      {isSearch && !isImdb && isMobile && (
        <FilterToggle
          open={mobileFiltersOpen}
          onToggle={() => setMobileFiltersOpen((v) => !v)}
          count={searchFilterCount}
          controls="search-filter-panel"
        />
      )}
      {isSearch && !isImdb && (!isMobile || mobileFiltersOpen) && (
        <div
          id="search-filter-panel"
          className="space-y-3 rounded-lg bg-card/60 border border-border p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
              <button
                className={`${pillBase} ${isPeopleSearch ? pillActive : pillInactive}`}
                onClick={() => setSearchType("PERSON")}
              >
                {t("filter.people")}
              </button>
            </div>
            {/* Title-only filters don't apply to people */}
            {!isPeopleSearch && (
              <>
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
                  <span className="text-muted-foreground text-sm">–</span>
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Categories don't apply to search results; Clear returns to them. */}
      {!isSearch && (
        <CategoryBar category={category} onCategoryChange={setCategory} />
      )}

      {/* Persistent browse filter — desktop full card / mobile collapsible (same card content) */}
      {!isSearch && (
        <div className="space-y-2">
          {isMobile && (
            <div className="flex items-center gap-2">
              <FilterToggle
                open={mobileFiltersOpen}
                onToggle={() => setMobileFiltersOpen((v) => !v)}
                count={activeFilterCount}
                controls="mobile-filter-panel"
              />
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  aria-label={t("browse.clearAllFilters")}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full border bg-accent text-foreground-secondary border-border hover:border-input hover:text-foreground transition-colors"
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
              <BrowseFilterCard
                onlyMine={onlyMine}
                onOnlyMineChange={
                  subscriptions?.providerIds.length ? setOnlyMine : undefined
                }
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
                showOwned={isNewReleases && !!user}
                yearMin={browseYearMin}
                yearMax={browseYearMax}
                onYearChange={setBrowseYearRange}
                minRating={browseMinRating}
                onMinRatingChange={setBrowseMinRating}
                daysBack={isNewReleases ? daysBack : undefined}
                onDaysBackChange={isNewReleases ? setDaysBack : undefined}
                type={type}
                onTypeChange={setType}
                language={language}
                onLanguageChange={setLanguage}
                singleLanguage={!isNewReleases}
                languages={filterLanguages}
                priorityLanguageCodes={filterPriorityLanguageCodes}
                hideTracked={hideTracked}
                onHideTrackedChange={setHideTracked}
                onClearFilters={clearFilters}
              />
            </div>
          )}
        </div>
      )}

      {isSearch ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-[-0.01em]">
              {t("browse.searchResults", { count: searchCount ?? 0 })}
            </h2>
            <button
              onClick={clearSearch}
              className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {t("browse.clear")}
            </button>
          </div>
          {searchLoading ? (
            <p role="status">{t("browse.searchLoading")}</p>
          ) : searchError ? (
            <div role="alert" className="space-y-2 text-destructive">
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
          ) : isPeopleSearch ? (
            searchPeople?.length ? (
              <PeopleList people={searchPeople} />
            ) : (
              <p className="text-muted-foreground">{t("browse.noResults")}</p>
            )
          ) : (
            <>
              {/* "All" shows matching people above the titles. */}
              {searchPeople && searchPeople.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {t("filter.people")}
                  </h3>
                  <PeopleList people={searchPeople} />
                </section>
              )}
              {(searchResults?.length || !searchPeople?.length) && (
                <TitleList
                  titles={searchResults ?? []}
                  emptyMessage={t("browse.noResults")}
                  applyContentAdvisory
                />
              )}
            </>
          )}
        </div>
      ) : (
        <div>
          <h2 className="text-xl font-bold tracking-[-0.01em] mb-4">
            {t(CATEGORY_LABEL_KEYS[category])}
          </h2>
          {user && subscriptionsStatus === "error" && (
            <div role="alert" className="space-y-2 text-primary-text">
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
          ) : isNewReleases ? (
            <NewReleases
              type={type}
              daysBack={daysBack}
              genre={genre}
              provider={provider}
              language={language}
              hideTracked={hideTracked}
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
              genre={genre}
              provider={provider}
              language={language}
              yearMin={browseYearMin}
              yearMax={browseYearMax}
              minRating={browseMinRating}
              hideTracked={hideTracked}
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
