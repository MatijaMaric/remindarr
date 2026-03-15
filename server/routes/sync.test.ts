import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import type { AppEnv } from "../types";

const mockFetchNewReleases = mock(() => Promise.resolve([]));

mock.module("../tmdb/sync-titles", () => ({
  fetchNewReleases: mockFetchNewReleases,
}));

const syncApp = (await import("./sync")).default;

let app: Hono<AppEnv>;

beforeEach(() => {
  setupTestDb();
  mockFetchNewReleases.mockClear();

  app = new Hono<AppEnv>();
  app.route("/sync", syncApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("POST /sync", () => {
  it("returns 400 for malformed JSON body", async () => {
    const res = await app.request("/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON in request body");
    expect(mockFetchNewReleases).not.toHaveBeenCalled();
  });

  it("syncs successfully with valid JSON body", async () => {
    mockFetchNewReleases.mockResolvedValueOnce([]);

    const res = await app.request("/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daysBack: 7 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockFetchNewReleases).toHaveBeenCalledTimes(1);
  });
});
