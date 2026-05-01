import { Hono } from "hono";
import { z } from "zod";
import {
  getSetting,
  setSetting,
  deleteSetting,
  getSettingsByPrefix,
  isOidcConfigured,
  getOidcConfig,
  getAllUsers,
  getAdminUserCount,
  getUserTrackedCount,
  getUserById,
  banUser,
  unbanUser,
  deleteUser,
  updateUserAdmin,
} from "../db/repository";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";
import { ok } from "./response";
import { logger, getRecentLogs, type LogLevel } from "../logger";
import { zValidator } from "../lib/validator";
import { MemoryRateLimitStore } from "../middleware/rate-limit";

const log = logger.child({ module: "admin" });

const OIDC_SETTING_KEYS = [
  "oidc_issuer_url",
  "oidc_client_id",
  "oidc_client_secret",
  "oidc_redirect_uri",
  "oidc_admin_claim",
  "oidc_admin_value",
] as const;

// PUT /settings only accepts whitelisted OIDC keys. Values must be string|null
// (null or empty string deletes the setting). Unknown keys are ignored, which
// preserves the existing behavior before validation was added.
const updateSettingsSchema = z
  .object(Object.fromEntries(
    OIDC_SETTING_KEYS.map((k) => [k, z.string().nullable().optional()]),
  ) as Record<(typeof OIDC_SETTING_KEYS)[number], z.ZodOptional<z.ZodNullable<z.ZodString>>>)
  .passthrough();

const updateRoleSchema = z.object({
  role: z.enum(["admin", "user"]),
});

const banUserSchema = z.object({
  reason: z.string().nullish(),
});

/**
 * Callback to recreate the auth instance after OIDC settings change.
 * Registered by the entry point (index.ts on Bun, no-op on CF Workers).
 */
let _onOidcSettingsChanged: (() => Promise<void>) | null = null;

export function setOnOidcSettingsChanged(cb: () => Promise<void>) {
  _onOidcSettingsChanged = cb;
}

const app = new Hono<AppEnv>();

// GET /api/admin/settings
app.get("/settings", async (c) => {
  const dbSettings = await getSettingsByPrefix("oidc_");

  const oidcConfig = await getOidcConfig();
  // Show which values come from env vs DB
  const oidc = {
    issuer_url: {
      value: oidcConfig.issuerUrl,
      source: CONFIG.OIDC_ISSUER_URL ? "env" : (dbSettings.oidc_issuer_url ? "db" : "unset"),
    },
    client_id: {
      value: oidcConfig.clientId,
      source: CONFIG.OIDC_CLIENT_ID ? "env" : (dbSettings.oidc_client_id ? "db" : "unset"),
    },
    client_secret: {
      value: oidcConfig.clientSecret ? "********" : "",
      source: CONFIG.OIDC_CLIENT_SECRET ? "env" : (dbSettings.oidc_client_secret ? "db" : "unset"),
    },
    redirect_uri: {
      value: oidcConfig.redirectUri,
      source: CONFIG.OIDC_REDIRECT_URI ? "env" : (dbSettings.oidc_redirect_uri ? "db" : "unset"),
    },
    admin_claim: {
      value: oidcConfig.adminClaim,
      source: CONFIG.OIDC_ADMIN_CLAIM ? "env" : (dbSettings.oidc_admin_claim ? "db" : "unset"),
    },
    admin_value: {
      value: oidcConfig.adminValue,
      source: CONFIG.OIDC_ADMIN_VALUE ? "env" : (dbSettings.oidc_admin_value ? "db" : "unset"),
    },
  };

  return ok(c, {
    oidc,
    oidc_configured: await isOidcConfigured(),
  });
});

// PUT /api/admin/settings
app.put("/settings", zValidator("json", updateSettingsSchema), async (c) => {
  const body = c.req.valid("json") as Partial<Record<(typeof OIDC_SETTING_KEYS)[number], string | null>>;

  for (const key of OIDC_SETTING_KEYS) {
    if (key in body) {
      const value = body[key];
      if (value === "" || value === null || value === undefined) {
        await deleteSetting(key);
      } else {
        await setSetting(key, value);
      }
    }
  }

  // On Bun, recreate auth instance to pick up new OIDC config
  if (_onOidcSettingsChanged) {
    try {
      await _onOidcSettingsChanged();
    } catch (err) {
      log.error("OIDC settings reload failed", { error: err });
      return c.json(
        {
          error: "oidc_reload_failed",
          message: `Settings saved but OIDC reload failed: ${(err as Error).message}. Restart the server to recover.`,
        },
        500,
      );
    }
  }

  return ok(c, { oidc_configured: await isOidcConfigured() });
});

// ─── User management ─────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// GET /api/admin/users?search=&filter=all|active|banned&page=1
app.get("/users", async (c) => {
  const search = c.req.query("search") || undefined;
  const filter = (c.req.query("filter") as "all" | "active" | "banned") || "all";
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, total] = await Promise.all([
    getAllUsers({ search, filter, limit: PAGE_SIZE, offset }),
    getAdminUserCount({ search, filter }),
  ]);

  return ok(c, {
    users: rows,
    total,
    page,
    page_size: PAGE_SIZE,
    total_pages: Math.ceil(total / PAGE_SIZE),
  });
});

// GET /api/admin/users/:id
app.get("/users/:id", async (c) => {
  const id = c.req.param("id");
  const user = await getUserById(id);
  if (!user) return c.json({ error: "User not found" }, 404);

  const trackedCount = await getUserTrackedCount(id);
  return ok(c, { user: { ...user, tracked_count: trackedCount } });
});

// PUT /api/admin/users/:id/role  { role: "admin" | "user" }
app.put("/users/:id/role", zValidator("json", updateRoleSchema), async (c) => {
  const id = c.req.param("id");
  const actingUser = c.get("user")!;

  if (id === actingUser.id) {
    return c.json({ error: "Cannot change your own role" }, 400);
  }

  const { role } = c.req.valid("json");

  const target = await getUserById(id);
  if (!target) return c.json({ error: "User not found" }, 404);

  await updateUserAdmin(id, role === "admin");
  log.info("Admin role changed", { targetUserId: id, newRole: role, by: actingUser.id });
  return ok(c, { message: `User role updated to ${role}` });
});

// PUT /api/admin/users/:id/ban  { reason?: string }
//
// `reason` is optional and can be omitted entirely (no body), so we safe-parse
// against an empty-object fallback rather than wiring `zValidator` as
// middleware (which would 400 on missing Content-Length).
app.put("/users/:id/ban", async (c) => {
  const id = c.req.param("id");
  const actingUser = c.get("user")!;

  if (id === actingUser.id) {
    return c.json({ error: "Cannot ban yourself" }, 400);
  }

  const target = await getUserById(id);
  if (!target) return c.json({ error: "User not found" }, 404);

  const raw = await c.req.json().catch(() => ({}));
  const parsed = banUserSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", issues: parsed.error.issues },
      400,
    );
  }
  const reason = parsed.data.reason ?? null;
  await banUser(id, reason, null);
  log.info("User banned", { targetUserId: id, reason, by: actingUser.id });
  return ok(c, { message: "User banned" });
});

// PUT /api/admin/users/:id/unban
app.put("/users/:id/unban", async (c) => {
  const id = c.req.param("id");
  const target = await getUserById(id);
  if (!target) return c.json({ error: "User not found" }, 404);

  await unbanUser(id);
  log.info("User unbanned", { targetUserId: id, by: c.get("user")!.id });
  return ok(c, { message: "User unbanned" });
});

// ─── Config dump ─────────────────────────────────────────────────────────────

// Keys whose values are safe to expose to admins.
const SAFE_CONFIG_KEYS: Array<{ key: string; value: () => unknown; envVar?: string }> = [
  { key: "LOG_LEVEL", value: () => CONFIG.LOG_LEVEL, envVar: "LOG_LEVEL" },
  { key: "BASE_URL", value: () => CONFIG.BASE_URL, envVar: "BASE_URL" },
  { key: "TMDB_COUNTRY", value: () => CONFIG.COUNTRY, envVar: "TMDB_COUNTRY" },
  { key: "TMDB_LANGUAGE", value: () => CONFIG.LANGUAGE, envVar: "TMDB_LANGUAGE" },
  { key: "CACHE_BACKEND", value: () => CONFIG.CACHE_BACKEND, envVar: "CACHE_BACKEND" },
  { key: "JOB_QUEUE_BACKEND", value: () => CONFIG.JOB_QUEUE_BACKEND, envVar: "JOB_QUEUE_BACKEND" },
  { key: "CORS_ORIGIN", value: () => CONFIG.CORS_ORIGIN, envVar: "CORS_ORIGIN" },
  { key: "OIDC_ISSUER_URL", value: () => CONFIG.OIDC_ISSUER_URL, envVar: "OIDC_ISSUER_URL" },
  { key: "OIDC_REDIRECT_URI", value: () => CONFIG.OIDC_REDIRECT_URI, envVar: "OIDC_REDIRECT_URI" },
  { key: "OIDC_ADMIN_CLAIM", value: () => CONFIG.OIDC_ADMIN_CLAIM, envVar: "OIDC_ADMIN_CLAIM" },
  { key: "OIDC_ADMIN_VALUE", value: () => CONFIG.OIDC_ADMIN_VALUE, envVar: "OIDC_ADMIN_VALUE" },
  { key: "PASSKEY_RP_ID", value: () => CONFIG.PASSKEY_RP_ID, envVar: "PASSKEY_RP_ID" },
  { key: "PASSKEY_RP_NAME", value: () => CONFIG.PASSKEY_RP_NAME, envVar: "PASSKEY_RP_NAME" },
  { key: "PASSKEY_ORIGIN", value: () => CONFIG.PASSKEY_ORIGIN, envVar: "PASSKEY_ORIGIN" },
  { key: "VAPID_PUBLIC_KEY", value: () => CONFIG.VAPID_PUBLIC_KEY, envVar: "VAPID_PUBLIC_KEY" },
  { key: "VAPID_SUBJECT", value: () => CONFIG.VAPID_SUBJECT, envVar: "VAPID_SUBJECT" },
  { key: "SENTRY_DSN", value: () => CONFIG.SENTRY_DSN, envVar: "SENTRY_DSN" },
  { key: "PLEX_CLIENT_ID", value: () => CONFIG.PLEX_CLIENT_ID, envVar: "PLEX_CLIENT_ID" },
  { key: "DB_PATH", value: () => CONFIG.DB_PATH, envVar: "DB_PATH" },
  { key: "BACKUP_DIR", value: () => CONFIG.BACKUP_DIR, envVar: "BACKUP_DIR" },
  { key: "BACKUP_CRON", value: () => CONFIG.BACKUP_CRON, envVar: "BACKUP_CRON" },
  { key: "BACKUP_RETAIN", value: () => CONFIG.BACKUP_RETAIN, envVar: "BACKUP_RETAIN" },
  { key: "SYNC_TITLES_CRON", value: () => CONFIG.SYNC_TITLES_CRON, envVar: "SYNC_TITLES_CRON" },
  { key: "SYNC_EPISODES_CRON", value: () => CONFIG.SYNC_EPISODES_CRON, envVar: "SYNC_EPISODES_CRON" },
  { key: "GLOBAL_RATE_LIMIT_PER_MINUTE", value: () => CONFIG.GLOBAL_RATE_LIMIT_PER_MINUTE, envVar: "GLOBAL_RATE_LIMIT_PER_MINUTE" },
  { key: "AUTH_RATE_LIMIT_PER_MINUTE", value: () => CONFIG.AUTH_RATE_LIMIT_PER_MINUTE, envVar: "AUTH_RATE_LIMIT_PER_MINUTE" },
];

// Keys whose presence (but not value) is safe to expose.
const SECRET_CONFIG_KEYS: Array<{ key: string; present: () => boolean }> = [
  { key: "TMDB_API_KEY", present: () => !!CONFIG.TMDB_API_KEY },
  { key: "BETTER_AUTH_SECRET", present: () => !!CONFIG.BETTER_AUTH_SECRET },
  { key: "OIDC_CLIENT_ID", present: () => !!CONFIG.OIDC_CLIENT_ID },
  { key: "OIDC_CLIENT_SECRET", present: () => !!CONFIG.OIDC_CLIENT_SECRET },
  { key: "VAPID_PRIVATE_KEY", present: () => !!CONFIG.VAPID_PRIVATE_KEY },
  { key: "METRICS_TOKEN", present: () => !!CONFIG.METRICS_TOKEN },
  { key: "REDIS_URL", present: () => !!CONFIG.REDIS_URL },
  { key: "STREAMING_AVAILABILITY_API_KEY", present: () => !!CONFIG.STREAMING_AVAILABILITY_API_KEY },
];

// GET /api/admin/config — sanitized runtime configuration dump
app.get("/config", (c) => {
  const safe = SAFE_CONFIG_KEYS.map(({ key, value, envVar }) => ({
    key,
    value: value(),
    source: envVar && process.env[envVar] ? "env" : "default",
  }));

  const secrets = SECRET_CONFIG_KEYS.map(({ key, present }) => ({
    key,
    source: present() ? "env" : "unset",
  }));

  return ok(c, { safe, secrets });
});

// GET /api/admin/logs — in-process log tail (ring buffer)
// Per-user rate limit: 10 req/min, enforced via a shared store keyed by userId.
const logsRateLimitStore = new MemoryRateLimitStore();

const logsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  level: z.enum(["debug", "info", "warn", "error"]).optional(),
  module: z.string().optional(),
});

app.get("/logs", zValidator("query", logsQuerySchema), async (c) => {
  const user = c.get("user")!;
  const { limit, level, module } = c.req.valid("query");

  const { allowed, retryAfterMs } = await logsRateLimitStore.consume(
    `logs:${user.id}`,
    10,
    60_000,
    Date.now(),
  );
  if (!allowed) {
    c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return c.json({ error: "Too many requests" }, 429);
  }

  const entries = getRecentLogs(limit, level as LogLevel | undefined, module);
  return ok(c, { entries, count: entries.length });
});

// DELETE /api/admin/users/:id
app.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  const actingUser = c.get("user")!;

  if (id === actingUser.id) {
    return c.json({ error: "Cannot delete your own account from admin panel" }, 400);
  }

  const target = await getUserById(id);
  if (!target) return c.json({ error: "User not found" }, 404);

  await deleteUser(id);
  log.info("User deleted by admin", { targetUserId: id, by: actingUser.id });
  return ok(c, { message: "User deleted" });
});

export default app;
