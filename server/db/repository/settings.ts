import { eq, inArray, like, sql, lt } from "drizzle-orm";
import { getDb } from "../schema";
import { settings, oidcStates } from "../schema";
import { CONFIG } from "../../config";
import { traceDbQuery } from "../../tracing";

const OIDC_SETTING_KEYS = [
  "oidc_issuer_url",
  "oidc_client_id",
  "oidc_client_secret",
  "oidc_redirect_uri",
  "oidc_admin_claim",
  "oidc_admin_value",
] as const;

// One batched read per Drizzle handle. Workers build a new handle per request,
// so this is a per-request cache. Bun keeps one handle; writes drop the entry.
const oidcRowsCache = new WeakMap<object, Promise<Record<string, string>>>();

async function readOidcRows(
  db: ReturnType<typeof getDb>,
): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [...OIDC_SETTING_KEYS]))
    .all();
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

function loadOidcRows(): Promise<Record<string, string>> {
  const db = getDb();
  const cached = oidcRowsCache.get(db);
  if (cached) return cached;

  let pending: Promise<Record<string, string>>;
  pending = readOidcRows(db).catch((err: unknown) => {
    if (oidcRowsCache.get(db) === pending) oidcRowsCache.delete(db);
    throw err;
  });
  oidcRowsCache.set(db, pending);
  return pending;
}

function forgetOidcRows() {
  oidcRowsCache.delete(getDb());
}

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
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value` },
      })
      .run();
    forgetOidcRows();
    forgetVapidRows();
  });
}

export async function deleteSetting(key: string) {
  return traceDbQuery("deleteSetting", async () => {
    const db = getDb();
    await db.delete(settings).where(eq(settings.key, key)).run();
    forgetOidcRows();
    forgetVapidRows();
  });
}

export async function getSettingsByPrefix(
  prefix: string,
): Promise<Record<string, string>> {
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

// Same per-handle cache as OIDC. A /tick calls getVapidKeys once per web-push
// send; without this each send re-reads the three vapid keys (#1330).
const vapidRowsCache = new WeakMap<object, Promise<Record<string, string>>>();

export function getVapidSettings(): Promise<Record<string, string>> {
  const db = getDb();
  const cached = vapidRowsCache.get(db);
  if (cached) return cached;

  let pending: Promise<Record<string, string>>;
  pending = getSettingsByPrefix("vapid_").catch((err: unknown) => {
    if (vapidRowsCache.get(db) === pending) vapidRowsCache.delete(db);
    throw err;
  });
  vapidRowsCache.set(db, pending);
  return pending;
}

function forgetVapidRows() {
  vapidRowsCache.delete(getDb());
}

// ─── OIDC Config Resolution ─────────────────────────────────────────────────

export async function getOidcConfig() {
  return traceDbQuery("getOidcConfig", async () => {
    const fromEnv = {
      issuerUrl: CONFIG.OIDC_ISSUER_URL,
      clientId: CONFIG.OIDC_CLIENT_ID,
      clientSecret: CONFIG.OIDC_CLIENT_SECRET,
      redirectUri: CONFIG.OIDC_REDIRECT_URI,
      adminClaim: CONFIG.OIDC_ADMIN_CLAIM,
      adminValue: CONFIG.OIDC_ADMIN_VALUE,
    };
    const needsDb = Object.values(fromEnv).some((value) => !value);
    const dbSettings = needsDb ? await loadOidcRows() : {};

    return {
      issuerUrl: fromEnv.issuerUrl || dbSettings.oidc_issuer_url || "",
      clientId: fromEnv.clientId || dbSettings.oidc_client_id || "",
      clientSecret: fromEnv.clientSecret || dbSettings.oidc_client_secret || "",
      redirectUri: fromEnv.redirectUri || dbSettings.oidc_redirect_uri || "",
      adminClaim: fromEnv.adminClaim || dbSettings.oidc_admin_claim || "",
      adminValue: fromEnv.adminValue || dbSettings.oidc_admin_value || "",
    };
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
