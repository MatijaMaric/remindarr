import { eq, like, sql, lt } from "drizzle-orm";
import { getDb } from "../schema";
import { settings, oidcStates } from "../schema";
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

// ─── OIDC State Store ────────────────────────────────────────────────────────

const OIDC_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createOidcState(state: string): void {
  traceDbQuery("createOidcState", () => {
    const db = getDb();
    db.insert(oidcStates).values({ state, createdAt: Date.now() }).run();
  });
}

export function consumeOidcState(state: string): boolean {
  return traceDbQuery("consumeOidcState", () => {
    const db = getDb();
    const row = db
      .select()
      .from(oidcStates)
      .where(eq(oidcStates.state, state))
      .get();
    if (!row) return false;
    db.delete(oidcStates).where(eq(oidcStates.state, state)).run();
    return Date.now() - row.createdAt < OIDC_STATE_TTL_MS;
  });
}

export function cleanExpiredOidcStates(): void {
  traceDbQuery("cleanExpiredOidcStates", () => {
    const db = getDb();
    const cutoff = Date.now() - OIDC_STATE_TTL_MS;
    db.delete(oidcStates).where(lt(oidcStates.createdAt, cutoff)).run();
  });
}
