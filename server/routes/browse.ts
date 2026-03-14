import { Hono } from "hono";
import {
  fetchPopularMovies,
  fetchPopularTv,
  fetchUpcomingMovies,
  fetchOnTheAirTv,
  fetchTopRatedMovies,
  fetchTopRatedTv,
  fetchMovieDetails,
  fetchTvDetails,
  getMovieGenres,
  getTvGenres,
} from "../tmdb/client";
import {
  parseDiscoverMovie,
  parseDiscoverTv,
  parseMovieDetails,
  parseTvDetails,
  type ParsedTitle,
} from "../tmdb/parser";

const VALID_CATEGORIES = ["popular", "upcoming", "top_rated"] as const;
type Category = (typeof VALID_CATEGORIES)[number];

const movieFetchers: Record<Category, (page: number) => ReturnType<typeof fetchPopularMovies>> = {
  popular: fetchPopularMovies,
  upcoming: fetchUpcomingMovies,
  top_rated: fetchTopRatedMovies,
};

const tvFetchers: Record<Category, (page: number) => ReturnType<typeof fetchPopularTv>> = {
  popular: fetchPopularTv,
  upcoming: fetchOnTheAirTv,
  top_rated: fetchTopRatedTv,
};

const app = new Hono();

app.get("/", async (c) => {
  const category = c.req.query("category");
  const type = c.req.query("type") || "";
  const page = parseInt(c.req.query("page") || "1", 10);

  if (!category || !VALID_CATEGORIES.includes(category as Category)) {
    return c.json({ error: "Invalid category. Must be one of: popular, upcoming, top_rated" }, 400);
  }

  try {
    const [genreMap, tvGenreMap] = await Promise.all([getMovieGenres(), getTvGenres()]);
    const allGenres = new Map([...genreMap, ...tvGenreMap]);

    let basicTitles: ParsedTitle[] = [];
    let totalPages = 1;

    if (type === "MOVIE") {
      const res = await movieFetchers[category as Category](page);
      basicTitles = res.results.map((m) => parseDiscoverMovie(m, allGenres));
      totalPages = Math.min(res.total_pages, 500);
    } else if (type === "SHOW") {
      const res = await tvFetchers[category as Category](page);
      basicTitles = res.results.map((t) => parseDiscoverTv(t, allGenres));
      totalPages = Math.min(res.total_pages, 500);
    } else {
      const [movieRes, tvRes] = await Promise.all([
        movieFetchers[category as Category](page),
        tvFetchers[category as Category](page),
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

    return c.json({ titles, page, totalPages });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
