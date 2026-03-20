import { getOidcConfig, createOidcState, consumeOidcState, cleanExpiredOidcStates } from "../db/repository";
import { traceHttp } from "../tracing";

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

let cachedDiscovery: { data: OidcDiscovery; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getDiscovery(): Promise<OidcDiscovery> {
  const { issuerUrl } = await getOidcConfig();
  if (!issuerUrl) throw new Error("OIDC issuer URL not configured");

  if (cachedDiscovery && Date.now() - cachedDiscovery.fetchedAt < CACHE_TTL_MS) {
    return cachedDiscovery.data;
  }

  const url = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await traceHttp("GET", url, () => fetch(url));
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);

  const data = await res.json() as OidcDiscovery;
  cachedDiscovery = { data, fetchedAt: Date.now() };
  return data;
}

/** Clear cached discovery (e.g. when OIDC settings change) */
export function clearDiscoveryCache() {
  cachedDiscovery = null;
}

// SQLite-backed state store for OIDC authorization flow
// Supports multi-instance deployments and avoids memory leak risks

export async function generateState(): Promise<string> {
  // Clean up expired states
  await cleanExpiredOidcStates();

  const state = crypto.randomUUID();
  await createOidcState(state);
  return state;
}

export async function validateState(state: string): Promise<boolean> {
  return await consumeOidcState(state);
}

/** Exchange authorization code for tokens and extract user info from id_token */
export async function exchangeCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = await getOidcConfig();
  const discovery = await getDiscovery();

  const res = await traceHttp("POST", discovery.token_endpoint, () =>
    fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${err}`);
  }

  const tokens = await res.json() as { id_token?: string; access_token: string };

  // Extract claims from id_token (base64-decode payload)
  let idTokenClaims: Record<string, unknown> = {};
  if (tokens.id_token) {
    const payload = tokens.id_token.split(".")[1];
    idTokenClaims = JSON.parse(atob(payload));
  }

  // Always fetch userinfo to get full claims (id_token often lacks group/role claims)
  let userinfoClaims: Record<string, unknown> = {};
  if (discovery.userinfo_endpoint) {
    try {
      const userinfoRes = await traceHttp("GET", discovery.userinfo_endpoint, () =>
        fetch(discovery.userinfo_endpoint, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
      );
      if (userinfoRes.ok) {
        userinfoClaims = await userinfoRes.json() as Record<string, unknown>;
      }
    } catch {
      // Userinfo fetch failed; continue with id_token claims only
    }
  }

  // Merge claims: userinfo takes precedence for richer data (e.g. groups)
  const claims = { ...idTokenClaims, ...userinfoClaims };

  if (!claims.sub) throw new Error("No 'sub' claim found in token or userinfo");

  return {
    sub: claims.sub as string,
    username: (claims.preferred_username || claims.email || claims.sub) as string,
    displayName: ((claims.name || claims.preferred_username || null) as string | null),
    claims,
  };
}
