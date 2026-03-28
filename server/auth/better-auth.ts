import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins/username";
import { admin } from "better-auth/plugins/admin";
import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { CONFIG } from "../config";
import { getOidcConfig, isOidcConfigured } from "../db/repository";
import { users, account, sessions, verification, passkey as passkeyTable, getDb } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import type { Platform } from "../platform/types";
import type { DrizzleDb } from "../platform/types";

const log = logger.child({ module: "auth" });

/**
 * Derive the WebAuthn Relying Party ID from a base URL.
 * Strips the "www." prefix so the rpID is the registrable domain,
 * which is valid for both www and non-www origins per WebAuthn spec.
 */
export function getPasskeyRpId(baseUrl: string): string | undefined {
  if (!baseUrl) return undefined;
  try {
    let hostname = new URL(baseUrl).hostname;
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    return undefined;
  }
}

/**
 * Given a base URL, return an array of origins for WebAuthn validation.
 * Includes both www and non-www variants so passkeys work on either domain.
 */
export function buildPasskeyOrigins(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/$/, "");
  if (!normalized) return [];
  try {
    const url = new URL(normalized);
    const origins = [url.origin];
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      origins.push(url.origin);
    } else {
      url.hostname = `www.${url.hostname}`;
      origins.push(url.origin);
    }
    return origins;
  } catch {
    return [normalized];
  }
}

/** Check if OIDC claims grant admin status based on configured claim/value. */
export function checkAdminClaim(
  claims: Record<string, unknown>,
  claimName: string,
  claimValue: string
): boolean {
  if (!claimName || !claimValue) return false;
  const value = claims[claimName];
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) {
    return value.some((v) => String(v) === claimValue);
  }
  return String(value) === claimValue;
}

export type BetterAuthInstance = ReturnType<typeof createAuth>;

export function createAuth(db: DrizzleDb, platform: Platform, oidcConfig?: {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  adminClaim: string;
  adminValue: string;
}) {
  // Per-request nonce → isAdmin mapping to avoid race conditions when the same
  // sub logs in concurrently. Each getUserInfo call generates a unique nonce,
  // and the corresponding database hook dequeues it in FIFO order.
  const pendingOidcAdminStatus = new Map<string, boolean>(); // nonce → isAdmin
  const pendingNoncesByAccountId = new Map<string, string[]>(); // sub → nonce queue

  const plugins: any[] = [
    username({
      minUsernameLength: 1,
      maxUsernameLength: 100,
    }),
    admin(),
    passkeyPlugin({
      rpID: CONFIG.PASSKEY_RP_ID || getPasskeyRpId(CONFIG.BASE_URL),
      rpName: CONFIG.PASSKEY_RP_NAME || "Remindarr",
      origin: CONFIG.PASSKEY_ORIGIN
        ? CONFIG.PASSKEY_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
        : (CONFIG.BASE_URL ? buildPasskeyOrigins(CONFIG.BASE_URL) : null),
    }),
  ];

  if (oidcConfig?.issuerUrl && oidcConfig?.clientId && oidcConfig?.clientSecret) {
    const discoveryUrl = `${oidcConfig.issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
    plugins.push(
      genericOAuth({
        config: [{
          providerId: "pocketid",
          clientId: oidcConfig.clientId,
          clientSecret: oidcConfig.clientSecret,
          discoveryUrl,
          scopes: ["openid", "profile", "email", "groups"],
          redirectURI: oidcConfig.redirectUri || undefined,
          getUserInfo: async (tokens) => {
            // Fetch user info from the OIDC provider's userinfo endpoint
            // We need discovery first to get the userinfo endpoint
            const discoResp = await fetch(discoveryUrl);
            const disco = await discoResp.json() as { userinfo_endpoint?: string };

            let claims: Record<string, unknown> = {};

            // Decode id_token claims if available
            if (tokens.idToken) {
              try {
                const payload = tokens.idToken.split(".")[1];
                claims = JSON.parse(atob(payload));
              } catch { /* ignore */ }
            }

            // Fetch userinfo (takes precedence)
            if (disco.userinfo_endpoint && tokens.accessToken) {
              try {
                const resp = await fetch(disco.userinfo_endpoint, {
                  headers: { Authorization: `Bearer ${tokens.accessToken}` },
                });
                if (resp.ok) {
                  const userinfo = await resp.json() as Record<string, unknown>;
                  claims = { ...claims, ...userinfo };
                }
              } catch { /* ignore */ }
            }

            if (!claims.sub) return null;

            // Enqueue admin status keyed by a per-request nonce so that
            // concurrent logins for the same sub don't overwrite each other.
            if (oidcConfig.adminClaim && oidcConfig.adminValue) {
              const isAdmin = checkAdminClaim(claims, oidcConfig.adminClaim, oidcConfig.adminValue);
              const nonce = crypto.randomUUID();
              pendingOidcAdminStatus.set(nonce, isAdmin);
              const queue = pendingNoncesByAccountId.get(String(claims.sub)) ?? [];
              queue.push(nonce);
              pendingNoncesByAccountId.set(String(claims.sub), queue);
            }

            return {
              id: String(claims.sub),
              name: (claims.name || claims.preferred_username || String(claims.sub)) as string,
              email: claims.email as string | undefined,
              emailVerified: !!claims.email_verified,
              image: claims.picture as string | undefined,
            };
          },
          mapProfileToUser: (profile) => ({
            name: profile.name,
            email: profile.email || undefined,
            image: profile.image,
            username: profile.email?.split("@")[0] || profile.name?.replace(/\s+/g, "_").toLowerCase() || profile.id,
          }),
        }],
      })
    );
  }

  const secret = CONFIG.BETTER_AUTH_SECRET || crypto.randomUUID();
  if (!CONFIG.BETTER_AUTH_SECRET) {
    log.warn("BETTER_AUTH_SECRET not set — using random secret. Sessions will not persist across restarts.");
  }

  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: users,
        session: sessions,
        account,
        verification,
        passkey: passkeyTable,
      },
    }),
    secret,
    baseURL: CONFIG.BASE_URL || `http://localhost:${CONFIG.PORT}`,
    basePath: "/api/auth",
    trustedOrigins: [
      ...(CONFIG.CORS_ORIGIN
        ? CONFIG.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean).flatMap(buildPasskeyOrigins)
        : []),
      ...(CONFIG.BASE_URL ? buildPasskeyOrigins(CONFIG.BASE_URL) : []),
    ].filter((v, i, a) => a.indexOf(v) === i),
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
    emailAndPassword: {
      enabled: true,
      password: {
        hash: (password) => platform.hashPassword(password),
        verify: ({ password, hash }) => platform.verifyPassword(password, hash),
      },
    },
    user: {
      modelName: "user",
      fields: {
        name: "name",
      },
      additionalFields: {
        username: {
          type: "string",
          required: false,
          unique: true,
          fieldName: "username",
        },
      },
    },
    session: {
      modelName: "session",
    },
    account: {
      modelName: "account",
    },
    plugins,
    databaseHooks: {
      account: {
        create: {
          after: async (acc) => {
            // Sync admin role for new OIDC users
            if (acc.providerId === "pocketid") {
              const queue = pendingNoncesByAccountId.get(acc.accountId);
              if (queue && queue.length > 0) {
                const nonce = queue.shift()!;
                if (queue.length === 0) pendingNoncesByAccountId.delete(acc.accountId);
                const isAdmin = pendingOidcAdminStatus.get(nonce);
                if (isAdmin !== undefined) {
                  pendingOidcAdminStatus.delete(nonce);
                  const role = isAdmin ? "admin" : "user";
                  const currentDb = getDb();
                  await currentDb.update(users).set({ role }).where(eq(users.id, acc.userId)).run();
                  log.info("Set OIDC user role", { userId: acc.userId, role });
                }
              }
            }
          },
        },
      },
      session: {
        create: {
          after: async (sess) => {
            // Sync admin role for returning OIDC users
            if (pendingNoncesByAccountId.size === 0) return;

            const currentDb = getDb();
            const acc = await currentDb
              .select({ accountId: account.accountId })
              .from(account)
              .where(
                and(
                  eq(account.userId, sess.userId),
                  eq(account.providerId, "pocketid")
                )
              )
              .get();

            if (acc) {
              const queue = pendingNoncesByAccountId.get(acc.accountId);
              if (queue && queue.length > 0) {
                const nonce = queue.shift()!;
                if (queue.length === 0) pendingNoncesByAccountId.delete(acc.accountId);
                const isAdmin = pendingOidcAdminStatus.get(nonce);
                if (isAdmin !== undefined) {
                  pendingOidcAdminStatus.delete(nonce);
                  const role = isAdmin ? "admin" : "user";
                  await currentDb.update(users).set({ role }).where(eq(users.id, sess.userId)).run();
                  log.info("Synced OIDC user role", { userId: sess.userId, role });
                }
              }
            }
          },
        },
      },
    },
  });

  return auth;
}

/**
 * Create auth instance with OIDC config resolved from DB/env.
 * Used by entry points that need async OIDC config resolution.
 */
export async function createAuthWithOidc(db: DrizzleDb, platform: Platform) {
  let oidcConfig: Parameters<typeof createAuth>[2] | undefined;

  if (await isOidcConfigured()) {
    const config = await getOidcConfig();
    oidcConfig = {
      issuerUrl: config.issuerUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      adminClaim: config.adminClaim,
      adminValue: config.adminValue,
    };
  }

  return createAuth(db, platform, oidcConfig);
}
