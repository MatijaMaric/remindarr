import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { CONFIG } from "../config";
CONFIG.DB_PATH = ":memory:";

import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { exchangeCode, clearDiscoveryCache, getDiscovery, generateState, validateState } from "./oidc";
import { setSetting } from "../db/repository";

// Helper to create a fake JWT with given payload
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesig`;
}

const DISCOVERY = {
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  userinfo_endpoint: "https://auth.example.com/userinfo",
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  setupTestDb();
  clearDiscoveryCache();
  originalFetch = globalThis.fetch;

  // Configure OIDC settings in the DB
  setSetting("oidc_issuer_url", "https://auth.example.com");
  setSetting("oidc_client_id", "test-client");
  setSetting("oidc_client_secret", "test-secret");
  setSetting("oidc_redirect_uri", "https://app.example.com/callback");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  teardownTestDb();
});

describe("exchangeCode", () => {
  it("merges userinfo claims with id_token claims", async () => {
    const idTokenPayload = {
      sub: "user123",
      preferred_username: "testuser",
      email: "test@example.com",
      name: "Test User",
    };

    const userinfoPayload = {
      sub: "user123",
      preferred_username: "testuser",
      groups: ["admin", "users"],
    };

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response(
          JSON.stringify({
            id_token: fakeJwt(idTokenPayload),
            access_token: "test-access-token",
          })
        );
      }
      if (urlStr === DISCOVERY.userinfo_endpoint) {
        return new Response(JSON.stringify(userinfoPayload));
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await exchangeCode("auth-code", "https://app.example.com/callback");

    expect(result.sub).toBe("user123");
    expect(result.username).toBe("testuser");
    expect(result.displayName).toBe("Test User");
    // Groups should come from userinfo
    expect(result.claims.groups).toEqual(["admin", "users"]);
    // id_token fields should still be present
    expect(result.claims.email).toBe("test@example.com");
  });

  it("works when id_token has no groups but userinfo does", async () => {
    const idTokenPayload = {
      sub: "user456",
      preferred_username: "nogroups",
    };

    const userinfoPayload = {
      sub: "user456",
      preferred_username: "nogroups",
      groups: ["remindarr"],
    };

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response(
          JSON.stringify({
            id_token: fakeJwt(idTokenPayload),
            access_token: "token",
          })
        );
      }
      if (urlStr === DISCOVERY.userinfo_endpoint) {
        return new Response(JSON.stringify(userinfoPayload));
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await exchangeCode("code", "https://app.example.com/callback");

    expect(result.claims.groups).toEqual(["remindarr"]);
  });

  it("falls back to id_token claims when userinfo fetch fails", async () => {
    const idTokenPayload = {
      sub: "user789",
      preferred_username: "fallback",
      name: "Fallback User",
    };

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response(
          JSON.stringify({
            id_token: fakeJwt(idTokenPayload),
            access_token: "token",
          })
        );
      }
      if (urlStr === DISCOVERY.userinfo_endpoint) {
        return new Response("Internal Server Error", { status: 500 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await exchangeCode("code", "https://app.example.com/callback");

    expect(result.sub).toBe("user789");
    expect(result.username).toBe("fallback");
    expect(result.displayName).toBe("Fallback User");
  });

  it("works with only userinfo (no id_token)", async () => {
    const userinfoPayload = {
      sub: "user-no-jwt",
      preferred_username: "nojwt",
      name: "No JWT",
      groups: ["admin"],
    };

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response(
          JSON.stringify({
            access_token: "token",
            // No id_token
          })
        );
      }
      if (urlStr === DISCOVERY.userinfo_endpoint) {
        return new Response(JSON.stringify(userinfoPayload));
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await exchangeCode("code", "https://app.example.com/callback");

    expect(result.sub).toBe("user-no-jwt");
    expect(result.claims.groups).toEqual(["admin"]);
  });

  it("throws when token exchange fails", async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response("invalid_grant", { status: 400 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    await expect(exchangeCode("bad-code", "https://app.example.com/callback")).rejects.toThrow(
      "Token exchange failed: 400"
    );
  });

  it("throws when no sub claim is found", async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response(
          JSON.stringify({
            id_token: fakeJwt({ preferred_username: "nosub" }),
            access_token: "token",
          })
        );
      }
      if (urlStr === DISCOVERY.userinfo_endpoint) {
        return new Response(JSON.stringify({ preferred_username: "nosub" }));
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    await expect(exchangeCode("code", "https://app.example.com/callback")).rejects.toThrow(
      "No 'sub' claim found"
    );
  });

  it("uses email as username when preferred_username is missing", async () => {
    const userinfoPayload = {
      sub: "user-email-only",
      email: "user@example.com",
      name: "Email User",
    };

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response(JSON.stringify({ access_token: "token" }));
      }
      if (urlStr === DISCOVERY.userinfo_endpoint) {
        return new Response(JSON.stringify(userinfoPayload));
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await exchangeCode("code", "https://app.example.com/callback");
    expect(result.username).toBe("user@example.com");
  });

  it("uses sub as username when preferred_username and email are missing", async () => {
    const userinfoPayload = { sub: "user-sub-only" };

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response(JSON.stringify({ access_token: "token" }));
      }
      if (urlStr === DISCOVERY.userinfo_endpoint) {
        return new Response(JSON.stringify(userinfoPayload));
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await exchangeCode("code", "https://app.example.com/callback");
    expect(result.username).toBe("user-sub-only");
    expect(result.displayName).toBeNull();
  });
});

describe("generateState / validateState", () => {
  it("generates a unique state and validates it once", () => {
    const state = generateState();
    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThan(0);

    expect(validateState(state)).toBe(true);
    // Second validation should fail (state is consumed)
    expect(validateState(state)).toBe(false);
  });

  it("rejects unknown state", () => {
    expect(validateState("unknown-state-token")).toBe(false);
  });

  it("generates unique states each time", () => {
    const state1 = generateState();
    const state2 = generateState();
    expect(state1).not.toBe(state2);
  });
});

describe("getDiscovery", () => {
  it("fetches and returns discovery document", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify(DISCOVERY));
    }) as unknown as typeof fetch;

    const result = await getDiscovery();
    expect(result.authorization_endpoint).toBe(DISCOVERY.authorization_endpoint);
    expect(result.token_endpoint).toBe(DISCOVERY.token_endpoint);
    expect(result.userinfo_endpoint).toBe(DISCOVERY.userinfo_endpoint);
  });

  it("caches discovery and reuses it", async () => {
    let fetchCount = 0;
    globalThis.fetch = mock(async () => {
      fetchCount++;
      return new Response(JSON.stringify(DISCOVERY));
    }) as unknown as typeof fetch;

    await getDiscovery();
    await getDiscovery();
    expect(fetchCount).toBe(1);
  });

  it("throws when discovery fetch fails", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    await expect(getDiscovery()).rejects.toThrow("OIDC discovery failed: 404");
  });

  it("throws when issuer URL is not configured", async () => {
    // Remove the issuer URL setting
    setSetting("oidc_issuer_url", "");

    await expect(getDiscovery()).rejects.toThrow("OIDC issuer URL not configured");
  });
});
