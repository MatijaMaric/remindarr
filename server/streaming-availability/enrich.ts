import { eq, sql } from "drizzle-orm";
import { getDb, offers, titles, providers } from "../db/schema";
import { logger } from "../logger";
import { CONFIG } from "../config";
import { fetchStreamingOptions } from "./client";
import { SA_TO_TMDB_PROVIDER, mapSAMonetizationType } from "./provider-map";
import type { SAStreamingOption } from "./types";
import { traceDbQuery } from "../tracing";

const log = logger.child({ module: "sa-enrich" });

/**
 * Resolve a SA service ID to a TMDB provider ID.
 * First checks the static map, then falls back to matching against providers.technical_name.
 */
async function resolveProviderId(
  serviceId: string,
  providerCache: Map<string, number>,
): Promise<number | null> {
  const staticId = SA_TO_TMDB_PROVIDER.get(serviceId);
  if (staticId !== undefined) return staticId;

  if (providerCache.has(serviceId)) return providerCache.get(serviceId)!;

  const db = getDb();
  const normalized = serviceId.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const row = await db
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.technicalName, normalized))
    .get();

  if (row) {
    providerCache.set(serviceId, row.id);
    return row.id;
  }

  providerCache.set(serviceId, -1);
  return null;
}

/**
 * Enrich a single title's offers with deep links from the Streaming Availability API.
 * Returns the number of offers updated.
 */
export async function enrichTitleDeepLinks(
  titleId: string,
  tmdbId: number,
  objectType: "MOVIE" | "SHOW",
): Promise<number> {
  const country = CONFIG.COUNTRY;
  const saOptions = await fetchStreamingOptions(tmdbId, objectType, country);

  if (saOptions.length === 0) {
    await markSaFetched(titleId);
    return 0;
  }

  const db = getDb();
  const existingOffers = await traceDbQuery("getOffersForEnrich", () =>
    db
      .select({
        id: offers.id,
        providerId: offers.providerId,
        monetizationType: offers.monetizationType,
      })
      .from(offers)
      .where(eq(offers.titleId, titleId))
      .all(),
  );

  if (existingOffers.length === 0) {
    await markSaFetched(titleId);
    return 0;
  }

  const providerCache = new Map<string, number>();
  let updated = 0;

  for (const saOption of saOptions) {
    const providerId = await resolveProviderId(saOption.service.id, providerCache);
    if (providerId === null) {
      log.debug("Unmapped SA provider", {
        serviceId: saOption.service.id,
        serviceName: saOption.service.name,
        titleId,
      });
      continue;
    }

    const monetizationType = mapSAMonetizationType(saOption.type);

    const matchingOffer = existingOffers.find(
      (o) => o.providerId === providerId && o.monetizationType === monetizationType,
    );

    if (!matchingOffer) {
      // Try matching by provider only (ignore monetization type)
      const providerMatch = existingOffers.find((o) => o.providerId === providerId);
      if (providerMatch) {
        await updateOfferDeepLink(providerMatch.id, saOption.link);
        updated++;
      }
      continue;
    }

    await updateOfferDeepLink(matchingOffer.id, saOption.link);
    updated++;
  }

  await markSaFetched(titleId);
  log.debug("Enriched title deep links", { titleId, updated, saOptions: saOptions.length });
  return updated;
}

async function updateOfferDeepLink(offerId: number, deepLink: string): Promise<void> {
  return traceDbQuery("updateOfferDeepLink", async () => {
    const db = getDb();
    await db
      .update(offers)
      .set({ deepLink })
      .where(eq(offers.id, offerId))
      .run();
  });
}

async function markSaFetched(titleId: string): Promise<void> {
  return traceDbQuery("markSaFetched", async () => {
    const db = getDb();
    await db
      .update(titles)
      .set({ saFetchedAt: sql`datetime('now')` })
      .where(eq(titles.id, titleId))
      .run();
  });
}
