import { eq, like, sql, lt } from "drizzle-orm";
import { getDb } from "../schema";
import { settings, oidcStates } from "../schema";
import { CONFIG } from "../../config";
import { traceDbQuery } from "../../tracing";

export async function getSetting(key: string): Promise<string | null> {
  return traceDbQuery("getSetting", async () => {
    const db = getDb();
    const row = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .get();
    return row?.value ?? null;
  });
}

export async function setSetting(key: string, value: string) {
  return traceDbQuery("setSetting", async () => {
    const db = getDb();
    await db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value` },
      })
      .run();
  });
}

export async function deleteSetting(key: string) {
  return traceDbQuery("deleteSetting", async () => {
    const db = getDb();
    await db.delete(settings).where(eq(settings.key, key)).run();
  });
}

export async function getSettingsByPrefix(prefix: string): Promise<Record<string, string>> {
  return traceDbQuery("getSettingsByPrefix", async () => {
    const db = getDb();
    const rows = await db
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

export async function getOidcConfig() {
  return traceDbQuery("getOidcConfig", async () => {
    const issuerUrl = CONFIG.OIDC_ISSUER_URL || await getSetting("oidc_issuer_url") || "";
    const clientId = CONFIG.OIDC_CLIENT_ID || await getSetting("oidc_client_id") || "";
    const clientSecret =
      CONFIG.OIDC_CLIENT_SECRET || await getSetting("oidc_client_secret") || "";
    const redirectUri =
      CONFIG.OIDC_REDIRECT_URI || await getSetting("oidc_redirect_uri") || "";

    const adminClaim =
      CONFIG.OIDC_ADMIN_CLAIM || await getSetting("oidc_admin_claim") || "";
    const adminValue =
      CONFIG.OIDC_ADMIN_VALUE || await getSetting("oidc_admin_value") || "";

    return { issuerUrl, clientId, clientSecret, redirectUri, adminClaim, adminValue };
  });
}

export async function isOidcConfigured(): Promise<boolean> {
  return traceDbQuery("isOidcConfigured", async () => {
    const { issuerUrl, clientId, clientSecret } = await getOidcConfig();
    return Boolean(issuerUrl && clientId && clientSecret);
  });
}

// ─── OIDC State Store ────────────────────────────────────────────────────────

const OIDC_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function createOidcState(state: string): Promise<void> {
  return traceDbQuery("createOidcState", async () => {
    const db = getDb();
    await db.insert(oidcStates).values({ state, createdAt: Date.now() }).run();
  });
}

export async function consumeOidcState(state: string): Promise<boolean> {
  return traceDbQuery("consumeOidcState", async () => {
    const db = getDb();
    const row = await db
      .select()
      .from(oidcStates)
      .where(eq(oidcStates.state, state))
      .get();
    if (!row) return false;
    await db.delete(oidcStates).where(eq(oidcStates.state, state)).run();
    return Date.now() - row.createdAt < OIDC_STATE_TTL_MS;
  });
}

export async function cleanExpiredOidcStates(): Promise<void> {
  return traceDbQuery("cleanExpiredOidcStates", async () => {
    const db = getDb();
    const cutoff = Date.now() - OIDC_STATE_TTL_MS;
    await db.delete(oidcStates).where(lt(oidcStates.createdAt, cutoff)).run();
  });
}
