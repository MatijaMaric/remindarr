import { eq } from "drizzle-orm";
import { getDb } from "../schema";
import { offers, providers } from "../schema";
import { traceDbQuery } from "../../tracing";

export function getOffersForTitle(titleId: string) {
  return traceDbQuery("getOffersForTitle", () => {
    const db = getDb();
    return db
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
