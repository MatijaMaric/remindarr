import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { streamingAlerts } from "../schema";
import { traceDbQuery } from "../../tracing";

/**
 * Returns the subset of providerIds that have NOT yet been alerted for
 * the given (userId, titleId) combination.
 */
export async function getUnalertedProviders(
  userId: string,
  titleId: string,
  providerIds: number[]
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
          inArray(streamingAlerts.providerId, providerIds)
        )
      )
      .all();
    const alerted = new Set(alreadyAlerted.map((r) => r.providerId));
    return providerIds.filter((id) => !alerted.has(id));
  });
}

/**
 * Marks a (userId, titleId, providerId) triple as alerted so we don't
 * send duplicate notifications.
 */
export async function markAlerted(
  userId: string,
  titleId: string,
  providerId: number,
  providerName: string
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
      })
      .onConflictDoNothing()
      .run();
  });
}
