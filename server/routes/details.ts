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
} from "../tmdb/client";
import { parseMovieDetails, parseTvDetails } from "../tmdb/parser";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";

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

  return ok(c, { title, tmdb, country });
});

app.get("/show/:id", async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchShowFullDetails(title.tmdb_id);
    } catch (e) {
      log.error("TMDB show fetch failed", { tmdbId: title.tmdb_id, err: e });
    }
  }

  return ok(c, { title, tmdb, country });
});

app.get("/show/:id/season/:season", async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  const seasonNumber = Number(c.req.param("season"));

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchSeasonDetails(title.tmdb_id, seasonNumber);
    } catch (e) {
      log.error("TMDB season fetch failed", { tmdbId: title.tmdb_id, season: seasonNumber, err: e });
    }
  }

  return ok(c, { title, tmdb, seasonNumber, country });
});

app.get("/show/:id/season/:season/episode/:episode", async (c) => {
  const user = c.get("user");
  const title = await getOrFetchTitle(c.req.param("id"), user?.id);
  if (!title) return err(c, "Title not found", 404);

  const seasonNumber = Number(c.req.param("season"));
  const episodeNumber = Number(c.req.param("episode"));

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

export default app;
