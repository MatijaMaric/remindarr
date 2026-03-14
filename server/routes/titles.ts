import { Hono } from "hono";
import { getRecentTitles, getProviders, getGenres, getLanguages } from "../db/repository";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/", (c) => {
  const user = c.get("user");
  const daysBack = Number(c.req.query("daysBack")) || 30;
  const typeParam = c.req.query("type") || "";
  const providerParam = c.req.query("provider") || "";
  const genreParam = c.req.query("genre") || "";
  const languageParam = c.req.query("language") || "";
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const objectTypes = typeParam ? typeParam.split(",").filter(Boolean) : [];
  const providers = providerParam ? providerParam.split(",").filter(Boolean) : [];
  const genres = genreParam ? genreParam.split(",").filter(Boolean) : [];
  const languages = languageParam ? languageParam.split(",").filter(Boolean) : [];

  const titles = getRecentTitles({ daysBack, objectTypes, providers, genres, languages, limit, offset }, user?.id);
  return c.json({ titles, count: titles.length });
});

app.get("/providers", (c) => {
  const providers = getProviders();
  return c.json({ providers });
});

app.get("/genres", (c) => {
  const genres = getGenres();
  return c.json({ genres });
});

app.get("/languages", (c) => {
  const languages = getLanguages();
  return c.json({ languages });
});

export default app;
