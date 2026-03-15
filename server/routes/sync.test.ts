import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import type { AppEnv } from "../types";

const mockFetchNewReleases = mock(() => Promise.resolve([makeParsedTitle()]));

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

  it("syncs titles with default parameters", async () => {
    mockFetchNewReleases.mockResolvedValueOnce([makeParsedTitle()]);

    const res = await app.request("/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    expect(body.message).toContain("Synced");

    expect(mockFetchNewReleases).toHaveBeenCalledWith({
      daysBack: 30,
      objectType: undefined,
      maxPages: 10,
    });
  });

  it("passes custom parameters to fetchNewReleases", async () => {
    mockFetchNewReleases.mockResolvedValueOnce([]);

    const res = await app.request("/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daysBack: 7, type: "MOVIE", maxPages: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(0);

    expect(mockFetchNewReleases).toHaveBeenCalledWith({
      daysBack: 7,
      objectType: "MOVIE",
      maxPages: 5,
    });
  });

  it("returns 500 when fetchNewReleases throws", async () => {
    mockFetchNewReleases.mockRejectedValueOnce(new Error("TMDB API down"));

    const res = await app.request("/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("TMDB API down");
  });
});
