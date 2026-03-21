import { Hono } from "hono";
import * as sync from "../tmdb/sync";
import { getEpisodesByDateRange, getUnwatchedEpisodes } from "../db/repository";
import { localDateForTimezone, addDays } from "../utils/timezone";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";

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

  return c.json({ today: todayEpisodes, upcoming: upcomingEpisodes, unwatched: unwatchedEpisodes });
});

app.post("/sync", async (c) => {
  if (!CONFIG.TMDB_API_KEY) {
    return c.json({ error: "TMDB_API_KEY not configured" }, 500);
  }

  const result = await sync.syncEpisodes();
  return c.json({
    success: true,
    ...result,
    message: `Synced ${result.synced} episodes from ${result.shows} shows`,
  });
});

export default app;
