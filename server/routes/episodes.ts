import { Hono } from "hono";
import * as sync from "../tmdb/sync";
import { getEpisodesByDateRange, getUnwatchedEpisodes } from "../db/repository";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";
import { ok, err } from "./response";

const app = new Hono<AppEnv>();

app.get("/upcoming", async (c) => {
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

  const todayEpisodes = await getEpisodesByDateRange(today, tomorrowStr, user.id);
  const upcomingEpisodes = await getEpisodesByDateRange(tomorrowStr, nextWeekStr, user.id);

  const unwatchedEpisodes = await getUnwatchedEpisodes(user.id);

  return ok(c, { today: todayEpisodes, upcoming: upcomingEpisodes, unwatched: unwatchedEpisodes });
});

app.post("/sync", async (c) => {
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
