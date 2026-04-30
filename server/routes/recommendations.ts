import { Hono } from "hono";
import { z } from "zod";
import {
  createRecommendation,
  getUserRecommendation,
  getDiscoveryFeed,
  getDiscoveryFeedCount,
  getSentRecommendations,
  markAsRead,
  deleteRecommendation,
  getUnreadCount,
} from "../db/repository";
import { isFollowing } from "../db/repository/follows";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const log = logger.child({ module: "recommendations" });

const createRecommendationSchema = z.object({
  titleId: z.string().min(1),
  message: z.string().max(500).optional(),
  targetUserId: z.string().optional(),
});

const discoveryFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const app = new Hono<AppEnv>();

// POST / — Send a recommendation (broadcast to all followers, or targeted to one user)
app.post("/", zValidator("json", createRecommendationSchema), async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const body = c.req.valid("json");
  const { targetUserId } = body;

  // Validate targeted recommendation
  if (targetUserId != null) {
    if (targetUserId === user.id) {
      return err(c, "Cannot send a recommendation to yourself", 400);
    }
    const following = await isFollowing(user.id, targetUserId);
    if (!following) {
      return err(c, "You can only send targeted recommendations to users you follow", 403);
    }
  }

  // Check for duplicate recommendation (same sender, same title, same target)
  const existing = await getUserRecommendation(user.id, body.titleId, targetUserId);
  if (existing) {
    return err(c, "You have already recommended this title to this recipient", 409);
  }

  const id = await createRecommendation(user.id, body.titleId, body.message, targetUserId);
  log.info("Recommendation created", { fromUserId: user.id, titleId: body.titleId, targetUserId: targetUserId ?? null });
  return c.json({ success: true, id }, 201);
});

// GET /count — Unread count (must be before /:id routes)
app.get("/count", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const count = await getUnreadCount(user.id);
  return ok(c, { count });
});

// GET /sent — List user's own recommendations
app.get("/sent", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const rows = await getSentRecommendations(user.id);
  const recommendations = rows.map((r) => ({
    id: r.id,
    title: {
      id: r.titleId,
      title: r.titleName,
      object_type: r.titleObjectType,
      poster_url: r.posterUrl,
    },
    message: r.message,
    created_at: r.createdAt,
    target_user: r.targetUserId != null
      ? { id: r.targetUserId, username: r.targetUsername ?? "", display_name: r.targetDisplayName ?? null }
      : null,
  }));

  return ok(c, { recommendations });
});

// GET /check/:titleId — Check if user already recommended a title
app.get("/check/:titleId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const titleId = c.req.param("titleId");
  const existing = await getUserRecommendation(user.id, titleId);
  return ok(c, { recommended: !!existing, id: existing?.id ?? null });
});

// GET / — Discovery feed (recommendations from followed users)
app.get("/", zValidator("query", discoveryFeedQuerySchema), async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const { limit, offset } = c.req.valid("query");

  const [rows, count] = await Promise.all([
    getDiscoveryFeed(user.id, limit, offset),
    getDiscoveryFeedCount(user.id),
  ]);

  const recommendations = rows.map((r) => ({
    id: r.id,
    from_user: {
      id: r.fromUserId,
      username: r.fromUsername,
      display_name: r.fromDisplayName,
      image: r.fromImage,
    },
    title: {
      id: r.titleId,
      title: r.titleName,
      object_type: r.titleObjectType,
      poster_url: r.posterUrl,
    },
    message: r.message,
    created_at: r.createdAt,
    read_at: r.readAt,
    is_targeted: r.targetUserId != null,
  }));

  return ok(c, { recommendations, count });
});

// POST /:id/read — Mark as read (per-user tracking)
app.post("/:id/read", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const id = c.req.param("id");
  await markAsRead(id, user.id);
  return ok(c, { success: true });
});

// DELETE /:id — Delete a recommendation (only creator can delete)
app.delete("/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const id = c.req.param("id");
  await deleteRecommendation(id, user.id);
  log.info("Recommendation deleted", { id, userId: user.id });
  return ok(c, { success: true });
});

export default app;
