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
import { CronExpressionParser } from "cron-parser";
import { logger } from "../logger";
import type { DOJobRow } from "./durable-object";
import { CRON_JOB_NAMES } from "./durable-object";

const log = logger.child({ module: "job-backend" });

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
  { name: "sync-titles", cron: "0 3 * * *" },
  { name: "sync-episodes", cron: "30 3 * * *" },
  { name: "sync-deep-links", cron: "0 4 * * *" },
  { name: "send-notifications", cron: "*/5 * * * *" },
  { name: "cleanup", cron: "0 0 * * *" },
] as const;

export type CronJobName = (typeof CRON_JOBS)[number]["name"];

/** Map cron expression → job name (used by the scheduled() switch replacement). */
export const CRON_BY_EXPRESSION: Record<string, CronJobName> =
  Object.fromEntries(CRON_JOBS.map((j) => [j.cron, j.name])) as Record<
    string,
    CronJobName
  >;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive the DO partition key for a job name + data combo. */
function getPartitionKey(
  name: string,
  data?: Record<string, unknown>,
): string | null {
  if (name === "sync-show-episodes" && data?.titleId != null)
    return String(data.titleId);
  if (name === "backfill-title-offers" && data?.tmdbId != null)
    return String(data.tmdbId);
  if (name === "evaluate-achievements" && data?.userId != null)
    return String(data.userId);
  return null;
}

function getDoId(
  env: CFEnv,
  name: string,
  partitionKey?: string | number | null,
): DurableObjectId {
  const doNamespace = env.JOB_QUEUE_DO!;
  const key = partitionKey != null ? `${name}:${partitionKey}` : name;
  return doNamespace.idFromName(key);
}

/** Per-RPC deadline for the read fan-out in getJobsData, so a DO busy running a job
 *  can't stall the admin page (the .catch falls back to empty after this elapses). */
const READ_RPC_TIMEOUT_MS = 3000;

async function doFetch<T>(
  env: CFEnv,
  name: string,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  partitionKey?: string | number | null,
  timeoutMs?: number,
): Promise<T> {
  const id = getDoId(env, name, partitionKey);
  const stub = env.JOB_QUEUE_DO!.get(id);
  // Optional timeout: a DO is single-threaded, so while it runs a long job body its
  // read RPCs (/stats, /cron-info, /recent-jobs) would otherwise hang until the platform
  // timeout and stall the admin page. AbortController lets the caller's .catch fall back
  // to empty quickly. Write RPCs pass no timeout — they must reach the DO.
  const controller = timeoutMs != null ? new AbortController() : undefined;
  const timer =
    controller != null
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
  try {
    const resp = await stub.fetch(
      new Request(`https://do${path}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller?.signal,
      }),
    );
    if (!resp.ok)
      throw new Error(`DO fetch failed: ${resp.status} ${await resp.text()}`);
    return resp.json() as Promise<T>;
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Arm a cron DO (DO mode) or enqueue a cron job (D1 mode).
 * Called from the scheduled() handler for each cron trigger.
 */
export async function armCron(
  env: CFEnv,
  name: string,
  cron: string,
): Promise<void> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    await doFetch(env, name, "/arm", "POST", { name, cron });
  } else {
    await enqueueCronJob(name);
  }
}

/**
 * Drive due work in a cron-singleton DO via the /tick RPC. This is the primary
 * execution path in DO mode: the every-5-min Worker watchdog (worker.ts scheduled())
 * calls this for each cron job because the DO alarm() callback is unreliable under
 * the Sentry-wrapped entrypoint (#795). No-op in D1 mode (D1 drains via processPending).
 */
export async function tickCron(env: CFEnv, name: string): Promise<void> {
  if (CONFIG.JOB_QUEUE_BACKEND !== "durable-object") return;
  if (!env.JOB_QUEUE_DO) return;
  try {
    await doFetch(env, name, "/tick", "POST", {});
  } catch (err) {
    log.warn("DO tick failed", {
      name,
      error: err instanceof Error ? err.message : String(err),
    });
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
    if (!env?.JOB_QUEUE_DO)
      throw new Error("JOB_QUEUE_DO binding not available");
    const partitionKey = getPartitionKey(name, data);
    await doFetch(
      env,
      name,
      "/enqueue",
      "POST",
      {
        name,
        data: data ? JSON.stringify(data) : null,
      },
      partitionKey,
    );
    // Drive execution immediately via the working fetch path — ad-hoc DOs cannot
    // rely on alarm() delivery (#795), so without this the job would never run.
    // A single ad-hoc job (e.g. one show's episode sync) fits the 30s DO limit.
    await doFetch(env, name, "/tick", "POST", {}, partitionKey);
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
 * Enqueue a one-time migration job (idempotent — skips if any pending row exists).
 * In D1 mode the D1 jobs table row is the dedup sentinel.
 * In DO mode the DO's own SQLite is the sentinel (enforced by the idempotent flag).
 */
export async function enqueueOnce(name: string): Promise<void> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    const env = getEnvOrNull();
    if (env?.JOB_QUEUE_DO) {
      await doFetch(env, name, "/enqueue", "POST", {
        name,
        maxAttempts: 1,
        idempotent: true,
      });
    }
    return;
  }
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
export async function recoverStale(
  env: CFEnv,
  staleMinutes = 15,
): Promise<number> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    if (!env.JOB_QUEUE_DO) return 0;
    const results = await Promise.all(
      [...CRON_JOB_NAMES, "cleanup"].map((name) =>
        doFetch<{ count: number }>(env, name, "/recover", "POST", {
          staleMinutes,
        }),
      ),
    );
    return results.reduce((sum, r) => sum + (r.count ?? 0), 0);
  }
  return recoverStaleJobs(staleMinutes);
}

/**
 * Clean up old completed/failed jobs.
 * D1 mode: DELETE from shared jobs table.
 * DO mode: fan out POST /cleanup to all 5 cron DOs. Uses allSettled so one
 * unresponsive DO cannot abort the rest of the sweep.
 */
export async function cleanupOld(
  env: CFEnv,
  retentionDays = 30,
): Promise<number> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    if (!env.JOB_QUEUE_DO) return 0;
    const names = [...CRON_JOB_NAMES, "cleanup"];
    const results = await Promise.allSettled(
      names.map((name) =>
        doFetch<{ count: number }>(env, name, "/cleanup", "POST", {
          retentionDays,
        }),
      ),
    );
    let total = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        total += result.value.count ?? 0;
      } else {
        log.warn("DO cleanup peer failed", {
          name: names[i],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    }
    return total;
  }
  return cleanupOldJobs(retentionDays);
}

// ─── /api/jobs response shapes ───────────────────────────────────────────────

type JobStats = {
  pending: number;
  running: number;
  completed: number;
  failed: number;
};
type CronEntry = {
  name: string;
  cron: string;
  last_run: string | null;
  next_run: string;
  enabled: number;
  alarmLastCompletedAt: string | null;
};
type RecentJob = {
  id: number;
  name: string;
  status: string;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

/**
 * Return the stats/crons/recentJobs shape expected by GET /api/jobs.
 * D1 mode: queries the D1 jobs table (existing logic, extracted here).
 * DO mode: fans out to each cron DO.
 */
export async function getJobsOverview(env: CFEnv): Promise<{
  stats: Record<string, JobStats>;
  crons: CronEntry[];
  recentJobs: RecentJob[];
  bootstrap: { lastSeenAt: string | null };
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
  bootstrap: { lastSeenAt: string | null };
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
    if (!stats[row.name])
      stats[row.name] = { pending: 0, running: 0, completed: 0, failed: 0 };
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
        next_run = CronExpressionParser.parse(cron, { currentDate: new Date() })
          .next()
          .toDate()
          .toISOString();
      } catch {
        // ignore invalid expression
      }
      return {
        name,
        cron,
        last_run: lastJob?.completedAt ?? null,
        next_run,
        enabled: 1,
        alarmLastCompletedAt: null,
      };
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

  return {
    stats,
    crons: cronEntries,
    recentJobs,
    bootstrap: { lastSeenAt: null },
  };
}

async function getJobsOverviewDO(env: CFEnv): Promise<{
  stats: Record<string, JobStats>;
  crons: CronEntry[];
  recentJobs: RecentJob[];
  bootstrap: { lastSeenAt: string | null };
}> {
  if (!env.JOB_QUEUE_DO) {
    return {
      stats: {},
      crons: [],
      recentJobs: [],
      bootstrap: { lastSeenAt: null },
    };
  }

  const doNames = [...CRON_JOB_NAMES, "cleanup"] as string[];
  const emptyStats: JobStats = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
  };
  const emptyCronInfo = {
    cron: null,
    nextRun: null,
    lastRun: null,
    alarmLastCompletedAt: null,
  };

  const [statsResults, cronInfoResults, recentResults] = await Promise.all([
    Promise.all(
      doNames.map((name) =>
        doFetch<JobStats>(
          env,
          name,
          "/stats",
          "GET",
          undefined,
          null,
          READ_RPC_TIMEOUT_MS,
        )
          .then((s) => ({ name, stats: s }))
          .catch((err) => {
            log.warn("DO stats unavailable", { name, err });
            return { name, stats: emptyStats };
          }),
      ),
    ),
    Promise.all(
      doNames.map((name) =>
        doFetch<{
          cron: string | null;
          nextRun: string | null;
          lastRun: string | null;
          alarmLastCompletedAt: string | null;
        }>(env, name, "/cron-info", "GET", undefined, null, READ_RPC_TIMEOUT_MS)
          .then((info) => ({ name, info }))
          .catch((err) => {
            log.warn("DO cron-info unavailable", { name, err });
            return { name, info: emptyCronInfo };
          }),
      ),
    ),
    Promise.all(
      doNames.map((name) =>
        doFetch<DOJobRow[]>(
          env,
          name,
          "/recent-jobs?limit=5",
          "GET",
          undefined,
          null,
          READ_RPC_TIMEOUT_MS,
        )
          .then((rows) => rows.map((r) => ({ ...r, name })))
          .catch((err) => {
            log.warn("DO recent-jobs unavailable", { name, err });
            return [] as DOJobRow[];
          }),
      ),
    ),
  ]);

  const lastSeenAt = env.CACHE_KV
    ? await env.CACHE_KV.get("cron_bootstrap_last_seen_at", "text")
    : null;

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
      alarmLastCompletedAt: info.alarmLastCompletedAt,
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

  return { stats, crons, recentJobs, bootstrap: { lastSeenAt } };
}

/**
 * Manually trigger a cron job by name (admin endpoint).
 * D1 mode: insert a job row (same as before).
 * DO mode: arm the DO (idempotent).
 */
export async function triggerCron(
  env: CFEnv,
  name: string,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<{ jobId: number | null }> {
  if (CONFIG.JOB_QUEUE_BACKEND === "durable-object") {
    const jobDef = CRON_JOBS.find((j) => j.name === name);
    if (!jobDef || !env.JOB_QUEUE_DO) return { jobId: null };
    await doFetch(env, name, "/arm", "POST", { name, cron: jobDef.cron });
    // "Run now" must execute regardless of cron schedule. tick() honors cron timing
    // and won't auto-create a job when the cron isn't due, so force a real pending
    // row first; runJob then claims and runs it on the tick (#795-followup).
    await doFetch(env, name, "/enqueue", "POST", {
      name,
      data: null,
      idempotent: true,
    });
    // Drive the job via /tick WITHOUT blocking the HTTP response: running a full sync
    // body inline made the POST take 140s+. Defer it to waitUntil so the request returns
    // immediately while the job runs promptly (not waiting on unreliable alarm delivery).
    // runJob's due/in-flight guards ensure this tick + the enqueue's 1s alarm can't
    // double-run. When no executionCtx is available (e.g. tests), fall back to detached.
    const tick = doFetch(env, name, "/tick", "POST", {}).catch((err) => {
      log.warn("DO tick failed", {
        name,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    if (waitUntil) waitUntil(tick);
    else void tick;
    return { jobId: null };
  }
  const jobId = await enqueueJobReturningId(name);
  return { jobId };
}
