import { eq, sql } from "drizzle-orm";
import { getDb, offers, titles, providers } from "../db/schema";
import { logger } from "../logger";
import { CONFIG } from "../config";
import { fetchStreamingOptions } from "./client";
import { SA_TO_TMDB_PROVIDER, mapSAMonetizationType } from "./provider-map";
import type { SAStreamingOption, SAService } from "./types";
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

    if (matchingOffer) {
      await updateOfferDeepLink(matchingOffer.id, saOption.link);
      updated++;
      continue;
    }

    // Try matching by provider only (ignore monetization type mismatch)
    const providerMatch = existingOffers.find((o) => o.providerId === providerId);
    if (providerMatch) {
      await updateOfferDeepLink(providerMatch.id, saOption.link);
      updated++;
      continue;
    }

    // No existing offer for this provider — create one from SA data
    await ensureProvider(providerId, saOption.service);
    await createOfferFromSA(titleId, providerId, monetizationType, saOption);
    updated++;
  }

  await markSaFetched(titleId);
  log.debug("Enriched title deep links", { titleId, updated, saOptions: saOptions.length });
  return updated;
}

async function ensureProvider(providerId: number, service: SAService): Promise<void> {
  return traceDbQuery("ensureProvider", async () => {
    const db = getDb();
    const technicalName = service.id.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const iconUrl = service.imageSet?.whiteImage || service.imageSet?.lightThemeImage || null;
    await db.insert(providers)
      .values({ id: providerId, name: service.name, technicalName, iconUrl })
      .onConflictDoNothing()
      .run();
  });
}

async function createOfferFromSA(
  titleId: string,
  providerId: number,
  monetizationType: string,
  saOption: SAStreamingOption,
): Promise<void> {
  return traceDbQuery("createOfferFromSA", async () => {
    const db = getDb();
    await db.insert(offers)
      .values({
        titleId,
        providerId,
        monetizationType,
        presentationType: saOption.quality || "",
        priceValue: saOption.price ? parseFloat(saOption.price.amount) : null,
        priceCurrency: saOption.price?.currency || null,
        url: saOption.link,
        deepLink: saOption.link,
        availableTo: saOption.expiresOn
          ? new Date(saOption.expiresOn * 1000).toISOString()
          : null,
      })
      .run();
  });
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
