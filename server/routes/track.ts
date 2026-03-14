import { Hono } from "hono";
import { trackTitle, untrackTitle, getTrackedTitles, upsertTitles, deleteEpisodesForTitle } from "../db/repository";
import type { ParsedTitle } from "../tmdb/parser";
import { CONFIG } from "../config";
import { syncEpisodesForShow } from "../tmdb/sync";
import type { AppEnv } from "../types";
import { logger } from "../logger";

const log = logger.child({ module: "track" });

const app = new Hono<AppEnv>();

app.get("/", (c) => {
  const user = c.get("user")!;
  const titles = getTrackedTitles(user.id);
  return c.json({ titles, count: titles.length });
});

// Convert frontend Title (snake_case) to ParsedTitle (camelCase) for upsert
function toParsedTitle(t: any): ParsedTitle {
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
    offers: (t.offers || []).map((o: any) => ({
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

app.post("/:id", async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  // If title data is provided (e.g. from search results), upsert it first
  if (body.titleData) {
    upsertTitles([toParsedTitle(body.titleData)]);
  }

  trackTitle(titleId, user.id, body.notes);

  // Fire-and-forget episode sync for shows with a TMDB ID
  if (CONFIG.TMDB_API_KEY) {
    const titleData = body.titleData;
    if (titleData?.object_type === "SHOW" && titleData?.tmdb_id) {
      syncEpisodesForShow(titleId, titleData.tmdb_id, titleData.title).catch((err) =>
        log.error("Background episode sync failed", { title: titleData.title, err })
      );
    }
  }

  return c.json({ success: true, message: `Tracking ${titleId}` });
});

app.delete("/:id", (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  untrackTitle(titleId, user.id);
  deleteEpisodesForTitle(titleId);
  return c.json({ success: true, message: `Untracked ${titleId}` });
});

export default app;
