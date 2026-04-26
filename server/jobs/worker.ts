import Sentry from "../sentry";
import { logger } from "../logger";
import { jobsTotal, jobDurationSeconds } from "../metrics";

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

const handlers = new Map<string, JobHandler>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let cronTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function registerHandler(name: string, handler: JobHandler) {
  handlers.set(name, handler);
}

export async function processJobs() {
  for (const [name, handler] of handlers) {
    const job = claimNextJob(name);
    if (!job) continue;

    const cronExpr = getCronExpression(name);
    const monitorConfig = cronExpr
      ? {
          schedule: { type: "crontab" as const, value: cronExpr },
          maxRuntime: 30,
        }
      : undefined;

    const jobStart = performance.now();
    try {
      if (cronExpr) {
        await Sentry.withMonitor(
          name,
          async () => {
            await handler(job);
          },
          monitorConfig
        );
      } else {
        await handler(job);
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
      log.error("Failed job", { name, jobId: job.id, attempt: job.attempts, maxAttempts: job.max_attempts, err });
    }
  }
}

export function startWorker() {
  // Cron runs missed during downtime are not backfilled: `recoverStaleJobs`
  // only re-queues jobs that were already claimed when the process died, and
  // `tickCrons` computes the next run from "now" rather than "last run".
  // This is intentional — it prevents restart storms after long outages.
  recoverStaleJobs();

  // Poll for pending jobs
  pollTimer = setInterval(processJobs, POLL_INTERVAL_MS);

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
