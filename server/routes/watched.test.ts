import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser } from "../db/repository";
import watchedApp from "./watched";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("watcheduser", "hash");

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, username: "watcheduser", name: null, role: null, is_admin: false });
    await next();
  });
  app.route("/watched", watchedApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("POST /watched/:episodeId", () => {
  it("returns 400 for non-numeric episodeId", async () => {
    const res = await app.request("/watched/abc", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid episodeId");
  });
});

describe("DELETE /watched/:episodeId", () => {
  it("returns 400 for non-numeric episodeId", async () => {
    const res = await app.request("/watched/abc", { method: "DELETE" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid episodeId");
  });
});
