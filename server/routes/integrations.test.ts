import { describe, it, expect, beforeEach, afterAll, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import integrationApp from "./integrations";
import type { AppEnv } from "../types";

// Mock Sentry
import Sentry from "../sentry";
spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));
spyOn(Sentry, "captureException").mockImplementation(() => "");

// Mock Plex client so no real HTTP calls are made
import * as plexClient from "../plex/client";
const spies: ReturnType<typeof spyOn>[] = [];

function createMockAuth() {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const cookieHeader = headers.get("cookie") || "";
        const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
        const token = match?.[1];
        if (!token) return null;
        const user = await getSessionWithUser(token);
        if (!user) return null;
        return {
          session: { id: "session-id", userId: user.id },
          user: {
            id: user.id,
            name: user.display_name,
            username: user.username,
            role: user.role || (user.is_admin ? "admin" : "user"),
          },
        };
      },
    },
  };
}

let app: Hono<AppEnv>;
let userToken: string;
let userId: string;

beforeEach(async () => {
  setupTestDb();

  userId = await createUser("integrationuser", "hash");
  userToken = await createSession(userId);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/integrations/*", requireAuth);
  app.use("/integrations", requireAuth);
  app.route("/integrations", integrationApp);
});

afterEach(() => {
  spies.forEach((s) => s.mockRestore());
  spies.length = 0;
});

afterAll(() => {
  teardownTestDb();
});

function headers() {
  return { Cookie: `better-auth.session_token=${userToken}` };
}

function jsonHeaders() {
  return { ...headers(), "Content-Type": "application/json" };
}

const validPlexIntegration = {
  provider: "plex",
  config: {
    plexToken: "my-plex-token",
    serverUrl: "http://plex:32400",
    serverId: "server-abc",
    serverName: "My Plex Server",
    syncMovies: true,
    syncEpisodes: true,
  },
};

describe("GET /integrations", () => {
  it("returns empty list for new user", async () => {
    const res = await app.request("/integrations", { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.integrations).toEqual([]);
  });

  it("returns created integrations", async () => {
    await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validPlexIntegration),
    });
    const res = await app.request("/integrations", { headers: headers() });
    const body = await res.json() as any;
    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0].provider).toBe("plex");
  });

  it("does not return plex token in config", async () => {
    await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validPlexIntegration),
    });
    const res = await app.request("/integrations", { headers: headers() });
    const body = await res.json() as any;
    expect(body.integrations[0].config.plexToken).toBeUndefined();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/integrations");
    expect(res.status).toBe(401);
  });
});

describe("POST /integrations", () => {
  it("creates a Plex integration", async () => {
    const res = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validPlexIntegration),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.integration.provider).toBe("plex");
    expect(body.integration.name).toBe("My Plex Server");
    expect(body.integration.enabled).toBe(true);
  });

  it("rejects unknown provider", async () => {
    const res = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ provider: "jellyfin", config: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing plex config fields", async () => {
    const res = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ provider: "plex", config: { plexToken: "x" } }),
    });
    expect(res.status).toBe(400);
  });

  it("strips trailing slash from serverUrl", async () => {
    const res = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        ...validPlexIntegration,
        config: { ...validPlexIntegration.config, serverUrl: "http://plex:32400/" },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.integration.config.serverUrl).toBe("http://plex:32400");
  });
});

describe("PUT /integrations/:id", () => {
  it("updates enabled state", async () => {
    const createRes = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validPlexIntegration),
    });
    const { integration } = await createRes.json() as any;

    const res = await app.request(`/integrations/${integration.id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.integration.enabled).toBe(false);
  });

  it("returns 404 for non-existent integration", async () => {
    const res = await app.request("/integrations/nonexistent", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /integrations/:id", () => {
  it("deletes an integration", async () => {
    const createRes = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validPlexIntegration),
    });
    const { integration } = await createRes.json() as any;

    const delRes = await app.request(`/integrations/${integration.id}`, {
      method: "DELETE",
      headers: headers(),
    });
    expect(delRes.status).toBe(200);

    const listRes = await app.request("/integrations", { headers: headers() });
    const body = await listRes.json() as any;
    expect(body.integrations).toHaveLength(0);
  });

  it("returns 404 for non-existent integration", async () => {
    const res = await app.request("/integrations/nonexistent", {
      method: "DELETE",
      headers: headers(),
    });
    expect(res.status).toBe(404);
  });
});

describe("validation", () => {
  it("rejects POST /integrations with missing config", async () => {
    const res = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ provider: "plex" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects POST /integrations with missing plex config fields", async () => {
    const res = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ provider: "plex", config: { plexToken: "x" } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects POST /integrations/plex/servers without authToken", async () => {
    const res = await app.request("/integrations/plex/servers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PUT /integrations/:id with non-boolean enabled", async () => {
    const createRes = await app.request("/integrations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validPlexIntegration),
    });
    const { integration } = await createRes.json() as any;

    const res = await app.request(`/integrations/${integration.id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ enabled: "yes" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("POST /integrations/plex/pin", () => {
  it("creates a Plex PIN and returns authUrl", async () => {
    const pinSpy = spyOn(plexClient, "createPin").mockResolvedValue({
      id: 12345,
      code: "ABCD",
      authToken: null,
      expiresAt: "2099-01-01T00:00:00Z",
    });
    spies.push(pinSpy);

    const res = await app.request("/integrations/plex/pin", {
      method: "POST",
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.pinId).toBe(12345);
    expect(body.authUrl).toContain("ABCD");
  });
});

describe("POST /integrations/plex/pin/:pinId", () => {
  it("returns resolved=false when pin not yet authorized", async () => {
    const checkSpy = spyOn(plexClient, "checkPin").mockResolvedValue({
      id: 1, code: "X", authToken: null, expiresAt: "2099-01-01",
    });
    spies.push(checkSpy);

    const res = await app.request("/integrations/plex/pin/1", {
      method: "POST",
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.resolved).toBe(false);
  });

  it("returns resolved=true with servers when pin is authorized", async () => {
    const checkSpy = spyOn(plexClient, "checkPin").mockResolvedValue({
      id: 1, code: "X", authToken: "my-token", expiresAt: "2099-01-01",
    });
    const serversSpy = spyOn(plexClient, "getServers").mockResolvedValue([
      { name: "Home Server", clientIdentifier: "server-id", connections: [{ uri: "http://192.168.1.1:32400", local: true, relay: false }] },
    ]);
    spies.push(checkSpy, serversSpy);

    const res = await app.request("/integrations/plex/pin/1", {
      method: "POST",
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.resolved).toBe(true);
    expect(body.authToken).toBe("my-token");
    expect(body.servers).toHaveLength(1);
  });
});
