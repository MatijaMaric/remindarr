import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  getUserByProviderSubject,
} from "../db/repository";
import * as repository from "../db/repository";
import * as oidc from "../auth/oidc";
import type { AppEnv } from "../types";

const authApp = (await import("./auth")).default;

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  setupTestDb();
  app = new Hono<AppEnv>();
  app.route("/auth", authApp);

  spies = [
    spyOn(oidc, "exchangeCode").mockResolvedValue({
      sub: "oidc-sub-123",
      username: "oidcuser",
      displayName: "OIDC User",
      claims: { sub: "oidc-sub-123", groups: ["users"] },
    }),
    spyOn(oidc, "validateState").mockResolvedValue(true),
    spyOn(oidc, "generateState").mockResolvedValue("mock-state"),
    spyOn(oidc, "getDiscovery").mockResolvedValue({
      authorization_endpoint: "https://idp.example.com/authorize",
      token_endpoint: "https://idp.example.com/token",
      userinfo_endpoint: "https://idp.example.com/userinfo",
    }),
    spyOn(repository, "isOidcConfigured").mockResolvedValue(true),
    spyOn(repository, "getOidcConfig").mockResolvedValue({
      issuerUrl: "https://idp.example.com",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/auth/oidc/callback",
      adminClaim: "groups",
      adminValue: "admin",
    }),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /auth/oidc/callback - race condition", () => {
  it("handles concurrent user creation (UNIQUE constraint) gracefully", async () => {
    // Simulate the race: pre-create the OIDC user so createUser will hit UNIQUE constraint
    await createUser("oidcuser", null, "OIDC User", "oidc", "oidc-sub-123", false);

    // The callback should catch the duplicate error and find the existing user
    const res = await app.request(
      "/auth/oidc/callback?code=test-code&state=valid-state",
    );

    // Should redirect to / (success) instead of /login?error=...
    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toBe("/");
  });

  it("creates a new OIDC user on first login", async () => {
    const res = await app.request(
      "/auth/oidc/callback?code=test-code&state=valid-state",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");

    // Verify user was created in DB
    const user = await getUserByProviderSubject("oidc", "oidc-sub-123");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("oidcuser");
  });

  it("appends _oidc suffix when username is taken by a local user", async () => {
    // Create a local user with the same username
    await createUser("oidcuser", "hash", "Local User");

    const res = await app.request(
      "/auth/oidc/callback?code=test-code&state=valid-state",
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");

    const user = await getUserByProviderSubject("oidc", "oidc-sub-123");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("oidcuser_oidc");
  });

  it("re-throws non-duplicate errors during user creation", async () => {
    (oidc.exchangeCode as any).mockResolvedValueOnce({
      sub: "",
      username: "someone",
      displayName: "Someone",
      claims: { sub: "" },
    });

    const res = await app.request(
      "/auth/oidc/callback?code=test-code&state=valid-state",
    );

    // Should redirect to login with error since getUserByProviderSubject("oidc", "")
    // won't find a user and the error gets re-thrown
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toStartWith("/login?error=");
  });
});
