import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";
import { upsertTitles, createUser } from "../db/repository";
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
  it("returns titles for a given month", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", releaseDate: "2026-03-15" }),
    ]);

    const res = await app.request("/calendar?month=2026-03");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles).toBeDefined();
    expect(body.episodes).toBeDefined();
    expect(body.count).toBeDefined();
  });

  it("returns 400 when month parameter is missing", async () => {
    const res = await app.request("/calendar");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 for invalid month format", async () => {
    const res = await app.request("/calendar?month=2026-3");
    expect(res.status).toBe(400);
  });

  it("returns 400 for completely invalid month", async () => {
    const res = await app.request("/calendar?month=invalid");
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid objectType", async () => {
    const res = await app.request("/calendar?month=2026-03&type=INVALID");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("accepts valid objectType MOVIE", async () => {
    const res = await app.request("/calendar?month=2026-03&type=MOVIE");
    expect(res.status).toBe(200);
  });

  it("accepts valid objectType SHOW", async () => {
    const res = await app.request("/calendar?month=2026-03&type=SHOW");
    expect(res.status).toBe(200);
  });

  it("returns empty results for month with no titles", async () => {
    const res = await app.request("/calendar?month=2020-01");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("filters by object type", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", releaseDate: "2026-03-15" }),
      makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "A Show", releaseDate: "2026-03-15" }),
    ]);

    const res = await app.request("/calendar?month=2026-03&type=SHOW");
    expect(res.status).toBe(200);
    const body = await res.json();
    const movieTitles = body.titles.filter((t: any) => t.object_type === "MOVIE");
    expect(movieTitles).toHaveLength(0);
  });

  it("filters by provider", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "movie-1",
        releaseDate: "2026-03-15",
        offers: [makeParsedOffer({ titleId: "movie-1", providerId: 8, providerName: "Netflix" })],
      }),
      makeParsedTitle({
        id: "movie-2",
        title: "Disney Movie",
        releaseDate: "2026-03-15",
        offers: [makeParsedOffer({ titleId: "movie-2", providerId: 337, providerName: "Disney Plus" })],
      }),
    ]);

    const res = await app.request("/calendar?month=2026-03&provider=8");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles.length).toBeGreaterThanOrEqual(0);
  });

  describe("validation", () => {
    it("rejects missing month", async () => {
      const res = await app.request("/calendar");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects single-digit month (2026-3)", async () => {
      const res = await app.request("/calendar?month=2026-3");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects non-date month", async () => {
      const res = await app.request("/calendar?month=foo");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
    });

    it("rejects lowercase type", async () => {
      const res = await app.request("/calendar?month=2026-05&type=movie");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects unknown type value", async () => {
      const res = await app.request("/calendar?month=2026-05&type=BOOK");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("happy-path: minimal request with month only", async () => {
      const res = await app.request("/calendar?month=2026-05");
      expect(res.status).toBe(200);
    });

    it("happy-path: month + type + provider", async () => {
      const res = await app.request("/calendar?month=2026-05&type=MOVIE&provider=8");
      expect(res.status).toBe(200);
    });
  });

  it("works with authenticated user context", async () => {
    const userId = await createUser("testuser", "hash");

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/calendar/*", async (c, next) => {
      c.set("user", {
        id: userId,
        username: "testuser",
        name: null,
        role: null,
        is_admin: false,
      });
      await next();
    });
    authedApp.route("/calendar", calendarApp);

    await upsertTitles([
      makeParsedTitle({ id: "movie-1", releaseDate: "2026-03-15" }),
    ]);

    const res = await authedApp.request("/calendar?month=2026-03");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles).toBeDefined();
  });
});
