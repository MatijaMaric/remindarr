import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession } from "../db/repository";
import { CONFIG } from "../config";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { registerCron, enqueueJob, claimNextJob, completeJob } from "../jobs/queue";
import jobsApp from "./jobs";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let adminCookie: string;

beforeEach(async () => {
  setupTestDb();
  app = new Hono<AppEnv>();
  app.use("/jobs/*", requireAuth, requireAdmin);
  app.use("/jobs", requireAuth, requireAdmin);
  app.route("/jobs", jobsApp);

  const hash = await Bun.password.hash("admin123");
  const adminId = createUser("admin", hash, "Admin", "local", undefined, true);
  const token = createSession(adminId);
  adminCookie = `${CONFIG.SESSION_COOKIE_NAME}=${token}`;
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /jobs", () => {
  it("returns stats, crons, and recent jobs", async () => {
    registerCron("sync-titles", "0 3 * * *");
    enqueueJob("sync-titles");

    const res = await app.request("/jobs", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stats).toBeDefined();
    expect(body.crons).toBeArray();
    expect(body.crons).toHaveLength(1);
    expect(body.crons[0].name).toBe("sync-titles");
    expect(body.recentJobs).toBeArray();
    expect(body.recentJobs).toHaveLength(1);
    expect(body.recentJobs[0].name).toBe("sync-titles");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/jobs");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    const hash = await Bun.password.hash("user123");
    const userId = createUser("regularuser", hash, "User");
    const token = createSession(userId);
    const userCookie = `${CONFIG.SESSION_COOKIE_NAME}=${token}`;

    const res = await app.request("/jobs", {
      headers: { Cookie: userCookie },
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /jobs/:name", () => {
  it("manually triggers a job", async () => {
    const res = await app.request("/jobs/sync-titles", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.jobId).toBeGreaterThan(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/jobs/sync-titles", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});
