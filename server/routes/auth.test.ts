import { describe, it, expect, beforeEach, afterEach, afterAll, mock, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, getUserByUsername, getUserByProviderSubject, setSetting } from "../db/repository";
import { CONFIG } from "../config";
import authApp, { checkAdminClaim } from "./auth";
import { generateState, clearDiscoveryCache } from "../auth/oidc";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  setupTestDb();
  clearDiscoveryCache();
  fetchSpy = spyOn(globalThis, "fetch");
  app = new Hono<AppEnv>();
  app.route("/auth", authApp);

  // Create a test user with a hashed password
  const hash = await Bun.password.hash("password123");
  createUser("testuser", hash, "Test User");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

afterAll(() => {
  teardownTestDb();
});

describe("POST /auth/login", () => {
  it("logs in with valid credentials", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("testuser");
    expect(res.headers.get("set-cookie")).toContain(CONFIG.SESSION_COOKIE_NAME);
  });

  it("returns 401 for wrong password", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for non-existent user", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nobody", password: "password" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("returns user when logged in", async () => {
    // Login first
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/me", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("testuser");
  });

  it("returns null user without session", async () => {
    const res = await app.request("/auth/me");
    const body = await res.json();
    expect(body.user).toBeNull();
  });
});

describe("POST /auth/logout", () => {
  it("clears session", async () => {
    // Login first
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    // Logout
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);

    // Verify session is gone
    const meRes = await app.request("/auth/me", {
      headers: { Cookie: cookie },
    });
    const meBody = await meRes.json();
    expect(meBody.user).toBeNull();
  });
});

describe("POST /auth/change-password", () => {
  it("returns 401 without authentication", async () => {
    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "password123", newPassword: "newpass456" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "password123" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for OIDC users", async () => {
    createUser("oidcuser", null, "OIDC User", "oidc", "oidc-sub-123");
    // Login as OIDC user via a session created directly
    const { createSession } = await import("../db/repository");
    const user = getUserByProviderSubject("oidc", "oidc-sub-123");
    const token = createSession(user!.id);

    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: {
        Cookie: `${CONFIG.SESSION_COOKIE_NAME}=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPassword: "any", newPassword: "newpass456" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("OIDC");
  });

  it("changes password successfully", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "password123", newPassword: "newpass456" }),
    });
    expect(res.status).toBe(200);

    // Verify new password works
    const newLoginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "newpass456" }),
    });
    expect(newLoginRes.status).toBe(200);
  });

  it("returns 400 for short password", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "password123", newPassword: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 for wrong current password", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "wrong", newPassword: "newpass456" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /auth/providers", () => {
  it("returns available providers", async () => {
    const res = await app.request("/auth/providers");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.local).toBe(true);
  });
});

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

function setupOidcConfig() {
  setSetting("oidc_issuer_url", "https://auth.example.com");
  setSetting("oidc_client_id", "test-client");
  setSetting("oidc_client_secret", "test-secret");
  setSetting("oidc_redirect_uri", "https://app.example.com/auth/oidc/callback");
  setSetting("oidc_admin_claim", "groups");
  setSetting("oidc_admin_value", "admin");
  clearDiscoveryCache();
}

function mockFetchForOidc(
  userinfoPayload: Record<string, unknown>,
  idTokenPayload?: Record<string, unknown>
) {
  fetchSpy.mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes(".well-known/openid-configuration")) {
      return new Response(JSON.stringify(DISCOVERY));
    }
    if (urlStr === DISCOVERY.token_endpoint) {
      return new Response(
        JSON.stringify({
          id_token: idTokenPayload ? fakeJwt(idTokenPayload) : undefined,
          access_token: "test-access-token",
        })
      );
    }
    if (urlStr === DISCOVERY.userinfo_endpoint) {
      return new Response(JSON.stringify(userinfoPayload));
    }
    return new Response("Not found", { status: 404 });
  });
}

describe("GET /auth/oidc/authorize", () => {
  it("returns 400 when OIDC is not configured", async () => {
    const res = await app.request("/auth/oidc/authorize");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("OIDC not configured");
  });

  it("redirects to authorization endpoint when OIDC is configured", async () => {
    setupOidcConfig();

    fetchSpy.mockImplementation(async () => {
      return new Response(JSON.stringify(DISCOVERY));
    });

    const res = await app.request("/auth/oidc/authorize");
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain(DISCOVERY.authorization_endpoint);
    expect(location).toContain("response_type=code");
    expect(location).toContain("client_id=test-client");
    expect(location).toContain("state=");
  });
});

describe("GET /auth/oidc/callback", () => {
  it("redirects to login with error when error param is present", async () => {
    setupOidcConfig();

    const res = await app.request("/auth/oidc/callback?error=access_denied");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=access_denied");
  });

  it("redirects to login when code or state is missing", async () => {
    setupOidcConfig();

    const res = await app.request("/auth/oidc/callback?code=abc");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=missing_params");
  });

  it("redirects to login when state is invalid", async () => {
    setupOidcConfig();

    const res = await app.request("/auth/oidc/callback?code=abc&state=invalid-state");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=invalid_state");
  });

  it("creates user and session on successful callback", async () => {
    setupOidcConfig();
    const state = generateState();

    const userinfo = {
      sub: "oidc-user-1",
      preferred_username: "oidcnewuser",
      name: "OIDC New User",
      groups: ["users"],
    };
    mockFetchForOidc(userinfo);

    const res = await app.request(`/auth/oidc/callback?code=valid-code&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain(CONFIG.SESSION_COOKIE_NAME);

    // Verify user was created in DB
    const user = getUserByProviderSubject("oidc", "oidc-user-1");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("oidcnewuser");
  });

  it("creates user with admin flag from claims", async () => {
    setupOidcConfig();
    const state = generateState();

    const userinfo = {
      sub: "oidc-admin-1",
      preferred_username: "oidcadmin",
      name: "OIDC Admin",
      groups: ["admin", "users"],
    };
    mockFetchForOidc(userinfo);

    const res = await app.request(`/auth/oidc/callback?code=valid-code&state=${state}`);
    expect(res.status).toBe(302);

    const user = getUserByProviderSubject("oidc", "oidc-admin-1");
    expect(user).not.toBeNull();
    expect(user!.is_admin).toBeTruthy();
  });

  it("deduplicates username when it already exists", async () => {
    setupOidcConfig();

    // "testuser" already exists from beforeEach
    const state = generateState();
    const userinfo = {
      sub: "oidc-dup-1",
      preferred_username: "testuser",
      name: "Duplicate User",
    };
    mockFetchForOidc(userinfo);

    const res = await app.request(`/auth/oidc/callback?code=valid-code&state=${state}`);
    expect(res.status).toBe(302);

    const user = getUserByProviderSubject("oidc", "oidc-dup-1");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("testuser_oidc");
  });

  it("syncs admin status on returning user login", async () => {
    setupOidcConfig();

    // Create an existing OIDC user without admin
    createUser("existingoidc", null, "Existing OIDC", "oidc", "oidc-existing-1", false);
    const userBefore = getUserByProviderSubject("oidc", "oidc-existing-1");
    expect(userBefore!.is_admin).toBeFalsy();

    const state = generateState();
    const userinfo = {
      sub: "oidc-existing-1",
      preferred_username: "existingoidc",
      groups: ["admin"],
    };
    mockFetchForOidc(userinfo);

    const res = await app.request(`/auth/oidc/callback?code=valid-code&state=${state}`);
    expect(res.status).toBe(302);

    const userAfter = getUserByProviderSubject("oidc", "oidc-existing-1");
    expect(userAfter!.is_admin).toBeTruthy();
  });

  it("redirects to login with error when token exchange fails", async () => {
    setupOidcConfig();
    const state = generateState();

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

    const res = await app.request(`/auth/oidc/callback?code=bad-code&state=${state}`);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("/login?error=");
    expect(location).toContain("Token%20exchange%20failed");
  });
});

describe("checkAdminClaim", () => {
  it("returns true when array claim contains the admin value", () => {
    const claims = { groups: ["admin", "users", "editors"] };
    expect(checkAdminClaim(claims, "groups", "admin")).toBe(true);
  });

  it("returns false when array claim does not contain the admin value", () => {
    const claims = { groups: ["users", "editors"] };
    expect(checkAdminClaim(claims, "groups", "admin")).toBe(false);
  });

  it("returns true when string claim matches the admin value", () => {
    const claims = { role: "admin" };
    expect(checkAdminClaim(claims, "role", "admin")).toBe(true);
  });

  it("returns false when string claim does not match", () => {
    const claims = { role: "user" };
    expect(checkAdminClaim(claims, "role", "admin")).toBe(false);
  });

  it("returns false when claim is missing from claims", () => {
    const claims = { email: "test@example.com" };
    expect(checkAdminClaim(claims, "groups", "admin")).toBe(false);
  });

  it("returns false when claimName is empty", () => {
    const claims = { groups: ["admin"] };
    expect(checkAdminClaim(claims, "", "admin")).toBe(false);
  });

  it("returns false when claimValue is empty", () => {
    const claims = { groups: ["admin"] };
    expect(checkAdminClaim(claims, "groups", "")).toBe(false);
  });

  it("is case-sensitive for string comparison", () => {
    const claims = { groups: ["Admin"] };
    expect(checkAdminClaim(claims, "groups", "admin")).toBe(false);
    expect(checkAdminClaim(claims, "groups", "Admin")).toBe(true);
  });
});
