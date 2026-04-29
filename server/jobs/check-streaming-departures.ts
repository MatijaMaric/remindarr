import { logger } from "../logger";
import {
  getOffersForTitles,
  getArrivalAlertedProviders,
  getUnalertedProviders,
  markAlerted,
  getStreamingAlertNotifiersForUser,
  getTitleById,
  getUserDepartureSettings,
  recordDelivery,
  getUsersTrackingTitles,
} from "../db/repository";
import { getProvider } from "../notifications/registry";

const log = logger.child({ module: "check-streaming-departures" });

/**
 * After a batch of titles has been synced, check whether any tracked title
 * has lost flatrate/free streaming offers for users who had arrival alerts.
 * If so, send an immediate departure notification.
 */
export async function checkStreamingDepartures(titleIds: string[]): Promise<void> {
  if (titleIds.length === 0) return;

  // 1. Get all current offers for these titles
  const offersByTitle = await getOffersForTitles(titleIds);

  const today = new Date().toISOString().slice(0, 10);

  for (const titleId of titleIds) {
    const titleOffers = offersByTitle.get(titleId) ?? [];

    // Current set of FLATRATE/FREE provider IDs
    const currentStreamingProviderIds = new Set(
      titleOffers
        .filter((o) => o.monetization_type === "FLATRATE" || o.monetization_type === "FREE")
        .map((o) => o.provider_id)
        .filter((id): id is number => id != null)
    );

    // 2. Get all (user, provider) pairs that have arrival alerts for this title
    const arrivalAlerts = await getArrivalAlertedProviders(titleId);
    if (arrivalAlerts.length === 0) continue;

    // 3. Find providers that are no longer in current offers (departed)
    const departedAlerts = arrivalAlerts.filter(
      (a) => !currentStreamingProviderIds.has(a.providerId)
    );
    if (departedAlerts.length === 0) continue;

    // Group departed alerts by userId
    const byUser = new Map<string, Array<{ providerId: number; providerName: string }>>();
    for (const alert of departedAlerts) {
      const list = byUser.get(alert.userId) ?? [];
      list.push({ providerId: alert.providerId, providerName: alert.providerName });
      byUser.set(alert.userId, list);
    }

    // 4. Verify the user is still tracking this title
    const trackersByTitle = await getUsersTrackingTitles([titleId]);
    const trackingUserIds = new Set(trackersByTitle.get(titleId) ?? []);

    for (const [userId, departedProviders] of byUser) {
      // Skip if user is no longer tracking this title
      if (!trackingUserIds.has(userId)) continue;

      // 5. Check user's departure settings
      const userSettings = await getUserDepartureSettings(userId);
      if (!userSettings || userSettings.streamingDeparturesEnabled === 0) continue;

      const providerIds = departedProviders.map((p) => p.providerId);

      // 6. Find providers not yet alerted for departure for this (user, title)
      const newProviderIds = await getUnalertedProviders(userId, titleId, providerIds, "departure");
      if (newProviderIds.length === 0) continue;

      // 7. Get enabled streaming-alert notifiers for this user
      const userNotifiers = await getStreamingAlertNotifiersForUser(userId);

      // 8. Fetch title info for the notification message
      const titleRow = await getTitleById(titleId);
      if (!titleRow) continue;

      for (const pid of newProviderIds) {
        const provider = departedProviders.find((p) => p.providerId === pid);
        if (!provider) continue;

        // Check if offer has an available_to date — used for lead-time filtering
        // (The offers table uses available_to for expiry dates)
        const offer = titleOffers.find(
          (o) => o.provider_id === pid
        );
        const leavingAt = offer?.available_to ?? null;

        // If there's a departure date in the future, check lead-time window
        if (leavingAt) {
          const leaveDate = new Date(leavingAt);
          const now = new Date();
          const leadDays = userSettings.departureAlertLeadDays;
          const windowStart = new Date(leaveDate.getTime() - leadDays * 24 * 3600 * 1000);
          if (now < windowStart) {
            // Not yet within the lead-time window — skip for now
            continue;
          }
        }

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
                providerName: provider.providerName,
                kind: "departure" as const,
                leavingAt,
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
                eventKind: "streaming_departure",
              });
              log.info("Sent streaming departure alert", {
                userId,
                titleId,
                title: titleRow.title,
                provider: provider.providerName,
                leavingAt,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              await recordDelivery({
                notifierId: notifier.id,
                status: "failure",
                latencyMs: Date.now() - alertStart,
                errorMessage: message,
                eventKind: "streaming_departure",
              });
              log.error("Failed to send streaming departure alert", {
                notifierId: notifier.id,
                userId,
                titleId,
                error: message,
              });
            }
          }
        }

        // Mark departure as alerted (dedup for this user+title+provider combo)
        await markAlerted(userId, titleId, pid, provider.providerName, "departure");
      }
    }
  }
}
