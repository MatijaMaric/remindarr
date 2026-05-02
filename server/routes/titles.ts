import { Hono } from "hono";
import { getRecentTitles, getProviders, getGenres, getLanguages, getSubscribedProviderIds } from "../db/repository";
import { getMovieWatchProviders, getTvWatchProviders } from "../tmdb/client";
import { expandGenreGroup } from "../genres";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";
import { ok } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";

const PRIORITY_LANGUAGES = ["en", "es", "fr", "de", "pt", "ja", "ko", "zh", "hi", "it", "ar"];

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user");
  const daysBack = Math.max(1, Math.min(Number(c.req.query("daysBack")) || 30, 365));
  const typeParam = c.req.query("type") || "";
  const providerParam = c.req.query("provider") || "";
  const genreParam = c.req.query("genre") || "";
  const languageParam = c.req.query("language") || "";
  const excludeTracked = c.req.query("excludeTracked") === "1";
  const onlyMine = c.req.query("onlyMine") === "true";
  const limit = Math.max(1, Math.min(Number(c.req.query("limit")) || 100, 1000));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);

  const objectTypes = typeParam ? typeParam.split(",").filter(Boolean) : [];
  let providers = providerParam ? providerParam.split(",").filter(Boolean) : [];
  const genres = genreParam ? genreParam.split(",").filter(Boolean).flatMap(expandGenreGroup) : [];
  const languages = languageParam ? languageParam.split(",").filter(Boolean) : [];

  if (onlyMine && user) {
    const subscribedIds = await getSubscribedProviderIds(user.id);
    if (subscribedIds.length === 0) {
      return ok(c, { titles: [], count: 0 });
    }
    const subscribedStrings = subscribedIds.map(String);
    providers = providers.length > 0
      ? providers.filter((p) => subscribedStrings.includes(p))
      : subscribedStrings;
    if (providers.length === 0) {
      return ok(c, { titles: [], count: 0 });
    }
  }

  const titles = await getRecentTitles({ daysBack, objectTypes, providers, genres, languages, excludeTracked, limit, offset }, user?.id);
  setPublicCacheIfAnon(c, 600);
  return ok(c, { titles, count: titles.length });
});

app.get("/providers", async (c) => {
  const [dbProviders, movieProviders, tvProviders] = await Promise.all([
    getProviders(),
    getMovieWatchProviders(),
    getTvWatchProviders(),
  ]);
  const regionIds = new Set([
    ...movieProviders.map((p) => p.id),
    ...tvProviders.map((p) => p.id),
  ]);
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  return ok(c, { providers: dbProviders, regionProviderIds: Array.from(regionIds) });
});

app.get("/genres", async (c) => {
  const genres = await getGenres();
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  return ok(c, { genres });
});

app.get("/languages", async (c) => {
  const languages = await getLanguages();
  const localLang = CONFIG.LANGUAGE.split("-")[0];
  const prioritySet = new Set([localLang, ...PRIORITY_LANGUAGES]);
  const priorityLanguageCodes = languages.filter((l) => prioritySet.has(l));
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  return ok(c, { languages, priorityLanguageCodes });
});

export default app;
