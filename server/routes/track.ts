import { Hono } from "hono";
import { trackTitle, untrackTitle, getTrackedTitles, upsertTitles, deleteEpisodesForTitle, getWatchedEpisodesForExport, getEpisodeIdsBySE, watchEpisodesBulk } from "../db/repository";
import type { ParsedTitle } from "../tmdb/parser";
import { CONFIG } from "../config";
import { syncEpisodesForShow } from "../tmdb/sync";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok } from "./response";

const log = logger.child({ module: "track" });

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user")!;
  const titles = await getTrackedTitles(user.id);
  return ok(c, { titles, count: titles.length });
});

interface FrontendOffer {
  provider_id: number;
  provider_name: string;
  provider_technical_name: string;
  provider_icon_url: string;
  monetization_type: string;
  presentation_type: string;
  price_value: number | null;
  price_currency: string | null;
  url: string;
  available_to: string | null;
}

interface FrontendTitle {
  id: string;
  object_type: string;
  title: string;
  original_title?: string | null;
  release_year?: number | null;
  release_date?: string | null;
  runtime_minutes?: number | null;
  short_description?: string | null;
  genres?: string[];
  original_language?: string | null;
  imdb_id?: string | null;
  tmdb_id?: string | null;
  poster_url?: string | null;
  age_certification?: string | null;
  tmdb_url?: string | null;
  imdb_score?: number | null;
  imdb_votes?: number | null;
  tmdb_score?: number | null;
  offers?: FrontendOffer[];
}

// Convert frontend Title (snake_case) to ParsedTitle (camelCase) for upsert
function toParsedTitle(t: FrontendTitle): ParsedTitle {
  return {
    id: t.id,
    objectType: t.object_type,
    title: t.title,
    originalTitle: t.original_title || null,
    releaseYear: t.release_year,
    releaseDate: t.release_date,
    runtimeMinutes: t.runtime_minutes,
    shortDescription: t.short_description,
    genres: t.genres || [],
    originalLanguage: t.original_language || null,
    imdbId: t.imdb_id,
    tmdbId: t.tmdb_id,
    posterUrl: t.poster_url,
    ageCertification: t.age_certification,
    tmdbUrl: t.tmdb_url,
    offers: (t.offers || []).map((o: FrontendOffer) => ({
      titleId: t.id,
      providerId: o.provider_id,
      providerName: o.provider_name,
      providerTechnicalName: o.provider_technical_name,
      providerIconUrl: o.provider_icon_url,
      monetizationType: o.monetization_type,
      presentationType: o.presentation_type,
      priceValue: o.price_value,
      priceCurrency: o.price_currency,
      url: o.url,
      availableTo: o.available_to,
    })),
    scores: {
      imdbScore: t.imdb_score,
      imdbVotes: t.imdb_votes,
      tmdbScore: t.tmdb_score,
    },
  };
}

app.get("/export", async (c) => {
  const user = c.get("user")!;
  const tracked = await getTrackedTitles(user.id);
  const watchedByTitle = await getWatchedEpisodesForExport(user.id);

  const exportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    titles: tracked.map((t) => ({
      id: t.id,
      tmdb_id: t.tmdb_id,
      object_type: t.object_type,
      title: t.title,
      original_title: t.original_title,
      release_year: t.release_year,
      release_date: t.release_date,
      runtime_minutes: t.runtime_minutes,
      short_description: t.short_description,
      genres: t.genres,
      original_language: t.original_language,
      imdb_id: t.imdb_id,
      poster_url: t.poster_url,
      age_certification: t.age_certification,
      tmdb_url: t.tmdb_url,
      tracked_at: t.tracked_at,
      notes: t.notes,
      watched_episodes: watchedByTitle.get(t.id) ?? [],
    })),
  };

  c.header("Content-Disposition", `attachment; filename="watchlist-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(exportData);
});

app.post("/import", async (c) => {
  const user = c.get("user")!;

  let data: any;
  try {
    data = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!data || typeof data !== "object" || !Array.isArray(data.titles)) {
    return c.json({ error: "Invalid export format: expected { titles: [...] }" }, 400);
  }

  let imported = 0;
  let skipped = 0;

  for (const item of data.titles) {
    if (!item.id || !item.title || !item.object_type) {
      skipped++;
      continue;
    }

    try {
      await upsertTitles([{
        id: item.id,
        objectType: item.object_type,
        title: item.title,
        originalTitle: item.original_title ?? null,
        releaseYear: item.release_year ?? null,
        releaseDate: item.release_date ?? null,
        runtimeMinutes: item.runtime_minutes ?? null,
        shortDescription: item.short_description ?? null,
        genres: Array.isArray(item.genres) ? item.genres : [],
        originalLanguage: item.original_language ?? null,
        imdbId: item.imdb_id ?? null,
        tmdbId: item.tmdb_id ?? null,
        posterUrl: item.poster_url ?? null,
        ageCertification: item.age_certification ?? null,
        tmdbUrl: item.tmdb_url ?? null,
        offers: [],
        scores: { imdbScore: null, imdbVotes: null, tmdbScore: null },
      }]);

      await trackTitle(item.id, user.id, item.notes ?? undefined);

      if (Array.isArray(item.watched_episodes) && item.watched_episodes.length > 0) {
        const episodeIds = await getEpisodeIdsBySE(item.id, item.watched_episodes);
        if (episodeIds.length > 0) {
          await watchEpisodesBulk(episodeIds, user.id);
        }
      }

      imported++;
    } catch (err) {
      log.warn("Failed to import title", { titleId: item.id, err });
      skipped++;
    }
  }

  return c.json({ success: true, imported, skipped });
});

app.post("/:id", async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  // If title data is provided (e.g. from search results), upsert it first
  if (body.titleData) {
    await upsertTitles([toParsedTitle(body.titleData)]);
  }

  await trackTitle(titleId, user.id, body.notes);

  // Fire-and-forget episode sync for shows with a TMDB ID
  if (CONFIG.TMDB_API_KEY) {
    const titleData = body.titleData;
    if (titleData?.object_type === "SHOW" && titleData?.tmdb_id) {
      syncEpisodesForShow(titleId, titleData.tmdb_id, titleData.title).catch((err) =>
        log.error("Background episode sync failed", { title: titleData.title, err })
      );
    }
  }

  return ok(c, { message: `Tracking ${titleId}` });
});

app.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  await untrackTitle(titleId, user.id);
  await deleteEpisodesForTitle(titleId);
  return ok(c, { message: `Untracked ${titleId}` });
});

export default app;
