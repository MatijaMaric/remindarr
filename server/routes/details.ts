import { Hono } from "hono";
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
} from "../tmdb/client";
import { parseMovieDetails, parseTvDetails, parseDiscoverMovie, parseDiscoverTv } from "../tmdb/parser";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";
import { getUserPace, computeEta } from "../db/repository/stats";
import { getDb } from "../db/schema";
import { sql } from "drizzle-orm";

const log = logger.child({ module: "details" });

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

app.get("/movie/:id", async (c) => {
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

app.get("/show/:id", async (c) => {
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

app.get("/show/:id/season/:season", async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  const seasonNumber = Number(c.req.param("season"));
  if (isNaN(seasonNumber)) return c.json({ error: "Invalid season number" }, 400);

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

app.get("/show/:id/season/:season/episode/:episode", async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  const seasonNumber = Number(c.req.param("season"));
  const episodeNumber = Number(c.req.param("episode"));
  if (isNaN(seasonNumber) || isNaN(episodeNumber)) return c.json({ error: "Invalid season or episode number" }, 400);

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

app.get("/person/:personId", async (c) => {
  const personId = Number(c.req.param("personId"));
  if (!personId || isNaN(personId)) {
    return err(c, "Invalid person ID");
  }

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

app.get("/movie/:id/suggestions", async (c) => {
  const parsed = parseTitleId(c.req.param("id"));
  if (!parsed || parsed.type !== "MOVIE") return err(c, "Invalid title ID", 400);
  if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);

  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);

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

app.get("/show/:id/suggestions", async (c) => {
  const parsed = parseTitleId(c.req.param("id"));
  if (!parsed || parsed.type !== "SHOW") return err(c, "Invalid title ID", 400);
  if (!CONFIG.TMDB_API_KEY) return err(c, "TMDB not configured", 503);

  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);

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

export default app;
