/**
 * Portable job processor that uses Drizzle ORM (no bun:sqlite dependency).
 *
 * Used by the CF Workers scheduled handler to claim and execute pending jobs
 * from the `jobs` table. The Bun server uses its own polling worker instead.
 */
import { eq, and, lte, lt, asc, sql, inArray } from "drizzle-orm";
import { getDb, jobs } from "../db/schema";
import { CONFIG } from "../config";
import { logger } from "../logger";
import { upsertTitles, deleteExpiredSessions } from "../db/repository";
import {
  getDueNotifiers,
  getDistinctNotifierTimezones,
  markNotifierSent,
  disableNotifier,
  recordDelivery,
} from "../db/repository";
import { fetchNewReleases } from "../tmdb/sync-titles";
import { syncEpisodes, syncEpisodesForShow } from "../tmdb/sync";
import { fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { parseMovieDetails, parseTvDetails } from "../tmdb/parser";
import { getProvider } from "../notifications/registry";
import { buildNotificationContent } from "../notifications/content";
import { SubscriptionExpiredError } from "../notifications/webpush";
import { getCurrentTimeInTimezone } from "./time-utils";
import { listEarnedSince, markAchievementsNotified, upsertUserAchievement } from "../db/repository/achievements";
import { recomputeStreakFromHistory } from "../db/repository/streaks";
import { getSetting, setSetting } from "../db/repository/settings";
import { ACHIEVEMENTS, type AchievementKind } from "../achievements/definitions";
import {
  evaluateCountMovies,
  evaluateCountEpisodes,
  evaluateStreak,
  evaluateGenreCount,
  evaluateCompletionist,
  evaluateSpeedBingeSeason,
  evaluateSocialFirstFollow,
  evaluateSocialFirstRecommendation,
} from "../achievements/evaluate";

const log = logger.child({ module: "job-processor" });

// ─── Job Handlers ──────────────────────────────────────────────────────────

async function handleSyncTitles(): Promise<void> {
  const titles = await fetchNewReleases({ daysBack: CONFIG.DEFAULT_DAYS_BACK });
  const count = await upsertTitles(titles);
  log.info("Synced titles from TMDB", { count });
}

async function handleSyncEpisodes(): Promise<void> {
  if (!CONFIG.TMDB_API_KEY) {
    log.info("Skipping episode sync", { reason: "TMDB_API_KEY not configured" });
    return;
  }
  const result = await syncEpisodes();
  log.info("Synced episodes", { synced: result.synced, shows: result.shows });
}

async function handleSyncShowEpisodes(data: string | null): Promise<void> {
  if (!CONFIG.TMDB_API_KEY) {
    log.info("Skipping show episode sync", { reason: "TMDB_API_KEY not configured" });
    return;
  }
  const parsed = data ? JSON.parse(data) : null;
  if (!parsed?.titleId || !parsed?.tmdbId || !parsed?.title) {
    throw new Error("sync-show-episodes job missing required data fields");
  }
  const count = await syncEpisodesForShow(parsed.titleId, parsed.tmdbId, parsed.title);
  log.info("Synced show episodes via job", { title: parsed.title, episodes: count });
}

async function handleSendNotifications(): Promise<void> {
  const timezones = await getDistinctNotifierTimezones();
  if (timezones.length === 0) return;

  const timesByTimezone = new Map<string, { time: string; date: string; dayOfWeek: number }>();
  for (const tz of timezones) {
    timesByTimezone.set(tz, getCurrentTimeInTimezone(tz));
  }

  const dueNotifiers = await getDueNotifiers(timesByTimezone);
  if (dueNotifiers.length === 0) return;

  log.info("Processing due notifiers", { count: dueNotifiers.length });

  // Per-invocation caches keyed by "userId|date" — local to this job run, not global.
  // For N notifiers sharing the same user+date, DB queries drop from 2N to 2.
  const dailyContentCache = new Map<string, Awaited<ReturnType<typeof buildNotificationContent>>>();

  async function getDailyContentCached(userId: string, date: string) {
    const key = `${userId}|${date}`;
    if (dailyContentCache.has(key)) {
      log.debug("Notification content cache hit", { userId, date });
      return dailyContentCache.get(key)!;
    }
    const result = await buildNotificationContent(userId, date);
    dailyContentCache.set(key, result);
    return result;
  }

  for (const notifier of dueNotifiers) {
    try {
      const provider = getProvider(notifier.provider);
      if (!provider) {
        log.warn("Unknown provider", { provider: notifier.provider, notifierId: notifier.id });
        continue;
      }

      // Default daily behavior
      const content = await getDailyContentCached(notifier.user_id, notifier.todayDate);

      // Inject achievements if enabled for this notifier
      let achievementKeys: string[] = [];
      if (notifier.achievementsEnabled) {
        const lastSentDate = notifier.last_sent_date ?? "1970-01-01T00:00:00.000Z";
        const earnedSince = await listEarnedSince(notifier.user_id, lastSentDate);
        const unnotified = earnedSince.filter((ua) => !ua.earnedNotified && ua.earnedAt != null);
        if (unnotified.length > 0) {
          content.achievementsEarned = unnotified.map((ua) => {
            const def = ACHIEVEMENTS.find((a) => a.key === ua.achievementKey);
            return {
              key: ua.achievementKey,
              title: def?.title ?? ua.achievementKey,
              description: def?.description ?? "",
              icon: def?.icon ?? "",
              points: def?.points ?? 0,
              earnedAt: ua.earnedAt!,
            };
          });
          achievementKeys = unnotified.map((ua) => ua.achievementKey);
        }
      }

      // Skip if nothing to notify about
      if (content.episodes.length === 0 && content.movies.length === 0 && !(content.achievementsEarned?.length)) {
        await markNotifierSent(notifier.id, notifier.todayDate);
        continue;
      }

      const dailyStart = Date.now();
      try {
        await provider.send(notifier.config, content);
        await recordDelivery({ notifierId: notifier.id, status: "success", latencyMs: Date.now() - dailyStart, eventKind: "episode_air" });
      } catch (sendErr) {
        await recordDelivery({ notifierId: notifier.id, status: "failure", latencyMs: Date.now() - dailyStart, errorMessage: sendErr instanceof Error ? sendErr.message : String(sendErr), eventKind: "episode_air" });
        throw sendErr;
      }
      // Mark achievements as notified after successful send
      if (achievementKeys.length > 0) {
        await markAchievementsNotified(notifier.user_id, achievementKeys);
      }
      await markNotifierSent(notifier.id, notifier.todayDate);
      log.info("Sent notification", { provider: notifier.provider, userId: notifier.user_id });
    } catch (err) {
      if (err instanceof SubscriptionExpiredError) {
        log.warn("Push subscription expired, disabling notifier", { notifierId: notifier.id });
        await disableNotifier(notifier.id);
        continue;
      }
      log.error("Failed to send notification", {
        provider: notifier.provider,
        notifierId: notifier.id,
        userId: notifier.user_id,
        err,
      });
    }
  }
}

async function handleBackfillTitleOffers(data: string | null): Promise<void> {
  if (!CONFIG.TMDB_API_KEY) {
    log.info("Skipping offers backfill", { reason: "TMDB_API_KEY not configured" });
    return;
  }
  const parsed = data ? JSON.parse(data) : null;
  if (!parsed?.tmdbId || !parsed?.objectType) {
    throw new Error("backfill-title-offers job missing required data fields");
  }
  const tmdbId = Number(parsed.tmdbId);
  const title = parsed.objectType === "MOVIE"
    ? parseMovieDetails(await fetchMovieDetails(tmdbId))
    : parseTvDetails(await fetchTvDetails(tmdbId));
  if (title.offers.length > 0) {
    await upsertTitles([title]);
    log.info("Backfilled offers for title", { title: title.title, offers: title.offers.length });
  } else {
    log.info("No offers found for title", { title: title.title });
  }
}

async function handleMigrateOffers(): Promise<void> {
  const { migrateOffers } = await import("./migrate-offers");
  const result = await migrateOffers();
  if (result.hasMore && CONFIG.JOB_QUEUE_BACKEND !== "durable-object") {
    // Direct insert bypasses enqueueOneTimeMigration's "any row" sentinel so the
    // backfill continues across multiple cron ticks. In DO mode the alarm() handler
    // re-enqueues the next batch in DO SQLite instead.
    const db = getDb();
    await db.insert(jobs).values({ name: "migrate-offers", runAt: new Date().toISOString(), maxAttempts: 1 });
    log.info("migrate-offers batch done, re-enqueued for next tick");
  }
}

async function handleSyncDeepLinks(): Promise<void> {
  if (!CONFIG.STREAMING_AVAILABILITY_API_KEY) {
    log.info("Skipping deep link sync", { reason: "STREAMING_AVAILABILITY_API_KEY not configured" });
    return;
  }
  const { enrichTitleDeepLinks } = await import("../streaming-availability/enrich");
  const { RateLimitError } = await import("../streaming-availability/types");
  const { BreakerOpenError } = await import("../lib/circuit-breaker");
  const { getTitlesNeedingSaEnrichment } = await import("../db/repository");

  const titleRows = await getTitlesNeedingSaEnrichment();
  if (titleRows.length === 0) return;

  let enriched = 0;
  let processed = 0;
  for (const t of titleRows) {
    try {
      const count = await enrichTitleDeepLinks(
        t.id,
        Number(t.tmdbId),
        t.objectType as "MOVIE" | "SHOW",
      );
      enriched += count;
      processed++;
    } catch (err) {
      if (err instanceof RateLimitError) {
        log.warn("SA rate limit hit, stopping early", { processed, enriched });
        break;
      }
      if (err instanceof BreakerOpenError) {
        log.warn("SA breaker open, stopping early", { processed, enriched });
        break;
      }
      log.error("SA enrichment failed", { titleId: t.id, err });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  log.info("Deep link sync complete", { processed, enriched });
}

// ─── Job Dispatcher ────────────────────────────────────────────────────────

async function handleCleanup() {
  await deleteExpiredSessions();
  await cleanupOldJobs(30);
}

const BACKFILL_PAGE_SIZE = 50;

async function handleEvaluateAchievements(data: string | null): Promise<void> {
  const raw = typeof data === "string" ? JSON.parse(data) : data;
  const { userId, kinds, titleId } = (raw ?? {}) as {
    userId: string;
    kinds: AchievementKind[];
    titleId?: string;
  };

  if (!userId || !Array.isArray(kinds)) {
    log.warn("evaluate-achievements: invalid job data");
    return;
  }

  for (const kind of kinds) {
    const matchingAchievements = ACHIEVEMENTS.filter((a) => a.kind === kind);
    for (const a of matchingAchievements) {
      try {
        let result: { progress: number; earned: boolean };
        switch (kind) {
          case "count_movies":
            result = await evaluateCountMovies(userId, a.threshold);
            break;
          case "count_episodes":
            result = await evaluateCountEpisodes(userId, a.threshold);
            break;
          case "streak_days":
            result = await evaluateStreak(userId, a.threshold);
            break;
          case "genre_count":
            result = await evaluateGenreCount(userId, a.threshold, a.genre ?? "__any__");
            break;
          case "completionist":
            result = await evaluateCompletionist(userId, a.threshold, titleId);
            break;
          case "speed_binge_season":
            if (!titleId) continue;
            result = await evaluateSpeedBingeSeason(userId, a.threshold, a.windowHours ?? 24, titleId);
            break;
          case "social_first_follow":
            result = await evaluateSocialFirstFollow(userId);
            break;
          case "social_first_recommendation":
            result = await evaluateSocialFirstRecommendation(userId);
            break;
          default:
            log.warn("evaluate-achievements: unknown kind, skipping", { kind, userId });
            continue;
        }
        const earnedAt = result.earned ? new Date().toISOString() : null;
        const { newlyEarned } = await upsertUserAchievement(userId, a.key, result.progress, earnedAt);
        if (newlyEarned) {
          log.info("Achievement newly earned (deferred)", { userId, key: a.key, kind });
        }
      } catch (err) {
        log.error("evaluate-achievements: error evaluating achievement", {
          userId,
          key: a.key,
          kind,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

async function handleBackfillAchievements(_data?: string | null): Promise<void> {
  const db = getDb();

  const cursor = (await getSetting("achievements_backfill_cursor")) ?? "";

  const rows = await db.all<{ id: string }>(sql`
    SELECT id FROM users
    WHERE id > ${cursor}
    ORDER BY id ASC
    LIMIT ${BACKFILL_PAGE_SIZE}
  `);

  if (rows.length === 0) {
    await setSetting("achievements_backfill_done", "1");
    log.info("Backfill complete — no more users");
    return;
  }

  log.info("Backfill: processing page", { count: rows.length, cursor });

  for (const row of rows) {
    const userId = row.id;
    try {
      await recomputeStreakFromHistory(userId);

      for (const a of ACHIEVEMENTS) {
        try {
          let result: { progress: number; earned: boolean };
          switch (a.kind) {
            case "count_movies":
              result = await evaluateCountMovies(userId, a.threshold);
              break;
            case "count_episodes":
              result = await evaluateCountEpisodes(userId, a.threshold);
              break;
            case "streak_days":
              result = await evaluateStreak(userId, a.threshold);
              break;
            case "genre_count":
              result = await evaluateGenreCount(userId, a.threshold, a.genre ?? "__any__");
              break;
            case "completionist":
              result = await evaluateCompletionist(userId, a.threshold);
              break;
            case "speed_binge_season": {
              const threshold = a.threshold;
              const windowHours = a.windowHours ?? 24;
              const candidateRows = await db.all<{ title_id: string }>(sql`
                SELECT e.title_id
                FROM watched_episodes we
                JOIN episodes e ON e.id = we.episode_id
                WHERE we.user_id = ${userId}
                  AND we.watched_at IS NOT NULL
                GROUP BY e.title_id
                HAVING COUNT(*) >= ${threshold}
              `);
              let maxProgress = 0;
              let anyEarned = false;
              for (const c of candidateRows) {
                const r = await evaluateSpeedBingeSeason(userId, threshold, windowHours, c.title_id);
                if (r.earned) anyEarned = true;
                maxProgress = Math.max(maxProgress, r.progress);
              }
              result = { progress: maxProgress, earned: anyEarned };
              break;
            }
            case "social_first_follow":
              result = await evaluateSocialFirstFollow(userId);
              break;
            case "social_first_recommendation":
              result = await evaluateSocialFirstRecommendation(userId);
              break;
            default:
              continue;
          }
          const earnedAt = result.earned ? new Date().toISOString() : null;
          await upsertUserAchievement(userId, a.key, result.progress, earnedAt, { earnedNotified: 1 });
        } catch (err) {
          log.warn("Backfill: error evaluating achievement for user", {
            userId,
            key: a.key,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      log.warn("Backfill: error processing user", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const lastUserId = rows[rows.length - 1].id;
  await setSetting("achievements_backfill_cursor", lastUserId);

  if (rows.length === BACKFILL_PAGE_SIZE) {
    // Direct insert is CF-safe (no bun:sqlite); mirrors handleMigrateOffers pattern
    await db.insert(jobs).values({ name: "backfill-achievements", runAt: new Date(Date.now() + 5000).toISOString() });
    log.info("Backfill: enqueued next batch", { nextCursor: lastUserId });
  } else {
    await setSetting("achievements_backfill_done", "1");
    log.info("Backfill: complete", { totalProcessed: rows.length });
  }
}

export const handlers: Record<string, (data: string | null) => Promise<void>> = {
  "sync-titles": () => handleSyncTitles(),
  "sync-episodes": () => handleSyncEpisodes(),
  "sync-show-episodes": (data) => handleSyncShowEpisodes(data),
  "send-notifications": () => handleSendNotifications(),
  "backfill-title-offers": (data) => handleBackfillTitleOffers(data),
  "migrate-offers": () => handleMigrateOffers(),
  "sync-deep-links": () => handleSyncDeepLinks(),
  "cleanup": () => handleCleanup(),
  "evaluate-achievements": (data) => handleEvaluateAchievements(data),
  "backfill-achievements": (data) => handleBackfillAchievements(data),
};

export interface JobRow {
  id: number;
  name: string;
  data: string | null;
  status: string;
  attempts: number;
  maxAttempts: number;
}

/**
 * Process all pending jobs from the `jobs` table.
 * Each job is claimed (set to running), executed, then marked completed or failed.
 */
export async function processPendingJobs(): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();

  const pendingJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, now)))
    .orderBy(asc(jobs.runAt))
    .all();

  if (pendingJobs.length === 0) return 0;

  log.info("Processing pending jobs", { count: pendingJobs.length });
  let processed = 0;

  for (const job of pendingJobs) {
    const handler = handlers[job.name];
    if (!handler) {
      log.warn("Unknown job type, marking failed", { name: job.name, jobId: job.id });
      await db
        .update(jobs)
        .set({ status: "failed", error: `Unknown job type: ${job.name}`, completedAt: now })
        .where(eq(jobs.id, job.id));
      continue;
    }

    // Claim the job atomically — the status check in WHERE prevents a second
    // concurrent CF scheduled invocation from executing the same job if both
    // selected it as "pending" before either claimed it. .returning() is used
    // instead of rowsAffected because the bun:sqlite Drizzle driver doesn't
    // populate rowsAffected reliably; an empty result means 0 rows matched.
    const [claimed] = await db
      .update(jobs)
      .set({ status: "running", startedAt: now, attempts: job.attempts + 1 })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "pending")))
      .returning({ id: jobs.id });

    if (!claimed) {
      log.info("Job already claimed by concurrent invocation, skipping", { name: job.name, jobId: job.id });
      continue;
    }

    try {
      await handler(job.data);
      await db
        .update(jobs)
        .set({ status: "completed", completedAt: new Date().toISOString() })
        .where(eq(jobs.id, job.id));
      log.info("Completed job", { name: job.name, jobId: job.id });
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const newAttempts = job.attempts + 1;

      if (newAttempts < job.maxAttempts) {
        // Re-queue with exponential backoff: 2^attempts * 30 seconds
        const delaySec = Math.pow(2, newAttempts) * 30;
        const retryAt = new Date(Date.now() + delaySec * 1000).toISOString();
        await db
          .update(jobs)
          .set({ status: "pending", error: message, runAt: retryAt })
          .where(eq(jobs.id, job.id));
        log.warn("Job failed, will retry", {
          name: job.name,
          jobId: job.id,
          attempt: newAttempts,
          maxAttempts: job.maxAttempts,
          retryAt,
          err,
        });
      } else {
        await db
          .update(jobs)
          .set({ status: "failed", error: message, completedAt: new Date().toISOString() })
          .where(eq(jobs.id, job.id));
        log.error("Job failed permanently", {
          name: job.name,
          jobId: job.id,
          attempts: newAttempts,
          err,
        });
      }
    }
  }

  return processed;
}

/**
 * Enqueue a cron-triggered job if one isn't already pending for that name.
 */
export async function enqueueCronJob(name: string): Promise<void> {
  await enqueueJobReturningId(name);
}

/**
 * Enqueue a job by name and return the new job ID, or null if one is already pending/running.
 */
export async function enqueueJobReturningId(name: string): Promise<number | null> {
  const db = getDb();
  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.name, name), inArray(jobs.status, ["pending", "running"])))
    .get();

  if (existing) {
    log.info("Cron job already pending/running, skipping", { name });
    return null;
  }

  await db.insert(jobs).values({
    name,
    runAt: new Date().toISOString(),
  });

  const inserted = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.name, name))
    .orderBy(sql`${jobs.id} DESC`)
    .limit(1)
    .get();

  log.info("Enqueued cron job", { name });
  return inserted?.id ?? null;
}

/**
 * Enqueue a one-time migration job if no job with that name exists at all
 * (regardless of status). This prevents re-running completed migrations.
 */
export async function enqueueOneTimeMigration(name: string): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.name, name))
    .get();

  if (existing) return;

  await db.insert(jobs).values({
    name,
    runAt: new Date().toISOString(),
    maxAttempts: 1,
  });
  log.info("Enqueued one-time migration", { name });
}

/**
 * Reset jobs that have been stuck in "running" state for too long back to "pending".
 * This recovers jobs that were killed mid-execution (e.g. CF Worker CPU limit).
 */
export async function recoverStaleJobs(staleMinutes: number = 15): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
  const result = await db
    .update(jobs)
    .set({ status: "pending", error: "Recovered after stale timeout" })
    .where(and(eq(jobs.status, "running"), lt(jobs.startedAt, cutoff)));
  const count = result.rowsAffected ?? 0;
  if (count > 0) {
    log.info("Recovered stale jobs", { count });
  }
  return count;
}

/**
 * Clean up old completed/failed jobs.
 */
export async function cleanupOldJobs(retentionDays: number = 30): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const result = await db
    .delete(jobs)
    .where(
      and(
        inArray(jobs.status, ["completed", "failed"]),
        lte(jobs.completedAt, cutoff)
      )
    );
  return result.rowsAffected ?? 0;
}
