import { Hono } from "hono";
import { z } from "zod";
import { follow, unfollow, getFollowers, getFollowing, getUserById, getFriendsLovedThisWeek } from "../db/repository";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const friendsLovedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const log = logger.child({ module: "social" });

const app = new Hono<AppEnv>();

// POST /follow/:userId — Follow a user
app.post("/follow/:userId", async (c) => {
  const currentUser = c.get("user")!;
  const targetUserId = c.req.param("userId");

  if (currentUser.id === targetUserId) {
    return err(c, "Cannot follow yourself", 400);
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    return err(c, "User not found", 404);
  }

  await follow(currentUser.id, targetUserId);
  log.info("User followed", { followerId: currentUser.id, followingId: targetUserId });
  return ok(c, { success: true });
});

// DELETE /follow/:userId — Unfollow a user
app.delete("/follow/:userId", async (c) => {
  const currentUser = c.get("user")!;
  const targetUserId = c.req.param("userId");

  await unfollow(currentUser.id, targetUserId);
  log.info("User unfollowed", { followerId: currentUser.id, followingId: targetUserId });
  return ok(c, { success: true });
});

// GET /followers — List current user's followers
app.get("/followers", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const followers = await getFollowers(user.id);
  const summary = followers.map(({ id, username, display_name, image }) => ({
    id,
    username,
    display_name,
    image,
  }));
  return ok(c, { followers: summary, count: summary.length });
});

// GET /following — List current user's following
app.get("/following", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const following = await getFollowing(user.id);
  const summary = following.map(({ id, username, display_name, image }) => ({
    id,
    username,
    display_name,
    image,
  }));
  return ok(c, { following: summary, count: summary.length });
});

// GET /followers/:userId — List a user's followers (public)
app.get("/followers/:userId", async (c) => {
  const targetUserId = c.req.param("userId");

  const followers = await getFollowers(targetUserId);
  const summary = followers.map(({ id, username, display_name, image }) => ({
    id,
    username,
    display_name,
    image,
  }));
  return ok(c, { followers: summary, count: summary.length });
});

// GET /following/:userId — List a user's following (public)
app.get("/following/:userId", async (c) => {
  const targetUserId = c.req.param("userId");

  const following = await getFollowing(targetUserId);
  const summary = following.map(({ id, username, display_name, image }) => ({
    id,
    username,
    display_name,
    image,
  }));
  return ok(c, { following: summary, count: summary.length });
});

// GET /friends-loved — Top-rated titles from followed users in the last 7 days
app.get("/friends-loved", zValidator("query", friendsLovedQuerySchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { limit } = c.req.valid("query");
  const items = await getFriendsLovedThisWeek(user.id, limit);
  return c.json({ items });
});

export default app;
