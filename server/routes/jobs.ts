import { Hono } from "hono";
import { getJobStats, getCronJobs, getRecentJobs, enqueueJob } from "../jobs/queue";
import type { AppEnv } from "../types";
import { ok } from "./response";

const app = new Hono<AppEnv>();

// GET /api/jobs — job stats, cron schedules, and recent history
app.get("/", (c) => {
  return ok(c, {
    stats: getJobStats(),
    crons: getCronJobs(),
    recentJobs: getRecentJobs(),
  });
});

// POST /api/jobs/:name — manually trigger a job
app.post("/:name", (c) => {
  const name = c.req.param("name");
  const id = enqueueJob(name);
  return ok(c, { jobId: id });
});

export default app;
