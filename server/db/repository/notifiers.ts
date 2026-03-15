import { eq, and, sql, asc } from "drizzle-orm";
import { getDb, getRawDb } from "../schema";
import { notifiers } from "../schema";
import { logger } from "../../logger";
import { traceDbQuery } from "../../tracing";

const log = logger.child({ module: "repository" });

export function createNotifier(
  userId: string,
  provider: string,
  name: string,
  config: Record<string, string>,
  notifyTime: string,
  timezone: string
): string {
  return traceDbQuery("createNotifier", () => {
    const db = getDb();
    const id = crypto.randomUUID();
    db.insert(notifiers)
      .values({
        id,
        userId,
        provider,
        name,
        config: JSON.stringify(config),
        notifyTime,
        timezone,
      })
      .run();
    return id;
  });
}

export function updateNotifier(
  id: string,
  userId: string,
  updates: {
    name?: string;
    config?: Record<string, string>;
    notifyTime?: string;
    timezone?: string;
    enabled?: boolean;
  }
) {
  return traceDbQuery("updateNotifier", () => {
    const db = getDb();
    const set: Record<string, any> = { updatedAt: sql`datetime('now')` };
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.config !== undefined) set.config = JSON.stringify(updates.config);
    if (updates.notifyTime !== undefined) set.notifyTime = updates.notifyTime;
    if (updates.timezone !== undefined) set.timezone = updates.timezone;
    if (updates.enabled !== undefined) set.enabled = updates.enabled ? 1 : 0;

    db.update(notifiers)
      .set(set)
      .where(and(eq(notifiers.id, id), eq(notifiers.userId, userId)))
      .run();
  });
}

export function deleteNotifier(id: string, userId: string) {
  return traceDbQuery("deleteNotifier", () => {
    const db = getDb();
    db.delete(notifiers)
      .where(and(eq(notifiers.id, id), eq(notifiers.userId, userId)))
      .run();
  });
}

export function getNotifiersByUser(userId: string) {
  return traceDbQuery("getNotifiersByUser", () => {
    const db = getDb();
    return db
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
        created_at: notifiers.createdAt,
        updated_at: notifiers.updatedAt,
      })
      .from(notifiers)
      .where(eq(notifiers.userId, userId))
      .orderBy(asc(notifiers.createdAt))
      .all()
      .map((row) => {
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
        };
      });
  });
}

export function getNotifierById(id: string, userId: string) {
  return traceDbQuery("getNotifierById", () => {
    const db = getDb();
    const row = db
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
    };
  });
}

export function getDueNotifiers(
  timesByTimezone: Map<string, { time: string; date: string }>
) {
  return traceDbQuery("getDueNotifiers", () => {
    const db = getDb();

    // Get all enabled notifiers
    const allEnabled = db
      .select({
        id: notifiers.id,
        user_id: notifiers.userId,
        provider: notifiers.provider,
        name: notifiers.name,
        config: notifiers.config,
        notify_time: notifiers.notifyTime,
        timezone: notifiers.timezone,
        last_sent_date: notifiers.lastSentDate,
      })
      .from(notifiers)
      .where(eq(notifiers.enabled, 1))
      .all();

    // Filter in JS: match notify_time to current time in their timezone,
    // and ensure we haven't already sent today
    return allEnabled
      .filter((n) => {
        const tzInfo = timesByTimezone.get(n.timezone);
        if (!tzInfo) return false;
        return n.notify_time === tzInfo.time && n.last_sent_date !== tzInfo.date;
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
        };
      });
  });
}

export function disableNotifier(id: string) {
  return traceDbQuery("disableNotifier", () => {
    const db = getDb();
    db.update(notifiers)
      .set({ enabled: 0, updatedAt: sql`datetime('now')` })
      .where(eq(notifiers.id, id))
      .run();
  });
}

export function markNotifierSent(id: string, date: string) {
  return traceDbQuery("markNotifierSent", () => {
    const db = getDb();
    db.update(notifiers)
      .set({ lastSentDate: date, updatedAt: sql`datetime('now')` })
      .where(eq(notifiers.id, id))
      .run();
  });
}

export function getDistinctNotifierTimezones(): string[] {
  return traceDbQuery("getDistinctNotifierTimezones", () => {
    const raw = getRawDb();
    const rows = raw
      .prepare("SELECT DISTINCT timezone FROM notifiers WHERE enabled = 1")
      .all() as { timezone: string }[];
    return rows.map((r) => r.timezone);
  });
}

export function getEnabledNotifierSchedules(): { notify_time: string; timezone: string }[] {
  return traceDbQuery("getEnabledNotifierSchedules", () => {
    const raw = getRawDb();
    return raw
      .prepare("SELECT DISTINCT notify_time, timezone FROM notifiers WHERE enabled = 1")
      .all() as { notify_time: string; timezone: string }[];
  });
}
