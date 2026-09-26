import { logger } from "../logger";
import {
  getNotifiersByUser,
  getTitleById,
  recordDelivery,
  setRemindOnRelease,
} from "../db/repository";
import { getProvider } from "../notifications/registry";
import type { NotificationContent } from "../notifications/types";
import { getDb, tracked } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { notificationsSentTotal } from "../metrics";

const log = logger.child({ module: "release-reminder" });

export async function handleReleaseReminder(payload: unknown): Promise<void> {
  const data = payload as { userId?: string; titleId?: string };
  const { userId, titleId } = data;

  if (!userId || !titleId) {
    log.error("release-reminder job missing required fields", { payload });
    return;
  }
  const reminder = await getDb()
    .select({ enabled: tracked.remindOnRelease })
    .from(tracked)
    .where(and(eq(tracked.userId, userId), eq(tracked.titleId, titleId)))
    .get();
  // Canceled, untracked, or an older duplicate job already completed.
  if (!reminder?.enabled) return;

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
    log.info("No enabled notifiers for user, skipping release reminder", {
      userId,
      titleId,
    });
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

  let succeeded = 0;

  for (const notifier of enabledNotifiers) {
    const provider = getProvider(notifier.provider);
    if (!provider) {
      log.warn("Unknown provider for release reminder", {
        provider: notifier.provider,
        notifierId: notifier.id,
      });
      continue;
    }

    const started = Date.now();
    try {
      await provider.send(notifier.config, content);
      succeeded++;
      await recordDelivery({
        notifierId: notifier.id,
        status: "success",
        latencyMs: Date.now() - started,
        eventKind: "release_reminder",
      });
      notificationsSentTotal.inc({
        provider: notifier.provider,
        kind: "release_reminder",
        outcome: "success",
      });
      log.info("Sent release reminder notification", {
        provider: notifier.provider,
        notifierId: notifier.id,
        titleId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordDelivery({
        notifierId: notifier.id,
        status: "failure",
        latencyMs: Date.now() - started,
        errorMessage: message,
        eventKind: "release_reminder",
      });
      notificationsSentTotal.inc({
        provider: notifier.provider,
        kind: "release_reminder",
        outcome: "failure",
      });
      log.error("Failed to send release reminder notification", {
        provider: notifier.provider,
        notifierId: notifier.id,
        titleId,
        err,
      });
    }
  }

  // A total outage must stay retryable. Clearing the flag here used to drop
  // the reminder even when every provider failed.
  if (succeeded === 0) {
    log.error("All release reminder sends failed; keeping reminder", {
      userId,
      titleId,
    });
    throw new Error("All release reminder sends failed");
  }

  await setRemindOnRelease(titleId, userId, false);
  log.info("Release reminder completed, flag cleared", { userId, titleId });
}
