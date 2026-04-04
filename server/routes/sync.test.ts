import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth, requireAdmin } from "../middleware/auth";
import * as syncTitles from "../tmdb/sync-titles";
import type { AppEnv } from "../types";

function createMockAuth(adminUserId?: string) {
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
let authedApp: Hono<AppEnv>;
let adminToken: string;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(async () => {
  setupTestDb();

  const adminId = await createUser("adminuser", "hash", "Admin", "local", undefined, true);
  adminToken = await createSession(adminId);

  spies = [
    spyOn(syncTitles, "fetchNewReleases").mockResolvedValue([makeParsedTitle()]),
  ];

  const syncApp = (await import("./sync")).default;

  // Unauthenticated app (mirrors real setup with requireAdmin middleware)
  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/sync/*", requireAuth, requireAdmin);
  app.use("/sync", requireAuth, requireAdmin);
  app.route("/sync", syncApp);

  // Admin-authenticated app
  authedApp = new Hono<AppEnv>();
  authedApp.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  authedApp.use("/sync/*", requireAuth, requireAdmin);
  authedApp.use("/sync", requireAuth, requireAdmin);
  authedApp.route("/sync", syncApp);
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

function adminHeaders() {
  return { Cookie: `better-auth.session_token=${adminToken}` };
}

describe("POST /sync", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await app.request("/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    expect(syncTitles.fetchNewReleases).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    const res = await authedApp.request("/sync", {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: "not valid json{",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON in request body");
    expect(syncTitles.fetchNewReleases).not.toHaveBeenCalled();
  });

  it("syncs titles with default parameters", async () => {
    (syncTitles.fetchNewReleases as any).mockResolvedValueOnce([makeParsedTitle()]);

    const res = await authedApp.request("/sync", {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.message).toContain("Synced");

    expect(syncTitles.fetchNewReleases).toHaveBeenCalledWith({
      daysBack: 30,
      objectType: undefined,
      maxPages: 10,
    });
  });

  it("passes custom parameters to fetchNewReleases", async () => {
    (syncTitles.fetchNewReleases as any).mockResolvedValueOnce([]);

    const res = await authedApp.request("/sync", {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ daysBack: 7, type: "MOVIE", maxPages: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);

    expect(syncTitles.fetchNewReleases).toHaveBeenCalledWith({
      daysBack: 7,
      objectType: "MOVIE",
      maxPages: 5,
    });
  });

  it("returns 500 when fetchNewReleases throws", async () => {
    (syncTitles.fetchNewReleases as any).mockRejectedValueOnce(new Error("TMDB API down"));

    const res = await authedApp.request("/sync", {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("TMDB API down");
  });
});
