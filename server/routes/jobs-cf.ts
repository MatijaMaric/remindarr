/**
 * CF Workers-compatible /api/jobs route.
 *
 * Stats and cron info are provided by the backend dispatcher (backend.ts),
 * which fans out to D1 or DOs depending on CONFIG.JOB_QUEUE_BACKEND.
 */
import { Hono } from "hono";
import { z } from "zod";
import { getJobsOverview, triggerCron, CRON_JOBS } from "../jobs/backend";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";
import type { AppEnv } from "../types";
import type { CFEnv } from "../jobs/backend";

const app = new Hono<AppEnv>();

const jobNameParamSchema = z.object({
  name: z.string().min(1),
});

const VALID_JOB_NAMES = new Set(CRON_JOBS.map((j) => j.name));

// GET /api/jobs — job stats, cron schedules, and recent history
app.get("/", async (c) => {
  const overview = await getJobsOverview(c.env as unknown as CFEnv);
  return ok(c, overview);
});

// POST /api/jobs/:name — manually trigger a job
app.post("/:name", zValidator("param", jobNameParamSchema), async (c) => {
  const { name } = c.req.valid("param");
  if (!VALID_JOB_NAMES.has(name as (typeof CRON_JOBS)[number]["name"])) {
    return err(c, `Unknown job: ${name}`, 400);
  }
  // Pass executionCtx.waitUntil so triggerCron can run the job in the background
  // instead of blocking this response until the (potentially multi-minute) job finishes.
  // c.executionCtx throws when no ExecutionContext is bound (e.g. some test harnesses);
  // fall back to undefined so triggerCron detaches the tick instead.
  let waitUntil: ((p: Promise<unknown>) => void) | undefined;
  try {
    const ctx = c.executionCtx;
    waitUntil = (p) => ctx.waitUntil(p);
  } catch {
    waitUntil = undefined;
  }
  const result = await triggerCron(c.env as unknown as CFEnv, name, waitUntil);
  return ok(c, { jobId: result.jobId, success: true });
});

export default app;
