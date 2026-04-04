import { Hono } from "hono";
import * as sync from "../tmdb/sync";
import { getEpisodesByDateRange, getUnwatchedEpisodes, getSeasonEpisodeStatus } from "../db/repository";
import { localDateForTimezone, addDays } from "../utils/timezone";
import { CONFIG } from "../config";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import { ok, err } from "./response";

const app = new Hono<AppEnv>();

app.get("/upcoming", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ today: [], upcoming: [] });
  }

  const timezone = c.req.header("X-Timezone") || "UTC";
  const today = localDateForTimezone(timezone);
  const tomorrowStr = addDays(today, 1);
  const nextWeekStr = addDays(today, 8);

  const todayEpisodes = await getEpisodesByDateRange(today, tomorrowStr, user.id);
  const upcomingEpisodes = await getEpisodesByDateRange(tomorrowStr, nextWeekStr, user.id);

  const unwatchedEpisodes = await getUnwatchedEpisodes(user.id, timezone);

  return ok(c, { today: todayEpisodes, upcoming: upcomingEpisodes, unwatched: unwatchedEpisodes });
});

app.get("/status/:titleId/:season", async (c) => {
  const user = c.get("user");
  if (!user) return ok(c, { episodes: [] });

  const titleId = c.req.param("titleId");
  const seasonNumber = Number(c.req.param("season"));
  if (isNaN(seasonNumber)) return err(c, "Invalid season number", 400);

  const episodes = await getSeasonEpisodeStatus(titleId, seasonNumber, user.id);
  return ok(c, { episodes });
});

app.post("/sync", requireAuth, async (c) => {
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
