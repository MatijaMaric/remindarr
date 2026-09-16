/**
 * Portable notification scheduling logic.
 *
 * This module is intentionally free of bun:sqlite dependencies so that
 * the CF Workers entry point can import it without pulling in Bun-only code.
 * The actual cron registration is injected via setScheduleCallback().
 */
import { logger } from "../logger";
import { getEnabledNotifierSchedules } from "../db/repository";
import { getCurrentTimeInTimezone } from "./time-utils";

const log = logger.child({ module: "schedule" });

type ScheduleCallback = (name: string, cron: string) => void;
let scheduleCallback: ScheduleCallback | null = null;

/**
 * Register the function that persists cron schedules (e.g. registerCron from queue.ts).
 * On CF Workers this is never called, so refreshNotificationSchedule becomes a no-op.
 */
export function setScheduleCallback(cb: ScheduleCallback) {
  scheduleCallback = cb;
}

/**
 * Convert a time in a given timezone to server-local time.
 * Returns the equivalent hour and minute in the server's local timezone.
 */
export function convertToLocalTime(
  time: string,
  fromTz: string,
  now: Date = new Date(),
): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);

  // Get current time in source timezone (with UTC fallback for invalid TZ)
  const { time: tzTime } = getCurrentTimeInTimezone(fromTz, now);

  // Get current time in server-local timezone
  const localFormatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [tzH, tzM] = tzTime.split(":").map(Number);
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
 * Check due notifications every minute while any destination is enabled.
 * This also retries failures and resumes sends deferred by quiet hours.
 */
export async function computeNotificationCron(): Promise<string | null> {
  const schedules = await getEnabledNotifierSchedules();
  if (schedules.length === 0) return null;

  // Poll each minute so retries and quiet-hour deferrals stay eligible today.
  return "* * * * *";
}

/**
 * Recompute and re-register the notification cron schedule based on
 * currently enabled notifiers. Call this when notifiers are created,
 * updated, or deleted.
 *
 * On CF Workers (where no callback is registered), this is a no-op
 * because cron triggers are defined statically in wrangler.toml.
 */
export async function refreshNotificationSchedule() {
  if (!scheduleCallback) {
    log.debug("No schedule callback registered, skipping cron update");
    return;
  }
  const cron = await computeNotificationCron();
  if (cron) {
    scheduleCallback("send-notifications", cron);
  } else {
    // No enabled notifiers — use a daily check as a fallback
    // (in case notifiers are added later, the CRUD routes will refresh)
    scheduleCallback("send-notifications", "0 0 * * *");
  }
}
