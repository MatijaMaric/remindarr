import * as Sentry from "@sentry/node";
import { logger } from "../logger";

const log = logger.child({ module: "jobs" });

import {
  initJobsSchema,
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

    try {
      await Sentry.withMonitor(
        name,
        async () => {
          await handler(job);
        },
        monitorConfig
      );
      completeJob(job.id);
      log.info("Completed job", { name, jobId: job.id });
    } catch (err) {
      Sentry.captureException(err);
      const message = err instanceof Error ? err.message : String(err);
      failJob(job.id, message);
      log.error("Failed job", { name, jobId: job.id, attempt: job.attempts, maxAttempts: job.max_attempts, error: message });
    }
  }
}

export function startWorker() {
  initJobsSchema();
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
