import { Hono } from "hono";
import { z } from "zod";
import {
  rateTitle,
  unrateTitle,
  getUserRating,
  getTitleRatings,
  getFriendsRatings,
  rateEpisode,
  unrateEpisode,
  getUserEpisodeRating,
  getEpisodeRatings,
  getFriendsEpisodeRatings,
  getSeasonEpisodeRatings,
} from "../db/repository";
import type { RatingValue } from "../db/repository";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const log = logger.child({ module: "ratings" });

export const VALID_RATINGS = ["HATE", "DISLIKE", "LIKE", "LOVE"] as const;
const ratingEnum = z.enum(VALID_RATINGS);

const rateTitleSchema = z.object({
  rating: ratingEnum,
});

const rateEpisodeSchema = z.object({
  rating: ratingEnum,
  review: z
    .string()
    .max(500)
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined;
    }),
});

const episodeIdParamSchema = z.object({
  episodeId: z.coerce.number().int(),
});

const seasonParamSchema = z.object({
  titleId: z.string().min(1),
  season: z.coerce.number().int(),
});

const app = new Hono<AppEnv>();

// POST /:titleId — Rate a title
app.post("/:titleId", zValidator("json", rateTitleSchema), async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const titleId = c.req.param("titleId");
  const { rating } = c.req.valid("json");

  await rateTitle(user.id, titleId, rating as RatingValue);
  log.info("Title rated", { userId: user.id, titleId, rating });
  return ok(c, { success: true, rating });
});

// DELETE /:titleId — Remove rating
app.delete("/:titleId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const titleId = c.req.param("titleId");
  await unrateTitle(user.id, titleId);
  log.info("Title unrated", { userId: user.id, titleId });
  return ok(c, { success: true });
});

// GET /:titleId — Get rating info
app.get("/:titleId", async (c) => {
  const user = c.get("user");
  const titleId = c.req.param("titleId");

  const userRating = user ? await getUserRating(user.id, titleId) : null;
  const aggregated = await getTitleRatings(titleId);
  const friendsRaw = user ? await getFriendsRatings(user.id, titleId) : [];

  const friendsRatings = friendsRaw.map((f) => ({
    user: {
      id: f.userId,
      username: f.username,
      display_name: f.displayName,
      image: f.image,
    },
    rating: f.rating,
  }));

  return ok(c, {
    user_rating: userRating,
    aggregated,
    friends_ratings: friendsRatings,
  });
});

// ─── Episode Rating Endpoints ────────────────────────────────────────────────

// POST /episode/:episodeId — Rate an episode
app.post(
  "/episode/:episodeId",
  zValidator("param", episodeIdParamSchema),
  zValidator("json", rateEpisodeSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) return err(c, "Authentication required", 401);

    const { episodeId } = c.req.valid("param");
    const { rating, review } = c.req.valid("json");

    await rateEpisode(user.id, episodeId, rating as RatingValue, review);
    log.info("Episode rated", { userId: user.id, episodeId, rating });
    return ok(c, { success: true, rating });
  },
);

// DELETE /episode/:episodeId — Remove episode rating
app.delete(
  "/episode/:episodeId",
  zValidator("param", episodeIdParamSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) return err(c, "Authentication required", 401);

    const { episodeId } = c.req.valid("param");

    await unrateEpisode(user.id, episodeId);
    log.info("Episode unrated", { userId: user.id, episodeId });
    return ok(c, { success: true });
  },
);

// GET /episode/:episodeId — Get episode rating info
app.get(
  "/episode/:episodeId",
  zValidator("param", episodeIdParamSchema),
  async (c) => {
    const user = c.get("user");
    const { episodeId } = c.req.valid("param");

    const userRatingData = user ? await getUserEpisodeRating(user.id, episodeId) : null;
    const aggregated = await getEpisodeRatings(episodeId);
    const friendsRaw = user ? await getFriendsEpisodeRatings(user.id, episodeId) : [];

    const friendsRatings = friendsRaw.map((f) => ({
      user: {
        id: f.userId,
        username: f.username,
        display_name: f.displayName,
        image: f.image,
      },
      rating: f.rating,
    }));

    return ok(c, {
      user_rating: userRatingData?.rating ?? null,
      user_review: userRatingData?.review ?? null,
      aggregated,
      friends_ratings: friendsRatings,
    });
  },
);

// GET /season/:titleId/:season — Get aggregate episode ratings for a season
app.get(
  "/season/:titleId/:season",
  zValidator("param", seasonParamSchema),
  async (c) => {
    const { titleId, season } = c.req.valid("param");

    const ratings = await getSeasonEpisodeRatings(titleId, season);
    return ok(c, { ratings });
  },
);

export default app;
