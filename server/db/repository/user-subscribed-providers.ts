import { eq, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { userSubscribedProviders, users, providers } from "../schema";
import { traceDbQuery } from "../../tracing";
import { canonicalProviderId } from "../../streaming-availability/provider-map";

export async function getSubscribedProviderIds(userId: string): Promise<number[]> {
  return traceDbQuery("getSubscribedProviderIds", async () => {
    const db = getDb();
    const rows = await db
      .select({ providerId: userSubscribedProviders.providerId })
      .from(userSubscribedProviders)
      .where(eq(userSubscribedProviders.userId, userId))
      .all();
    return rows.map((r) => r.providerId);
  });
}

export async function setSubscribedProviderIds(userId: string, providerIds: number[]): Promise<void> {
  return traceDbQuery("setSubscribedProviderIds", async () => {
    const db = getDb();
    const canonical = Array.from(new Set(providerIds.map(canonicalProviderId)));
    await db.delete(userSubscribedProviders).where(eq(userSubscribedProviders.userId, userId)).run();
    if (canonical.length > 0) {
      await db.insert(userSubscribedProviders)
        .values(canonical.map((providerId) => ({ userId, providerId })))
        .run();
    }
  });
}

export async function getOnlyMineFilter(userId: string): Promise<boolean> {
  return traceDbQuery("getOnlyMineFilter", async () => {
    const db = getDb();
    const row = await db
      .select({ onlyMineFilter: users.onlyMineFilter })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return (row?.onlyMineFilter ?? 0) !== 0;
  });
}

export async function setOnlyMineFilter(userId: string, value: boolean): Promise<void> {
  return traceDbQuery("setOnlyMineFilter", async () => {
    const db = getDb();
    await db.update(users).set({ onlyMineFilter: value ? 1 : 0 }).where(eq(users.id, userId)).run();
  });
}

/** Returns the subset of providerIds that actually exist in the providers table. */
export async function filterValidProviderIds(providerIds: number[]): Promise<number[]> {
  if (providerIds.length === 0) return [];
  return traceDbQuery("filterValidProviderIds", async () => {
    const db = getDb();
    const rows = await db
      .select({ id: providers.id })
      .from(providers)
      .where(inArray(providers.id, providerIds))
      .all();
    return rows.map((r) => r.id);
  });
}
