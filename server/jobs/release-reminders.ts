import { logger } from "../logger";
import { getNotifiersByUser, getTitleById, setRemindOnRelease } from "../db/repository";
import { getProvider } from "../notifications/registry";
import type { NotificationContent } from "../notifications/types";

const log = logger.child({ module: "release-reminder" });

export async function handleReleaseReminder(
  payload: unknown
): Promise<void> {
  const data = payload as { userId?: string; titleId?: string };
  const { userId, titleId } = data;

  if (!userId || !titleId) {
    log.error("release-reminder job missing required fields", { payload });
    return;
  }

  log.info("Processing release reminder", { userId, titleId });

  const [titleRow, notifierRows] = await Promise.all([
    getTitleById(titleId),
    getNotifiersByUser(userId),
  ]);

  if (!titleRow) {
    log.warn("Title not found for release reminder", { titleId, userId });
    // Clear the flag anyway so we don't get stuck
    await setRemindOnRelease(titleId, userId, false);
    return;
  }

  const enabledNotifiers = notifierRows.filter((n) => n.enabled);

  if (enabledNotifiers.length === 0) {
    log.info("No enabled notifiers for user, skipping release reminder", { userId, titleId });
    await setRemindOnRelease(titleId, userId, false);
    return;
  }

  const content: NotificationContent = {
    episodes: [],
    movies: [
      {
        title: titleRow.title,
        releaseYear: titleRow.release_year,
        posterUrl: titleRow.poster_url,
        offers: [],
      },
    ],
    date: titleRow.release_date ?? new Date().toISOString().slice(0, 10),
  };

  for (const notifier of enabledNotifiers) {
    const provider = getProvider(notifier.provider);
    if (!provider) {
      log.warn("Unknown provider for release reminder", { provider: notifier.provider, notifierId: notifier.id });
      continue;
    }

    try {
      await provider.send(notifier.config, content);
      log.info("Sent release reminder notification", { provider: notifier.provider, notifierId: notifier.id, titleId });
    } catch (err) {
      log.error("Failed to send release reminder notification", { provider: notifier.provider, notifierId: notifier.id, titleId, err });
    }
  }

  // Clear the flag after dispatching
  await setRemindOnRelease(titleId, userId, false);
  log.info("Release reminder completed, flag cleared", { userId, titleId });
}
