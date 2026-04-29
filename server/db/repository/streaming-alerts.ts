import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { streamingAlerts } from "../schema";
import { traceDbQuery } from "../../tracing";

/**
 * Returns the subset of providerIds that have NOT yet been alerted for
 * the given (userId, titleId, kind) combination.
 */
export async function getUnalertedProviders(
  userId: string,
  titleId: string,
  providerIds: number[],
  kind: "arrival" | "departure" = "arrival"
): Promise<number[]> {
  return traceDbQuery("getUnalertedProviders", async () => {
    if (providerIds.length === 0) return [];
    const db = getDb();
    const alreadyAlerted = await db
      .select({ providerId: streamingAlerts.providerId })
      .from(streamingAlerts)
      .where(
        and(
          eq(streamingAlerts.userId, userId),
          eq(streamingAlerts.titleId, titleId),
          eq(streamingAlerts.kind, kind),
          inArray(streamingAlerts.providerId, providerIds)
        )
      )
      .all();
    const alerted = new Set(alreadyAlerted.map((r) => r.providerId));
    return providerIds.filter((id) => !alerted.has(id));
  });
}

/**
 * Marks a (userId, titleId, providerId, kind) quadruple as alerted so we don't
 * send duplicate notifications.
 */
export async function markAlerted(
  userId: string,
  titleId: string,
  providerId: number,
  providerName: string,
  kind: "arrival" | "departure" = "arrival"
): Promise<void> {
  return traceDbQuery("markAlerted", async () => {
    const db = getDb();
    await db
      .insert(streamingAlerts)
      .values({
        id: crypto.randomUUID(),
        userId,
        titleId,
        providerId,
        providerName,
        kind,
      })
      .onConflictDoNothing()
      .run();
  });
}

/**
 * Returns all (userId, titleId, providerId) triples that have an arrival alert
 * for a given titleId. Used by the departure checker to know which providers
 * were historically available.
 */
export async function getArrivalAlertedProviders(
  titleId: string
): Promise<Array<{ userId: string; providerId: number; providerName: string }>> {
  return traceDbQuery("getArrivalAlertedProviders", async () => {
    const db = getDb();
    return await db
      .select({
        userId: streamingAlerts.userId,
        providerId: streamingAlerts.providerId,
        providerName: streamingAlerts.providerName,
      })
      .from(streamingAlerts)
      .where(
        and(
          eq(streamingAlerts.titleId, titleId),
          eq(streamingAlerts.kind, "arrival")
        )
      )
      .all();
  });
}
