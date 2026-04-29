import { Hono } from "hono";
import { pLimit } from "../lib/p-limit";
import {
  discoverMovies,
  discoverTv,
  fetchMovieDetails,
  fetchTvDetails,
  getMovieGenres,
  getTvGenres,
  getMovieWatchProviders,
  getTvWatchProviders,
  getLanguages,
  type DiscoverFilters,
} from "../tmdb/client";
import {
  parseDiscoverMovie,
  parseDiscoverTv,
  parseMovieDetails,
  parseTvDetails,
  type ParsedTitle,
} from "../tmdb/parser";
import { getTrackedTitleIds, upsertTitles } from "../db/repository";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { syncFailureTotal } from "../metrics";
import { ok, err } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";
import { toCanonicalGenre, expandGenreIds } from "../genres";
import { CONFIG } from "../config";

const log = logger.child({ module: "browse" });

const VALID_CATEGORIES = ["popular", "upcoming", "top_rated"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}


interface CategoryDiscoverOptions {
  page: number;
  filters: DiscoverFilters;
}

function fetchMoviesByCategory(category: Category, opts: CategoryDiscoverOptions) {
  const { page, filters } = opts;
  switch (category) {
    case "popular":
      return discoverMovies({ sortBy: "popularity.desc", page, filters });
    case "upcoming": {
      const today = new Date();
      const sixMonthsLater = new Date(today);
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      return discoverMovies({
        releaseDateGte: formatDate(today),
        releaseDateLte: formatDate(sixMonthsLater),
        sortBy: "release_date.asc",
        page,
        filters,
      });
    }
    case "top_rated":
      return discoverMovies({ sortBy: "vote_average.desc", voteCountGte: "200", page, filters });
  }
}

function fetchTvByCategory(category: Category, opts: CategoryDiscoverOptions) {
  const { page, filters } = opts;
  switch (category) {
    case "popular":
      return discoverTv({ sortBy: "popularity.desc", page, filters });
    case "upcoming": {
      const today = new Date();
      const sixMonthsLater = new Date(today);
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      return discoverTv({
        firstAirDateGte: formatDate(today),
        firstAirDateLte: formatDate(sixMonthsLater),
        sortBy: "first_air_date.asc",
        page,
        filters,
      });
    }
    case "top_rated":
      return discoverTv({ sortBy: "vote_average.desc", voteCountGte: "200", page, filters });
  }
}

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const category = c.req.query("category");
  const type = c.req.query("type") || "";
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
  const genreParam = c.req.query("genre") || "";
  const providerParam = c.req.query("provider") || "";
  const languageParam = c.req.query("language") || "";
  const yearMinParam = c.req.query("year_min");
  const yearMaxParam = c.req.query("year_max");
  const minRatingParam = c.req.query("min_rating");
  const genreNames = genreParam ? genreParam.split(",").filter(Boolean) : [];
  const providerValues = providerParam ? providerParam.split(",").filter(Boolean) : [];
  const languageValues = languageParam ? languageParam.split(",").filter(Boolean) : [];
  const typeValues = type ? type.split(",").filter(Boolean) : [];
  const yearMin = yearMinParam ? parseInt(yearMinParam, 10) : undefined;
  const yearMax = yearMaxParam ? parseInt(yearMaxParam, 10) : undefined;
  const minRating = minRatingParam ? parseFloat(minRatingParam) : undefined;

  if (!category || !VALID_CATEGORIES.includes(category as Category)) {
    return err(c, "Invalid category. Must be one of: popular, upcoming, top_rated");
  }

  try {
    const [movieGenreMap, tvGenreMap, movieProviders, tvProviders, tmdbLanguages] = await Promise.all([
      getMovieGenres(),
      getTvGenres(),
      getMovieWatchProviders(),
      getTvWatchProviders(),
      getLanguages(),
    ]);
    const allGenres = new Map([...movieGenreMap, ...tvGenreMap]);

    // Build discover filters
    const filters: DiscoverFilters = {};
    if (genreNames.length > 0) {
      const genreIds = genreNames.flatMap((name) =>
        expandGenreIds(name, movieGenreMap, tvGenreMap),
      );
      if (genreIds.length > 0) filters.withGenres = genreIds.map(String).join("|");
    }
    if (providerValues.length > 0) filters.withProviders = providerValues.join("|");
    if (languageValues.length > 0) filters.withOriginalLanguage = languageValues[0];
    if (yearMin != null && Number.isFinite(yearMin)) filters.yearMin = yearMin;
    if (yearMax != null && Number.isFinite(yearMax)) filters.yearMax = yearMax;
    if (minRating != null && Number.isFinite(minRating)) filters.voteAverageGte = minRating;

    const discoverOpts: CategoryDiscoverOptions = { page, filters };

    let basicTitles: ParsedTitle[] = [];
    let totalPages = 1;
    let totalResults = 0;

    const fetchMovies = typeValues.length === 0 || typeValues.includes("MOVIE");
    const fetchShows = typeValues.length === 0 || typeValues.includes("SHOW");

    if (fetchMovies && !fetchShows) {
      const res = await fetchMoviesByCategory(category as Category, discoverOpts);
      basicTitles = res.results.map((m) => parseDiscoverMovie(m, allGenres));
      totalPages = Math.min(res.total_pages, 500);
      totalResults = res.total_results;
    } else if (fetchShows && !fetchMovies) {
      const res = await fetchTvByCategory(category as Category, discoverOpts);
      basicTitles = res.results.map((t) => parseDiscoverTv(t, allGenres));
      totalPages = Math.min(res.total_pages, 500);
      totalResults = res.total_results;
    } else {
      const [movieRes, tvRes] = await Promise.all([
        fetchMoviesByCategory(category as Category, discoverOpts),
        fetchTvByCategory(category as Category, discoverOpts),
      ]);
      const movies = movieRes.results.map((m) => parseDiscoverMovie(m, allGenres));
      const tvShows = tvRes.results.map((t) => parseDiscoverTv(t, allGenres));
      basicTitles = [...movies, ...tvShows];
      totalPages = Math.min(Math.max(movieRes.total_pages, tvRes.total_pages), 500);
      totalResults = movieRes.total_results + tvRes.total_results;
    }

    // Fetch full details with watch providers for each result — capped at 5
    // concurrent requests to avoid bursting TMDB's rate limit.
    const limit = pLimit(5);
    const titles = await Promise.all(
      basicTitles.map((t) =>
        limit(async () => {
          try {
            const tmdbId = parseInt(t.tmdbId || "0", 10);
            if (t.objectType === "MOVIE") {
              return parseMovieDetails(await fetchMovieDetails(tmdbId));
            } else {
              return parseTvDetails(await fetchTvDetails(tmdbId));
            }
          } catch (err) {
            log.warn("TMDB enrichment failed for title", { titleId: t.tmdbId, err });
            syncFailureTotal.inc({ source: "tmdb" });
            return t;
          }
        })
      )
    );

    // Persist titles with offers to DB so stream buttons appear on subsequent views
    const titlesWithOffers = titles.filter((t) => t.offers.length > 0);
    if (titlesWithOffers.length > 0) {
      upsertTitles(titlesWithOffers).catch((e) => {
        log.error("Failed to persist browse titles", { error: (e as Error).message });
      });
    }

    const user = c.get("user");
    const trackedIds = user ? await getTrackedTitleIds(user.id) : new Set<string>();
    const titlesWithTracked = titles.map((t) => ({
      ...t,
      isTracked: trackedIds.has(t.id),
    }));

    // Build available filter options from TMDB data for dropdown population
    const rawGenres = [...movieGenreMap.values(), ...tvGenreMap.values()];
    const availableGenres = Array.from(new Set(rawGenres.map(toCanonicalGenre))).sort();

    // Deduplicate providers by ID and sort by name
    const providerMap = new Map<number, { id: number; name: string; iconUrl: string }>();
    for (const p of [...movieProviders, ...tvProviders]) {
      if (!providerMap.has(p.id)) providerMap.set(p.id, p);
    }
    const availableProviders = Array.from(providerMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    const availableLanguages = tmdbLanguages;

    // All browse providers come from TMDB filtered by region, so all are region providers
    const regionProviderIds = Array.from(providerMap.keys());

    // Priority languages: local language + English + common world languages
    const localLang = CONFIG.LANGUAGE.split("-")[0];
    const PRIORITY_LANGUAGES = ["en", "es", "fr", "de", "pt", "ja", "ko", "zh", "hi", "it", "ar"];
    const prioritySet = new Set([localLang, ...PRIORITY_LANGUAGES]);
    const priorityLanguageCodes = availableLanguages
      .filter((l) => prioritySet.has(l.code))
      .map((l) => l.code);

    setPublicCacheIfAnon(c, 1800);
    return ok(c, { titles: titlesWithTracked, page, totalPages, totalResults, availableGenres, availableProviders, availableLanguages, regionProviderIds, priorityLanguageCodes });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    log.error("Browse error", { error: message, stack });
    return err(c, message, 500);
  }
});

export default app;
