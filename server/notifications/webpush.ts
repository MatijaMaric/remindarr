import webpush from "web-push";
import { logger } from "../logger";
import { getVapidKeys } from "./vapid";
import type { NotificationContent, NotificationProvider } from "./types";

const log = logger.child({ module: "webpush" });

export class SubscriptionExpiredError extends Error {
  constructor(endpoint: string) {
    super(`Push subscription expired: ${endpoint.slice(0, 60)}`);
    this.name = "SubscriptionExpiredError";
  }
}

export class WebPushProvider implements NotificationProvider {
  readonly name = "webpush";

  validateConfig(
    config: Record<string, string>
  ): { valid: boolean; error?: string } {
    if (!config.endpoint) {
      return { valid: false, error: "Push subscription endpoint is required" };
    }
    if (!config.p256dh) {
      return { valid: false, error: "Push subscription p256dh key is required" };
    }
    if (!config.auth) {
      return { valid: false, error: "Push subscription auth key is required" };
    }
    return { valid: true };
  }

  async send(
    config: Record<string, string>,
    content: NotificationContent
  ): Promise<void> {
    const { episodes, movies, streamingAlerts = [] } = content;
    if (episodes.length === 0 && movies.length === 0 && streamingAlerts.length === 0) return;

    const vapid = await getVapidKeys();
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

    const payload = this.buildPayload(content);
    const subscription: webpush.PushSubscription = {
      endpoint: config.endpoint,
      keys: {
        p256dh: config.p256dh,
        auth: config.auth,
      },
    };

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        throw new SubscriptionExpiredError(config.endpoint);
      }
      throw new Error(
        `Web push failed (${err.statusCode || "unknown"}): ${err.body || err.message}`
      );
    }
  }

  private buildPayload(content: NotificationContent) {
    const { episodes, movies, streamingAlerts = [] } = content;
    const totalCount = episodes.length + movies.length + streamingAlerts.length;

    const lines: string[] = [];
    // Group episodes by show
    const showMap = new Map<string, typeof episodes>();
    for (const ep of episodes) {
      const existing = showMap.get(ep.showTitle) || [];
      existing.push(ep);
      showMap.set(ep.showTitle, existing);
    }

    for (const [showTitle, eps] of showMap) {
      const codes = eps.map(
        (ep) =>
          `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
      );
      lines.push(`${showTitle} ${codes.join(", ")}`);
    }

    for (const movie of movies) {
      lines.push(movie.releaseYear ? `${movie.title} (${movie.releaseYear})` : movie.title);
    }

    for (const alert of streamingAlerts) {
      lines.push(`${alert.title} — now on ${alert.providerName}`);
    }

    return {
      title: `Remindarr — ${totalCount} new release${totalCount !== 1 ? "s" : ""}`,
      body: lines.join("\n"),
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: "/" },
    };
  }
}
