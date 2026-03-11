import { Hono } from "hono";
import {
  getSetting,
  setSetting,
  deleteSetting,
  getSettingsByPrefix,
  isOidcConfigured,
  getOidcConfig,
} from "../db/repository";
import { clearDiscoveryCache } from "../auth/oidc";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";

const app = new Hono<AppEnv>();

const OIDC_SETTING_KEYS = ["oidc_issuer_url", "oidc_client_id", "oidc_client_secret", "oidc_redirect_uri", "oidc_admin_claim", "oidc_admin_value"];

// GET /api/admin/settings
app.get("/settings", (c) => {
  const dbSettings = getSettingsByPrefix("oidc_");

  // Show which values come from env vs DB
  const oidc = {
    issuer_url: {
      value: getOidcConfig().issuerUrl,
      source: CONFIG.OIDC_ISSUER_URL ? "env" : (dbSettings.oidc_issuer_url ? "db" : "unset"),
    },
    client_id: {
      value: getOidcConfig().clientId,
      source: CONFIG.OIDC_CLIENT_ID ? "env" : (dbSettings.oidc_client_id ? "db" : "unset"),
    },
    client_secret: {
      value: getOidcConfig().clientSecret ? "********" : "",
      source: CONFIG.OIDC_CLIENT_SECRET ? "env" : (dbSettings.oidc_client_secret ? "db" : "unset"),
    },
    redirect_uri: {
      value: getOidcConfig().redirectUri,
      source: CONFIG.OIDC_REDIRECT_URI ? "env" : (dbSettings.oidc_redirect_uri ? "db" : "unset"),
    },
    admin_claim: {
      value: getOidcConfig().adminClaim,
      source: CONFIG.OIDC_ADMIN_CLAIM ? "env" : (dbSettings.oidc_admin_claim ? "db" : "unset"),
    },
    admin_value: {
      value: getOidcConfig().adminValue,
      source: CONFIG.OIDC_ADMIN_VALUE ? "env" : (dbSettings.oidc_admin_value ? "db" : "unset"),
    },
  };

  return c.json({
    oidc,
    oidc_configured: isOidcConfigured(),
  });
});

// PUT /api/admin/settings
app.put("/settings", async (c) => {
  const body = await c.req.json().catch(() => ({}));

  for (const key of OIDC_SETTING_KEYS) {
    if (key in body) {
      const value = body[key];
      if (value === "" || value === null) {
        deleteSetting(key);
      } else {
        setSetting(key, value);
      }
    }
  }

  // Clear OIDC discovery cache when settings change
  clearDiscoveryCache();

  return c.json({ success: true, oidc_configured: isOidcConfigured() });
});

export default app;
