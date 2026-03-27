import { eq, inArray, sql, isNull, asc, desc } from "drizzle-orm";
import { getDb } from "../schema";
import { offers, providers, titles, tracked } from "../schema";
import { traceDbQuery } from "../../tracing";

const offerColumns = {
  id: offers.id,
  title_id: offers.titleId,
  provider_id: offers.providerId,
  monetization_type: offers.monetizationType,
  presentation_type: offers.presentationType,
  price_value: offers.priceValue,
  price_currency: offers.priceCurrency,
  url: sql<string>`COALESCE(${offers.deepLink}, ${offers.url})`.as("url"),
  available_to: offers.availableTo,
  provider_name: providers.name,
  provider_technical_name: providers.technicalName,
  provider_icon_url: providers.iconUrl,
};

export async function getOffersForTitle(titleId: string) {
  return traceDbQuery("getOffersForTitle", async () => {
    const db = getDb();
    return await db
      .select(offerColumns)
      .from(offers)
      .innerJoin(providers, eq(offers.providerId, providers.id))
      .where(eq(offers.titleId, titleId))
      .all();
  });
}

export async function getOffersForTitles(titleIds: string[]) {
  return traceDbQuery("getOffersForTitles", async () => {
    if (titleIds.length === 0) return new Map<string, Awaited<ReturnType<typeof getOffersForTitle>>>();
    const db = getDb();
    const allOffers = await db
      .select(offerColumns)
      .from(offers)
      .innerJoin(providers, eq(offers.providerId, providers.id))
      .where(inArray(offers.titleId, titleIds))
      .all();
    return Map.groupBy(allOffers, (o) => o.title_id);
  });
}

/**
 * Returns titles that need Streaming Availability enrichment.
 * Prioritizes tracked titles, then sorts by most recent release date.
 */
export async function getTitlesNeedingSaEnrichment(limit: number) {
  return traceDbQuery("getTitlesNeedingSaEnrichment", async () => {
    const db = getDb();
    return await db
      .select({
        id: titles.id,
        tmdbId: titles.tmdbId,
        objectType: titles.objectType,
      })
      .from(titles)
      .leftJoin(tracked, eq(titles.id, tracked.titleId))
      .where(
        sql`${titles.tmdbId} IS NOT NULL AND ${titles.saFetchedAt} IS NULL`,
      )
      .orderBy(
        desc(tracked.titleId),  // tracked titles first (non-null)
        desc(titles.releaseDate),
      )
      .limit(limit)
      .all();
  });
}
