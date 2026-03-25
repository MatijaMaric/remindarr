import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import authCustomApp from "./auth-custom";

describe("GET /providers", () => {
  const app = new Hono();
  app.route("/", authCustomApp);

  beforeEach(() => {
    setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("returns passkey: true in providers response", async () => {
    const res = await app.request("/providers");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.local).toBe(true);
    expect(body.passkey).toBe(true);
    expect(body.oidc).toBeNull();
  });
});
