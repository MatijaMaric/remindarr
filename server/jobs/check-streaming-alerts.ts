import { logger } from "../logger";
import {
  getOffersForTitles,
  getUsersTrackingTitles,
  getUnalertedProvidersBulk,
  markAlerted,
  getStreamingAlertNotifiersForUsers,
  getTitleById,
  recordDelivery,
} from "../db/repository";
import { getProvider } from "../notifications/registry";
import { notificationsSentTotal } from "../metrics";

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
      (o) =>
        o.monetization_type === "FLATRATE" || o.monetization_type === "FREE",
    );
  });
  if (titlesWithStreamingOffers.length === 0) return;

  // 3. Find users tracking these titles
  const trackersByTitle = await getUsersTrackingTitles(
    titlesWithStreamingOffers,
  );
  if (trackersByTitle.size === 0) return;

  // Fetch notifiers once for the union of all tracking users instead of
  // once per (title, user) pair
  const allUserIds = [...new Set([...trackersByTitle.values()].flat())];
  const notifiersByUser = await getStreamingAlertNotifiersForUsers(allUserIds);

  for (const [titleId, userIds] of trackersByTitle) {
    const titleOffers = offersByTitle.get(titleId) ?? [];
    const streamingProviders = titleOffers
      .filter(
        (o) =>
          o.monetization_type === "FLATRATE" || o.monetization_type === "FREE",
      )
      .map((o) => ({ id: o.provider_id!, name: o.provider_name }))
      .filter((p) => p.id != null);

    if (streamingProviders.length === 0) continue;

    const providerIds = streamingProviders.map((p) => p.id);

    // Fetch title once per titleId, not once per (titleId, userId) pair
    const titleRow = await getTitleById(titleId);
    if (!titleRow) continue;

    const today = new Date().toISOString().slice(0, 10);

    // 4. Find providers not yet alerted per user, in one query per title
    const unalertedByUser = await getUnalertedProvidersBulk(
      userIds,
      titleId,
      providerIds,
      "arrival",
    );

    for (const userId of userIds) {
      const newProviderIds = unalertedByUser.get(userId) ?? [];
      if (newProviderIds.length === 0) continue;

      // 5. Enabled streaming-alert notifiers for this user (prefetched above)
      const userNotifiers = notifiersByUser.get(userId) ?? [];

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
                kind: "arrival" as const,
              },
            ],
          };

          for (const notifier of userNotifiers) {
            const notifierProvider = getProvider(notifier.provider);
            if (!notifierProvider) continue;
            const alertStart = Date.now();
            try {
              await notifierProvider.send(notifier.config, content);
              await recordDelivery({
                notifierId: notifier.id,
                status: "success",
                latencyMs: Date.now() - alertStart,
                eventKind: "streaming_arrival",
              });
              notificationsSentTotal.inc({
                provider: notifier.provider,
                kind: "streaming_arrival",
                outcome: "success",
              });
              log.info("Sent streaming alert", {
                userId,
                titleId,
                title: titleRow.title,
                provider: provider.name,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              await recordDelivery({
                notifierId: notifier.id,
                status: "failure",
                latencyMs: Date.now() - alertStart,
                errorMessage: message,
                eventKind: "streaming_arrival",
              });
              notificationsSentTotal.inc({
                provider: notifier.provider,
                kind: "streaming_arrival",
                outcome: "failure",
              });
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
        await markAlerted(userId, titleId, pid, provider.name, "arrival");
      }
    }
  }
}
