import { Hono } from "hono";
import type { AppEnv } from "../types";
import {
  createNotifier,
  updateNotifier,
  deleteNotifier,
  getNotifiersByUser,
  getNotifierById,
} from "../db/repository";
import { getProvider, getAvailableProviders } from "../notifications/registry";
import { buildNotificationContent } from "../notifications/content";
import { refreshNotificationSchedule } from "../jobs/schedule";
import { getVapidPublicKey } from "../notifications/vapid";
import { SubscriptionExpiredError } from "../notifications/webpush";
import Sentry from "../sentry";
import { ok, err } from "./response";

const app = new Hono<AppEnv>();

function isValidTime(time: string): boolean {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const VALID_DIGEST_MODES = ["weekly", "off"] as const;
type DigestMode = (typeof VALID_DIGEST_MODES)[number];

function isValidDigestMode(mode: unknown): mode is DigestMode | null {
  if (mode === null || mode === undefined) return true;
  return VALID_DIGEST_MODES.includes(mode as DigestMode);
}

function isValidDigestDay(day: unknown): day is number | null {
  if (day === null || day === undefined) return true;
  return typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6;
}

// GET / — list user's notifiers
app.get("/", async (c) => {
  const user = c.get("user")!;
  const notifiers = await getNotifiersByUser(user.id);
  return ok(c, { notifiers });
});

// GET /providers — available provider types
app.get("/providers", (c) => {
  return ok(c, { providers: getAvailableProviders() });
});

// GET /vapid-public-key — VAPID public key for push subscriptions
app.get("/vapid-public-key", async (c) => {
  try {
    const publicKey = await getVapidPublicKey();
    return ok(c, { publicKey });
  } catch {
    return err(c, "VAPID keys not configured", 500);
  }
});

// POST / — create notifier
app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();

  const { provider, config, notify_time, timezone, digest_mode, digest_day, streaming_alerts_enabled } = body;

  if (!provider || !config) {
    return err(c, "provider and config are required");
  }

  const name = provider.charAt(0).toUpperCase() + provider.slice(1);

  const providerImpl = getProvider(provider);
  if (!providerImpl) {
    return err(c, `Unknown provider: ${provider}. Available: ${getAvailableProviders().join(", ")}`);
  }

  const validation = providerImpl.validateConfig(config);
  if (!validation.valid) {
    return err(c, validation.error ?? "Invalid config");
  }

  const time = notify_time || "09:00";
  if (!isValidTime(time)) {
    return err(c, "Invalid time format. Use HH:MM (24h)");
  }

  const tz = timezone || "UTC";
  if (!isValidTimezone(tz)) {
    return err(c, "Invalid timezone");
  }

  if (!isValidDigestMode(digest_mode)) {
    return err(c, "Invalid digest_mode. Must be 'weekly', 'off', or null");
  }

  if (!isValidDigestDay(digest_day)) {
    return err(c, "Invalid digest_day. Must be 0-6 (0=Sunday) or null");
  }

  if (digest_mode === "weekly" && (digest_day === null || digest_day === undefined)) {
    return err(c, "digest_day is required when digest_mode is 'weekly'");
  }

  const id = await createNotifier(user.id, provider, name, config, time, tz, digest_mode ?? null, digest_day ?? null, streaming_alerts_enabled !== false);
  await refreshNotificationSchedule();
  const notifier = await getNotifierById(id, user.id);
  return c.json({ notifier }, 201);
});

// POST /renew-subscription — update webpush subscription config after SW update
app.post("/renew-subscription", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();

  const { endpoint, p256dh, auth } = body;

  const providerImpl = getProvider("webpush");
  if (!providerImpl) {
    return err(c, "webpush provider not available", 500);
  }

  const validation = providerImpl.validateConfig({ endpoint, p256dh, auth });
  if (!validation.valid) {
    return err(c, validation.error ?? "Invalid subscription config");
  }

  const notifiers = await getNotifiersByUser(user.id);
  const webpushNotifier = notifiers.find((n) => n.provider === "webpush");
  if (!webpushNotifier) {
    return err(c, "No webpush notifier found", 404);
  }

  await updateNotifier(webpushNotifier.id, user.id, {
    config: { endpoint, p256dh, auth },
    enabled: true,
  });
  await refreshNotificationSchedule();

  const notifier = await getNotifierById(webpushNotifier.id, user.id);
  return ok(c, { notifier });
});

// PUT /:id — update notifier
app.put("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await getNotifierById(id, user.id);
  if (!existing) {
    return err(c, "Notifier not found", 404);
  }

  // Validate config if provided
  if (body.config) {
    const provider = getProvider(body.provider || existing.provider);
    if (provider) {
      const validation = provider.validateConfig(body.config);
      if (!validation.valid) {
        return err(c, validation.error ?? "Invalid config");
      }
    }
  }

  if (body.notify_time && !isValidTime(body.notify_time)) {
    return err(c, "Invalid time format. Use HH:MM (24h)");
  }

  if (body.timezone && !isValidTimezone(body.timezone)) {
    return err(c, "Invalid timezone");
  }

  if ("digest_mode" in body && !isValidDigestMode(body.digest_mode)) {
    return err(c, "Invalid digest_mode. Must be 'weekly', 'off', or null");
  }

  if ("digest_day" in body && !isValidDigestDay(body.digest_day)) {
    return err(c, "Invalid digest_day. Must be 0-6 (0=Sunday) or null");
  }

  const digestMode = "digest_mode" in body ? body.digest_mode : undefined;
  const digestDay = "digest_day" in body ? body.digest_day : undefined;

  if (digestMode === "weekly" && (digestDay === null || digestDay === undefined)) {
    // Check if existing notifier already has a digest_day set
    if (existing.digest_day === null || existing.digest_day === undefined) {
      return err(c, "digest_day is required when digest_mode is 'weekly'");
    }
  }

  await updateNotifier(id, user.id, {
    config: body.config,
    notifyTime: body.notify_time,
    timezone: body.timezone,
    enabled: body.enabled,
    ...("digest_mode" in body ? { digestMode: body.digest_mode ?? null } : {}),
    ...("digest_day" in body ? { digestDay: body.digest_day ?? null } : {}),
    ...("streaming_alerts_enabled" in body ? { streamingAlertsEnabled: body.streaming_alerts_enabled !== false } : {}),
  });
  await refreshNotificationSchedule();

  const notifier = await getNotifierById(id, user.id);
  return ok(c, { notifier });
});

// DELETE /:id — delete notifier
app.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const existing = await getNotifierById(id, user.id);
  if (!existing) {
    return err(c, "Notifier not found", 404);
  }

  await deleteNotifier(id, user.id);
  await refreshNotificationSchedule();
  return ok(c, {});
});

// POST /:id/test — send test notification
app.post("/:id/test", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const notifier = await getNotifierById(id, user.id);
  if (!notifier) {
    return err(c, "Notifier not found", 404);
  }

  const providerImpl = getProvider(notifier.provider);
  if (!providerImpl) {
    return err(c, "Unknown provider");
  }

  const today = new Date().toISOString().slice(0, 10);
  let content = await buildNotificationContent(user.id, today);

  // If nothing is releasing today, send sample content
  if (content.episodes.length === 0 && content.movies.length === 0) {
    content = {
      date: today,
      episodes: [
        {
          showTitle: "Sample Show",
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: "Pilot",
          posterUrl: null,
          offers: [{ providerName: "Netflix", providerIconUrl: null }],
        },
      ],
      movies: [],
    };
  }

  try {
    await providerImpl.send(notifier.config, content);
    return c.json({ success: true, message: "Test notification sent" });
  } catch (err: any) {
    if (!(err instanceof SubscriptionExpiredError)) {
      Sentry.captureException(err);
    }
    return c.json(
      { success: false, message: err.message || "Failed to send" },
    );
  }
});

export default app;
