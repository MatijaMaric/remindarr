import { Hono } from "hono";
import { getTitleById, getOffersForTitle } from "../db/repository";
import { CONFIG } from "../config";
import {
  fetchMovieDetails,
  fetchShowDetailsExtended,
  fetchSeasonDetails,
  fetchEpisodeDetails,
} from "../tmdb/client";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

const country = CONFIG.COUNTRY;

app.get("/movie/:id", async (c) => {
  const user = c.get("user");
  const title = getTitleById(c.req.param("id"), user?.id);
  if (!title) return c.json({ error: "Title not found" }, 404);

  let tmdb = null;
  if (title.tmdb_id && CONFIG.TMDB_API_KEY) {
    try {
      tmdb = await fetchMovieDetails(title.tmdb_id);
    } catch (e) {
      console.error(`[Details] TMDB movie fetch failed for ${title.tmdb_id}:`, e);
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
      tmdb = await fetchShowDetailsExtended(title.tmdb_id);
    } catch (e) {
      console.error(`[Details] TMDB show fetch failed for ${title.tmdb_id}:`, e);
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
      console.error(`[Details] TMDB season fetch failed:`, e);
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
      console.error(`[Details] TMDB episode fetch failed:`, e);
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
