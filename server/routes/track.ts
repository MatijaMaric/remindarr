import { Hono } from "hono";
import { z } from "zod";
import { trackTitle, untrackTitle, getTrackedTitles, upsertTitles, getWatchedEpisodesForExport, getEpisodeIdsBySE, watchEpisodesBulk, getWatchedTitleIds, watchTitle, updateTrackedVisibility, updateAllTrackedVisibility, updateProfilePublic, getUserById, updateTrackedStatus, updateNotificationMode, updateTrackedNotes, setTags } from "../db/repository";
import type { UserStatus, NotificationMode } from "../db/repository";
import type { ParsedTitle } from "../tmdb/parser";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok } from "./response";
import { zValidator } from "../lib/validator";
import { enqueueAdhoc } from "../jobs/backend";

const log = logger.child({ module: "track" });

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user")!;
  const [titles, fullUser] = await Promise.all([
    getTrackedTitles(user.id),
    getUserById(user.id),
  ]);
  return ok(c, {
    titles,
    count: titles.length,
    profile_public: Boolean(fullUser?.profile_public),
    profile_visibility: fullUser?.profile_visibility ?? (fullUser?.profile_public ? "public" : "private"),
  });
});

const VALID_USER_STATUSES = ["plan_to_watch", "watching", "on_hold", "dropped", "completed"] as const;
const VALID_NOTIFICATION_MODES = ["all", "premieres_only", "none"] as const;

const frontendOfferSchema = z.object({
  provider_id: z.number(),
  provider_name: z.string(),
  provider_technical_name: z.string(),
  provider_icon_url: z.string(),
  monetization_type: z.string(),
  presentation_type: z.string(),
  price_value: z.number().nullable(),
  price_currency: z.string().nullable(),
  url: z.string(),
  available_to: z.string().nullable(),
});

const frontendTitleSchema = z.object({
  id: z.string(),
  object_type: z.enum(["MOVIE", "SHOW"]),
  title: z.string(),
  original_title: z.string().nullish(),
  release_year: z.number().nullish(),
  release_date: z.string().nullish(),
  runtime_minutes: z.number().nullish(),
  short_description: z.string().nullish(),
  genres: z.array(z.string()).optional(),
  original_language: z.string().nullish(),
  imdb_id: z.string().nullish(),
  tmdb_id: z.string().nullish(),
  poster_url: z.string().nullish(),
  age_certification: z.string().nullish(),
  tmdb_url: z.string().nullish(),
  imdb_score: z.number().nullish(),
  imdb_votes: z.number().nullish(),
  tmdb_score: z.number().nullish(),
  offers: z.array(frontendOfferSchema).optional(),
});

type FrontendOffer = z.infer<typeof frontendOfferSchema>;
type FrontendTitle = z.infer<typeof frontendTitleSchema>;

const trackPostBodySchema = z.object({
  titleData: frontendTitleSchema.optional(),
  notes: z.string().nullish(),
});

const importBodySchema = z.object({
  titles: z.array(z.unknown()),
});

const profileVisibilitySchema = z
  .object({
    visibility: z.enum(["public", "friends_only", "private"]).optional(),
    public: z.boolean().optional(),
  })
  .refine((v) => v.visibility !== undefined || v.public !== undefined, {
    message: "Either 'visibility' or 'public' must be provided",
  });

const visibilitySchema = z.object({
  public: z.boolean(),
});

const statusSchema = z.object({
  status: z.enum(VALID_USER_STATUSES).nullable(),
});

const notesSchema = z.object({
  notes: z.string().max(500).nullable(),
});

const tagsSchema = z.object({
  tags: z
    .array(z.string().refine((t) => t.trim().length <= 30, { message: "Each tag must be 30 characters or fewer" }))
    .max(10, "Maximum 10 tags allowed"),
});

const notificationModeSchema = z.object({
  mode: z.enum(VALID_NOTIFICATION_MODES).nullable(),
});

// Convert frontend Title (snake_case) to ParsedTitle (camelCase) for upsert
function toParsedTitle(t: FrontendTitle): ParsedTitle {
  return {
    id: t.id,
    objectType: t.object_type,
    title: t.title,
    originalTitle: t.original_title ?? null,
    releaseYear: t.release_year ?? null,
    releaseDate: t.release_date ?? null,
    runtimeMinutes: t.runtime_minutes ?? null,
    shortDescription: t.short_description ?? null,
    genres: t.genres || [],
    originalLanguage: t.original_language ?? null,
    imdbId: t.imdb_id ?? null,
    tmdbId: t.tmdb_id ?? null,
    posterUrl: t.poster_url ?? null,
    backdropUrl: null,
    ageCertification: t.age_certification ?? null,
    tmdbUrl: t.tmdb_url ?? null,
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
      imdbScore: t.imdb_score ?? null,
      imdbVotes: t.imdb_votes ?? null,
      tmdbScore: t.tmdb_score ?? null,
    },
  };
}

app.get("/export", async (c) => {
  const user = c.get("user")!;
  const tracked = await getTrackedTitles(user.id);
  const watchedByTitle = await getWatchedEpisodesForExport(user.id);
  const watchedTitleIds = await getWatchedTitleIds(user.id);

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
      is_watched: watchedTitleIds.has(t.id),
      watched_episodes: watchedByTitle.get(t.id) ?? [],
    })),
  };

  c.header("Content-Disposition", `attachment; filename="watchlist-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(exportData);
});

// Per-row shape is intentionally validated leniently — bad rows are skipped,
// not rejected. Only the wrapping `{ titles: [...] }` shape is strict so
// callers get a clear 400 when posting the wrong envelope.
app.post("/import", zValidator("json", importBodySchema), async (c) => {
  const user = c.get("user")!;
  const data = c.req.valid("json");

  let imported = 0;
  let skipped = 0;

  for (const raw of data.titles) {
    const item = (raw ?? {}) as {
      id?: string;
      title?: string;
      object_type?: "MOVIE" | "SHOW";
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
      notes?: string | null;
      is_watched?: boolean;
      watched_episodes?: Array<{ season: number; episode: number }>;
    };
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
        backdropUrl: null,
        ageCertification: item.age_certification ?? null,
        tmdbUrl: item.tmdb_url ?? null,
        offers: [],
        scores: { imdbScore: null, imdbVotes: null, tmdbScore: null },
      }]);

      await trackTitle(item.id, user.id, item.notes ?? undefined);

      // Restore movie watched status
      if (item.is_watched) {
        await watchTitle(item.id, user.id);
      }

      // Backfill watch provider offers from TMDB
      if (item.tmdb_id && CONFIG.TMDB_API_KEY) {
        await enqueueAdhoc("backfill-title-offers", {
          tmdbId: item.tmdb_id,
          objectType: item.object_type,
        });
      }

      const hasWatched = Array.isArray(item.watched_episodes) && item.watched_episodes.length > 0;
      const canSyncEpisodes = item.object_type === "SHOW" && item.tmdb_id && CONFIG.TMDB_API_KEY;

      if (canSyncEpisodes) {
        const jobData: Record<string, unknown> = {
          titleId: item.id,
          tmdbId: item.tmdb_id,
          title: item.title,
        };
        if (hasWatched) {
          jobData.watchedEpisodes = item.watched_episodes;
          jobData.userId = user.id;
        }
        await enqueueAdhoc("sync-show-episodes", jobData);
      } else if (hasWatched && item.watched_episodes) {
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

// `trackPostBodySchema` is `.optional()` per-field, so an empty body `{}` is
// valid. We safe-parse against an empty-object fallback so a totally absent
// body (no Content-Type, no payload) is still accepted.
app.post("/:id", async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = trackPostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", issues: parsed.error.issues },
      400,
    );
  }
  const body = parsed.data;

  // If title data is provided (e.g. from search results), upsert it first
  if (body.titleData) {
    await upsertTitles([toParsedTitle(body.titleData)]);
  }

  await trackTitle(titleId, user.id, body.notes ?? undefined);

  // Queue episode sync for shows with a TMDB ID
  if (CONFIG.TMDB_API_KEY) {
    const titleData = body.titleData;
    if (titleData?.object_type === "SHOW" && titleData?.tmdb_id) {
      await enqueueAdhoc("sync-show-episodes", { titleId, tmdbId: titleData.tmdb_id, title: titleData.title });
      log.info("Queued episode sync", { title: titleData.title, titleId });
    }
  }

  return ok(c, { message: `Tracking ${titleId}` });
});

app.patch(
  "/profile-visibility",
  zValidator("json", profileVisibilitySchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    if (body.visibility) {
      await updateProfilePublic(user.id, body.visibility);
    } else if (body.public !== undefined) {
      await updateProfilePublic(user.id, body.public);
    }
    return ok(c, { message: "Profile visibility updated" });
  },
);

app.patch("/visibility", zValidator("json", visibilitySchema), async (c) => {
  const user = c.get("user")!;
  const { public: isPublic } = c.req.valid("json");
  await updateAllTrackedVisibility(user.id, isPublic);
  return ok(c, { message: "Visibility updated" });
});

app.patch(
  "/:id/visibility",
  zValidator("json", visibilitySchema),
  async (c) => {
    const user = c.get("user")!;
    const titleId = c.req.param("id");
    const { public: isPublic } = c.req.valid("json");
    await updateTrackedVisibility(titleId, user.id, isPublic);
    return ok(c, { message: "Visibility updated" });
  },
);

app.patch("/:id/status", zValidator("json", statusSchema), async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  const { status } = c.req.valid("json");
  await updateTrackedStatus(titleId, user.id, status as UserStatus | null);
  return ok(c, { message: "Status updated" });
});

app.patch("/:id/notes", zValidator("json", notesSchema), async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  const { notes } = c.req.valid("json");
  await updateTrackedNotes(titleId, user.id, notes);
  return ok(c, { message: "Notes updated" });
});

app.patch("/:id/tags", zValidator("json", tagsSchema), async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  const { tags } = c.req.valid("json");
  // Normalize: trim, lowercase, deduplicate
  const normalized = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))];
  await setTags(user.id, titleId, normalized);
  return ok(c, { message: "Tags updated" });
});

app.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const titleId = c.req.param("id");
  await untrackTitle(titleId, user.id);
  return ok(c, { message: `Untracked ${titleId}` });
});

app.patch(
  "/:id/notification",
  zValidator("json", notificationModeSchema),
  async (c) => {
    const user = c.get("user")!;
    const titleId = c.req.param("id");
    const { mode } = c.req.valid("json");
    await updateNotificationMode(titleId, user.id, mode as NotificationMode | null);
    return ok(c, { message: "Notification mode updated" });
  },
);

export default app;
