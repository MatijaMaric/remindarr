import { Hono } from "hono";
import { z } from "zod";
import {
  getUserByKioskToken,
  getKioskToken,
  setKioskToken,
  getEpisodesByDateRange,
  getRecentTitles,
  getTrackedTitles,
} from "../db/repository";
import { requireAuth } from "../middleware/auth";
import { zValidator } from "../lib/validator";
import { localDateForTimezone, addDays } from "../utils/timezone";
import { ok, err } from "./response";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

// ─── Auth-gated token management (registered before /:token to avoid shadowing) ──

// GET /api/kiosk/token  (requireAuth)
app.get("/token", requireAuth, async (c) => {
  const user = c.get("user")!;
  const token = await getKioskToken(user.id);
  return c.json({ token });
});

// POST /api/kiosk/token/regenerate  (requireAuth)
app.post("/token/regenerate", requireAuth, async (c) => {
  const user = c.get("user")!;
  const token = crypto.randomUUID().replace(/-/g, "");
  await setKioskToken(user.id, token);
  return c.json({ token });
});

// DELETE /api/kiosk/token  (requireAuth)
app.delete("/token", requireAuth, async (c) => {
  const user = c.get("user")!;
  await setKioskToken(user.id, null);
  return new Response(null, { status: 204 });
});

// ─── Public dashboard ─────────────────────────────────────────────────────────

// GET /api/kiosk/:token  (public, token-authenticated)
app.get("/:token", zValidator("param", z.object({ token: z.string().min(1).max(64) })), async (c) => {
  const { token } = c.req.valid("param");

  const user = await getUserByKioskToken(token);
  if (!user) return err(c, "Invalid kiosk token", 401);

  const timezone = c.req.header("X-Timezone") || "UTC";
  const today = localDateForTimezone(timezone);
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 8);

  const [tonight, week, recentArr, tracked] = await Promise.all([
    getEpisodesByDateRange(today, tomorrow, user.id),
    getEpisodesByDateRange(tomorrow, weekEnd, user.id),
    getRecentTitles({ daysBack: 14, limit: 24 }, user.id),
    getTrackedTitles(user.id),
  ]);

  const watching = tracked
    .filter((t) => t.show_status === "watching")
    .slice(0, 12)
    .map(({ id, object_type, title, original_title, release_year, release_date, poster_url, tmdb_id, imdb_id, tmdb_url, tmdb_score, imdb_score, genres, offers, next_episode_air_date, total_episodes, watched_episodes_count, released_episodes_count, show_status }) => ({
      id, object_type, title, original_title, release_year, release_date, poster_url, tmdb_id, imdb_id, tmdb_url, tmdb_score, imdb_score, genres, offers, next_episode_air_date, total_episodes, watched_episodes_count, released_episodes_count, show_status,
    }));

  c.header("Cache-Control", "no-cache, no-store");
  return ok(c, { tonight, week, recent: recentArr, watching });
});

export default app;
