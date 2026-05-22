import { Hono } from "hono";
import { z } from "zod";
import { pLimit } from "../lib/p-limit";
import {
  discoverMovies,
  discoverTv,
  cachedFetchMovieDetails,
  cachedFetchTvDetails,
  getMovieGenres,
  getTvGenres,
  tmdbLanguage,
  type DiscoverFilters,
} from "../tmdb/client";
import {
  parseDiscoverMovie,
  parseDiscoverTv,
  parseMovieDetails,
  parseTvDetails,
  type ParsedTitle,
} from "../tmdb/parser";
import {
  getTrackedTitleIds,
  upsertTitles,
  getSubscribedProviderIds,
  getTitlesByTmdbIds,
} from "../db/repository";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { syncFailureTotal, browseCacheTotal } from "../metrics";
import { ok, err } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";
import { zValidator } from "../lib/validator";
import { expandGenreIds } from "../genres";
import { getCache } from "../cache";
import Sentry from "../sentry";
import { CONFIG } from "../config";

const log = logger.child({ module: "browse" });

function buildBrowseCacheKey(params: {
  category: string;
  type: string[];
  page: number;
  genreParam: string | undefined;
  providerValues: string[];
  languageValues: string[];
  yearMin: number | undefined;
  yearMax: number | undefined;
  minRating: number | undefined;
  onlyMine: boolean;
}): string {
  return [
    "browse:v1",
    params.category,
    [...params.type].sort().join(","),
    params.page,
    params.genreParam ?? "",
    [...params.providerValues].sort().join(","),
    params.languageValues[0] ?? "",
    params.yearMin ?? "",
    params.yearMax ?? "",
    params.minRating ?? "",
    params.onlyMine ? "1" : "0",
    tmdbLanguage(),
  ].join(":");
}

const VALID_CATEGORIES = ["popular", "upcoming", "top_rated"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

const browseQuerySchema = z.object({
  category: z.enum(["popular", "upcoming", "top_rated"]),
  type: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  genre: z.string().optional(),
  provider: z.string().optional(),
  language: z.string().optional(),
  year_min: z.coerce.number().int().optional(),
  year_max: z.coerce.number().int().optional(),
  min_rating: z.coerce.number().min(0).max(10).optional(),
  onlyMine: z
    .literal("true")
    .optional()
    .transform((v) => v === "true"),
});

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

interface CategoryDiscoverOptions {
  page: number;
  filters: DiscoverFilters;
}

function fetchMoviesByCategory(
  category: Category,
  opts: CategoryDiscoverOptions,
) {
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
      return discoverMovies({
        sortBy: "vote_average.desc",
        voteCountGte: "200",
        page,
        filters,
      });
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
      return discoverTv({
        sortBy: "vote_average.desc",
        voteCountGte: "200",
        page,
        filters,
      });
  }
}

const app = new Hono<AppEnv>();

app.get("/", zValidator("query", browseQuerySchema), async (c) => {
  const {
    category,
    type,
    page,
    genre: genreParam,
    provider: providerParam,
    language: languageParam,
    year_min: yearMin,
    year_max: yearMax,
    min_rating: minRating,
    onlyMine,
  } = c.req.valid("query");
  const genreNames = genreParam ? genreParam.split(",").filter(Boolean) : [];
  let providerValues = providerParam
    ? providerParam.split(",").filter(Boolean)
    : [];
  const languageValues = languageParam
    ? languageParam.split(",").filter(Boolean)
    : [];
  const typeValues = type ? type.split(",").filter(Boolean) : [];

  const user = c.get("user");

  try {
    if (onlyMine && user) {
      const subscribedIds = await getSubscribedProviderIds(user.id);
      if (subscribedIds.length === 0) {
        return ok(c, { titles: [], page, totalPages: 0, totalResults: 0 });
      }
      const subscribedStrings = subscribedIds.map(String);
      providerValues =
        providerValues.length > 0
          ? providerValues.filter((p) => subscribedStrings.includes(p))
          : subscribedStrings;
      if (providerValues.length === 0) {
        return ok(c, { titles: [], page, totalPages: 0, totalResults: 0 });
      }
    }

    // ── Browse response cache ──────────────────────────────────────────────
    const browseCacheKey = buildBrowseCacheKey({
      category,
      type: typeValues,
      page,
      genreParam,
      providerValues,
      languageValues,
      yearMin,
      yearMax,
      minRating,
      onlyMine,
    });

    const cachedPayload = await getCache().get<{
      titles: ParsedTitle[];
      page: number;
      totalPages: number;
      totalResults: number;
    }>(browseCacheKey);
    if (cachedPayload !== null) {
      browseCacheTotal.inc({ result: "hit" });
      Sentry.addBreadcrumb({
        category: "browse",
        message: "Browse cache hit",
        level: "info",
        data: { cacheKey: browseCacheKey },
      });
      const trackedIds = user
        ? await getTrackedTitleIds(user.id)
        : new Set<string>();
      const titlesWithTracked = cachedPayload.titles.map((t) => ({
        ...t,
        isTracked: trackedIds.has(t.id),
      }));
      setPublicCacheIfAnon(c, 1800);
      return ok(c, { ...cachedPayload, titles: titlesWithTracked });
    }
    browseCacheTotal.inc({ result: "miss" });
    // ──────────────────────────────────────────────────────────────────────

    const [movieGenreMap, tvGenreMap] = await Promise.all([
      getMovieGenres(),
      getTvGenres(),
    ]);
    const allGenres = new Map([...movieGenreMap, ...tvGenreMap]);

    // Build discover filters
    const filters: DiscoverFilters = {};
    if (genreNames.length > 0) {
      const genreIds = genreNames.flatMap((name) =>
        expandGenreIds(name, movieGenreMap, tvGenreMap),
      );
      if (genreIds.length > 0)
        filters.withGenres = genreIds.map(String).join("|");
    }
    if (providerValues.length > 0)
      filters.withProviders = providerValues.join("|");
    if (languageValues.length > 0)
      filters.withOriginalLanguage = languageValues[0];
    if (yearMin != null && Number.isFinite(yearMin)) filters.yearMin = yearMin;
    if (yearMax != null && Number.isFinite(yearMax)) filters.yearMax = yearMax;
    if (minRating != null && Number.isFinite(minRating))
      filters.voteAverageGte = minRating;

    const discoverOpts: CategoryDiscoverOptions = { page, filters };

    let basicTitles: ParsedTitle[] = [];
    let totalPages = 1;
    let totalResults = 0;

    const fetchMovies = typeValues.length === 0 || typeValues.includes("MOVIE");
    const fetchShows = typeValues.length === 0 || typeValues.includes("SHOW");

    if (fetchMovies && !fetchShows) {
      const res = await fetchMoviesByCategory(
        category as Category,
        discoverOpts,
      );
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
      const movies = movieRes.results.map((m) =>
        parseDiscoverMovie(m, allGenres),
      );
      const tvShows = tvRes.results.map((t) => parseDiscoverTv(t, allGenres));
      basicTitles = [...movies, ...tvShows];
      totalPages = Math.min(
        Math.max(movieRes.total_pages, tvRes.total_pages),
        500,
      );
      totalResults = movieRes.total_results + tvRes.total_results;
    }

    // Batch-read known titles from DB to skip TMDB calls for already-stored titles
    const dbTitles = await getTitlesByTmdbIds(
      basicTitles.map((t) => ({
        tmdbId: parseInt(t.tmdbId || "0", 10),
        objectType: t.objectType,
      })),
    );
    const dbByKey = new Map(
      dbTitles.map((t) => [`${t.objectType}:${t.tmdbId}`, t]),
    );

    // Fetch full details with watch providers for each result — capped at 5
    // concurrent requests to avoid bursting TMDB's rate limit. DB-stored titles
    // skip the TMDB call entirely (fanout DB short-circuit).
    const limit = pLimit(5);
    let fanoutDbHits = 0;
    let fanoutTmdbMisses = 0;

    const titles = await Sentry.startSpan(
      { name: "browse.enrich", op: "browse.fanout" },
      () =>
        Promise.all(
          basicTitles.map((t) =>
            limit(async () => {
              const dbHit = dbByKey.get(`${t.objectType}:${t.tmdbId}`);
              if (dbHit) {
                fanoutDbHits++;
                return dbHit;
              }
              fanoutTmdbMisses++;
              try {
                const tmdbId = parseInt(t.tmdbId || "0", 10);
                if (t.objectType === "MOVIE") {
                  return parseMovieDetails(
                    await cachedFetchMovieDetails(tmdbId),
                  );
                } else {
                  return parseTvDetails(await cachedFetchTvDetails(tmdbId));
                }
              } catch (fanoutErr) {
                log.warn("TMDB enrichment failed for title", {
                  titleId: t.tmdbId,
                  err: fanoutErr,
                });
                syncFailureTotal.inc({ source: "tmdb" });
                return t;
              }
            }),
          ),
        ),
    );

    Sentry.addBreadcrumb({
      category: "browse",
      message: "Browse fan-out complete",
      level: "info",
      data: {
        fanoutCount: String(basicTitles.length),
        dbHits: String(fanoutDbHits),
        tmdbMisses: String(fanoutTmdbMisses),
      },
    });

    // Persist titles with offers to DB so stream buttons appear on subsequent views
    const titlesWithOffers = titles.filter((t) => t.offers.length > 0);
    if (titlesWithOffers.length > 0) {
      upsertTitles(titlesWithOffers).catch((e) => {
        log.error("Failed to persist browse titles", {
          error: (e as Error).message,
        });
      });
    }

    // Cache the user-agnostic payload (isTracked is applied after cache read)
    await getCache().set(
      browseCacheKey,
      { titles, page, totalPages, totalResults },
      CONFIG.CACHE_TTL_BROWSE,
    );

    const trackedIds = user
      ? await getTrackedTitleIds(user.id)
      : new Set<string>();
    const titlesWithTracked = titles.map((t) => ({
      ...t,
      isTracked: trackedIds.has(t.id),
    }));

    setPublicCacheIfAnon(c, 1800);
    return ok(c, { titles: titlesWithTracked, page, totalPages, totalResults });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    log.error("Browse error", { error: message, stack });
    return err(c, message, 500);
  }
});

export default app;
