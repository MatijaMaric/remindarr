import { Hono } from "hono";
import { searchMulti, fetchMovieDetails, fetchTvDetails, getMovieGenres, getTvGenres } from "../tmdb/client";
import { parseSearchResult, parseMovieDetails, parseTvDetails, type ParsedTitle } from "../tmdb/parser";
import { getTrackedTitleIds } from "../db/repository";

import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const query = c.req.query("q");
  if (!query) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  try {
    const [genreMap, tvGenreMap, searchResult] = await Promise.all([
      getMovieGenres(),
      getTvGenres(),
      searchMulti(query),
    ]);

    // Merge genre maps
    const allGenres = new Map([...genreMap, ...tvGenreMap]);

    // Parse search results (filter out "person" results)
    const basicTitles = searchResult.results
      .map((r) => parseSearchResult(r, allGenres))
      .filter((t): t is ParsedTitle => t !== null);

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

    const user = c.get("user");
    const trackedIds = user ? getTrackedTitleIds(user.id) : new Set<string>();
    const titlesWithTracked = titles.map((t) => ({
      ...t,
      isTracked: trackedIds.has(t.id),
    }));

    return c.json({ titles: titlesWithTracked, count: titlesWithTracked.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
