import { Hono } from "hono";
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

const log = logger.child({ module: "ratings" });

const VALID_RATINGS: RatingValue[] = ["HATE", "DISLIKE", "LIKE", "LOVE"];

const app = new Hono<AppEnv>();

// POST /:titleId — Rate a title
app.post("/:titleId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const titleId = c.req.param("titleId");
  const body = await c.req.json<{ rating: string }>();

  if (!body.rating || !VALID_RATINGS.includes(body.rating as RatingValue)) {
    return err(c, "Invalid rating value. Must be one of: HATE, DISLIKE, LIKE, LOVE", 400);
  }

  const rating = body.rating as RatingValue;
  await rateTitle(user.id, titleId, rating);
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
app.post("/episode/:episodeId", async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);

  const episodeId = Number(c.req.param("episodeId"));
  if (isNaN(episodeId)) return err(c, "Invalid episode ID", 400);

  const body = await c.req.json<{ rating: string; review?: string }>();
  if (!body.rating || !VALID_RATINGS.includes(body.rating as RatingValue)) {
    return err(c, "Invalid rating value. Must be one of: HATE, DISLIKE, LIKE, LOVE", 400);
  }

  const review = body.review && body.review.trim().length > 0
    ? body.review.trim().slice(0, 500)
    : undefined;

  await rateEpisode(user.id, episodeId, body.rating as RatingValue, review);
  log.info("Episode rated", { userId: user.id, episodeId, rating: body.rating });
  return ok(c, { success: true, rating: body.rating });
});

// DELETE /episode/:episodeId — Remove episode rating
app.delete("/episode/:episodeId", async (c) => {
  const user = c.get("user");
  if (!user) return err(c, "Authentication required", 401);

  const episodeId = Number(c.req.param("episodeId"));
  if (isNaN(episodeId)) return err(c, "Invalid episode ID", 400);

  await unrateEpisode(user.id, episodeId);
  log.info("Episode unrated", { userId: user.id, episodeId });
  return ok(c, { success: true });
});

// GET /episode/:episodeId — Get episode rating info
app.get("/episode/:episodeId", async (c) => {
  const user = c.get("user");
  const episodeId = Number(c.req.param("episodeId"));
  if (isNaN(episodeId)) return err(c, "Invalid episode ID", 400);

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
});

// GET /season/:titleId/:season — Get aggregate episode ratings for a season
app.get("/season/:titleId/:season", async (c) => {
  const titleId = c.req.param("titleId");
  const season = Number(c.req.param("season"));
  if (isNaN(season)) return err(c, "Invalid season number", 400);

  const ratings = await getSeasonEpisodeRatings(titleId, season);
  return ok(c, { ratings });
});

export default app;
