import { eq, inArray } from "drizzle-orm";
import { getDb } from "../schema";
import { offers, providers } from "../schema";
import { traceDbQuery } from "../../tracing";

export async function getOffersForTitle(titleId: string) {
  return traceDbQuery("getOffersForTitle", async () => {
    const db = getDb();
    return await db
      .select({
        id: offers.id,
        title_id: offers.titleId,
        provider_id: offers.providerId,
        monetization_type: offers.monetizationType,
        presentation_type: offers.presentationType,
        price_value: offers.priceValue,
        price_currency: offers.priceCurrency,
        url: offers.url,
        available_to: offers.availableTo,
        provider_name: providers.name,
        provider_technical_name: providers.technicalName,
        provider_icon_url: providers.iconUrl,
      })
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
      .select({
        id: offers.id,
        title_id: offers.titleId,
        provider_id: offers.providerId,
        monetization_type: offers.monetizationType,
        presentation_type: offers.presentationType,
        price_value: offers.priceValue,
        price_currency: offers.priceCurrency,
        url: offers.url,
        available_to: offers.availableTo,
        provider_name: providers.name,
        provider_technical_name: providers.technicalName,
        provider_icon_url: providers.iconUrl,
      })
      .from(offers)
      .innerJoin(providers, eq(offers.providerId, providers.id))
      .where(inArray(offers.titleId, titleIds))
      .all();
    return Map.groupBy(allOffers, (o) => o.title_id);
  });
}
