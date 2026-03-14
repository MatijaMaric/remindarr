import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import healthApp from "./health";

let app: Hono;

beforeEach(() => {
  setupTestDb();
  app = new Hono();
  app.route("/health", healthApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
