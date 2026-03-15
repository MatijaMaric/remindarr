import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import calendarApp from "./calendar";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;

beforeEach(() => {
  setupTestDb();
  app = new Hono<AppEnv>();
  app.route("/calendar", calendarApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /calendar", () => {
  it("returns 400 when month is missing", async () => {
    const res = await app.request("/calendar");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("month parameter required");
  });

  it("returns 400 for invalid month format", async () => {
    const res = await app.request("/calendar?month=2026-1");
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid objectType", async () => {
    const res = await app.request("/calendar?month=2026-03&type=INVALID");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid type");
  });

  it("accepts valid objectType MOVIE", async () => {
    const res = await app.request("/calendar?month=2026-03&type=MOVIE");
    expect(res.status).toBe(200);
  });

  it("accepts valid objectType SHOW", async () => {
    const res = await app.request("/calendar?month=2026-03&type=SHOW");
    expect(res.status).toBe(200);
  });

  it("accepts request without type filter", async () => {
    const res = await app.request("/calendar?month=2026-03");
    expect(res.status).toBe(200);
  });
});
