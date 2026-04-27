/**
 * Backend dispatcher for the CF Workers job queue.
 *
 * Picks D1 (existing) or Durable Objects (new) based on CONFIG.JOB_QUEUE_BACKEND.
 * Bun never imports this file — Bun uses server/jobs/queue.ts instead.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { CONFIG } from "../config";
import { getDb, jobs } from "../db/schema";
import {
  processPendingJobs,
  enqueueCronJob,
  enqueueJobReturningId,
  enqueueOneTimeMigration,
  recoverStaleJobs,
  cleanupOldJobs,
} from "./processor";
import { parseExpression } from "cron-parser";
import type { DOJobRow } from "./durable-object";
import { CRON_JOB_NAMES } from "./durable-object";

// ─── CF env shape ────────────────────────────────────────────────────────────

export interface CFEnv {
  DB: D1Database;
  CACHE_KV?: KVNamespace;
  JOB_QUEUE_DO?: DurableObjectNamespace;
}

// ─── Env ALS (set by worker.ts for every fetch/scheduled invocation) ─────────

const envStorage = new AsyncLocalStorage<CFEnv>();

/** Run a callback with the CF env bound to ALS so backend can access it. */
export function runWithEnv<T>(env: CFEnv, fn: () => T): T {
  return envStorage.run(env, fn);
}

function getEnvOrNull(): CFEnv | null {
  return envStorage.getStore() ?? null;
}

// ─── Cron job catalogue (single source of truth) ─────────────────────────────

export const CRON_JOBS = [
  { name: "sync-titles",        cron: "0 3 * * *" },
  { name: "sync-episodes",      cron: "30 3 * * *" },
  { name: "sync-deep-links",    cron: "0 4 * * *" },
  { name: "send-notifications", cron: "*/5 * * * *" },
  { name: "cleanup",            cron: "0 0 * * *" },
] as const;

export type CronJobName = typeof CRON_JOBS[number]["name"];

/** Map cron expression → job name (used by the scheduled() switch replacement). */
export const CRON_BY_EXPRESSION: Record<string, CronJobName> = Object.fromEntries(
  CRON_JOBS.map((j) => [j.cron, j.name]),
) as Record<string, CronJobName>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive the DO partition key for a job name + data combo. */
function getPartitionKey(name: string, data?: Record<string, unknown>): string | null {
  if (name === "sync-show-episodes" && data?.titleId != null) return String(data.titleId);
  if (name === "backfill-title-offers" && data?.tmdbId != null) return String(data.tmdbId);
  return null;
}

function getDoId(env: CFEnv, name: string, partitionKey?: string | number | null): DurableObjectId {
  const doNamespace = env.JOB_QUEUE_DO!;
  const key = partitionKey != null ? `${name}:${partitionKey}` : name;
  return doNamespace.idFromName(key);
}

async function doFetch<T>(
  env: CFEnv,
  name: string,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  partitionKey?: string | number | null,
): Promise<T> {
  const id = getDoId(env, name, partitionKey);
  const stub = env.JOB_QUEUE_DO!.get(id);
  const resp = await stub.fetch(
    new Request(`https://do${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  if (!resp.ok) throw new Error(`DO fetch failed: ${resp.status} ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Arm a cron DO (DO mode) or enqueue a cron job (D1 mode).
 * Called from the scheduled() handler for each cron trigger.
 */
export async function armCron(env: CFEnv, name: string, cron: string): Promise<void> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    await doFetch(env, name, "/arm", "POST", { name, cron });
  } else {
    await enqueueCronJob(name);
  }
}

/**
 * Enqueue an ad-hoc job. Partition key is inferred from data for known names.
 * Used by routes (track, integrations) that need to queue per-item work.
 */
export async function enqueueAdhoc(
  name: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    const env = getEnvOrNull();
    if (!env?.JOB_QUEUE_DO) throw new Error("JOB_QUEUE_DO binding not available");
    const partitionKey = getPartitionKey(name, data);
    await doFetch(env, name, "/enqueue", "POST", {
      name,
      data: data ? JSON.stringify(data) : null,
    }, partitionKey);
  } else {
    const db = getDb();
    await db.insert(jobs).values({
      name,
      data: data ? JSON.stringify(data) : null,
      runAt: new Date().toISOString(),
    });
  }
}

/**
 * Enqueue a one-time migration job (idempotent — skips if any row exists).
 * D1 mode only: called from scheduled() keep-alive block.
 */
export async function enqueueOnce(name: string): Promise<void> {
  // One-time migrations are D1-only: the row in the D1 jobs table is the
  // sentinel that prevents re-running. DO mode doesn't have a shared jobs
  // table, so we fall back to D1 for migration dedup regardless of mode.
  await enqueueOneTimeMigration(name);
}

/**
 * Drain pending D1 jobs (D1 mode) or no-op (DO mode — DOs self-drive).
 */
export async function processPending(): Promise<number> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    return 0;
  }
  return processPendingJobs();
}

/**
 * Recover stale running jobs.
 * D1 mode: global UPDATE across all jobs.
 * DO mode: fan out to each cron DO.
 */
export async function recoverStale(env: CFEnv, staleMinutes = 15): Promise<number> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    if (!env.JOB_QUEUE_DO) return 0;
    const results = await Promise.all(
      [...CRON_JOB_NAMES, "cleanup"].map((name) =>
        doFetch<{ count: number }>(env, name, "/recover", "POST", { staleMinutes }),
      ),
    );
    return results.reduce((sum, r) => sum + (r.count ?? 0), 0);
  }
  return recoverStaleJobs(staleMinutes);
}

/**
 * Clean up old completed/failed jobs.
 * D1 mode: DELETE from shared jobs table.
 * DO mode: fan out to each cron DO (cleanup DO fans out further internally).
 */
export async function cleanupOld(env: CFEnv, retentionDays = 30): Promise<number> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    if (!env.JOB_QUEUE_DO) return 0;
    const results = await Promise.all(
      [...CRON_JOB_NAMES, "cleanup"].map((name) =>
        doFetch<{ count: number }>(env, name, "/cleanup", "POST", { retentionDays }),
      ),
    );
    return results.reduce((sum, r) => sum + (r.count ?? 0), 0);
  }
  return cleanupOldJobs(retentionDays);
}

// ─── /api/jobs response shapes ───────────────────────────────────────────────

type JobStats = { pending: number; running: number; completed: number; failed: number };
type CronEntry = { name: string; cron: string; last_run: string | null; next_run: string; enabled: number };
type RecentJob = { id: number; name: string; status: string; error: string | null; started_at: string | null; completed_at: string | null; created_at: string };

/**
 * Return the stats/crons/recentJobs shape expected by GET /api/jobs.
 * D1 mode: queries the D1 jobs table (existing logic, extracted here).
 * DO mode: fans out to each cron DO.
 */
export async function getJobsOverview(env: CFEnv): Promise<{
  stats: Record<string, JobStats>;
  crons: CronEntry[];
  recentJobs: RecentJob[];
}> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    return getJobsOverviewDO(env);
  }
  return getJobsOverviewD1();
}

async function getJobsOverviewD1(): Promise<{
  stats: Record<string, JobStats>;
  crons: CronEntry[];
  recentJobs: RecentJob[];
}> {
  const { eq, desc, sql, inArray } = await import("drizzle-orm");
  const db = getDb();

  const statsRows = await db
    .select({
      name: jobs.name,
      status: jobs.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(jobs)
    .groupBy(jobs.name, jobs.status)
    .all();

  const stats: Record<string, JobStats> = {};
  for (const row of statsRows) {
    if (!stats[row.name]) stats[row.name] = { pending: 0, running: 0, completed: 0, failed: 0 };
    const s = row.status as keyof JobStats;
    if (s in stats[row.name]) stats[row.name][s] = row.count;
  }

  const cronEntries: CronEntry[] = await Promise.all(
    CRON_JOBS.map(async ({ name, cron }) => {
      const lastJob = await db
        .select({ completedAt: jobs.completedAt })
        .from(jobs)
        .where(
          sql`${jobs.name} = ${name} AND ${jobs.status} IN ('completed', 'failed')`,
        )
        .orderBy(desc(jobs.id))
        .limit(1)
        .get();

      let next_run = "";
      try {
        next_run = parseExpression(cron, { currentDate: new Date() }).next().toDate().toISOString();
      } catch {
        // ignore invalid expression
      }
      return { name, cron, last_run: lastJob?.completedAt ?? null, next_run, enabled: 1 };
    }),
  );

  const recentRows = await db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.id))
    .limit(20)
    .all();

  const recentJobs: RecentJob[] = recentRows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    error: r.error,
    started_at: r.startedAt,
    completed_at: r.completedAt,
    created_at: r.createdAt,
  }));

  return { stats, crons: cronEntries, recentJobs };
}

async function getJobsOverviewDO(env: CFEnv): Promise<{
  stats: Record<string, JobStats>;
  crons: CronEntry[];
  recentJobs: RecentJob[];
}> {
  if (!env.JOB_QUEUE_DO) {
    return { stats: {}, crons: [], recentJobs: [] };
  }

  const doNames = [...CRON_JOB_NAMES, "cleanup"] as string[];

  const [statsResults, cronInfoResults, recentResults] = await Promise.all([
    Promise.all(
      doNames.map((name) =>
        doFetch<JobStats>(env, name, "/stats", "GET").then((s) => ({ name, stats: s })),
      ),
    ),
    Promise.all(
      doNames.map((name) =>
        doFetch<{ cron: string | null; nextRun: string | null; lastRun: string | null }>(
          env,
          name,
          "/cron-info",
          "GET",
        ).then((info) => ({ name, info })),
      ),
    ),
    Promise.all(
      doNames.map((name) =>
        doFetch<DOJobRow[]>(env, name, "/recent-jobs?limit=5", "GET").then((rows) =>
          rows.map((r) => ({ ...r, name })),
        ),
      ),
    ),
  ]);

  const stats: Record<string, JobStats> = {};
  for (const { name, stats: s } of statsResults) {
    stats[name] = s;
  }

  const crons: CronEntry[] = cronInfoResults.map(({ name, info }) => {
    const jobDef = CRON_JOBS.find((j) => j.name === name);
    return {
      name,
      cron: info.cron ?? jobDef?.cron ?? "",
      last_run: info.lastRun,
      next_run: info.nextRun ?? "",
      enabled: 1,
    };
  });

  const allRecent = recentResults.flat();
  allRecent.sort((a, b) => b.id - a.id);
  const recentJobs: RecentJob[] = allRecent.slice(0, 20).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    error: r.error,
    started_at: r.started_at,
    completed_at: r.completed_at,
    created_at: r.created_at,
  }));

  return { stats, crons, recentJobs };
}

/**
 * Manually trigger a cron job by name (admin endpoint).
 * D1 mode: insert a job row (same as before).
 * DO mode: arm the DO (idempotent).
 */
export async function triggerCron(
  env: CFEnv,
  name: string,
): Promise<{ jobId: number | null }> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    const jobDef = CRON_JOBS.find((j) => j.name === name);
    if (!jobDef || !env.JOB_QUEUE_DO) return { jobId: null };
    await doFetch(env, name, "/arm", "POST", { name, cron: jobDef.cron });
    return { jobId: null };
  }
  const jobId = await enqueueJobReturningId(name);
  return { jobId };
}
