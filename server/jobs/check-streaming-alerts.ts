import { logger } from "../logger";
import {
  getOffersForTitles,
  getUsersTrackingTitles,
  getUnalertedProviders,
  markAlerted,
  getStreamingAlertNotifiersForUser,
  getTitleById,
  recordDelivery,
} from "../db/repository";
import { getProvider } from "../notifications/registry";

const log = logger.child({ module: "streaming-alerts" });

/**
 * After a batch of titles has been upserted, check whether any tracked title
 * has new flatrate/free streaming offers for any user. If so, send an
 * immediate notification via each user's enabled streaming-alert notifiers.
 */
export async function checkStreamingAlerts(titleIds: string[]): Promise<void> {
  if (titleIds.length === 0) return;

  // 1. Get all current offers for these titles
  const offersByTitle = await getOffersForTitles(titleIds);

  // 2. Find titles that have flatrate/free offers
  const titlesWithStreamingOffers = titleIds.filter((id) => {
    const titleOffers = offersByTitle.get(id) ?? [];
    return titleOffers.some(
      (o) => o.monetization_type === "FLATRATE" || o.monetization_type === "FREE"
    );
  });
  if (titlesWithStreamingOffers.length === 0) return;

  // 3. Find users tracking these titles
  const trackersByTitle = await getUsersTrackingTitles(titlesWithStreamingOffers);
  if (trackersByTitle.size === 0) return;

  for (const [titleId, userIds] of trackersByTitle) {
    const titleOffers = offersByTitle.get(titleId) ?? [];
    const streamingProviders = titleOffers
      .filter((o) => o.monetization_type === "FLATRATE" || o.monetization_type === "FREE")
      .map((o) => ({ id: o.provider_id!, name: o.provider_name }))
      .filter((p) => p.id != null);

    if (streamingProviders.length === 0) continue;

    const providerIds = streamingProviders.map((p) => p.id);

    for (const userId of userIds) {
      // 4. Find providers not yet alerted for this (user, title)
      const newProviderIds = await getUnalertedProviders(userId, titleId, providerIds);
      if (newProviderIds.length === 0) continue;

      // 5. Get enabled streaming-alert notifiers for this user
      const userNotifiers = await getStreamingAlertNotifiersForUser(userId);

      // 6. Fetch title info for the notification message
      const titleRow = await getTitleById(titleId);
      if (!titleRow) continue;

      const today = new Date().toISOString().slice(0, 10);

      for (const pid of newProviderIds) {
        const provider = streamingProviders.find((sp) => sp.id === pid);
        if (!provider) continue;

        if (userNotifiers.length > 0) {
          const content = {
            episodes: [] as never[],
            movies: [] as never[],
            date: today,
            streamingAlerts: [
              {
                titleId,
                title: titleRow.title,
                posterUrl: titleRow.poster_url,
                providerName: provider.name,
              },
            ],
          };

          for (const notifier of userNotifiers) {
            const notifierProvider = getProvider(notifier.provider);
            if (!notifierProvider) continue;
            const alertStart = Date.now();
            try {
              await notifierProvider.send(notifier.config, content);
              await recordDelivery({ notifierId: notifier.id, status: "success", latencyMs: Date.now() - alertStart, eventKind: "streaming_arrival" });
              log.info("Sent streaming alert", {
                userId,
                titleId,
                title: titleRow.title,
                provider: provider.name,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              await recordDelivery({ notifierId: notifier.id, status: "failure", latencyMs: Date.now() - alertStart, errorMessage: message, eventKind: "streaming_arrival" });
              log.error("Failed to send streaming alert", {
                notifierId: notifier.id,
                userId,
                titleId,
                error: message,
              });
            }
          }
        }

        // Mark as alerted regardless of whether we had notifiers
        // (so we don't re-send if user adds a notifier later for already-available titles)
        await markAlerted(userId, titleId, pid, provider.name);
      }
    }
  }
}
