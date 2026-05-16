import { Hono } from "hono";
import type { AppEnv } from "../types";
import { ok } from "./response";
import { getReleasedUnwatchedTrackedMovies, getUpcomingTrackedMoviesOpen } from "../db/repository";

const app = new Hono<AppEnv>();

app.get("/tracking", async (c) => {
  const user = c.get("user")!;
  const [to_watch, upcoming] = await Promise.all([
    getReleasedUnwatchedTrackedMovies(user.id),
    getUpcomingTrackedMoviesOpen(user.id),
  ]);
  return ok(c, { to_watch, upcoming });
});

export default app;
