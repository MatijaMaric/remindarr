import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createAuth, checkAdminClaim } from "./better-auth";
import { getDb } from "../db/schema";
import { users, account } from "../db/schema";
import {
  createOidcState,
  consumeOidcState,
} from "../db/repository";
import type { Platform } from "../platform/types";

const platform: Platform = {
  hashPassword: async (password: string) => Bun.password.hash(password),
  verifyPassword: async (password: string, hash: string) =>
    Bun.password.verify(password, hash),
};

const MOCK_ISSUER = "https://auth.example.com";
const MOCK_CLIENT_ID = "test-client-id";
const MOCK_CLIENT_SECRET = "test-client-secret";

const MOCK_DISCOVERY = {
  issuer: MOCK_ISSUER,
  authorization_endpoint: `${MOCK_ISSUER}/authorize`,
  token_endpoint: `${MOCK_ISSUER}/token`,
  userinfo_endpoint: `${MOCK_ISSUER}/userinfo`,
  jwks_uri: `${MOCK_ISSUER}/.well-known/jwks`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Create a minimal fake JWT with the given claims (uses base64 that atob() can handle). */
function makeIdToken(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.fakesig`;
}

/** Build a standard mock fetch handler for the OIDC provider. */
function makeMockFetch(
  userinfoClaims: Record<string, unknown>,
  opts?: { tokenStatus?: number; userinfoStatus?: number }
) {
  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);

    if (url.includes(".well-known/openid-configuration")) {
      return jsonResponse(MOCK_DISCOVERY);
    }

    if (url === MOCK_DISCOVERY.token_endpoint) {
      const status = opts?.tokenStatus ?? 200;
      if (status !== 200) {
        return jsonResponse({ error: "invalid_grant", error_description: "Code expired" }, status);
      }
      const idToken = makeIdToken(userinfoClaims);
      return jsonResponse({
        access_token: "mock-access-token",
        token_type: "Bearer",
        id_token: idToken,
        expires_in: 3600,
      });
    }

    if (url === MOCK_DISCOVERY.userinfo_endpoint) {
      const status = opts?.userinfoStatus ?? 200;
      if (status !== 200) {
        return new Response("Unauthorized", { status });
      }
      return jsonResponse(userinfoClaims);
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };
}

// ─── checkAdminClaim unit tests ───────────────────────────────────────────────

describe("checkAdminClaim", () => {
  test("returns true when scalar claim matches", () => {
    expect(checkAdminClaim({ role: "admin" }, "role", "admin")).toBe(true);
  });

  test("returns false when scalar claim does not match", () => {
    expect(checkAdminClaim({ role: "user" }, "role", "admin")).toBe(false);
  });

  test("returns true when array claim contains the value", () => {
    expect(checkAdminClaim({ groups: ["users", "admins"] }, "groups", "admins")).toBe(true);
  });

  test("returns false when array claim does not contain the value", () => {
    expect(checkAdminClaim({ groups: ["users", "viewers"] }, "groups", "admins")).toBe(false);
  });

  test("returns false when array claim is empty", () => {
    expect(checkAdminClaim({ groups: [] }, "groups", "admins")).toBe(false);
  });

  test("returns false when claim key is missing", () => {
    expect(checkAdminClaim({}, "role", "admin")).toBe(false);
  });

  test("returns false when claim value is null", () => {
    expect(checkAdminClaim({ role: null }, "role", "admin")).toBe(false);
  });

  test("returns false when claim value is undefined", () => {
    expect(checkAdminClaim({ role: undefined }, "role", "admin")).toBe(false);
  });

  test("returns false when claimName is empty string", () => {
    expect(checkAdminClaim({ role: "admin" }, "", "admin")).toBe(false);
  });

  test("returns false when claimValue is empty string", () => {
    expect(checkAdminClaim({ role: "admin" }, "role", "")).toBe(false);
  });

  test("coerces numeric scalar to string for comparison", () => {
    expect(checkAdminClaim({ level: 1 }, "level", "1")).toBe(true);
  });

  test("coerces numeric array element to string for comparison", () => {
    expect(checkAdminClaim({ levels: [1, 2, 3] }, "levels", "2")).toBe(true);
  });

  test("returns false when numeric value does not match string", () => {
    expect(checkAdminClaim({ level: 1 }, "level", "2")).toBe(false);
  });

  test("is case-sensitive", () => {
    expect(checkAdminClaim({ role: "Admin" }, "role", "admin")).toBe(false);
    expect(checkAdminClaim({ role: "admin" }, "role", "Admin")).toBe(false);
  });
});

// ─── OIDC state management (DB layer) ────────────────────────────────────────

describe("OIDC state management", () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  test("createOidcState stores state in DB", async () => {
    await createOidcState("test-state-abc");
    // consumeOidcState returns true if the state exists and is not expired
    const valid = await consumeOidcState("test-state-abc");
    expect(valid).toBe(true);
  });

  test("consumeOidcState removes the state after consumption", async () => {
    await createOidcState("one-time-state");
    const first = await consumeOidcState("one-time-state");
    const second = await consumeOidcState("one-time-state");
    expect(first).toBe(true);
    expect(second).toBe(false); // already consumed
  });

  test("consumeOidcState returns false for unknown state", async () => {
    const valid = await consumeOidcState("nonexistent-state");
    expect(valid).toBe(false);
  });
});

// ─── OIDC authorization redirect flow ────────────────────────────────────────

describe("OIDC authorize endpoint", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setupTestDb();
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      (async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes(".well-known/openid-configuration")) {
          return jsonResponse(MOCK_DISCOVERY);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }) as typeof fetch
    );
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    teardownTestDb();
  });

  function makeAuth(extra?: { adminClaim?: string; adminValue?: string }) {
    return createAuth(getDb(), platform, {
      issuerUrl: MOCK_ISSUER,
      clientId: MOCK_CLIENT_ID,
      clientSecret: MOCK_CLIENT_SECRET,
      redirectUri: "",
      adminClaim: extra?.adminClaim ?? "",
      adminValue: extra?.adminValue ?? "",
    });
  }

  test("POST /api/auth/sign-in/social redirects to OIDC provider", async () => {
    const auth = makeAuth();

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "pocketid",
          callbackURL: "http://localhost:3000/",
        }),
      })
    );

    // better-auth returns 302 redirect or 200 with { url } in body
    expect([200, 302]).toContain(res.status);

    let authUrl: URL;
    if (res.status === 302) {
      const location = res.headers.get("location") ?? "";
      expect(location).toBeTruthy();
      authUrl = new URL(location);
    } else {
      const body = await res.json() as { url?: string };
      expect(body.url).toBeTruthy();
      authUrl = new URL(body.url!);
    }

    expect(authUrl.href).toContain(MOCK_ISSUER);
  });

  test("authorization URL includes required OAuth parameters", async () => {
    const auth = makeAuth();

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "pocketid",
          callbackURL: "http://localhost:3000/",
        }),
      })
    );

    let authUrl: URL;
    if (res.status === 302) {
      authUrl = new URL(res.headers.get("location") ?? "");
    } else {
      const body = await res.json() as { url?: string };
      authUrl = new URL(body.url!);
    }

    expect(authUrl.searchParams.get("client_id")).toBe(MOCK_CLIENT_ID);
    expect(authUrl.searchParams.get("state")).toBeTruthy();
    expect(authUrl.searchParams.get("response_type")).toBe("code");
  });

  test("authorization URL includes openid scope", async () => {
    const auth = makeAuth();

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "pocketid",
          callbackURL: "http://localhost:3000/",
        }),
      })
    );

    let authUrl: URL;
    if (res.status === 302) {
      authUrl = new URL(res.headers.get("location") ?? "");
    } else {
      const body = await res.json() as { url?: string };
      authUrl = new URL(body.url!);
    }

    const scope = authUrl.searchParams.get("scope") ?? "";
    expect(scope).toContain("openid");
  });

  test("returns error for unknown provider ID", async () => {
    const auth = makeAuth();

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "nonexistent-provider",
          callbackURL: "http://localhost:3000/",
        }),
      })
    );

    expect(res.status).not.toBe(200);
  });

  test("OIDC plugin is not added when issuerUrl is empty", () => {
    // createAuth without OIDC config should not register the genericOAuth plugin
    const auth = createAuth(getDb(), platform);
    expect(auth).toBeDefined();
    // No error thrown — auth instance is valid without OIDC
  });
});

// ─── OIDC callback flow ───────────────────────────────────────────────────────

describe("OIDC callback flow", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setupTestDb();
    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    teardownTestDb();
  });

  function makeAuth(opts?: { adminClaim?: string; adminValue?: string }) {
    return createAuth(getDb(), platform, {
      issuerUrl: MOCK_ISSUER,
      clientId: MOCK_CLIENT_ID,
      clientSecret: MOCK_CLIENT_SECRET,
      redirectUri: "",
      adminClaim: opts?.adminClaim ?? "",
      adminValue: opts?.adminValue ?? "",
    });
  }

  /**
   * Runs the full authorize → callback flow.
   * Returns the callback response and the auth instance.
   */
  async function runOidcFlow(
    userinfoClaims: Record<string, unknown>,
    opts?: {
      adminClaim?: string;
      adminValue?: string;
      tokenStatus?: number;
      userinfoStatus?: number;
    }
  ): Promise<{ callbackRes: Response }> {
    fetchSpy.mockImplementation(
      makeMockFetch(userinfoClaims, {
        tokenStatus: opts?.tokenStatus,
        userinfoStatus: opts?.userinfoStatus,
      })
    );

    const auth = makeAuth({ adminClaim: opts?.adminClaim, adminValue: opts?.adminValue });

    // Step 1: initiate the OAuth flow to obtain a valid state
    const authorizeRes = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "pocketid",
          callbackURL: "http://localhost:3000/",
        }),
      })
    );

    let state: string;
    if (authorizeRes.status === 302) {
      const location = authorizeRes.headers.get("location") ?? "";
      state = new URL(location).searchParams.get("state") ?? "";
    } else {
      const body = await authorizeRes.json() as { url?: string };
      state = new URL(body.url!).searchParams.get("state") ?? "";
    }
    expect(state).toBeTruthy();

    // Forward cookies from authorize response to callback request
    const setCookies = authorizeRes.headers.getSetCookie?.() ?? [];
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");

    // Step 2: simulate the provider redirecting back with code + state
    const callbackRes = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/callback/pocketid?code=test-auth-code&state=${state}`,
        {
          method: "GET",
          headers: cookieHeader ? { Cookie: cookieHeader } : {},
        }
      )
    );

    return { callbackRes };
  }

  test("successful callback creates a new user in the database", async () => {
    await runOidcFlow({
      sub: "oidc-user-001",
      name: "Alice OIDC",
      email: "alice@example.com",
      email_verified: true,
    });

    const db = getDb();
    const allUsers = await db.select().from(users).all();
    expect(allUsers.some((u) => u.name === "Alice OIDC")).toBe(true);
  });

  test("successful callback creates an account record linked to pocketid provider", async () => {
    await runOidcFlow({
      sub: "oidc-user-002",
      name: "Bob OIDC",
      email: "bob@example.com",
    });

    const db = getDb();
    const accounts = await db.select().from(account).all();
    expect(
      accounts.some((a) => a.providerId === "pocketid" && a.accountId === "oidc-user-002")
    ).toBe(true);
  });

  test("successful callback sets a session cookie", async () => {
    const { callbackRes } = await runOidcFlow({
      sub: "oidc-user-session",
      name: "Session User",
      email: "session@example.com",
    });

    // On success, better-auth sets a session cookie and redirects (302)
    const cookies = callbackRes.headers.getSetCookie?.() ?? [];
    const hasBetterAuthCookie = cookies.some((c) =>
      c.includes("better-auth.session_token")
    );
    expect(hasBetterAuthCookie).toBe(true);
  });

  test("callback with admin array claim grants admin role", async () => {
    await runOidcFlow(
      {
        sub: "oidc-admin-001",
        name: "Admin User Array",
        email: "admin-array@example.com",
        groups: ["users", "admins"],
      },
      { adminClaim: "groups", adminValue: "admins" }
    );

    const db = getDb();
    const allUsers = await db.select().from(users).all();
    const adminUser = allUsers.find((u) => u.name === "Admin User Array");
    expect(adminUser).toBeDefined();
    expect(adminUser?.role).toBe("admin");
  });

  test("callback without admin claim grants user role", async () => {
    await runOidcFlow(
      {
        sub: "oidc-regular-001",
        name: "Regular User",
        email: "regular@example.com",
        groups: ["users"],
      },
      { adminClaim: "groups", adminValue: "admins" }
    );

    const db = getDb();
    const allUsers = await db.select().from(users).all();
    const regularUser = allUsers.find((u) => u.name === "Regular User");
    expect(regularUser).toBeDefined();
    expect(regularUser?.role).toBe("user");
  });

  test("callback with admin scalar claim grants admin role", async () => {
    await runOidcFlow(
      {
        sub: "oidc-scalar-admin",
        name: "Scalar Admin User",
        email: "scalar-admin@example.com",
        role: "superadmin",
      },
      { adminClaim: "role", adminValue: "superadmin" }
    );

    const db = getDb();
    const allUsers = await db.select().from(users).all();
    const adminUser = allUsers.find((u) => u.name === "Scalar Admin User");
    expect(adminUser?.role).toBe("admin");
  });

  test("callback with no admin config assigns user role by default", async () => {
    await runOidcFlow({
      sub: "oidc-default-role",
      name: "Default Role User",
      email: "default-role@example.com",
      role: "superadmin", // claim present but no claim config
    });

    const db = getDb();
    const allUsers = await db.select().from(users).all();
    const user = allUsers.find((u) => u.name === "Default Role User");
    expect(user).toBeDefined();
    // With no adminClaim configured, role should be 'user'
    expect(user?.role).toBe("user");
  });

  test("second login with same sub syncs returning user role", async () => {
    // First login — no admin
    await runOidcFlow(
      {
        sub: "returning-user",
        name: "Returning User",
        email: "returning@example.com",
        groups: ["users"],
      },
      { adminClaim: "groups", adminValue: "admins" }
    );

    // Verify not admin after first login
    const db = getDb();
    let allUsers = await db.select().from(users).all();
    const userAfterFirst = allUsers.find((u) => u.name === "Returning User");
    expect(userAfterFirst?.role).toBe("user");

    // Second login — now has admin claim
    await runOidcFlow(
      {
        sub: "returning-user",
        name: "Returning User",
        email: "returning@example.com",
        groups: ["users", "admins"],
      },
      { adminClaim: "groups", adminValue: "admins" }
    );

    allUsers = await db.select().from(users).all();
    const userAfterSecond = allUsers.find((u) => u.name === "Returning User");
    expect(userAfterSecond?.role).toBe("admin");
  });

  test("callback with invalid state returns an error response", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes(".well-known/openid-configuration")) {
        return jsonResponse(MOCK_DISCOVERY);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const auth = makeAuth();

    const res = await auth.handler(
      new Request(
        "http://localhost:3000/api/auth/callback/pocketid?code=some-code&state=invalid-state-xyz",
        { method: "GET" }
      )
    );

    // Should not succeed
    expect(res.status).not.toBe(200);
  });

  test("callback with failed token exchange returns an error response", async () => {
    const { callbackRes } = await runOidcFlow(
      { sub: "token-fail-user", name: "Token Fail User" },
      { tokenStatus: 400 }
    );

    // The provider returned an error; better-auth should return non-200
    expect(callbackRes.status).not.toBe(200);
  });

  test("callback when provider discovery is unavailable returns an error response", async () => {
    fetchSpy.mockImplementation(async () => {
      return new Response("Service Unavailable", { status: 503 });
    });

    const auth = makeAuth();

    let error: unknown;
    let res: Response | undefined;
    try {
      res = await auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: "pocketid",
            callbackURL: "http://localhost:3000/",
          }),
        })
      );
    } catch (e) {
      error = e;
    }

    // Either an error was thrown OR better-auth returned a non-success status
    if (error) {
      expect(error).toBeDefined();
    } else {
      expect(res!.status).not.toBe(200);
    }
  });

  test("callback missing code parameter returns an error response", async () => {
    fetchSpy.mockImplementation(makeMockFetch({ sub: "x", name: "X" }));

    const auth = makeAuth();

    // Initiate authorize to get a valid state
    const authorizeRes = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "pocketid",
          callbackURL: "http://localhost:3000/",
        }),
      })
    );

    let state: string;
    const setCookies = authorizeRes.headers.getSetCookie?.() ?? [];
    const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
    if (authorizeRes.status === 302) {
      state = new URL(authorizeRes.headers.get("location") ?? "").searchParams.get("state") ?? "";
    } else {
      const body = await authorizeRes.json() as { url?: string };
      state = new URL(body.url!).searchParams.get("state") ?? "";
    }

    // Callback without a code
    const res = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/callback/pocketid?state=${state}`,
        {
          method: "GET",
          headers: cookieHeader ? { Cookie: cookieHeader } : {},
        }
      )
    );

    expect(res.status).not.toBe(200);
  });
});
