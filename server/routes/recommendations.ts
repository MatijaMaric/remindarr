import { Hono } from "hono";
import {
  createRecommendation,
  getReceivedRecommendations,
  getReceivedCount,
  getSentRecommendations,
  markAsRead,
  deleteRecommendation,
  getUnreadCount,
  isFollowing,
} from "../db/repository";
import type { AppEnv } from "../types";
import { logger } from "../logger";
import { ok, err } from "./response";

const log = logger.child({ module: "recommendations" });

const app = new Hono<AppEnv>();

// POST / — Send a recommendation
app.post("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const body = await c.req.json<{ toUserId?: string; titleId?: string; message?: string }>();

  if (!body.toUserId || !body.titleId) {
    return err(c, "toUserId and titleId are required", 400);
  }

  if (body.toUserId === user.id) {
    return err(c, "Cannot recommend to yourself", 400);
  }

  const following = await isFollowing(user.id, body.toUserId);
  if (!following) {
    return err(c, "You must follow this user to send recommendations", 403);
  }

  const id = await createRecommendation(user.id, body.toUserId, body.titleId, body.message);
  log.info("Recommendation sent", { fromUserId: user.id, toUserId: body.toUserId, titleId: body.titleId });
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

// GET /sent — List sent recommendations
app.get("/sent", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const rows = await getSentRecommendations(user.id);
  const recommendations = rows.map((r) => ({
    id: r.id,
    to_user: {
      id: r.toUserId,
      username: r.toUsername,
      display_name: r.toDisplayName,
      image: r.toImage,
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

  return ok(c, { recommendations });
});

// GET / — List received recommendations (paginated)
app.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20", 10), 1), 100);
  const offset = Math.max(parseInt(c.req.query("offset") || "0", 10), 0);

  const [rows, count] = await Promise.all([
    getReceivedRecommendations(user.id, limit, offset),
    getReceivedCount(user.id),
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

// POST /:id/read — Mark as read
app.post("/:id/read", async (c) => {
  const user = c.get("user");
  if (!user) {
    return err(c, "Authentication required", 401);
  }

  const id = c.req.param("id");
  await markAsRead(id, user.id);
  return ok(c, { success: true });
});

// DELETE /:id — Delete a recommendation
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
