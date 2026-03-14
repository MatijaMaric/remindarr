import { logger } from "../logger";
import { registerHandler } from "./worker";

const log = logger.child({ module: "notifications" });
import { registerCron } from "./queue";
import {
  getDueNotifiers,
  getDistinctNotifierTimezones,
  getEnabledNotifierSchedules,
  markNotifierSent,
} from "../db/repository";
import { getProvider } from "../notifications/registry";
import { buildNotificationContent } from "../notifications/content";

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

/**
 * Convert a time in a given timezone to server-local time.
 * Returns the equivalent hour and minute in the server's local timezone.
 */
export function convertToLocalTime(
  time: string,
  fromTz: string,
  now: Date = new Date()
): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);

  // Get current time in source timezone
  const tzFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: fromTz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const localFormatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [tzH, tzM] = tzFormatter.format(now).split(":").map(Number);
  const [localH, localM] = localFormatter.format(now).split(":").map(Number);

  // Offset = source_tz - server_local (in minutes)
  const tzMinutes = tzH * 60 + tzM;
  const localMinutes = localH * 60 + localM;
  let offset = tzMinutes - localMinutes;
  if (offset > 720) offset -= 1440;
  if (offset < -720) offset += 1440;

  // Convert target time: local_target = tz_target - offset
  let targetMinutes = h * 60 + m - offset;
  if (targetMinutes < 0) targetMinutes += 1440;
  if (targetMinutes >= 1440) targetMinutes -= 1440;

  return {
    hour: Math.floor(targetMinutes / 60),
    minute: targetMinutes % 60,
  };
}

/**
 * Compute a cron expression that fires only at times when notifications
 * could be due, based on all enabled notifiers' configured times and timezones.
 * Includes ±1 hour buffer around each computed hour to handle DST transitions.
 */
export function computeNotificationCron(): string | null {
  const schedules = getEnabledNotifierSchedules();
  if (schedules.length === 0) return null;

  const hours = new Set<number>();
  const minutes = new Set<number>();

  for (const { notify_time, timezone } of schedules) {
    try {
      const local = convertToLocalTime(notify_time, timezone);
      // Add ±1 hour buffer for DST transitions
      hours.add((local.hour - 1 + 24) % 24);
      hours.add(local.hour);
      hours.add((local.hour + 1) % 24);
      minutes.add(local.minute);
    } catch {
      // Invalid timezone — skip, will be warned at send time
    }
  }

  if (hours.size === 0 || minutes.size === 0) return null;

  const sortedMinutes = [...minutes].sort((a, b) => a - b);
  const sortedHours = [...hours].sort((a, b) => a - b);

  return `${sortedMinutes.join(",")} ${sortedHours.join(",")} * * *`;
}

let handlerRegistered = false;

export function registerNotificationJobs() {
  if (!handlerRegistered) {
    registerHandler("send-notifications", async () => {
      const timezones = getDistinctNotifierTimezones();
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

      const dueNotifiers = getDueNotifiers(timesByTimezone);
      if (dueNotifiers.length === 0) return;

      log.info("Processing due notifiers", { count: dueNotifiers.length });

      for (const notifier of dueNotifiers) {
        try {
          const provider = getProvider(notifier.provider);
          if (!provider) {
            log.warn("Unknown provider", { provider: notifier.provider, notifierId: notifier.id });
            continue;
          }

          const content = buildNotificationContent(
            notifier.user_id,
            notifier.todayDate
          );

          // Skip if nothing to notify about
          if (content.episodes.length === 0 && content.movies.length === 0) {
            markNotifierSent(notifier.id, notifier.todayDate);
            continue;
          }

          await provider.send(notifier.config, content);
          markNotifierSent(notifier.id, notifier.todayDate);
          log.info("Sent notification", { provider: notifier.provider, userId: notifier.user_id });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error("Failed to send notification", { provider: notifier.provider, notifierId: notifier.id, error: message });
        }
      }
    });
    handlerRegistered = true;
  }

  refreshNotificationSchedule();
}

/**
 * Recompute and re-register the notification cron schedule based on
 * currently enabled notifiers. Call this when notifiers are created,
 * updated, or deleted.
 */
export function refreshNotificationSchedule() {
  const cron = computeNotificationCron();
  if (cron) {
    registerCron("send-notifications", cron);
  } else {
    // No enabled notifiers — use a daily check as a fallback
    // (in case notifiers are added later, the CRUD routes will refresh)
    registerCron("send-notifications", "0 0 * * *");
  }
}
