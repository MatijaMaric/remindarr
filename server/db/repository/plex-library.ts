import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "../schema";
import { plexLibraryItems, integrations } from "../schema";
import { traceDbQuery } from "../../tracing";
import { buildPlexDeepLink } from "../../plex/deep-link";
import type { PlexConfig } from "./integrations";

// Reserved provider ID for Plex (out-of-range for TMDB provider IDs)
export const PLEX_PROVIDER_ID = 9999;

export type PlexLibraryItem = {
  integrationId: string;
  userId: string;
  titleId: string;
  ratingKey: string;
  mediaType: "movie" | "show";
  plexSlug?: string | null;
};

export async function upsertPlexLibraryItems(items: PlexLibraryItem[]) {
  return traceDbQuery("upsertPlexLibraryItems", async () => {
    if (items.length === 0) return;
    const db = getDb();
    for (const item of items) {
      await db.insert(plexLibraryItems)
        .values({
          integrationId: item.integrationId,
          userId: item.userId,
          titleId: item.titleId,
          ratingKey: item.ratingKey,
          mediaType: item.mediaType,
          plexSlug: item.plexSlug ?? null,
          syncedAt: sql`datetime('now')`,
        })
        .onConflictDoUpdate({
          target: [plexLibraryItems.userId, plexLibraryItems.titleId],
          set: {
            integrationId: sql`excluded.integration_id`,
            ratingKey: sql`excluded.rating_key`,
            mediaType: sql`excluded.media_type`,
            // Preserve existing slug if the new value is null (lookup may have failed)
            plexSlug: sql`COALESCE(excluded.plex_slug, plex_library_items.plex_slug)`,
            syncedAt: sql`datetime('now')`,
          },
        })
        .run();
    }
  });
}

export async function deleteStaleLibraryItems(
  integrationId: string,
  currentTitleIds: string[]
) {
  return traceDbQuery("deleteStaleLibraryItems", async () => {
    const db = getDb();
    if (currentTitleIds.length === 0) {
      // All items for this integration are stale
      await db.delete(plexLibraryItems)
        .where(eq(plexLibraryItems.integrationId, integrationId))
        .run();
      return;
    }
    await db.delete(plexLibraryItems)
      .where(
        and(
          eq(plexLibraryItems.integrationId, integrationId),
          notInArray(plexLibraryItems.titleId, currentTitleIds)
        )
      )
      .run();
  });
}

export async function deletePlexLibraryByIntegration(integrationId: string) {
  return traceDbQuery("deletePlexLibraryByIntegration", async () => {
    const db = getDb();
    await db.delete(plexLibraryItems)
      .where(eq(plexLibraryItems.integrationId, integrationId))
      .run();
  });
}

type SyntheticOffer = {
  id: number;
  title_id: string;
  provider_id: number | null;
  monetization_type: string | null;
  presentation_type: string | null;
  price_value: number | null;
  price_currency: string | null;
  url: string;
  available_to: string | null;
  provider_name: string;
  provider_technical_name: string | null;
  provider_icon_url: string | null;
};

export async function getPlexOffersForUser(
  titleIds: string[],
  userId: string
): Promise<Map<string, SyntheticOffer[]>> {
  return traceDbQuery("getPlexOffersForUser", async () => {
    if (titleIds.length === 0) return new Map();

    const db = getDb();
    const rows = await db
      .select({
        titleId: plexLibraryItems.titleId,
        ratingKey: plexLibraryItems.ratingKey,
        mediaType: plexLibraryItems.mediaType,
        plexSlug: plexLibraryItems.plexSlug,
        config: integrations.config,
      })
      .from(plexLibraryItems)
      .innerJoin(integrations, eq(plexLibraryItems.integrationId, integrations.id))
      .where(
        and(
          eq(plexLibraryItems.userId, userId),
          inArray(plexLibraryItems.titleId, titleIds)
        )
      )
      .all();

    const result = new Map<string, SyntheticOffer[]>();
    for (const row of rows) {
      let serverId: string;
      try {
        const config = JSON.parse(row.config) as PlexConfig;
        serverId = config.serverId;
      } catch {
        continue;
      }
      if (!serverId) continue;

      const offer: SyntheticOffer = {
        id: 0,
        title_id: row.titleId,
        provider_id: PLEX_PROVIDER_ID,
        monetization_type: "FLATRATE",
        presentation_type: null,
        price_value: null,
        price_currency: null,
        url: buildPlexDeepLink(serverId, row.ratingKey, row.plexSlug, row.mediaType),
        available_to: null,
        provider_name: "Plex",
        provider_technical_name: "plex",
        provider_icon_url: "/plex-icon.svg",
      };
      const existing = result.get(row.titleId) ?? [];
      existing.push(offer);
      result.set(row.titleId, existing);
    }
    return result;
  });
}
