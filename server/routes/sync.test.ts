import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import * as syncTitles from "../tmdb/sync-titles";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(async () => {
  setupTestDb();

  spies = [
    spyOn(syncTitles, "fetchNewReleases").mockResolvedValue([makeParsedTitle()]),
  ];

  const syncApp = (await import("./sync")).default;
  app = new Hono<AppEnv>();
  app.route("/sync", syncApp);
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
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
    expect(syncTitles.fetchNewReleases).not.toHaveBeenCalled();
  });

  it("syncs titles with default parameters", async () => {
    (syncTitles.fetchNewReleases as any).mockResolvedValueOnce([makeParsedTitle()]);

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

    expect(syncTitles.fetchNewReleases).toHaveBeenCalledWith({
      daysBack: 30,
      objectType: undefined,
      maxPages: 10,
    });
  });

  it("passes custom parameters to fetchNewReleases", async () => {
    (syncTitles.fetchNewReleases as any).mockResolvedValueOnce([]);

    const res = await app.request("/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daysBack: 7, type: "MOVIE", maxPages: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.count).toBe(0);

    expect(syncTitles.fetchNewReleases).toHaveBeenCalledWith({
      daysBack: 7,
      objectType: "MOVIE",
      maxPages: 5,
    });
  });

  it("returns 500 when fetchNewReleases throws", async () => {
    (syncTitles.fetchNewReleases as any).mockRejectedValueOnce(new Error("TMDB API down"));

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
