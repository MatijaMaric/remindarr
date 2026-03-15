import { eq, like, sql } from "drizzle-orm";
import { getDb } from "../schema";
import { settings } from "../schema";
import { CONFIG } from "../../config";
import { traceDbQuery } from "../../tracing";

export function getSetting(key: string): string | null {
  return traceDbQuery("getSetting", () => {
    const db = getDb();
    const row = db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .get();
    return row?.value ?? null;
  });
}

export function setSetting(key: string, value: string) {
  return traceDbQuery("setSetting", () => {
    const db = getDb();
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value` },
      })
      .run();
  });
}

export function deleteSetting(key: string) {
  return traceDbQuery("deleteSetting", () => {
    const db = getDb();
    db.delete(settings).where(eq(settings.key, key)).run();
  });
}

export function getSettingsByPrefix(prefix: string): Record<string, string> {
  return traceDbQuery("getSettingsByPrefix", () => {
    const db = getDb();
    const rows = db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(like(settings.key, `${prefix}%`))
      .all();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  });
}

// ─── OIDC Config Resolution ─────────────────────────────────────────────────

export function getOidcConfig() {
  return traceDbQuery("getOidcConfig", () => {
    const issuerUrl = CONFIG.OIDC_ISSUER_URL || getSetting("oidc_issuer_url") || "";
    const clientId = CONFIG.OIDC_CLIENT_ID || getSetting("oidc_client_id") || "";
    const clientSecret =
      CONFIG.OIDC_CLIENT_SECRET || getSetting("oidc_client_secret") || "";
    const redirectUri =
      CONFIG.OIDC_REDIRECT_URI || getSetting("oidc_redirect_uri") || "";

    const adminClaim =
      CONFIG.OIDC_ADMIN_CLAIM || getSetting("oidc_admin_claim") || "";
    const adminValue =
      CONFIG.OIDC_ADMIN_VALUE || getSetting("oidc_admin_value") || "";

    return { issuerUrl, clientId, clientSecret, redirectUri, adminClaim, adminValue };
  });
}

export function isOidcConfigured(): boolean {
  return traceDbQuery("isOidcConfigured", () => {
    const { issuerUrl, clientId, clientSecret } = getOidcConfig();
    return Boolean(issuerUrl && clientId && clientSecret);
  });
}
