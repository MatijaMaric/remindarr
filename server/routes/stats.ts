import { Hono } from "hono";
import type { AppEnv } from "../types";
import { ok } from "./response";
import {
  getStatsOverview,
  getUserGenreBreakdown,
  getUserLanguageBreakdown,
  getMonthlyActivity,
  getShowsByStatus,
} from "../db/repository/stats";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  const user = c.get("user")!;
  const [overview, genres, languages, monthly, showsByStatus] = await Promise.all([
    getStatsOverview(user.id),
    getUserGenreBreakdown(user.id, 10),
    getUserLanguageBreakdown(user.id, 10),
    getMonthlyActivity(user.id, 13),
    getShowsByStatus(user.id),
  ]);
  return ok(c, {
    overview,
    genres,
    languages,
    monthly,
    shows_by_status: showsByStatus,
  });
});

export default app;
