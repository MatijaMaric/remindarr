import { Hono } from "hono";
import { getTitleById } from "../db/repository";
import { CONFIG } from "../config";
import {
  fetchMovieFullDetails,
  fetchShowFullDetails,
  fetchSeasonDetails,
  fetchEpisodeDetails,
} from "../tmdb/client";
import type { AppEnv } from "../types";
import { logger } from "../logger";

const log = logger.child({ module: "details" });

const app = new Hono<AppEnv>();

const country = CONFIG.COUNTRY;

app.get("/movie/:id", async (c) => {
  const user = c.get("user");
  const title = getTitleById(c.req.param("id"), user?.id);
  if (!title) return c.json({ error: "Title not found" }, 404);

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchMovieFullDetails(title.tmdb_id);
    } catch (e) {
      log.error("TMDB movie fetch failed", { tmdbId: title.tmdb_id, err: e });
    }
  }

  return c.json({
    title,
    tmdb,
    country,
  });
});

app.get("/show/:id", async (c) => {
  const user = c.get("user");
  const title = getTitleById(c.req.param("id"), user?.id);
  if (!title) return c.json({ error: "Title not found" }, 404);

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchShowFullDetails(title.tmdb_id);
    } catch (e) {
      log.error("TMDB show fetch failed", { tmdbId: title.tmdb_id, err: e });
    }
  }

  return c.json({
    title,
    tmdb,
    country,
  });
});

app.get("/show/:id/season/:season", async (c) => {
  const user = c.get("user");
  const title = getTitleById(c.req.param("id"), user?.id);
  if (!title) return c.json({ error: "Title not found" }, 404);

  const seasonNumber = Number(c.req.param("season"));

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchSeasonDetails(title.tmdb_id, seasonNumber);
    } catch (e) {
      log.error("TMDB season fetch failed", { tmdbId: title.tmdb_id, season: seasonNumber, err: e });
    }
  }

  return c.json({
    title,
    tmdb,
    seasonNumber,
    country,
  });
});

app.get("/show/:id/season/:season/episode/:episode", async (c) => {
  const user = c.get("user");
  const title = getTitleById(c.req.param("id"), user?.id);
  if (!title) return c.json({ error: "Title not found" }, 404);

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

  return c.json({
    title,
    tmdb,
    seasonNumber,
    episodeNumber,
    country,
  });
});

export default app;
