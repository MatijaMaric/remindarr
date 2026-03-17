import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import { CONFIG } from "../config";
import notifierApp from "./notifiers";
import type { AppEnv } from "../types";
import * as registry from "../notifications/registry";
import * as Sentry from "@sentry/bun";
import { SubscriptionExpiredError } from "../notifications/webpush";

let app: Hono<AppEnv>;
let userToken: string;
let userId: string;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  setupTestDb();

  userId = createUser("testuser", "hash");
  userToken = createSession(userId);

  app = new Hono<AppEnv>();
  app.use("/notifiers/*", requireAuth);
  app.use("/notifiers", requireAuth);
  app.route("/notifiers", notifierApp);
});

afterEach(() => {
  spies.forEach((s) => s.mockRestore());
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

function headers() {
  return { Cookie: `${CONFIG.SESSION_COOKIE_NAME}=${userToken}` };
}

function jsonHeaders() {
  return { ...headers(), "Content-Type": "application/json" };
}

const validNotifier = {
  provider: "discord",
  config: {
    webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefghijklmnop",
  },
  notify_time: "09:00",
  timezone: "UTC",
};

describe("GET /notifiers", () => {
  it("returns empty list initially", async () => {
    const res = await app.request("/notifiers", { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifiers).toHaveLength(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/notifiers");
    expect(res.status).toBe(401);
  });
});

describe("GET /notifiers/providers", () => {
  it("returns available providers", async () => {
    const res = await app.request("/notifiers/providers", {
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers).toContain("discord");
  });
});

describe("POST /notifiers", () => {
  it("creates a notifier", async () => {
    const res = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validNotifier),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.notifier.name).toBe("Discord");
    expect(body.notifier.provider).toBe("discord");
    expect(body.notifier.notify_time).toBe("09:00");
    expect(body.notifier.timezone).toBe("UTC");
    expect(body.notifier.enabled).toBe(true);
  });

  it("rejects unknown provider", async () => {
    const res = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validNotifier, provider: "telegram" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Unknown provider");
  });

  it("rejects invalid webhook URL", async () => {
    const res = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        ...validNotifier,
        config: { webhookUrl: "https://example.com/bad" },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });

  it("rejects invalid time format", async () => {
    const res = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validNotifier, notify_time: "25:00" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid timezone", async () => {
    const res = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...validNotifier, timezone: "Invalid/TZ" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /notifiers/:id", () => {
  it("updates a notifier", async () => {
    // Create
    const createRes = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validNotifier),
    });
    const { notifier } = await createRes.json();

    // Update
    const res = await app.request(`/notifiers/${notifier.id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ notify_time: "18:00" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifier.notify_time).toBe("18:00");
  });

  it("returns 404 for non-existent notifier", async () => {
    const res = await app.request("/notifiers/nonexistent", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ notify_time: "10:00" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /notifiers/:id", () => {
  it("deletes a notifier", async () => {
    const createRes = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validNotifier),
    });
    const { notifier } = await createRes.json();

    const res = await app.request(`/notifiers/${notifier.id}`, {
      method: "DELETE",
      headers: headers(),
    });
    expect(res.status).toBe(200);

    // Verify deleted
    const listRes = await app.request("/notifiers", { headers: headers() });
    const body = await listRes.json();
    expect(body.notifiers).toHaveLength(0);
  });
});

describe("POST /notifiers/:id/test", () => {
  async function createDiscordNotifier() {
    const res = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validNotifier),
    });
    const { notifier } = await res.json();
    return notifier;
  }

  it("returns 404 for non-existent notifier", async () => {
    const res = await app.request("/notifiers/nonexistent/test", {
      method: "POST",
      headers: headers(),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with success:true when send succeeds", async () => {
    const notifier = await createDiscordNotifier();

    const mockProvider = {
      name: "discord",
      validateConfig: () => ({ valid: true }),
      send: async () => {},
    };
    spies.push(spyOn(registry, "getProvider").mockReturnValue(mockProvider));

    const res = await app.request(`/notifiers/${notifier.id}/test`, {
      method: "POST",
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe("Test notification sent");
  });

  it("returns 200 with success:false when send throws", async () => {
    const notifier = await createDiscordNotifier();

    const mockProvider = {
      name: "discord",
      validateConfig: () => ({ valid: true }),
      send: async () => { throw new Error("Connection refused"); },
    };
    spies.push(spyOn(registry, "getProvider").mockReturnValue(mockProvider));
    spies.push(spyOn(Sentry, "captureException").mockImplementation(() => ""));

    const res = await app.request(`/notifiers/${notifier.id}/test`, {
      method: "POST",
      headers: headers(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe("Connection refused");
  });

  it("captures non-SubscriptionExpiredError in Sentry", async () => {
    const notifier = await createDiscordNotifier();

    const sendError = new Error("Web push failed");
    const mockProvider = {
      name: "discord",
      validateConfig: () => ({ valid: true }),
      send: async () => { throw sendError; },
    };
    spies.push(spyOn(registry, "getProvider").mockReturnValue(mockProvider));
    const sentrySpy = spyOn(Sentry, "captureException").mockImplementation(() => "");
    spies.push(sentrySpy);

    await app.request(`/notifiers/${notifier.id}/test`, {
      method: "POST",
      headers: headers(),
    });

    expect(sentrySpy).toHaveBeenCalledWith(sendError);
  });

  it("does not capture SubscriptionExpiredError in Sentry", async () => {
    const notifier = await createDiscordNotifier();

    const mockProvider = {
      name: "discord",
      validateConfig: () => ({ valid: true }),
      send: async () => { throw new SubscriptionExpiredError("https://example.com/push"); },
    };
    spies.push(spyOn(registry, "getProvider").mockReturnValue(mockProvider));
    const sentrySpy = spyOn(Sentry, "captureException").mockImplementation(() => "");
    spies.push(sentrySpy);

    await app.request(`/notifiers/${notifier.id}/test`, {
      method: "POST",
      headers: headers(),
    });

    expect(sentrySpy).not.toHaveBeenCalled();
  });
});

describe("ownership enforcement", () => {
  it("user cannot access another user's notifier", async () => {
    // Create notifier as user 1
    const createRes = await app.request("/notifiers", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(validNotifier),
    });
    const { notifier } = await createRes.json();

    // Create user 2
    const user2Id = createUser("other", "hash");
    const user2Token = createSession(user2Id);
    const user2Headers = {
      Cookie: `${CONFIG.SESSION_COOKIE_NAME}=${user2Token}`,
    };

    // User 2 shouldn't see user 1's notifiers
    const listRes = await app.request("/notifiers", {
      headers: user2Headers,
    });
    const listBody = await listRes.json();
    expect(listBody.notifiers).toHaveLength(0);

    // User 2 can't update user 1's notifier
    const updateRes = await app.request(`/notifiers/${notifier.id}`, {
      method: "PUT",
      headers: { ...user2Headers, "Content-Type": "application/json" },
      body: JSON.stringify({ notify_time: "10:00" }),
    });
    expect(updateRes.status).toBe(404);

    // User 2 can't delete user 1's notifier
    const deleteRes = await app.request(`/notifiers/${notifier.id}`, {
      method: "DELETE",
      headers: user2Headers,
    });
    expect(deleteRes.status).toBe(404);
  });
});
