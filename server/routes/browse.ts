import { Hono } from "hono";
import {
  discoverMovies,
  discoverTv,
  fetchMovieDetails,
  fetchTvDetails,
  getMovieGenres,
  getTvGenres,
  type DiscoverFilters,
} from "../tmdb/client";
import {
  parseDiscoverMovie,
  parseDiscoverTv,
  parseMovieDetails,
  parseTvDetails,
  type ParsedTitle,
} from "../tmdb/parser";
import { getTrackedTitleIds } from "../db/repository";
import type { AppEnv } from "../types";

const VALID_CATEGORIES = ["popular", "upcoming", "top_rated"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function reverseGenreLookup(
  genreName: string,
  movieGenres: Map<number, string>,
  tvGenres: Map<number, string>
): string | undefined {
  for (const [id, name] of movieGenres) {
    if (name === genreName) return String(id);
  }
  for (const [id, name] of tvGenres) {
    if (name === genreName) return String(id);
  }
  return undefined;
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
  const page = parseInt(c.req.query("page") || "1", 10);
  const genreName = c.req.query("genre") || "";
  const providerParam = c.req.query("provider") || "";
  const languageParam = c.req.query("language") || "";

  if (!category || !VALID_CATEGORIES.includes(category as Category)) {
    return c.json({ error: "Invalid category. Must be one of: popular, upcoming, top_rated" }, 400);
  }

  try {
    const [movieGenreMap, tvGenreMap] = await Promise.all([getMovieGenres(), getTvGenres()]);
    const allGenres = new Map([...movieGenreMap, ...tvGenreMap]);

    // Build discover filters
    const filters: DiscoverFilters = {};
    if (genreName) {
      const genreId = reverseGenreLookup(genreName, movieGenreMap, tvGenreMap);
      if (genreId) filters.withGenres = genreId;
    }
    if (providerParam) filters.withProviders = providerParam;
    if (languageParam) filters.withOriginalLanguage = languageParam;

    const discoverOpts: CategoryDiscoverOptions = { page, filters };

    let basicTitles: ParsedTitle[] = [];
    let totalPages = 1;

    if (type === "MOVIE") {
      const res = await fetchMoviesByCategory(category as Category, discoverOpts);
      basicTitles = res.results.map((m) => parseDiscoverMovie(m, allGenres));
      totalPages = Math.min(res.total_pages, 500);
    } else if (type === "SHOW") {
      const res = await fetchTvByCategory(category as Category, discoverOpts);
      basicTitles = res.results.map((t) => parseDiscoverTv(t, allGenres));
      totalPages = Math.min(res.total_pages, 500);
    } else {
      const [movieRes, tvRes] = await Promise.all([
        fetchMoviesByCategory(category as Category, discoverOpts),
        fetchTvByCategory(category as Category, discoverOpts),
      ]);
      const movies = movieRes.results.map((m) => parseDiscoverMovie(m, allGenres));
      const tvShows = tvRes.results.map((t) => parseDiscoverTv(t, allGenres));
      basicTitles = [...movies, ...tvShows];
      totalPages = Math.min(Math.max(movieRes.total_pages, tvRes.total_pages), 500);
    }

    // Fetch full details with watch providers for each result
    const titles = await Promise.all(
      basicTitles.map(async (t) => {
        try {
          const tmdbId = parseInt(t.tmdbId || "0", 10);
          if (t.objectType === "MOVIE") {
            return parseMovieDetails(await fetchMovieDetails(tmdbId));
          } else {
            return parseTvDetails(await fetchTvDetails(tmdbId));
          }
        } catch {
          return t;
        }
      })
    );

    const user = c.get("user");
    const trackedIds = user ? getTrackedTitleIds(user.id) : new Set<string>();
    const titlesWithTracked = titles.map((t) => ({
      ...t,
      isTracked: trackedIds.has(t.id),
    }));

    // Build available genres from TMDB genre maps for dropdown population
    const availableGenres = Array.from(new Set([...movieGenreMap.values(), ...tvGenreMap.values()])).sort();

    return c.json({ titles: titlesWithTracked, page, totalPages, availableGenres });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
