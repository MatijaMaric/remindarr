import { Hono } from "hono";
import {
  rateTitle,
  unrateTitle,
  getUserRating,
  getTitleRatings,
  getFriendsRatings,
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

export default app;
