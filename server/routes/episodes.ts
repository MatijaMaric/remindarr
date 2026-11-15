import { Hono } from "hono";
import { z } from "zod";
import * as sync from "../tmdb/sync";
import {
  getEpisodesByDateRange,
  getUnwatchedEpisodes,
  getSeasonEpisodeStatus,
} from "../db/repository";
import { localDateForTimezone, addDays } from "../utils/timezone";
import { CONFIG } from "../config";
import { requireAuth, requireAdmin } from "../middleware/auth";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const statusParamSchema = z.object({
  titleId: z.string().regex(/^(movie|tv)-\d+$/),
  season: z.coerce.number().int().min(0),
});

// Reels asks for a few episodes per show; other callers get the default cap.
const upcomingQuerySchema = z.object({
  per_title: z.coerce.number().int().min(1).max(100).optional(),
});

const app = new Hono<AppEnv>();

app.get("/upcoming", zValidator("query", upcomingQuerySchema), async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ today: [], upcoming: [] });
  }

  const timezone = c.req.header("X-Timezone") || "UTC";
  const today = localDateForTimezone(timezone);
  const tomorrowStr = addDays(today, 1);
  const nextWeekStr = addDays(today, 8);

  const todayEpisodes = await getEpisodesByDateRange(
    today,
    tomorrowStr,
    user.id,
  );
  const upcomingEpisodes = await getEpisodesByDateRange(
    tomorrowStr,
    nextWeekStr,
    user.id,
  );

  const { per_title } = c.req.valid("query");
  const unwatchedEpisodes = await getUnwatchedEpisodes(
    user.id,
    timezone,
    per_title,
  );

  return ok(c, {
    today: todayEpisodes,
    upcoming: upcomingEpisodes,
    unwatched: unwatchedEpisodes,
  });
});

app.get(
  "/status/:titleId/:season",
  zValidator("param", statusParamSchema),
  async (c) => {
    const user = c.get("user");
    if (!user) return ok(c, { episodes: [] });

    const { titleId, season: seasonNumber } = c.req.valid("param");

    const episodes = await getSeasonEpisodeStatus(
      titleId,
      seasonNumber,
      user.id,
    );
    return ok(c, { episodes });
  },
);

app.post("/sync", requireAuth, requireAdmin, async (c) => {
  if (!CONFIG.TMDB_API_KEY) {
    return err(c, "TMDB_API_KEY not configured", 500);
  }

  const result = await sync.syncEpisodes();
  return ok(c, {
    ...result,
    message: `Synced ${result.synced} episodes from ${result.shows} shows`,
  });
});

export default app;
