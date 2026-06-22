import { Hono } from "hono";
import { z } from "zod";
import {
  fetchTrendingMovies,
  fetchTrendingTv,
  fetchTrendingPeople,
  tmdbLanguage,
  type TrendingTimeWindow,
} from "../tmdb/client";
import {
  parseDiscoverMovie,
  parseDiscoverTv,
  parseTrendingPerson,
  type ParsedTitle,
  type TrendingPerson,
} from "../tmdb/parser";
import { getTrackedTitleIds } from "../db/repository";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { syncFailureTotal, trendingCacheTotal } from "../metrics";
import { ok } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";
import { zValidator } from "../lib/validator";
import { getCache } from "../cache";
import { CONFIG } from "../config";

const log = logger.child({ module: "trending" });

// ─── Snapshot shapes ────────────────────────────────────────────────────────

/** A trending movie/TV show in the user-agnostic snapshot (no `isTracked`). */
export interface TrendingTitleSnapshot {
  id: string;
  objectType: "MOVIE" | "SHOW";
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
}

/** The cached, user-agnostic trending snapshot. Any group may be empty. */
export interface TrendingSnapshot {
  movies: TrendingTitleSnapshot[];
  shows: TrendingTitleSnapshot[];
  people: TrendingPerson[];
  refreshedAt: string;
}

// parseDiscoverMovie/Tv need a genre map; trending doesn't surface genres so we
// pass an empty one (avoids an extra TMDB round-trip for genre lists).
const EMPTY_GENRES = new Map<number, string>();

const trendingQuerySchema = z.object({
  time_window: z.enum(["day", "week"]).optional(),
});

/** Cache key for a snapshot. Includes language + window so configs don't collide. */
export function trendingCacheKey(timeWindow: TrendingTimeWindow): string {
  return `trending:v1:${tmdbLanguage()}:${timeWindow}`;
}

function toTrendingTitle(t: ParsedTitle): TrendingTitleSnapshot {
  return {
    id: t.id,
    objectType: t.objectType,
    title: t.title,
    posterUrl: t.posterUrl,
    releaseDate: t.releaseDate,
  };
}

/** De-duplicate by `id`, preserving first occurrence (FR-014). */
function dedupeById<T extends { id: string | number }>(items: T[]): T[] {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Build the trending snapshot from TMDB. Throws if any upstream fetch fails —
 * callers decide whether to fail soft (route) or preserve stale cache (job).
 */
export async function buildTrendingSnapshot(
  timeWindow: TrendingTimeWindow,
): Promise<TrendingSnapshot> {
  const [movieRes, tvRes, peopleRes] = await Promise.all([
    fetchTrendingMovies(timeWindow),
    fetchTrendingTv(timeWindow),
    fetchTrendingPeople(timeWindow),
  ]);

  const movies = dedupeById(
    movieRes.results.map((m) =>
      toTrendingTitle(parseDiscoverMovie(m, EMPTY_GENRES)),
    ),
  );
  const shows = dedupeById(
    tvRes.results.map((t) => toTrendingTitle(parseDiscoverTv(t, EMPTY_GENRES))),
  );
  const people = dedupeById(peopleRes.results.map(parseTrendingPerson));

  return {
    movies,
    shows,
    people,
    refreshedAt: new Date().toISOString(),
  };
}

const app = new Hono<AppEnv>();

app.get("/", zValidator("query", trendingQuerySchema), async (c) => {
  const { time_window } = c.req.valid("query");
  const timeWindow = (time_window ??
    CONFIG.TRENDING_TIME_WINDOW) as TrendingTimeWindow;
  const cacheKey = trendingCacheKey(timeWindow);
  const user = c.get("user");

  // ── Snapshot cache (lazy populate on miss) ───────────────────────────────
  let snapshot = await getCache().get<TrendingSnapshot>(cacheKey);
  let failedSoft = false;
  if (snapshot !== null) {
    trendingCacheTotal.inc({ result: "hit" });
  } else {
    trendingCacheTotal.inc({ result: "miss" });
    try {
      snapshot = await buildTrendingSnapshot(timeWindow);
      await getCache().set(cacheKey, snapshot, CONFIG.CACHE_TTL_TRENDING);
    } catch (e: unknown) {
      // Fail soft (FR-008, SC-003): cold cache + upstream error → empty groups,
      // HTTP 200. The home screen must still render; never 5xx for trending.
      log.warn("Trending build failed, serving empty snapshot", {
        error: e instanceof Error ? e.message : String(e),
        timeWindow,
      });
      syncFailureTotal.inc({ source: "tmdb" });
      snapshot = {
        movies: [],
        shows: [],
        people: [],
        refreshedAt: new Date().toISOString(),
      };
      failedSoft = true;
    }
  }

  // ── Per-request isTracked overlay (snapshot is user-agnostic) ─────────────
  const trackedIds = user
    ? await getTrackedTitleIds(user.id)
    : new Set<string>();
  const overlay = (t: TrendingTitleSnapshot) => ({
    ...t,
    isTracked: trackedIds.has(t.id),
  });

  if (failedSoft) {
    // Don't let the edge cache pin an empty fail-soft response for the full TTL —
    // retry on the next request so the section recovers promptly once TMDB is back.
    c.header("Cache-Control", "no-store");
  } else {
    setPublicCacheIfAnon(c, CONFIG.CACHE_TTL_TRENDING);
  }
  return ok(c, {
    movies: snapshot.movies.map(overlay),
    shows: snapshot.shows.map(overlay),
    people: snapshot.people,
    refreshedAt: snapshot.refreshedAt,
  });
});

export default app;
