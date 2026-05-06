import { Hono } from "hono";
import { z } from "zod";
import { pLimit } from "../lib/p-limit";
import { searchMulti, fetchMovieDetails, fetchTvDetails, getMovieGenres, getTvGenres } from "../tmdb/client";
import { parseSearchResult, parseMovieDetails, parseTvDetails, type ParsedTitle } from "../tmdb/parser";
import { getTrackedTitleIds, upsertTitles } from "../db/repository";
import { logger } from "../logger";
import { syncFailureTotal } from "../metrics";

const log = logger.child({ module: "search" });
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

import type { AppEnv } from "../types";

const searchQuerySchema = z.object({
  q: z.string().min(1),
  year_min: z.coerce.number().int().optional(),
  year_max: z.coerce.number().int().optional(),
  min_rating: z.coerce.number().min(0).max(10).optional(),
  type: z.enum(["MOVIE", "SHOW"]).optional(),
  language: z.string().optional(),
});

const app = new Hono<AppEnv>();

app.get("/", zValidator("query", searchQuerySchema), async (c) => {
  const { q: query, year_min: yearMin, year_max: yearMax, min_rating: minRating, type: typeParam, language: languageParam } = c.req.valid("query");

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

    // Fetch watch providers for each result — capped at 5 concurrent requests.
    const limit = pLimit(5);
    const titles = await Promise.all(
      basicTitles.slice(0, 20).map((t) =>
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
            syncFailureTotal.inc({ source: "search_enrichment" });
            return t; // Fallback to basic data without watch providers
          }
        })
      )
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
