import { and, eq } from "drizzle-orm";
import { getDb, hiddenActivityEvents } from "../schema";
import { traceDbQuery } from "../../tracing";
import type { ActivityType } from "./activity";

export async function hideActivityEvent(
  userId: string,
  eventKind: ActivityType,
  eventKey: string,
): Promise<void> {
  return traceDbQuery("hideActivityEvent", async () => {
    const db = getDb();
    await db
      .insert(hiddenActivityEvents)
      .values({ userId, eventKind, eventKey })
      .onConflictDoNothing()
      .run();
  });
}

export async function unhideActivityEvent(
  userId: string,
  eventKind: ActivityType,
  eventKey: string,
): Promise<void> {
  return traceDbQuery("unhideActivityEvent", async () => {
    const db = getDb();
    await db
      .delete(hiddenActivityEvents)
      .where(
        and(
          eq(hiddenActivityEvents.userId, userId),
          eq(hiddenActivityEvents.eventKind, eventKind),
          eq(hiddenActivityEvents.eventKey, eventKey),
        ),
      )
      .run();
  });
}

export async function getHiddenActivityEventKeys(userId: string): Promise<Set<string>> {
  return traceDbQuery("getHiddenActivityEventKeys", async () => {
    const db = getDb();
    const rows = await db
      .select({
        eventKind: hiddenActivityEvents.eventKind,
        eventKey: hiddenActivityEvents.eventKey,
      })
      .from(hiddenActivityEvents)
      .where(eq(hiddenActivityEvents.userId, userId))
      .all();
    return new Set(rows.map((r) => `${r.eventKind}::${r.eventKey}`));
  });
}
