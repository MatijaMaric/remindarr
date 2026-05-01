import { logger } from "../logger";
import { registerHandler } from "./worker";
import {
  getDueNotifiers,
  getDistinctNotifierTimezones,
  markNotifierSent,
  disableNotifier,
  recordDelivery,
} from "../db/repository";
import { getProvider } from "../notifications/registry";
import { buildNotificationContent, buildWeeklyDigestContent } from "../notifications/content";
import { SubscriptionExpiredError } from "../notifications/webpush";
import { refreshNotificationSchedule } from "./schedule";
import { getCurrentTimeInTimezone } from "./time-utils";
import { notificationsSentTotal } from "../metrics";

// Re-export portable scheduling functions for backward compatibility (tests import from here)
export { convertToLocalTime, computeNotificationCron, refreshNotificationSchedule } from "./schedule";

const log = logger.child({ module: "notifications" });

let handlerRegistered = false;

export async function registerNotificationJobs() {
  if (!handlerRegistered) {
    registerHandler("send-notifications", async () => {
      const timezones = await getDistinctNotifierTimezones();
      if (timezones.length === 0) return;

      // Compute current time for each timezone
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
      const weeklyContentCache = new Map<string, Awaited<ReturnType<typeof buildWeeklyDigestContent>>>();

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

      async function getWeeklyContentCached(userId: string, startDate: string, endDate: string) {
        const key = `${userId}|${startDate}|${endDate}`;
        if (weeklyContentCache.has(key)) {
          log.debug("Weekly digest content cache hit", { userId, startDate, endDate });
          return weeklyContentCache.get(key)!;
        }
        const result = await buildWeeklyDigestContent(userId, startDate, endDate);
        weeklyContentCache.set(key, result);
        return result;
      }

      for (const notifier of dueNotifiers) {
        try {
          const provider = getProvider(notifier.provider);
          if (!provider) {
            log.warn("Unknown provider", { provider: notifier.provider, notifierId: notifier.id });
            continue;
          }

          // Weekly digest: only send if today matches the configured digest_day
          if (notifier.digest_mode === "weekly") {
            const tzInfo = timesByTimezone.get(notifier.timezone);
            if (!tzInfo) continue;

            let todayDayOfWeek = 0;
            let endDateStr = "";
            try {
              todayDayOfWeek = new Date(tzInfo.date + "T00:00:00Z").getUTCDay();
              const endDate = new Date(tzInfo.date + "T00:00:00Z");
              endDate.setUTCDate(endDate.getUTCDate() + 7);
              endDateStr = endDate.toISOString().slice(0, 10);
            } catch (err) {
              log.warn("Failed to parse timezone date, skipping notifier", { tz: notifier.timezone, notifierId: notifier.id, err });
              continue;
            }

            if (notifier.digest_day !== todayDayOfWeek) {
              // Not the right day — skip without marking sent so we retry tomorrow
              continue;
            }

            const content = await getWeeklyContentCached(
              notifier.user_id,
              tzInfo.date,
              endDateStr
            );

            if (content.episodes.length === 0 && content.movies.length === 0) {
              await markNotifierSent(notifier.id, notifier.todayDate);
              continue;
            }

            const weeklyStart = Date.now();
            try {
              await provider.send(notifier.config, content);
              await recordDelivery({ notifierId: notifier.id, status: "success", latencyMs: Date.now() - weeklyStart, eventKind: "digest" });
              notificationsSentTotal.inc({ provider: notifier.provider, kind: "digest", outcome: "success" });
            } catch (sendErr) {
              await recordDelivery({ notifierId: notifier.id, status: "failure", latencyMs: Date.now() - weeklyStart, errorMessage: sendErr instanceof Error ? sendErr.message : String(sendErr), eventKind: "digest" });
              notificationsSentTotal.inc({ provider: notifier.provider, kind: "digest", outcome: "failure" });
              throw sendErr;
            }
            await markNotifierSent(notifier.id, notifier.todayDate);
            log.info("Sent weekly digest notification", { provider: notifier.provider, userId: notifier.user_id });
            continue;
          }

          // "off" mode: do nothing, just mark as sent to prevent re-firing
          if (notifier.digest_mode === "off") {
            await markNotifierSent(notifier.id, notifier.todayDate);
            continue;
          }

          // Default daily behavior
          const content = await getDailyContentCached(
            notifier.user_id,
            notifier.todayDate
          );

          // Skip if nothing to notify about
          if (content.episodes.length === 0 && content.movies.length === 0) {
            await markNotifierSent(notifier.id, notifier.todayDate);
            continue;
          }

          const dailyStart = Date.now();
          try {
            await provider.send(notifier.config, content);
            await recordDelivery({ notifierId: notifier.id, status: "success", latencyMs: Date.now() - dailyStart, eventKind: "episode_air" });
            notificationsSentTotal.inc({ provider: notifier.provider, kind: "daily", outcome: "success" });
          } catch (sendErr) {
            await recordDelivery({ notifierId: notifier.id, status: "failure", latencyMs: Date.now() - dailyStart, errorMessage: sendErr instanceof Error ? sendErr.message : String(sendErr), eventKind: "episode_air" });
            notificationsSentTotal.inc({ provider: notifier.provider, kind: "daily", outcome: "failure" });
            throw sendErr;
          }
          await markNotifierSent(notifier.id, notifier.todayDate);
          log.info("Sent notification", { provider: notifier.provider, userId: notifier.user_id });
        } catch (err) {
          if (err instanceof SubscriptionExpiredError) {
            log.warn("Push subscription expired, disabling notifier", { notifierId: notifier.id });
            await disableNotifier(notifier.id);
            continue;
          }
          log.error("Failed to send notification", { provider: notifier.provider, notifierId: notifier.id, userId: notifier.user_id, err });
        }
      }
    });
    handlerRegistered = true;
  }

  await refreshNotificationSchedule();
}
