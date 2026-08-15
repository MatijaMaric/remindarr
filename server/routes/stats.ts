import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";
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
import { getYearInReview } from "../db/repository/year-in-review";

const yearParam = z.object({
  year: z.coerce.number().int().min(1970).max(2100),
});

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user")!;
  const [overview, genres, languages, monthly, showsByStatus, pace, tracked] =
    await Promise.all([
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
  const watchlistEtaDays = computeEta(
    totalRemainingMinutes,
    pace.minutesPerDay,
  );

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

app.get("/year/:year", zValidator("param", yearParam), async (c) => {
  const { year } = c.req.valid("param");
  const currentYear = new Date().getUTCFullYear();
  if (year > currentYear) {
    return err(c, "Year cannot be in the future", 400);
  }
  const user = c.get("user")!;
  const review = await getYearInReview(user.id, year);
  return ok(c, { ...review });
});

export default app;
