import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/auth";
import {
  createNotifier,
  updateNotifier,
  deleteNotifier,
  getNotifiersByUser,
  getNotifierById,
  recordDelivery,
  getRecentForNotifier,
  getSuccessRateForNotifier,
} from "../db/repository";
import { getProvider, getAvailableProviders } from "../notifications/registry";
import { buildNotificationContent } from "../notifications/content";
import { refreshNotificationSchedule } from "../jobs/schedule";
import { getVapidPublicKey } from "../notifications/vapid";
import { SubscriptionExpiredError } from "../notifications/webpush";
import Sentry from "../sentry";
import { ok, err } from "./response";
import { zValidator } from "../lib/validator";

const app = new Hono<AppEnv>();

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const timezoneSchema = z.string().refine(isValidTimezone, { message: "Invalid timezone" });
const digestModeSchema = z.enum(["weekly", "off"]);
const digestDaySchema = z.number().int().min(0).max(6);

const createNotifierSchema = z
  .object({
    provider: z.string().min(1),
    config: z.record(z.string(), z.string()),
    notify_time: z.string().regex(HHMM, { message: "Invalid time format. Use HH:MM (24h)" }).default("09:00"),
    timezone: timezoneSchema.default("UTC"),
    digest_mode: digestModeSchema.nullish(),
    digest_day: digestDaySchema.nullish(),
    streaming_alerts_enabled: z.boolean().optional(),
  })
  .refine(
    (v) => v.digest_mode !== "weekly" || (v.digest_day !== undefined && v.digest_day !== null),
    {
      message: "digest_day is required when digest_mode is 'weekly'",
      path: ["digest_day"],
    },
  );

const updateNotifierSchema = z
  .object({
    provider: z.string().min(1).optional(),
    config: z.record(z.string(), z.string()).optional(),
    notify_time: z.string().regex(HHMM, { message: "Invalid time format. Use HH:MM (24h)" }).optional(),
    timezone: timezoneSchema.optional(),
    enabled: z.boolean().optional(),
    digest_mode: digestModeSchema.nullish(),
    digest_day: digestDaySchema.nullish(),
    streaming_alerts_enabled: z.boolean().optional(),
  })
  .passthrough();

const renewSubscriptionSchema = z.object({
  endpoint: z.string().min(1),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

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
app.post("/", zValidator("json", createNotifierSchema), async (c) => {
  const user = c.get("user")!;
  const body = c.req.valid("json");

  const {
    provider,
    config,
    notify_time,
    timezone,
    digest_mode,
    digest_day,
    streaming_alerts_enabled,
  } = body;

  const name = provider.charAt(0).toUpperCase() + provider.slice(1);

  const providerImpl = getProvider(provider);
  if (!providerImpl) {
    return err(c, `Unknown provider: ${provider}. Available: ${getAvailableProviders().join(", ")}`);
  }

  // Provider-specific config validation (beyond zod's shape validation)
  const validation = providerImpl.validateConfig(config);
  if (!validation.valid) {
    return err(c, validation.error ?? "Invalid config");
  }

  const id = await createNotifier(
    user.id,
    provider,
    name,
    config,
    notify_time,
    timezone,
    digest_mode ?? null,
    digest_day ?? null,
    streaming_alerts_enabled !== false,
  );
  await refreshNotificationSchedule();
  const notifier = await getNotifierById(id, user.id);
  return c.json({ notifier }, 201);
});

// POST /renew-subscription — update webpush subscription config after SW update
app.post("/renew-subscription", zValidator("json", renewSubscriptionSchema), async (c) => {
  const user = c.get("user")!;
  const { endpoint, p256dh, auth } = c.req.valid("json");

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
app.put("/:id", zValidator("json", updateNotifierSchema), async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await getNotifierById(id, user.id);
  if (!existing) {
    return err(c, "Notifier not found", 404);
  }

  // Validate config if provided (provider-specific)
  if (body.config) {
    const provider = getProvider(body.provider || existing.provider);
    if (provider) {
      const validation = provider.validateConfig(body.config);
      if (!validation.valid) {
        return err(c, validation.error ?? "Invalid config");
      }
    }
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
    ...("streaming_alerts_enabled" in body
      ? { streamingAlertsEnabled: body.streaming_alerts_enabled !== false }
      : {}),
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

  const start = Date.now();
  try {
    await providerImpl.send(notifier.config, content);
    await recordDelivery({ notifierId: id, status: "success", latencyMs: Date.now() - start, eventKind: "test" });
    return c.json({ success: true, message: "Test notification sent" });
  } catch (err: unknown) {
    await recordDelivery({ notifierId: id, status: "failure", latencyMs: Date.now() - start, errorMessage: err instanceof Error ? err.message : String(err), eventKind: "test" });
    if (!(err instanceof SubscriptionExpiredError)) {
      Sentry.captureException(err);
    }
    const message = err instanceof Error ? err.message : String(err);
    return c.json(
      { success: false, message: message || "Failed to send" },
    );
  }
});

// GET /:id/history — delivery history for a notifier (owner only)
app.get("/:id/history", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const notifier = await getNotifierById(id, user.id);
  if (!notifier) {
    return err(c, "Notifier not found", 404);
  }

  const rows = await getRecentForNotifier(id, 5);
  const successRate = await getSuccessRateForNotifier(id, 7);
  return ok(c, { rows, successRate });
});

export default app;
