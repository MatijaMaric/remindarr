import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { CONFIG } from "../config";
CONFIG.DB_PATH = ":memory:";

import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { exchangeCode, clearDiscoveryCache, getDiscovery } from "./oidc";
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
});
