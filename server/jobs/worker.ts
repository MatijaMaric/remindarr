import Sentry from "../sentry";
import { logger } from "../logger";
import { jobsTotal, jobDurationSeconds } from "../metrics";
import { CONFIG } from "../config";

const log = logger.child({ module: "jobs" });

import {
  claimNextJob,
  completeJob,
  failJob,
  tickCrons,
  recoverStaleJobs,
  cleanupOldJobs,
  getCronExpression,
  type JobHandler,
} from "./queue";

const POLL_INTERVAL_MS = 30_000; // Check for jobs every 30s
const CRON_TICK_INTERVAL_MS = 60_000; // Check cron schedules every 60s
const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000; // Clean old jobs daily
// Per name, keep claiming jobs until the queue is empty or this much time has
// passed, so fan-out jobs drain in one tick without starving other names (#1442).
const NAME_BUDGET_MS = 10_000;

const handlers = new Map<string, JobHandler>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cronTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
// Guards: a tick never overlaps the previous one, and a name whose handler has
// not settled (e.g. it lost the withTimeout race and is still running) is not
// claimed again until it does.
let processing = false;
const unsettled = new Set<string>();

export function registerHandler(name: string, handler: JobHandler) {
  handlers.set(name, handler);
}

export function getHandler(name: string): JobHandler | undefined {
  return handlers.get(name);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  jobName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Job "${jobName}" exceeded handler timeout of ${timeoutMs}ms`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function processJobs(budgetMs = NAME_BUDGET_MS) {
  if (processing) return;
  processing = true;
  try {
    for (const [name, handler] of handlers) {
      const start = performance.now();
      while (
        !unsettled.has(name) &&
        performance.now() - start < budgetMs &&
        (await runNext(name, handler))
      );
    }
  } finally {
    processing = false;
  }
}

/** Claim and run one job for `name`. Returns false when none was pending. */
async function runNext(name: string, handler: JobHandler): Promise<boolean> {
  const job = claimNextJob(name);
  if (!job) return false;

  const cronExpr = getCronExpression(name);
  const monitorConfig = cronExpr
    ? {
        schedule: { type: "crontab" as const, value: cronExpr },
        maxRuntime: 30,
      }
    : undefined;

  const jobStart = performance.now();
  try {
    const exec = () => {
      unsettled.add(name);
      const run = Promise.resolve()
        .then(() => handler(job))
        .finally(() => unsettled.delete(name));
      return withTimeout(run, CONFIG.JOB_HANDLER_TIMEOUT_MS, name);
    };
    if (cronExpr) {
      await Sentry.withMonitor(name, exec, monitorConfig);
    } else {
      await exec();
    }
    completeJob(job.id);
    const duration = (performance.now() - jobStart) / 1000;
    jobsTotal.inc({ name, status: "completed" });
    jobDurationSeconds.observe({ name }, duration);
    log.info("Completed job", { name, jobId: job.id });
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : String(err);
    failJob(job.id, message);
    const duration = (performance.now() - jobStart) / 1000;
    jobsTotal.inc({ name, status: "failed" });
    jobDurationSeconds.observe({ name }, duration);
    log.error("Failed job", {
      name,
      jobId: job.id,
      attempt: job.attempts,
      maxAttempts: job.max_attempts,
      err,
    });
  }
  return true;
}

export function startWorker() {
  // Cron runs missed during downtime are not backfilled: `recoverStaleJobs`
  // only re-queues jobs that were already claimed when the process died, and
  // `tickCrons` computes the next run from "now" rather than "last run".
  // This is intentional — it prevents restart storms after long outages.
  recoverStaleJobs();

  // Poll for pending jobs
  pollTimer = setInterval(() => processJobs(), POLL_INTERVAL_MS);

  // Tick cron schedules
  cronTimer = setInterval(tickCrons, CRON_TICK_INTERVAL_MS);

  // Clean up old completed/failed jobs daily
  cleanupTimer = setInterval(() => cleanupOldJobs(30), CLEANUP_INTERVAL_MS);

  // Run an initial tick immediately
  tickCrons();
  processJobs();

  log.info("Worker started");
}

export function stopWorker() {
  if (pollTimer) clearInterval(pollTimer);
  if (cronTimer) clearInterval(cronTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  pollTimer = null;
  cronTimer = null;
  cleanupTimer = null;
  log.info("Worker stopped");
}
