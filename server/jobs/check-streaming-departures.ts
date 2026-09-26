import { logger } from "../logger";
import {
  getOffersForTitles,
  getArrivalAlertedProvidersForTitles,
  getUnalertedProvidersBulk,
  markAlerted,
  getStreamingAlertNotifiersForUsers,
  getTitleLabels,
  getDepartureSettingsForUsers,
  recordDelivery,
  getUsersTrackingTitles,
  getDeliveredStreamingNotifiers,
  markStreamingDelivered,
} from "../db/repository";
import { getProvider } from "../notifications/registry";

const log = logger.child({ module: "check-streaming-departures" });

type DepartedProvider = { providerId: number; providerName: string };

/**
 * After a batch of titles has been synced, check whether any tracked title
 * has lost flatrate/free streaming offers for users who had arrival alerts.
 * If so, send an immediate departure notification.
 */
export async function checkStreamingDepartures(
  titleIds: string[],
): Promise<void> {
  if (titleIds.length === 0) return;

  // 1. Get all current offers for these titles
  const offersByTitle = await getOffersForTitles(titleIds);

  const today = new Date().toISOString().slice(0, 10);

  // 2. Arrival history for every title in one query (chunked for D1).
  const arrivalAlertsByTitle =
    await getArrivalAlertedProvidersForTitles(titleIds);

  const departedByTitle = new Map<string, Map<string, DepartedProvider[]>>();
  const titlesWithDepartures: string[] = [];

  for (const titleId of titleIds) {
    const arrivalAlerts = arrivalAlertsByTitle.get(titleId) ?? [];
    if (arrivalAlerts.length === 0) continue;

    const titleOffers = offersByTitle.get(titleId) ?? [];

    // Current set of FLATRATE/FREE provider IDs
    const currentStreamingProviderIds = new Set(
      titleOffers
        .filter(
          (o) =>
            o.monetization_type === "FLATRATE" ||
            o.monetization_type === "FREE",
        )
        .map((o) => o.provider_id)
        .filter((id): id is number => id != null),
    );

    // 3. Find providers that are no longer in current offers (departed)
    const departedAlerts = arrivalAlerts.filter(
      (a) => !currentStreamingProviderIds.has(a.providerId),
    );
    if (departedAlerts.length === 0) continue;

    // Group departed alerts by userId
    const byUser = new Map<string, DepartedProvider[]>();
    for (const alert of departedAlerts) {
      const list = byUser.get(alert.userId) ?? [];
      list.push({
        providerId: alert.providerId,
        providerName: alert.providerName,
      });
      byUser.set(alert.userId, list);
    }
    departedByTitle.set(titleId, byUser);
    titlesWithDepartures.push(titleId);
  }

  if (titlesWithDepartures.length === 0) return;

  // 4. Who still tracks these titles — one query, not one per title.
  const trackersByTitle = await getUsersTrackingTitles(titlesWithDepartures);

  const candidatesByTitle = new Map<string, string[]>();
  const allCandidateUserIds = new Set<string>();
  for (const titleId of titlesWithDepartures) {
    const byUser = departedByTitle.get(titleId)!;
    const trackingUserIds = new Set(trackersByTitle.get(titleId) ?? []);
    const candidateUserIds = [...byUser.keys()].filter((id) =>
      trackingUserIds.has(id),
    );
    if (candidateUserIds.length === 0) continue;
    candidatesByTitle.set(titleId, candidateUserIds);
    for (const userId of candidateUserIds) allCandidateUserIds.add(userId);
  }

  if (allCandidateUserIds.size === 0) return;

  const candidateUserIdList = [...allCandidateUserIds];
  const titleIdsToNotify = [...candidatesByTitle.keys()];
  const [settingsByUser, titlesById, notifiersByUser] = await Promise.all([
    getDepartureSettingsForUsers(candidateUserIdList),
    getTitleLabels(titleIdsToNotify),
    getStreamingAlertNotifiersForUsers(candidateUserIdList),
  ]);

  for (const titleId of titleIdsToNotify) {
    const byUser = departedByTitle.get(titleId)!;
    const candidateUserIds = candidatesByTitle.get(titleId)!;
    const titleOffers = offersByTitle.get(titleId) ?? [];
    const titleRow = titlesById.get(titleId);
    if (!titleRow) continue;

    // 5. Bulk-fetch unalerted departures once per title. The bulk query uses
    // the union of departed providers; each user's own departed set is
    // intersected back in below.
    const departedProviderIds = [
      ...new Set(
        candidateUserIds.flatMap((userId) =>
          (byUser.get(userId) ?? []).map((provider) => provider.providerId),
        ),
      ),
    ];
    const unalertedByUser = await getUnalertedProvidersBulk(
      candidateUserIds,
      titleId,
      departedProviderIds,
      "departure",
    );

    for (const userId of candidateUserIds) {
      const departedProviders = byUser.get(userId) ?? [];

      // 6. Check user's departure settings
      const userSettings = settingsByUser.get(userId);
      if (!userSettings || userSettings.streamingDeparturesEnabled === 0)
        continue;

      // Find providers not yet alerted for departure for this (user, title)
      const userDeparted = new Set(departedProviders.map((p) => p.providerId));
      const newProviderIds = (unalertedByUser.get(userId) ?? []).filter((pid) =>
        userDeparted.has(pid),
      );
      if (newProviderIds.length === 0) continue;

      // 7. Enabled streaming-alert notifiers for this user (prefetched above)
      const userNotifiers = notifiersByUser.get(userId) ?? [];

      for (const pid of newProviderIds) {
        const provider = departedProviders.find((p) => p.providerId === pid);
        if (!provider) continue;

        // Check if offer has an available_to date — used for lead-time filtering
        // (The offers table uses available_to for expiry dates)
        const offer = titleOffers.find((o) => o.provider_id === pid);
        const leavingAt = offer?.available_to ?? null;

        // If there's a departure date in the future, check lead-time window
        if (leavingAt) {
          const leaveDate = new Date(leavingAt);
          const now = new Date();
          const leadDays = userSettings.departureAlertLeadDays;
          const windowStart = new Date(
            leaveDate.getTime() - leadDays * 24 * 3600 * 1000,
          );
          if (now < windowStart) {
            // Not yet within the lead-time window — skip for now
            continue;
          }
        }

        const delivered = await getDeliveredStreamingNotifiers(
          titleId,
          pid,
          "departure",
        );
        let allDelivered = true;
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
            if (delivered.has(notifier.id)) continue;
            const notifierProvider = getProvider(notifier.provider);
            if (!notifierProvider) {
              allDelivered = false;
              continue;
            }
            const alertStart = Date.now();
            try {
              await notifierProvider.send(notifier.config, content);
              await markStreamingDelivered(
                notifier.id,
                titleId,
                pid,
                "departure",
              );
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
              allDelivered = false;
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
        if (allDelivered)
          await markAlerted(
            userId,
            titleId,
            pid,
            provider.providerName,
            "departure",
          );
      }
    }
  }
}
