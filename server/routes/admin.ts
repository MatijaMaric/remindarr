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
import { logger } from "../logger";
import { zValidator } from "../lib/validator";

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
    await _onOidcSettingsChanged();
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
