import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";
import { upsertTitles } from "../db/repository";
import titlesApp from "./titles";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;

beforeEach(() => {
  setupTestDb();
  app = new Hono<AppEnv>();
  app.route("/titles", titlesApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /titles", () => {
  it("returns titles", async () => {
    // Use today's date so titles appear within default daysBack window
    const today = new Date().toISOString().slice(0, 10);
    upsertTitles([makeParsedTitle({ releaseDate: today })]);

    const res = await app.request("/titles?daysBack=9999");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Test Movie");
    expect(body.count).toBe(1);
  });

  it("filters by type", async () => {
    const today = new Date().toISOString().slice(0, 10);
    upsertTitles([
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", releaseDate: today }),
      makeParsedTitle({ id: "tv-1", objectType: "SHOW", title: "Show", releaseDate: today }),
    ]);

    const res = await app.request("/titles?daysBack=9999&type=SHOW");
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].object_type).toBe("SHOW");
  });

  it("returns empty when no titles match", async () => {
    const res = await app.request("/titles");
    const body = await res.json();
    expect(body.titles).toHaveLength(0);
    expect(body.count).toBe(0);
  });
});

describe("GET /titles/providers", () => {
  it("returns available providers", async () => {
    upsertTitles([
      makeParsedTitle({
        offers: [makeParsedOffer({ providerId: 8, providerName: "Netflix" })],
      }),
    ]);

    const res = await app.request("/titles/providers");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0].name).toBe("Netflix");
  });
});
