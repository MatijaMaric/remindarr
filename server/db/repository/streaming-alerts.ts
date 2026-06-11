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
  kind: "arrival" | "departure" = "arrival",
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
          inArray(streamingAlerts.providerId, providerIds),
        ),
      )
      .all();
    const alerted = new Set(alreadyAlerted.map((r) => r.providerId));
    return providerIds.filter((id) => !alerted.has(id));
  });
}

/**
 * Bulk variant of getUnalertedProviders for many users at once. Returns, for
 * EVERY input userId (each is present as a key even when fully alerted), the
 * providerIds NOT yet alerted for the given (titleId, kind).
 */
export async function getUnalertedProvidersBulk(
  userIds: string[],
  titleId: string,
  providerIds: number[],
  kind: "arrival" | "departure" = "arrival",
): Promise<Map<string, number[]>> {
  return traceDbQuery("getUnalertedProvidersBulk", async () => {
    // Seed every user with the full provider list; alerted pairs are
    // subtracted below, so users with no alert rows keep all providers.
    const pending = new Map<string, Set<number>>();
    for (const userId of userIds) {
      pending.set(userId, new Set(providerIds));
    }

    if (userIds.length > 0 && providerIds.length > 0) {
      const db = getDb();
      // D1 caps bound parameters at 100 per statement; titleId + kind take 2
      // slots and providerIds take providerIds.length, so chunk the userIds
      // to stay under the cap.
      const chunkSize = Math.max(1, 97 - providerIds.length);
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const alreadyAlerted = await db
          .select({
            userId: streamingAlerts.userId,
            providerId: streamingAlerts.providerId,
          })
          .from(streamingAlerts)
          .where(
            and(
              eq(streamingAlerts.titleId, titleId),
              eq(streamingAlerts.kind, kind),
              inArray(streamingAlerts.userId, chunk),
              inArray(streamingAlerts.providerId, providerIds),
            ),
          )
          .all();
        for (const row of alreadyAlerted) {
          pending.get(row.userId)?.delete(row.providerId);
        }
      }
    }

    const result = new Map<string, number[]>();
    for (const [userId, unalerted] of pending) {
      result.set(
        userId,
        providerIds.filter((id) => unalerted.has(id)),
      );
    }
    return result;
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
  kind: "arrival" | "departure" = "arrival",
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
  titleId: string,
): Promise<
  Array<{ userId: string; providerId: number; providerName: string }>
> {
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
          eq(streamingAlerts.kind, "arrival"),
        ),
      )
      .all();
  });
}
