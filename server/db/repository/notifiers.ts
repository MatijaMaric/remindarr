import { eq, and, sql, asc } from "drizzle-orm";
import { getDb } from "../schema";
import { notifiers } from "../schema";
import { logger } from "../../logger";
import { traceDbQuery } from "../../tracing";

const log = logger.child({ module: "repository" });

export async function createNotifier(
  userId: string,
  provider: string,
  name: string,
  config: Record<string, string>,
  notifyTime: string,
  timezone: string,
  digestMode?: string | null,
  digestDay?: number | null,
  streamingAlertsEnabled = true,
  opts?: {
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    quietHoursDays?: string;
    leavingSoonAlertsEnabled?: boolean;
    friendActivityAlertsEnabled?: boolean;
  }
): Promise<string> {
  return traceDbQuery("createNotifier", async () => {
    const db = getDb();
    const id = crypto.randomUUID();
    await db.insert(notifiers)
      .values({
        id,
        userId,
        provider,
        name,
        config: JSON.stringify(config),
        notifyTime,
        timezone,
        digestMode: digestMode ?? null,
        digestDay: digestDay ?? null,
        streamingAlertsEnabled: streamingAlertsEnabled ? 1 : 0,
        quietHoursStart: opts?.quietHoursStart ?? null,
        quietHoursEnd: opts?.quietHoursEnd ?? null,
        quietHoursDays: opts?.quietHoursDays ?? "",
        leavingSoonAlertsEnabled: (opts?.leavingSoonAlertsEnabled ?? true) ? 1 : 0,
        friendActivityAlertsEnabled: (opts?.friendActivityAlertsEnabled ?? false) ? 1 : 0,
      })
      .run();
    return id;
  });
}

export async function updateNotifier(
  id: string,
  userId: string,
  updates: {
    name?: string;
    config?: Record<string, string>;
    notifyTime?: string;
    timezone?: string;
    enabled?: boolean;
    digestMode?: string | null;
    digestDay?: number | null;
    streamingAlertsEnabled?: boolean;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    quietHoursDays?: string;
    leavingSoonAlertsEnabled?: boolean;
    friendActivityAlertsEnabled?: boolean;
  }
) {
  return traceDbQuery("updateNotifier", async () => {
    const db = getDb();
    const set: Record<string, unknown> = { updatedAt: sql`datetime('now')` };
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.config !== undefined) set.config = JSON.stringify(updates.config);
    if (updates.notifyTime !== undefined) set.notifyTime = updates.notifyTime;
    if (updates.timezone !== undefined) set.timezone = updates.timezone;
    if (updates.enabled !== undefined) set.enabled = updates.enabled ? 1 : 0;
    if ("digestMode" in updates) set.digestMode = updates.digestMode ?? null;
    if ("digestDay" in updates) set.digestDay = updates.digestDay ?? null;
    if (updates.streamingAlertsEnabled !== undefined) set.streamingAlertsEnabled = updates.streamingAlertsEnabled ? 1 : 0;
    if ("quietHoursStart" in updates) set.quietHoursStart = updates.quietHoursStart ?? null;
    if ("quietHoursEnd" in updates) set.quietHoursEnd = updates.quietHoursEnd ?? null;
    if (updates.quietHoursDays !== undefined) set.quietHoursDays = updates.quietHoursDays;
    if (updates.leavingSoonAlertsEnabled !== undefined) set.leavingSoonAlertsEnabled = updates.leavingSoonAlertsEnabled ? 1 : 0;
    if (updates.friendActivityAlertsEnabled !== undefined) set.friendActivityAlertsEnabled = updates.friendActivityAlertsEnabled ? 1 : 0;

    await db.update(notifiers)
      .set(set)
      .where(and(eq(notifiers.id, id), eq(notifiers.userId, userId)))
      .run();
  });
}

export async function deleteNotifier(id: string, userId: string) {
  return traceDbQuery("deleteNotifier", async () => {
    const db = getDb();
    await db.delete(notifiers)
      .where(and(eq(notifiers.id, id), eq(notifiers.userId, userId)))
      .run();
  });
}

export async function getNotifiersByUser(userId: string) {
  return traceDbQuery("getNotifiersByUser", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: notifiers.id,
        user_id: notifiers.userId,
        provider: notifiers.provider,
        name: notifiers.name,
        config: notifiers.config,
        notify_time: notifiers.notifyTime,
        timezone: notifiers.timezone,
        enabled: notifiers.enabled,
        last_sent_date: notifiers.lastSentDate,
        digest_mode: notifiers.digestMode,
        digest_day: notifiers.digestDay,
        streaming_alerts_enabled: notifiers.streamingAlertsEnabled,
        quiet_hours_start: notifiers.quietHoursStart,
        quiet_hours_end: notifiers.quietHoursEnd,
        quiet_hours_days: notifiers.quietHoursDays,
        leaving_soon_alerts_enabled: notifiers.leavingSoonAlertsEnabled,
        friend_activity_alerts_enabled: notifiers.friendActivityAlertsEnabled,
        created_at: notifiers.createdAt,
        updated_at: notifiers.updatedAt,
      })
      .from(notifiers)
      .where(eq(notifiers.userId, userId))
      .orderBy(asc(notifiers.createdAt))
      .all();

    return rows.map((row) => {
      let config: Record<string, string>;
      try {
        config = JSON.parse(row.config);
      } catch {
        log.warn("Failed to parse notifier config", { id: row.id });
        config = {};
      }
      return {
        ...row,
        config,
        enabled: Boolean(row.enabled),
        streaming_alerts_enabled: Boolean(row.streaming_alerts_enabled),
        leaving_soon_alerts_enabled: Boolean(row.leaving_soon_alerts_enabled),
        friend_activity_alerts_enabled: Boolean(row.friend_activity_alerts_enabled),
      };
    });
  });
}

export async function getNotifierById(id: string, userId: string) {
  return traceDbQuery("getNotifierById", async () => {
    const db = getDb();
    const row = await db
      .select({
        id: notifiers.id,
        user_id: notifiers.userId,
        provider: notifiers.provider,
        name: notifiers.name,
        config: notifiers.config,
        notify_time: notifiers.notifyTime,
        timezone: notifiers.timezone,
        enabled: notifiers.enabled,
        last_sent_date: notifiers.lastSentDate,
        digest_mode: notifiers.digestMode,
        digest_day: notifiers.digestDay,
        streaming_alerts_enabled: notifiers.streamingAlertsEnabled,
        quiet_hours_start: notifiers.quietHoursStart,
        quiet_hours_end: notifiers.quietHoursEnd,
        quiet_hours_days: notifiers.quietHoursDays,
        leaving_soon_alerts_enabled: notifiers.leavingSoonAlertsEnabled,
        friend_activity_alerts_enabled: notifiers.friendActivityAlertsEnabled,
        created_at: notifiers.createdAt,
        updated_at: notifiers.updatedAt,
      })
      .from(notifiers)
      .where(and(eq(notifiers.id, id), eq(notifiers.userId, userId)))
      .get();

    if (!row) return null;
    let config: Record<string, string>;
    try {
      config = JSON.parse(row.config);
    } catch {
      log.warn("Failed to parse notifier config", { id: row.id });
      config = {};
    }
    return {
      ...row,
      config,
      enabled: Boolean(row.enabled),
      streaming_alerts_enabled: Boolean(row.streaming_alerts_enabled),
      leaving_soon_alerts_enabled: Boolean(row.leaving_soon_alerts_enabled),
      friend_activity_alerts_enabled: Boolean(row.friend_activity_alerts_enabled),
    };
  });
}

/** Returns true if the current time (HH:MM) falls within the quiet window. */
function isInQuietWindow(currentTime: string, start: string, end: string): boolean {
  if (start === end) return false;
  if (start < end) {
    return currentTime >= start && currentTime < end;
  }
  // Wraps midnight: quiet from e.g. 23:00 to 08:00
  return currentTime >= start || currentTime < end;
}

/** Parses a CSV day string ("0,1,6") into a Set of day numbers. Empty string → all days. */
function parseQuietDays(csv: string): Set<number> | null {
  if (!csv) return null;
  const nums = csv.split(",").map(Number).filter((n) => n >= 0 && n <= 6);
  return nums.length > 0 ? new Set(nums) : null;
}

export async function getDueNotifiers(
  timesByTimezone: Map<string, { time: string; date: string; dayOfWeek: number }>
) {
  return traceDbQuery("getDueNotifiers", async () => {
    const db = getDb();

    // Get all enabled notifiers
    const allEnabled = await db
      .select({
        id: notifiers.id,
        user_id: notifiers.userId,
        provider: notifiers.provider,
        name: notifiers.name,
        config: notifiers.config,
        notify_time: notifiers.notifyTime,
        timezone: notifiers.timezone,
        last_sent_date: notifiers.lastSentDate,
        digest_mode: notifiers.digestMode,
        digest_day: notifiers.digestDay,
        streaming_alerts_enabled: notifiers.streamingAlertsEnabled,
        quiet_hours_start: notifiers.quietHoursStart,
        quiet_hours_end: notifiers.quietHoursEnd,
        quiet_hours_days: notifiers.quietHoursDays,
        leaving_soon_alerts_enabled: notifiers.leavingSoonAlertsEnabled,
        friend_activity_alerts_enabled: notifiers.friendActivityAlertsEnabled,
      })
      .from(notifiers)
      .where(eq(notifiers.enabled, 1))
      .all();

    // Filter in JS: match notify_time to current time in their timezone,
    // ensure we haven't already sent today, and respect quiet hours
    return allEnabled
      .filter((n) => {
        const tzInfo = timesByTimezone.get(n.timezone);
        if (!tzInfo) return false;
        if (n.notify_time !== tzInfo.time) return false;
        if (n.last_sent_date === tzInfo.date) return false;

        // Quiet hours: skip if configured and current time is within the window
        if (n.quiet_hours_start && n.quiet_hours_end) {
          const days = parseQuietDays(n.quiet_hours_days ?? "");
          const dayMatches = days === null || days.has(tzInfo.dayOfWeek);
          if (dayMatches && isInQuietWindow(tzInfo.time, n.quiet_hours_start, n.quiet_hours_end)) {
            return false;
          }
        }

        return true;
      })
      .map((n) => {
        let config: Record<string, string>;
        try {
          config = JSON.parse(n.config);
        } catch {
          log.warn("Failed to parse notifier config", { id: n.id });
          config = {};
        }
        return {
          ...n,
          config,
          todayDate: timesByTimezone.get(n.timezone)!.date,
          streaming_alerts_enabled: Boolean(n.streaming_alerts_enabled),
          leaving_soon_alerts_enabled: Boolean(n.leaving_soon_alerts_enabled),
          friend_activity_alerts_enabled: Boolean(n.friend_activity_alerts_enabled),
        };
      });
  });
}

export async function disableNotifier(id: string) {
  return traceDbQuery("disableNotifier", async () => {
    const db = getDb();
    await db.update(notifiers)
      .set({ enabled: 0, updatedAt: sql`datetime('now')` })
      .where(eq(notifiers.id, id))
      .run();
  });
}

export async function markNotifierSent(id: string, date: string) {
  return traceDbQuery("markNotifierSent", async () => {
    const db = getDb();
    await db.update(notifiers)
      .set({ lastSentDate: date, updatedAt: sql`datetime('now')` })
      .where(eq(notifiers.id, id))
      .run();
  });
}

export async function getDistinctNotifierTimezones(): Promise<string[]> {
  return traceDbQuery("getDistinctNotifierTimezones", async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({ timezone: notifiers.timezone })
      .from(notifiers)
      .where(eq(notifiers.enabled, 1))
      .all();
    return rows.map((r) => r.timezone);
  });
}

export async function getEnabledNotifierSchedules(): Promise<{ notify_time: string; timezone: string }[]> {
  return traceDbQuery("getEnabledNotifierSchedules", async () => {
    const db = getDb();
    const rows = await db
      .selectDistinct({
        notify_time: notifiers.notifyTime,
        timezone: notifiers.timezone,
      })
      .from(notifiers)
      .where(eq(notifiers.enabled, 1))
      .all();
    return rows;
  });
}

/**
 * Returns all enabled notifiers for a user that have streaming alerts enabled.
 * Used during sync to dispatch streaming availability notifications.
 */
export async function getStreamingAlertNotifiersForUser(userId: string) {
  return traceDbQuery("getStreamingAlertNotifiersForUser", async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: notifiers.id,
        user_id: notifiers.userId,
        provider: notifiers.provider,
        config: notifiers.config,
      })
      .from(notifiers)
      .where(and(eq(notifiers.userId, userId), eq(notifiers.enabled, 1), eq(notifiers.streamingAlertsEnabled, 1)))
      .all();
    return rows.map((row) => {
      let config: Record<string, string>;
      try {
        config = JSON.parse(row.config);
      } catch {
        log.warn("Failed to parse notifier config", { id: row.id });
        config = {};
      }
      return { ...row, config };
    });
  });
}
