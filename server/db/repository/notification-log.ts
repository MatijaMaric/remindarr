import { eq, desc, and, gte, sql } from "drizzle-orm";
import { getDb, notificationLog } from "../schema";
import { traceDbQuery } from "../../tracing";

export type NotificationLogRow = {
  id: number;
  notifierId: string;
  attemptedAt: Date;
  status: "success" | "failure" | "skipped";
  latencyMs: number | null;
  httpStatus: number | null;
  errorMessage: string | null;
  eventKind: string | null;
};

/**
 * Records a single notification delivery attempt.
 */
export async function recordDelivery(params: {
  notifierId: string;
  status: "success" | "failure" | "skipped";
  latencyMs?: number;
  httpStatus?: number;
  errorMessage?: string;
  eventKind?: string;
}): Promise<void> {
  return traceDbQuery("recordDelivery", async () => {
    const db = getDb();
    await db
      .insert(notificationLog)
      .values({
        notifierId: params.notifierId,
        attemptedAt: new Date(),
        status: params.status,
        latencyMs: params.latencyMs ?? null,
        httpStatus: params.httpStatus ?? null,
        errorMessage: params.errorMessage ?? null,
        eventKind: params.eventKind ?? null,
      })
      .run();
  });
}

/**
 * Returns the most recent `n` log rows for a notifier, newest first.
 */
export async function getRecentForNotifier(
  notifierId: string,
  n = 5
): Promise<NotificationLogRow[]> {
  return traceDbQuery("getRecentForNotifier", async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.notifierId, notifierId))
      .orderBy(desc(notificationLog.attemptedAt))
      .limit(n)
      .all();
    return rows as NotificationLogRow[];
  });
}

/**
 * Returns the success rate (0-100) for a notifier over the last `days` days.
 * Only success/failure rows count; skipped rows are excluded.
 */
export async function getSuccessRateForNotifier(
  notifierId: string,
  days = 7
): Promise<number> {
  return traceDbQuery("getSuccessRateForNotifier", async () => {
    const db = getDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db
      .select()
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.notifierId, notifierId),
          gte(notificationLog.attemptedAt, cutoff)
        )
      )
      .all();

    // Filter out "skipped" from the rate calculation
    const relevant = rows.filter(
      (r) => r.status === "success" || r.status === "failure"
    );

    if (relevant.length === 0) return 100; // no data → assume healthy
    const successes = relevant.filter((r) => r.status === "success").length;
    return Math.round((successes / relevant.length) * 100);
  });
}

/**
 * Prunes old rows, keeping at most 200 rows per notifier.
 * Runs as a maintenance job to bound table growth.
 */
export async function pruneOldRows(): Promise<void> {
  return traceDbQuery("pruneOldRows", async () => {
    const db = getDb();

    // Get distinct notifier IDs that have more than 200 rows
    const counts = await db
      .select({
        notifierId: notificationLog.notifierId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(notificationLog)
      .groupBy(notificationLog.notifierId)
      .all();

    for (const { notifierId, count } of counts) {
      if (count <= 200) continue;

      // Find the ID cutoff: keep the 200 most recent rows
      const cutoffRow = await db
        .select({ id: notificationLog.id })
        .from(notificationLog)
        .where(eq(notificationLog.notifierId, notifierId))
        .orderBy(desc(notificationLog.id))
        .limit(1)
        .offset(199)
        .get();

      if (!cutoffRow) continue;

      await db
        .delete(notificationLog)
        .where(
          and(
            eq(notificationLog.notifierId, notifierId),
            sql`${notificationLog.id} < ${cutoffRow.id}`
          )
        )
        .run();
    }
  });
}
