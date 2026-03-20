import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { CONFIG } from "../config";
CONFIG.DB_PATH = ":memory:";

import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { exchangeCode, clearDiscoveryCache, getDiscovery, generateState, validateState } from "./oidc";
import { setSetting, createOidcState, consumeOidcState, cleanExpiredOidcStates } from "../db/repository";

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

let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  setupTestDb();
  clearDiscoveryCache();
  fetchSpy = spyOn(globalThis, "fetch");

  // Configure OIDC settings in the DB
  await setSetting("oidc_issuer_url", "https://auth.example.com");
  await setSetting("oidc_client_id", "test-client");
  await setSetting("oidc_client_secret", "test-secret");
  await setSetting("oidc_redirect_uri", "https://app.example.com/callback");
});

afterEach(() => {
  fetchSpy.mockRestore();
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

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
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
    });

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

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
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
    });

    const result = await exchangeCode("code", "https://app.example.com/callback");

    expect(result.claims.groups).toEqual(["remindarr"]);
  });

  it("falls back to id_token claims when userinfo fetch fails", async () => {
    const idTokenPayload = {
      sub: "user789",
      preferred_username: "fallback",
      name: "Fallback User",
    };

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
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
    });

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

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
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
    });

    const result = await exchangeCode("code", "https://app.example.com/callback");

    expect(result.sub).toBe("user-no-jwt");
    expect(result.claims.groups).toEqual(["admin"]);
  });

  it("throws when token exchange fails", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes(".well-known/openid-configuration")) {
        return new Response(JSON.stringify(DISCOVERY));
      }
      if (urlStr === DISCOVERY.token_endpoint) {
        return new Response("invalid_grant", { status: 400 });
      }
      return new Response("Not found", { status: 404 });
    });

    await expect(exchangeCode("bad-code", "https://app.example.com/callback")).rejects.toThrow(
      "Token exchange failed: 400"
    );
  });

  it("throws when no sub claim is found", async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
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
    });

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

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
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
    });

    const result = await exchangeCode("code", "https://app.example.com/callback");
    expect(result.username).toBe("user@example.com");
  });

  it("uses sub as username when preferred_username and email are missing", async () => {
    const userinfoPayload = { sub: "user-sub-only" };

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
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
    });

    const result = await exchangeCode("code", "https://app.example.com/callback");
    expect(result.username).toBe("user-sub-only");
    expect(result.displayName).toBeNull();
  });
});

describe("getDiscovery", () => {
  it("fetches and returns discovery document", async () => {
    fetchSpy.mockImplementation(async () => {
      return new Response(JSON.stringify(DISCOVERY));
    });

    const result = await getDiscovery();
    expect(result.authorization_endpoint).toBe(DISCOVERY.authorization_endpoint);
    expect(result.token_endpoint).toBe(DISCOVERY.token_endpoint);
    expect(result.userinfo_endpoint).toBe(DISCOVERY.userinfo_endpoint);
  });

  it("caches discovery and reuses it", async () => {
    let fetchCount = 0;
    fetchSpy.mockImplementation(async () => {
      fetchCount++;
      return new Response(JSON.stringify(DISCOVERY));
    });

    await getDiscovery();
    await getDiscovery();
    expect(fetchCount).toBe(1);
  });

  it("throws when discovery fetch fails", async () => {
    fetchSpy.mockImplementation(async () => {
      return new Response("Not found", { status: 404 });
    });

    await expect(getDiscovery()).rejects.toThrow("OIDC discovery failed: 404");
  });

  it("throws when issuer URL is not configured", async () => {
    // Remove the issuer URL setting
    await setSetting("oidc_issuer_url", "");

    await expect(getDiscovery()).rejects.toThrow("OIDC issuer URL not configured");
  });
});

describe("OIDC state store", () => {
  it("generates and validates a state token", async () => {
    const state = await generateState();
    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThan(0);
    expect(await validateState(state)).toBe(true);
  });

  it("rejects an unknown state token", async () => {
    expect(await validateState("nonexistent")).toBe(false);
  });

  it("consumes state on validation (single use)", async () => {
    const state = await generateState();
    expect(await validateState(state)).toBe(true);
    expect(await validateState(state)).toBe(false);
  });

  it("rejects expired state tokens", async () => {
    // Directly insert a state with old timestamp
    const oldState = "expired-state";
    await createOidcState(oldState);
    // Manually update created_at to 11 minutes ago
    const { getDb } = require("../db/schema");
    const db = getDb();
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    db.run(
      require("drizzle-orm").sql`UPDATE oidc_states SET created_at = ${elevenMinutesAgo} WHERE state = ${oldState}`
    );

    expect(await consumeOidcState(oldState)).toBe(false);
  });

  it("cleans up expired states", async () => {
    const { getDb } = require("../db/schema");
    const db = getDb();
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;

    // Insert some expired states directly
    await createOidcState("expired-1");
    await createOidcState("expired-2");
    db.run(
      require("drizzle-orm").sql`UPDATE oidc_states SET created_at = ${elevenMinutesAgo}`
    );

    // Insert a fresh state
    await createOidcState("fresh-1");

    await cleanExpiredOidcStates();

    // Expired states should be gone
    expect(await consumeOidcState("expired-1")).toBe(false);
    expect(await consumeOidcState("expired-2")).toBe(false);

    // Fresh state should still be valid
    expect(await consumeOidcState("fresh-1")).toBe(true);
  });
});
