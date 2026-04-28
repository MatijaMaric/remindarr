import { Hono } from "hono";
import type { AppEnv } from "../types";
import { ok } from "./response";
import {
  getStatsOverview,
  getUserGenreBreakdown,
  getUserLanguageBreakdown,
  getMonthlyActivity,
  getShowsByStatus,
  getUserPace,
  computeEta,
} from "../db/repository/stats";
import { getTrackedTitles } from "../db/repository/tracked";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user")!;
  const [overview, genres, languages, monthly, showsByStatus, pace, tracked] = await Promise.all([
    getStatsOverview(user.id),
    getUserGenreBreakdown(user.id, 10),
    getUserLanguageBreakdown(user.id, 10),
    getMonthlyActivity(user.id, 13),
    getShowsByStatus(user.id),
    getUserPace(user.id),
    getTrackedTitles(user.id),
  ]);

  const totalRemainingMinutes = tracked.reduce(
    (sum, t) => sum + (t.remaining_runtime_minutes ?? 0),
    0,
  );
  const watchlistEtaDays = computeEta(totalRemainingMinutes, pace.minutesPerDay);

  return ok(c, {
    overview,
    genres,
    languages,
    monthly,
    shows_by_status: showsByStatus,
    pace: {
      minutesPerDay: pace.minutesPerDay,
      watchlistEtaDays,
    },
  });
});

export default app;
