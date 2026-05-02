import { Hono } from "hono";
import { pLimit } from "../lib/p-limit";
import {
  fetchMovieSuggestions,
  fetchTvSuggestions,
  getMovieGenres,
  getTvGenres,
} from "../tmdb/client";
import { parseDiscoverMovie, parseDiscoverTv } from "../tmdb/parser";
import type { ParsedTitle } from "../tmdb/parser";
import { getRecentTrackedSourceTitles, type TrackedSourceTitle } from "../db/repository/tracked";
import { getTrackedTitleIds } from "../db/repository/tracked";
import { getWatchedTitleIds } from "../db/repository/watched-titles";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";

const log = logger.child({ module: "suggestions" });

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);
  if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);

  const rawLimit = Number(c.req.query("limit") ?? "40");
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 40 : Math.min(rawLimit, 100);

  try {
    const [sourceTitles, trackedIds, watchedIds] = await Promise.all([
      getRecentTrackedSourceTitles(user.id, 5),
      getTrackedTitleIds(user.id),
      getWatchedTitleIds(user.id),
    ]);

    if (sourceTitles.length === 0) {
      return ok(c, { flat: [], groups: [] });
    }

    const [movieGenres, tvGenres] = await Promise.all([
      getMovieGenres(),
      getTvGenres(),
    ]);

    type GroupResult = { source: TrackedSourceTitle; suggestions: ParsedTitle[] };
    const limiter = pLimit(5);
    const groupResults: GroupResult[] = await Promise.all(
      sourceTitles.map((source) =>
        limiter(async (): Promise<GroupResult> => {
          try {
            const tmdbId = Number(source.tmdbId);
            let results: ParsedTitle[];
            if (source.objectType === "MOVIE") {
              const data = await fetchMovieSuggestions(tmdbId, 1);
              results = data.results.map((r) => parseDiscoverMovie(r, movieGenres));
            } else {
              const data = await fetchTvSuggestions(tmdbId, 1);
              results = data.results.map((r) => parseDiscoverTv(r, tvGenres));
            }
            return { source, suggestions: results };
          } catch (e) {
            log.warn("TMDB suggestions fetch failed for source", { sourceId: source.id, err: e });
            return { source, suggestions: [] as ParsedTitle[] };
          }
        })
      )
    );

    // Dedupe by id, filter out tracked and watched titles
    const seen = new Set<string>();
    const flat: ParsedTitle[] = [];

    const groups = groupResults
      .map(({ source, suggestions }) => {
        const filtered = suggestions.filter((t) => !trackedIds.has(t.id) && !watchedIds.has(t.id));
        return {
          source: { id: source.id, title: source.title, posterUrl: source.posterUrl },
          suggestions: filtered,
        };
      })
      .filter((g) => g.suggestions.length > 0);

    // Build flat list: iterate groups in order, pick unseen titles
    for (const group of groups) {
      for (const title of group.suggestions) {
        if (!seen.has(title.id)) {
          seen.add(title.id);
          flat.push(title);
        }
      }
    }

    // Sort flat by TMDB score descending, then truncate
    flat.sort((a, b) => (b.scores.tmdbScore ?? 0) - (a.scores.tmdbScore ?? 0));
    flat.splice(limit);

    return ok(c, { flat, groups });
  } catch (e) {
    log.error("Suggestions aggregate failed", { userId: user.id, err: e });
    return err(c, "Failed to fetch suggestions", 500);
  }
});

export default app;
