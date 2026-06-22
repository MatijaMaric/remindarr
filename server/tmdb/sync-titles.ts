import { CONFIG } from "../config";
import { logger } from "../logger";
import { syncFailureTotal } from "../metrics";

const log = logger.child({ module: "tmdb" });
import {
  discoverMovies,
  discoverTv,
  fetchMovieDetails,
  fetchTvDetails,
  getMovieGenres,
  getTvGenres,
} from "./client";
import {
  parseMovieDetails,
  parseTvDetails,
  parseDiscoverMovie,
  parseDiscoverTv,
  type ParsedTitle,
} from "./parser";
import { syncEachWithDelay } from "./sync-utils";

function dateString(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export async function fetchNewReleases(options: {
  daysBack?: number;
  objectType?: "MOVIE" | "SHOW";
  maxPages?: number;
  /**
   * When true, a failure in the movie or TV discover/genre calls is caught,
   * logged, and counted — the other path still runs and partial results are
   * returned. Default false preserves the throwing contract (used by the
   * admin sync route and CLI so operators see real errors).
   */
  continueOnError?: boolean;
}): Promise<ParsedTitle[]> {
  const {
    daysBack = CONFIG.DEFAULT_DAYS_BACK,
    objectType,
    maxPages = 5,
    continueOnError = false,
  } = options;

  const dateGte = dateString(daysBack);
  const dateLte = new Date().toISOString().slice(0, 10);
  const allTitles: ParsedTitle[] = [];

  // Fetch movies
  if (!objectType || objectType === "MOVIE") {
    try {
      const movieGenres = await getMovieGenres();

      for (let page = 1; page <= maxPages; page++) {
        const result = await discoverMovies({
          releaseDateGte: dateGte,
          releaseDateLte: dateLte,
          page,
        });

        if (result.results.length === 0) break;

        // Fetch full details for each movie (includes watch providers)
        const { results: parsed } = await syncEachWithDelay(result.results, {
          delayMs: CONFIG.PAGE_DELAY_MS,
          label: "sync-titles:movie",
          log,
          onItem: async (movie) =>
            parseMovieDetails(await fetchMovieDetails(movie.id)),
          onError: (err, movie) => {
            // Fallback to discover data without watch providers
            log.error("Failed to fetch movie details", {
              movieId: movie.id,
              err,
            });
            return { result: parseDiscoverMovie(movie, movieGenres) };
          },
        });
        allTitles.push(...parsed);

        if (page >= result.total_pages) break;
      }
    } catch (err) {
      if (!continueOnError) throw err;
      log.error("Movie release fetch failed, continuing with TV titles", {
        err,
      });
      syncFailureTotal.inc({ source: "tmdb-movies" });
    }
  }

  // Fetch TV shows
  if (!objectType || objectType === "SHOW") {
    try {
      const tvGenres = await getTvGenres();

      for (let page = 1; page <= maxPages; page++) {
        const result = await discoverTv({
          firstAirDateGte: dateGte,
          firstAirDateLte: dateLte,
          page,
        });

        if (result.results.length === 0) break;

        // Fetch full details for each show (includes watch providers)
        const { results: parsed } = await syncEachWithDelay(result.results, {
          delayMs: CONFIG.PAGE_DELAY_MS,
          label: "sync-titles:show",
          log,
          onItem: async (show) => parseTvDetails(await fetchTvDetails(show.id)),
          onError: (err, show) => {
            log.error("Failed to fetch TV details", { showId: show.id, err });
            return { result: parseDiscoverTv(show, tvGenres) };
          },
        });
        allTitles.push(...parsed);

        if (page >= result.total_pages) break;
      }
    } catch (err) {
      if (!continueOnError) throw err;
      log.error("TV release fetch failed", { err });
      syncFailureTotal.inc({ source: "tmdb-tv" });
    }
  }

  return allTitles;
}
