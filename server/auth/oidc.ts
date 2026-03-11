import { getOidcConfig } from "../db/repository";

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

let cachedDiscovery: { data: OidcDiscovery; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getDiscovery(): Promise<OidcDiscovery> {
  const { issuerUrl } = getOidcConfig();
  if (!issuerUrl) throw new Error("OIDC issuer URL not configured");

  if (cachedDiscovery && Date.now() - cachedDiscovery.fetchedAt < CACHE_TTL_MS) {
    return cachedDiscovery.data;
  }

  const url = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);

  const data = await res.json() as OidcDiscovery;
  cachedDiscovery = { data, fetchedAt: Date.now() };
  return data;
}

/** Clear cached discovery (e.g. when OIDC settings change) */
export function clearDiscoveryCache() {
  cachedDiscovery = null;
}

// Simple in-memory state store for OIDC authorization flow
const stateStore = new Map<string, number>();

export function generateState(): string {
  // Clean up old states (older than 10 minutes)
  const now = Date.now();
  for (const [key, ts] of stateStore) {
    if (now - ts > 10 * 60 * 1000) stateStore.delete(key);
  }

  const state = crypto.randomUUID();
  stateStore.set(state, now);
  return state;
}

export function validateState(state: string): boolean {
  if (!stateStore.has(state)) return false;
  stateStore.delete(state);
  return true;
}

/** Exchange authorization code for tokens and extract user info from id_token */
export async function exchangeCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getOidcConfig();
  const discovery = await getDiscovery();

  const res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${err}`);
  }

  const tokens = await res.json() as { id_token?: string; access_token: string };

  // Extract claims from id_token (base64-decode payload)
  if (tokens.id_token) {
    const payload = tokens.id_token.split(".")[1];
    const claims = JSON.parse(atob(payload));
    return {
      sub: claims.sub as string,
      username: (claims.preferred_username || claims.email || claims.sub) as string,
      displayName: (claims.name || claims.preferred_username || null) as string | null,
      claims,
    };
  }

  // Fallback: use userinfo endpoint
  const userinfoRes = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userinfoRes.ok) throw new Error("Failed to fetch userinfo");
  const userinfo = await userinfoRes.json() as any;

  return {
    sub: userinfo.sub as string,
    username: (userinfo.preferred_username || userinfo.email || userinfo.sub) as string,
    displayName: (userinfo.name || null) as string | null,
    claims: userinfo as Record<string, unknown>,
  };
}
