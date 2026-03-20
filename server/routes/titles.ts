import { Hono } from "hono";
import { getRecentTitles, getProviders, getGenres, getLanguages } from "../db/repository";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user");
  const daysBack = Math.max(1, Math.min(Number(c.req.query("daysBack")) || 30, 365));
  const typeParam = c.req.query("type") || "";
  const providerParam = c.req.query("provider") || "";
  const genreParam = c.req.query("genre") || "";
  const languageParam = c.req.query("language") || "";
  const excludeTracked = c.req.query("excludeTracked") === "1";
  const limit = Math.max(1, Math.min(Number(c.req.query("limit")) || 100, 1000));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);

  const objectTypes = typeParam ? typeParam.split(",").filter(Boolean) : [];
  const providers = providerParam ? providerParam.split(",").filter(Boolean) : [];
  const genres = genreParam ? genreParam.split(",").filter(Boolean) : [];
  const languages = languageParam ? languageParam.split(",").filter(Boolean) : [];

  const titles = await getRecentTitles({ daysBack, objectTypes, providers, genres, languages, excludeTracked, limit, offset }, user?.id);
  return c.json({ titles, count: titles.length });
});

app.get("/providers", async (c) => {
  const providers = await getProviders();
  return c.json({ providers });
});

app.get("/genres", async (c) => {
  const genres = await getGenres();
  return c.json({ genres });
});

app.get("/languages", async (c) => {
  const languages = await getLanguages();
  return c.json({ languages });
});

export default app;
