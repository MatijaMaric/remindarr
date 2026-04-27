import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth, requireAdmin } from "../middleware/auth";
import jobsCfApp from "./jobs-cf";
import type { AppEnv } from "../types";
import { getDb, jobs } from "../db/schema";

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
let adminCookie: string;

beforeEach(async () => {
  setupTestDb();
  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/jobs/*", requireAuth, requireAdmin);
  app.use("/jobs", requireAuth, requireAdmin);
  app.route("/jobs", jobsCfApp);

  const hash = await Bun.password.hash("admin123");
  const adminId = await createUser("admin", hash, "Admin", "local", undefined, true);
  const token = await createSession(adminId);
  adminCookie = `better-auth.session_token=${token}`;
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /jobs (CF)", () => {
  it("returns stats, crons (4 entries), and recentJobs with snake_case fields", async () => {
    const res = await app.request("/jobs", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stats).toBeDefined();
    expect(body.crons).toBeArray();
    expect(body.crons).toHaveLength(5);

    const names = body.crons.map((c: any) => c.name);
    expect(names).toContain("sync-titles");
    expect(names).toContain("sync-episodes");
    expect(names).toContain("sync-deep-links");
    expect(names).toContain("send-notifications");

    const deepLinks = body.crons.find((c: any) => c.name === "sync-deep-links");
    expect(deepLinks.cron).toBe("0 4 * * *");
    expect(deepLinks.enabled).toBe(1);
    expect(deepLinks.last_run).toBeNull();
    expect(typeof deepLinks.next_run).toBe("string");

    expect(body.recentJobs).toBeArray();
  });

  it("includes last_run from most recent completed job", async () => {
    const db = getDb();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "completed",
      completedAt: "2026-03-29T04:00:00",
      runAt: "2026-03-29T03:00:00",
    });

    const res = await app.request("/jobs", {
      headers: { Cookie: adminCookie },
    });
    const body = await res.json();
    const syncTitles = body.crons.find((c: any) => c.name === "sync-titles");
    expect(syncTitles.last_run).toBe("2026-03-29T04:00:00");
  });

  it("recentJobs have snake_case keys", async () => {
    const db = getDb();
    await db.insert(jobs).values({ name: "sync-titles", status: "completed", runAt: new Date().toISOString() });

    const res = await app.request("/jobs", {
      headers: { Cookie: adminCookie },
    });
    const body = await res.json();
    expect(body.recentJobs).toHaveLength(1);
    expect(body.recentJobs[0]).toHaveProperty("started_at");
    expect(body.recentJobs[0]).toHaveProperty("completed_at");
    expect(body.recentJobs[0]).toHaveProperty("created_at");
  });

  it("stats reflect job counts", async () => {
    const db = getDb();
    await db.insert(jobs).values({ name: "sync-titles", status: "completed", runAt: new Date().toISOString() });
    await db.insert(jobs).values({ name: "sync-titles", status: "pending", runAt: new Date().toISOString() });

    const res = await app.request("/jobs", {
      headers: { Cookie: adminCookie },
    });
    const body = await res.json();
    expect(body.stats["sync-titles"].completed).toBe(1);
    expect(body.stats["sync-titles"].pending).toBe(1);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/jobs");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const hash = await Bun.password.hash("user123");
    const userId = await createUser("regularuser", hash, "User");
    const token = await createSession(userId);
    const res = await app.request("/jobs", {
      headers: { Cookie: `better-auth.session_token=${token}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /jobs/:name (CF)", () => {
  it("enqueues a valid job and returns jobId", async () => {
    const res = await app.request("/jobs/sync-deep-links", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBeGreaterThan(0);
    expect(body.success).toBe(true);
  });

  it("returns null jobId when job is already pending", async () => {
    const db = getDb();
    await db.insert(jobs).values({ name: "sync-deep-links", status: "pending", runAt: new Date().toISOString() });

    const res = await app.request("/jobs/sync-deep-links", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBeNull();
  });

  it("returns 400 for unknown job name", async () => {
    const res = await app.request("/jobs/unknown-job", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/jobs/sync-titles", { method: "POST" });
    expect(res.status).toBe(401);
  });
});
