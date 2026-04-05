import { Hono } from "hono";
import { searchMulti, fetchMovieDetails, fetchTvDetails, getMovieGenres, getTvGenres } from "../tmdb/client";
import { parseSearchResult, parseMovieDetails, parseTvDetails, type ParsedTitle } from "../tmdb/parser";
import { getTrackedTitleIds, upsertTitles } from "../db/repository";
import { logger } from "../logger";

const log = logger.child({ module: "search" });
import { ok, err } from "./response";

import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const query = c.req.query("q");
  if (!query) {
    return err(c, "Query parameter 'q' is required");
  }

  // Parse optional filter params
  const yearMinRaw = c.req.query("year_min");
  const yearMaxRaw = c.req.query("year_max");
  const minRatingRaw = c.req.query("min_rating");
  const typeParam = c.req.query("type"); // "MOVIE" | "SHOW"
  const languageParam = c.req.query("language");

  const yearMin = yearMinRaw ? parseInt(yearMinRaw, 10) : undefined;
  const yearMax = yearMaxRaw ? parseInt(yearMaxRaw, 10) : undefined;
  const minRating = minRatingRaw ? parseFloat(minRatingRaw) : undefined;

  try {
    const [genreMap, tvGenreMap, searchResult] = await Promise.all([
      getMovieGenres(),
      getTvGenres(),
      searchMulti(query),
    ]);

    // Merge genre maps
    const allGenres = new Map([...genreMap, ...tvGenreMap]);

    // Parse search results (filter out "person" results)
    let basicTitles = searchResult.results
      .map((r) => parseSearchResult(r, allGenres))
      .filter((t): t is ParsedTitle => t !== null);

    // Apply type filter on TMDB results
    if (typeParam === "MOVIE" || typeParam === "SHOW") {
      basicTitles = basicTitles.filter((t) => t.objectType === typeParam);
    }

    // Apply year filters on TMDB results
    if (yearMin != null && !isNaN(yearMin)) {
      basicTitles = basicTitles.filter((t) => t.releaseYear != null && t.releaseYear >= yearMin);
    }
    if (yearMax != null && !isNaN(yearMax)) {
      basicTitles = basicTitles.filter((t) => t.releaseYear != null && t.releaseYear <= yearMax);
    }

    // Apply language filter on TMDB results (originalLanguage may be null for search results)
    if (languageParam) {
      basicTitles = basicTitles.filter((t) => t.originalLanguage === languageParam);
    }

    // Fetch watch providers for each result
    const titles = await Promise.all(
      basicTitles.slice(0, 20).map(async (t) => {
        try {
          const tmdbId = parseInt(t.tmdbId || "0", 10);
          if (t.objectType === "MOVIE") {
            return parseMovieDetails(await fetchMovieDetails(tmdbId));
          } else {
            return parseTvDetails(await fetchTvDetails(tmdbId));
          }
        } catch {
          return t; // Fallback to basic data without watch providers
        }
      })
    );

    // Apply rating filter only after fetching details (TMDB search results lack ratings;
    // full details include tmdbScore but not imdbScore — rating filter is best-effort here)
    let filteredTitles = titles;
    if (minRating != null && !isNaN(minRating)) {
      filteredTitles = titles.filter((t) => {
        const score = t.scores?.tmdbScore ?? null;
        return score != null && score >= minRating;
      });
    }

    // Persist titles with offers to DB so stream buttons appear on subsequent views
    const titlesWithOffers = filteredTitles.filter((t) => t.offers.length > 0);
    if (titlesWithOffers.length > 0) {
      upsertTitles(titlesWithOffers).catch((e) => {
        log.error("Failed to persist search titles", { error: (e as Error).message });
      });
    }

    const user = c.get("user");
    const trackedIds = user ? await getTrackedTitleIds(user.id) : new Set<string>();
    const titlesWithTracked = filteredTitles.map((t) => ({
      ...t,
      isTracked: trackedIds.has(t.id),
    }));

    return ok(c, { titles: titlesWithTracked, count: titlesWithTracked.length });
  } catch (e: unknown) {
    return err(c, (e as Error).message, 500);
  }
});

export default app;
