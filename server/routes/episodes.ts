import { Hono } from "hono";
import { syncEpisodes } from "../tmdb/sync";
import { getEpisodesByDateRange } from "../db/repository";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

app.get("/upcoming", (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ today: [], upcoming: [] });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 8);
  const nextWeekStr = nextWeek.toISOString().slice(0, 10);

  const todayEpisodes = getEpisodesByDateRange(today, tomorrowStr, user.id);
  const upcomingEpisodes = getEpisodesByDateRange(tomorrowStr, nextWeekStr, user.id);

  return c.json({ today: todayEpisodes, upcoming: upcomingEpisodes });
});

app.post("/sync", async (c) => {
  if (!CONFIG.TMDB_API_KEY) {
    return c.json({ error: "TMDB_API_KEY not configured" }, 500);
  }

  const result = await syncEpisodes();
  return c.json({
    success: true,
    ...result,
    message: `Synced ${result.synced} episodes from ${result.shows} shows`,
  });
});

export default app;
