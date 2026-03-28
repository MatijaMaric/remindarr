import { Hono } from "hono";
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
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";

const log = logger.child({ module: "recommendations" });

const app = new Hono<AppEnv>();

// POST / — Broadcast a recommendation (no toUserId needed)
app.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const body = await c.req.json<{ titleId?: string; message?: string }>();

  if (!body.titleId) {
    return err(c, "titleId is required", 400);
  }

  // Check for duplicate recommendation
  const existing = await getUserRecommendation(user.id, body.titleId);
  if (existing) {
    return err(c, "You have already recommended this title", 409);
  }

  const id = await createRecommendation(user.id, body.titleId, body.message);
  log.info("Recommendation created", { fromUserId: user.id, titleId: body.titleId });
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
app.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20", 10), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0", 10), 0);

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
