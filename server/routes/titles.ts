import { Hono } from "hono";
import { z } from "zod";
import {
  getRecentTitles,
  getProviders,
  getGenres,
  getLanguages,
  getSubscribedProviderIds,
} from "../db/repository";
import { getMovieWatchProviders, getTvWatchProviders } from "../tmdb/client";
import { canonicalProviderId } from "../streaming-availability/provider-map";
import { expandGenreGroup } from "../genres";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";
import { ok } from "./response";
import { setPublicCacheIfAnon } from "./cache-headers";
import { zValidator } from "../lib/validator";

const PRIORITY_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "ja",
  "ko",
  "zh",
  "hi",
  "it",
  "ar",
];

const titlesQuerySchema = z.object({
  daysBack: z.coerce.number().int().min(1).max(365).default(30),
  type: z.string().optional(),
  provider: z.string().optional(),
  genre: z.string().optional(),
  language: z.string().optional(),
  excludeTracked: z
    .literal("1")
    .optional()
    .transform((v) => v === "1"),
  onlyMine: z
    .literal("true")
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const app = new Hono<AppEnv>();

app.get("/", zValidator("query", titlesQuerySchema), async (c) => {
  const user = c.get("user");
  const {
    daysBack,
    type: typeParam,
    provider: providerParam,
    genre: genreParam,
    language: languageParam,
    excludeTracked,
    onlyMine,
    limit,
    offset,
  } = c.req.valid("query");

  const objectTypes = typeParam ? typeParam.split(",").filter(Boolean) : [];
  let providers = providerParam ? providerParam.split(",").filter(Boolean) : [];
  const genres = genreParam
    ? genreParam.split(",").filter(Boolean).flatMap(expandGenreGroup)
    : [];
  const languages = languageParam
    ? languageParam.split(",").filter(Boolean)
    : [];

  if (onlyMine && user) {
    const subscribedIds = await getSubscribedProviderIds(user.id);
    if (subscribedIds.length === 0) {
      return ok(c, { titles: [], count: 0 });
    }
    const subscribedStrings = subscribedIds.map(String);
    providers =
      providers.length > 0
        ? providers.filter((p) => subscribedStrings.includes(p))
        : subscribedStrings;
    if (providers.length === 0) {
      return ok(c, { titles: [], count: 0 });
    }
  }

  const titles = await getRecentTitles(
    {
      daysBack,
      objectTypes,
      providers,
      genres,
      languages,
      excludeTracked,
      limit,
      offset,
    },
    user?.id,
  );
  setPublicCacheIfAnon(c, 600);
  return ok(c, { titles, count: titles.length });
});

app.get("/providers", async (c) => {
  const [dbProviders, movieProviders, tvProviders] = await Promise.all([
    getProviders(),
    getMovieWatchProviders(),
    getTvWatchProviders(),
  ]);
  const regionIds = new Set(
    [...movieProviders, ...tvProviders].map((p) => canonicalProviderId(p.id)),
  );
  c.header(
    "Cache-Control",
    "public, max-age=86400, stale-while-revalidate=604800",
  );
  return ok(c, {
    providers: dbProviders,
    regionProviderIds: Array.from(regionIds),
  });
});

app.get("/genres", async (c) => {
  const genres = await getGenres();
  c.header(
    "Cache-Control",
    "public, max-age=86400, stale-while-revalidate=604800",
  );
  return ok(c, { genres });
});

app.get("/languages", async (c) => {
  const languages = await getLanguages();
  const localLang = CONFIG.LANGUAGE.split("-")[0];
  const prioritySet = new Set([localLang, ...PRIORITY_LANGUAGES]);
  const priorityLanguageCodes = languages.filter((l) => prioritySet.has(l));
  c.header(
    "Cache-Control",
    "public, max-age=86400, stale-while-revalidate=604800",
  );
  return ok(c, { languages, priorityLanguageCodes });
});

export default app;
