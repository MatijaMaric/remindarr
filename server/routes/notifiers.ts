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
import * as Sentry from "@sentry/bun";

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

// GET / — list user's notifiers
app.get("/", async (c) => {
  const user = c.get("user")!;
  const notifiers = await getNotifiersByUser(user.id);
  return c.json({ notifiers });
});

// GET /providers — available provider types
app.get("/providers", (c) => {
  return c.json({ providers: getAvailableProviders() });
});

// GET /vapid-public-key — VAPID public key for push subscriptions
app.get("/vapid-public-key", async (c) => {
  try {
    const publicKey = await getVapidPublicKey();
    return c.json({ publicKey });
  } catch {
    return c.json({ error: "VAPID keys not configured" }, 500);
  }
});

// POST / — create notifier
app.post("/", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();

  const { provider, config, notify_time, timezone } = body;

  if (!provider || !config) {
    return c.json({ error: "provider and config are required" }, 400);
  }

  const name = provider.charAt(0).toUpperCase() + provider.slice(1);

  const providerImpl = getProvider(provider);
  if (!providerImpl) {
    return c.json(
      { error: `Unknown provider: ${provider}. Available: ${getAvailableProviders().join(", ")}` },
      400
    );
  }

  const validation = providerImpl.validateConfig(config);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 400);
  }

  const time = notify_time || "09:00";
  if (!isValidTime(time)) {
    return c.json({ error: "Invalid time format. Use HH:MM (24h)" }, 400);
  }

  const tz = timezone || "UTC";
  if (!isValidTimezone(tz)) {
    return c.json({ error: "Invalid timezone" }, 400);
  }

  const id = await createNotifier(user.id, provider, name, config, time, tz);
  await refreshNotificationSchedule();
  const notifier = await getNotifierById(id, user.id);
  return c.json({ notifier }, 201);
});

// PUT /:id — update notifier
app.put("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await getNotifierById(id, user.id);
  if (!existing) {
    return c.json({ error: "Notifier not found" }, 404);
  }

  // Validate config if provided
  if (body.config) {
    const provider = getProvider(body.provider || existing.provider);
    if (provider) {
      const validation = provider.validateConfig(body.config);
      if (!validation.valid) {
        return c.json({ error: validation.error }, 400);
      }
    }
  }

  if (body.notify_time && !isValidTime(body.notify_time)) {
    return c.json({ error: "Invalid time format. Use HH:MM (24h)" }, 400);
  }

  if (body.timezone && !isValidTimezone(body.timezone)) {
    return c.json({ error: "Invalid timezone" }, 400);
  }

  await updateNotifier(id, user.id, {
    config: body.config,
    notifyTime: body.notify_time,
    timezone: body.timezone,
    enabled: body.enabled,
  });
  await refreshNotificationSchedule();

  const notifier = await getNotifierById(id, user.id);
  return c.json({ notifier });
});

// DELETE /:id — delete notifier
app.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const existing = await getNotifierById(id, user.id);
  if (!existing) {
    return c.json({ error: "Notifier not found" }, 404);
  }

  await deleteNotifier(id, user.id);
  await refreshNotificationSchedule();
  return c.json({ ok: true });
});

// POST /:id/test — send test notification
app.post("/:id/test", async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id");

  const notifier = await getNotifierById(id, user.id);
  if (!notifier) {
    return c.json({ error: "Notifier not found" }, 404);
  }

  const providerImpl = getProvider(notifier.provider);
  if (!providerImpl) {
    return c.json({ error: "Unknown provider" }, 400);
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
