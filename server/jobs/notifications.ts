import { logger } from "../logger";
import { registerHandler } from "./worker";
import {
  getDueNotifiers,
  getDistinctNotifierTimezones,
  markNotifierSent,
  disableNotifier,
} from "../db/repository";
import { getProvider } from "../notifications/registry";
import { buildNotificationContent } from "../notifications/content";
import { SubscriptionExpiredError } from "../notifications/webpush";
import { refreshNotificationSchedule } from "./schedule";

// Re-export portable scheduling functions for backward compatibility (tests import from here)
export { convertToLocalTime, computeNotificationCron, refreshNotificationSchedule } from "./schedule";

const log = logger.child({ module: "notifications" });

function getCurrentTimeInTimezone(tz: string): { time: string; date: string } {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return {
    time: timeFormatter.format(now), // "09:00"
    date: dateFormatter.format(now), // "2026-03-12"
  };
}

let handlerRegistered = false;

export async function registerNotificationJobs() {
  if (!handlerRegistered) {
    registerHandler("send-notifications", async () => {
      const timezones = await getDistinctNotifierTimezones();
      if (timezones.length === 0) return;

      // Compute current time for each timezone
      const timesByTimezone = new Map<string, { time: string; date: string }>();
      for (const tz of timezones) {
        try {
          timesByTimezone.set(tz, getCurrentTimeInTimezone(tz));
        } catch {
          log.warn("Invalid timezone", { timezone: tz });
        }
      }

      const dueNotifiers = await getDueNotifiers(timesByTimezone);
      if (dueNotifiers.length === 0) return;

      log.info("Processing due notifiers", { count: dueNotifiers.length });

      for (const notifier of dueNotifiers) {
        try {
          const provider = getProvider(notifier.provider);
          if (!provider) {
            log.warn("Unknown provider", { provider: notifier.provider, notifierId: notifier.id });
            continue;
          }

          const content = await buildNotificationContent(
            notifier.user_id,
            notifier.todayDate
          );

          // Skip if nothing to notify about
          if (content.episodes.length === 0 && content.movies.length === 0) {
            await markNotifierSent(notifier.id, notifier.todayDate);
            continue;
          }

          await provider.send(notifier.config, content);
          await markNotifierSent(notifier.id, notifier.todayDate);
          log.info("Sent notification", { provider: notifier.provider, userId: notifier.user_id });
        } catch (err) {
          if (err instanceof SubscriptionExpiredError) {
            log.warn("Push subscription expired, disabling notifier", { notifierId: notifier.id });
            await disableNotifier(notifier.id);
            continue;
          }
          const message = err instanceof Error ? err.message : String(err);
          log.error("Failed to send notification", { provider: notifier.provider, notifierId: notifier.id, error: message });
        }
      }
    });
    handlerRegistered = true;
  }

  await refreshNotificationSchedule();
}
