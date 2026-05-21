import { Hono } from "hono";
import { z } from "zod";
import { getTitleById, upsertTitles } from "../db/repository";
import { CONFIG } from "../config";
import {
  fetchMovieDetails,
  fetchTvDetails,
  fetchMovieFullDetails,
  fetchShowFullDetails,
  fetchSeasonDetails,
  fetchEpisodeDetails,
  fetchPersonDetails,
  fetchMovieSuggestions,
  fetchTvSuggestions,
  getMovieGenres,
  getTvGenres,
  fetchCollection,
} from "../tmdb/client";
import { parseMovieDetails, parseTvDetails, parseDiscoverMovie, parseDiscoverTv } from "../tmdb/parser";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";
import { zValidator } from "../lib/validator";
import { getUserPace, computeEta } from "../db/repository/stats";
import { getDb } from "../db/schema";
import { sql } from "drizzle-orm";

const log = logger.child({ module: "details" });

const titleIdParam = z.object({
  id: z.string().regex(/^(movie|tv)-\d+$/, "id must match movie-N or tv-N"),
});
const seasonParam = titleIdParam.extend({
  season: z.coerce.number().int().min(0),
});
const episodeParam = seasonParam.extend({
  episode: z.coerce.number().int().min(1),
});
const personIdParam = z.object({
  personId: z.coerce.number().int().min(1),
});
const suggestionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
});
const collectionIdParam = z.object({
  id: z.coerce.number().int().min(1),
});

const app = new Hono<AppEnv>();

const country = CONFIG.COUNTRY;

function parseTitleId(titleId: string): { type: "MOVIE" | "SHOW"; tmdbId: number } | null {
  const movieMatch = titleId.match(/^movie-(\d+)$/);
  if (movieMatch) return { type: "MOVIE", tmdbId: parseInt(movieMatch[1], 10) };

  const tvMatch = titleId.match(/^tv-(\d+)$/);
  if (tvMatch) return { type: "SHOW", tmdbId: parseInt(tvMatch[1], 10) };

  return null;
}

async function getOrFetchTitle(titleId: string, userId?: string) {
  let title = await getTitleById(titleId, userId);
  if (title) return title;

  const parsed = parseTitleId(titleId);
  if (!parsed || !CONFIG.TMDB_API_KEY) return null;

  try {
    if (parsed.type === "MOVIE") {
      const tmdbData = await fetchMovieDetails(parsed.tmdbId);
      await upsertTitles([parseMovieDetails(tmdbData)]);
    } else {
      const tmdbData = await fetchTvDetails(parsed.tmdbId);
      await upsertTitles([parseTvDetails(tmdbData)]);
    }
  } catch (e) {
    log.error("TMDB fallback fetch failed", { titleId, err: e });
    return null;
  }

  return await getTitleById(titleId, userId);
}

app.get("/movie/:id", zValidator("param", titleIdParam), async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchMovieFullDetails(title.tmdb_id);
    } catch (e) {
      log.error("TMDB movie fetch failed", { tmdbId: title.tmdb_id, err: e });
    }
  }

  setPublicCacheIfAnon(c, 3600);
  return ok(c, { title, tmdb, country });
});

app.get("/show/:id", zValidator("param", titleIdParam), async (c) => {
  const user = c.get("user");
  const titleId = c.req.param("id");
  const title = await getOrFetchTitle(titleId, user?.id);
  if (!title) return err(c, "Title not found", 404);

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchShowFullDetails(title.tmdb_id);
    } catch (e) {
      log.error("TMDB show fetch failed", { tmdbId: title.tmdb_id, err: e });
    }
  }

  let etaDays: number | null = null;
  if (user && title.is_tracked) {
    try {
      const db = getDb();
      // Episodes don't store per-episode runtime; use the title's runtime_minutes as proxy
      const remainingRows = await db.all<{ remaining_minutes: number }>(sql`
        SELECT COALESCE(
          (SELECT COUNT(e.id) FROM episodes e
           WHERE e.title_id = ${titleId}
             AND e.air_date <= date('now')
             AND e.id NOT IN (
               SELECT we.episode_id FROM watched_episodes we WHERE we.user_id = ${user.id}
             )
          ) * (SELECT t.runtime_minutes FROM titles t WHERE t.id = ${titleId}),
          0
        ) AS remaining_minutes
      `);
      const remainingMinutes = remainingRows[0]?.remaining_minutes ?? 0;
      if (remainingMinutes > 0) {
        const pace = await getUserPace(user.id);
        etaDays = computeEta(remainingMinutes, pace.minutesPerDay);
      }
    } catch (e) {
      log.error("ETA computation failed", { titleId, err: e });
    }
  }

  setPublicCacheIfAnon(c, 3600);
  return ok(c, { title: { ...title, eta_days: etaDays }, tmdb, country });
});

app.get("/show/:id/season/:season", zValidator("param", seasonParam), async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  const seasonNumber = c.req.valid("param").season;

  let tmdb = null;
  let seasons: { season_number: number; name: string; episode_count: number; air_date: string | null; poster_path: string | null }[] = [];

  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    const [seasonResult, showResult] = await Promise.allSettled([
      fetchSeasonDetails(title.tmdb_id, seasonNumber),
      fetchShowFullDetails(title.tmdb_id),
    ]);

    if (seasonResult.status === "fulfilled") {
      tmdb = seasonResult.value;
    } else {
      log.error("TMDB season fetch failed", { tmdbId: title.tmdb_id, season: seasonNumber, err: seasonResult.reason });
    }

    if (showResult.status === "fulfilled" && showResult.value?.seasons) {
      seasons = showResult.value.seasons
        .filter((s: { season_number: number }) => s.season_number > 0)
        .sort((a: { season_number: number }, b: { season_number: number }) => a.season_number - b.season_number)
        .map((s: { season_number: number; name: string; episode_count: number; air_date: string | null; poster_path: string | null }) => ({
          season_number: s.season_number,
          name: s.name,
          episode_count: s.episode_count,
          air_date: s.air_date,
          poster_path: s.poster_path,
        }));
    }
  }

  setPublicCacheIfAnon(c, 3600);
  return ok(c, { title, tmdb, seasonNumber, country, seasons });
});

app.get("/show/:id/season/:season/episode/:episode", zValidator("param", episodeParam), async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  const { season: seasonNumber, episode: episodeNumber } = c.req.valid("param");

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchEpisodeDetails(title.tmdb_id, seasonNumber, episodeNumber);
    } catch (e) {
      log.error("TMDB episode fetch failed", { tmdbId: title.tmdb_id, season: seasonNumber, episode: episodeNumber, err: e });
    }
  }

  return ok(c, { title, tmdb, seasonNumber, episodeNumber, country });
});

app.get("/person/:personId", zValidator("param", personIdParam), async (c) => {
  const personId = c.req.valid("param").personId;

  if (!CONFIG.TMDB_API_KEY) {
    return err(c, "TMDB not configured", 503);
  }

  try {
    const person = await fetchPersonDetails(personId);
    return ok(c, { person });
  } catch (e) {
    log.error("TMDB person fetch failed", { personId, err: e });
    return err(c, "Person not found", 404);
  }
});

app.get("/movie/:id/suggestions", zValidator("param", titleIdParam), zValidator("query", suggestionsQuery), async (c) => {
  const parsed = parseTitleId(c.req.param("id"));
  if (!parsed || parsed.type !== "MOVIE") return err(c, "Invalid title ID", 400);
  if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);

  const page = c.req.valid("query").page;

  try {
    const [data, genreMap] = await Promise.all([
      fetchMovieSuggestions(parsed.tmdbId, page),
      getMovieGenres(),
    ]);
    const titles = data.results.map((r) => parseDiscoverMovie(r, genreMap));
    setPublicCacheIfAnon(c, 1800);
    return ok(c, { titles, page: data.page, totalPages: data.total_pages, totalResults: data.total_results });
  } catch (e) {
    log.error("TMDB movie suggestions fetch failed", { tmdbId: parsed.tmdbId, err: e });
    return err(c, "Failed to fetch suggestions", 503);
  }
});

app.get("/show/:id/suggestions", zValidator("param", titleIdParam), zValidator("query", suggestionsQuery), async (c) => {
  const parsed = parseTitleId(c.req.param("id"));
  if (!parsed || parsed.type !== "SHOW") return err(c, "Invalid title ID", 400);
  if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);

  const page = c.req.valid("query").page;

  try {
    const [data, genreMap] = await Promise.all([
      fetchTvSuggestions(parsed.tmdbId, page),
      getTvGenres(),
    ]);
    const titles = data.results.map((r) => parseDiscoverTv(r, genreMap));
    setPublicCacheIfAnon(c, 1800);
    return ok(c, { titles, page: data.page, totalPages: data.total_pages, totalResults: data.total_results });
  } catch (e) {
    log.error("TMDB show suggestions fetch failed", { tmdbId: parsed.tmdbId, err: e });
    return err(c, "Failed to fetch suggestions", 503);
  }
});

app.get("/collection/:id", zValidator("param", collectionIdParam), async (c) => {
  if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);
  const { id } = c.req.valid("param");
  try {
    const collection = await fetchCollection(id);
    setPublicCacheIfAnon(c, 3600);
    return c.json(collection);
  } catch (e) {
    log.error("TMDB collection fetch failed", { collectionId: id, err: e });
    return err(c, "Collection not found", 404);
  }
});

export default app;
