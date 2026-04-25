import { Hono } from "hono";
import { z } from "zod";
import { getJobStats, getCronJobs, getRecentJobs, enqueueJob } from "../jobs/queue";
import type { AppEnv } from "../types";
import { ok } from "./response";
import { zValidator } from "../lib/validator";

const app = new Hono<AppEnv>();

// `:name` is the cron job name. Bun's queue accepts arbitrary registered
// names so we only enforce shape (non-empty string) here.
const jobNameParamSchema = z.object({
  name: z.string().min(1),
});

// GET /api/jobs — job stats, cron schedules, and recent history
app.get("/", (c) => {
  return ok(c, {
    stats: getJobStats(),
    crons: getCronJobs(),
    recentJobs: getRecentJobs(),
  });
});

// POST /api/jobs/:name — manually trigger a job
app.post("/:name", zValidator("param", jobNameParamSchema), (c) => {
  const { name } = c.req.valid("param");
  const id = enqueueJob(name);
  return ok(c, { jobId: id });
});

export default app;
