/**
 * CF Workers-compatible /api/jobs route.
 *
 * Uses Drizzle ORM (no bun:sqlite dependency) so it works with D1.
 * Cron schedules are hardcoded to mirror wrangler.toml triggers — keep in sync.
 */
import { Hono } from "hono";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { parseExpression } from "cron-parser";
import { getDb, jobs } from "../db/schema";
import { enqueueJobReturningId } from "../jobs/processor";
import { ok, err } from "./response";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

/**
 * Static cron schedule map — mirrors wrangler.toml [triggers].crons and the
 * switch block in server/worker.ts scheduled handler. Keep both in sync.
 */
const CRON_SCHEDULES: Record<string, string> = {
  "sync-titles": "0 3 * * *",
  "sync-episodes": "30 3 * * *",
  "sync-deep-links": "0 4 * * *",
  "send-notifications": "*/5 * * * *",
};

const VALID_JOB_NAMES = new Set(Object.keys(CRON_SCHEDULES));

// GET /api/jobs — job stats, cron schedules, and recent history
app.get("/", async (c) => {
  const db = getDb();

  // Job stats: group by name and status
  const statsRows = await db
    .select({
      name: jobs.name,
      status: jobs.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(jobs)
    .groupBy(jobs.name, jobs.status)
    .all();

  const stats: Record<string, { pending: number; running: number; completed: number; failed: number }> = {};
  for (const row of statsRows) {
    if (!stats[row.name]) {
      stats[row.name] = { pending: 0, running: 0, completed: 0, failed: 0 };
    }
    const s = row.status as "pending" | "running" | "completed" | "failed";
    if (s in stats[row.name]) stats[row.name][s] = row.count;
  }

  // Cron info: derive last_run from most recent completed job, compute next_run
  const cronEntries = await Promise.all(
    Object.entries(CRON_SCHEDULES).map(async ([name, cron]) => {
      const lastJob = await db
        .select({ completedAt: jobs.completedAt })
        .from(jobs)
        .where(
          sql`${jobs.name} = ${name} AND ${jobs.status} IN ('completed', 'failed')`,
        )
        .orderBy(desc(jobs.id))
        .limit(1)
        .get();

      let next_run: string;
      try {
        next_run = parseExpression(cron, { currentDate: new Date() }).next().toDate().toISOString();
      } catch {
        next_run = "";
      }

      return {
        name,
        cron,
        last_run: lastJob?.completedAt ?? null,
        next_run,
        enabled: 1,
      };
    }),
  );

  // Recent jobs — map Drizzle camelCase to snake_case for frontend
  const recentRows = await db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.id))
    .limit(20)
    .all();

  const recentJobs = recentRows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    error: r.error,
    started_at: r.startedAt,
    completed_at: r.completedAt,
    created_at: r.createdAt,
  }));

  return ok(c, { stats, crons: cronEntries, recentJobs });
});

// POST /api/jobs/:name — manually trigger a job
app.post("/:name", async (c) => {
  const name = c.req.param("name");
  if (!VALID_JOB_NAMES.has(name)) {
    return err(c, `Unknown job: ${name}`, 400);
  }
  const jobId = await enqueueJobReturningId(name);
  return ok(c, { jobId, success: true });
});

export default app;
