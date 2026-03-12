import { registerHandler } from "./worker";
import { registerCron } from "./queue";
import {
  getDueNotifiers,
  getDistinctNotifierTimezones,
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

export function registerNotificationJobs() {
  registerHandler("send-notifications", async () => {
    const timezones = getDistinctNotifierTimezones();
    if (timezones.length === 0) return;

    // Compute current time for each timezone
    const timesByTimezone = new Map<string, { time: string; date: string }>();
    for (const tz of timezones) {
      try {
        timesByTimezone.set(tz, getCurrentTimeInTimezone(tz));
      } catch {
        console.warn(`[Notifications] Invalid timezone: ${tz}`);
      }
    }

    const dueNotifiers = getDueNotifiers(timesByTimezone);
    if (dueNotifiers.length === 0) return;

    console.log(
      `[Notifications] Processing ${dueNotifiers.length} due notifier(s)`
    );

    for (const notifier of dueNotifiers) {
      try {
        const provider = getProvider(notifier.provider);
        if (!provider) {
          console.warn(
            `[Notifications] Unknown provider "${notifier.provider}" for notifier ${notifier.id}`
          );
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
        console.log(
          `[Notifications] Sent ${notifier.provider} notification for user ${notifier.user_id}`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[Notifications] Failed to send ${notifier.provider} notification for notifier ${notifier.id}: ${message}`
        );
      }
    }
  });

  registerCron("send-notifications", "* * * * *");
}
