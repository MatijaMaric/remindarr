import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { createUser, createSession } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import { CONFIG } from "../config";
import * as resolver from "../imdb/resolver";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let userCookie: string;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(async () => {
  setupTestDb();

  spies = [
    spyOn(resolver, "resolveImdbUrl").mockResolvedValue(makeParsedTitle()),
  ];

  const userId = createUser("testuser", "hash");
  const token = createSession(userId);
  userCookie = `${CONFIG.SESSION_COOKIE_NAME}=${token}`;

  const imdbApp = (await import("./imdb")).default;
  app = new Hono<AppEnv>();
  app.use("/imdb/*", requireAuth);
  app.use("/imdb", requireAuth);
  app.route("/imdb", imdbApp);
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

describe("POST /imdb", () => {
  it("resolves IMDB URL, upserts, and tracks title", async () => {
    const title = makeParsedTitle({ id: "movie-999", title: "IMDB Movie" });
    (resolver.resolveImdbUrl as any).mockResolvedValueOnce(title);

    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.imdb.com/title/tt1234567" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.title.title).toBe("IMDB Movie");
  });

  it("returns 400 when url is missing", async () => {
    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("url is required");
  });

  it("returns 400 for invalid IMDB URL", async () => {
    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://example.com/not-imdb" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid IMDB");
  });

  it("returns 404 when title is not found on TMDB", async () => {
    (resolver.resolveImdbUrl as any).mockResolvedValueOnce(null);

    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.imdb.com/title/tt0000000" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 500 when resolver throws", async () => {
    (resolver.resolveImdbUrl as any).mockRejectedValueOnce(new Error("TMDB down"));

    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://www.imdb.com/title/tt1234567" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("TMDB down");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/imdb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.imdb.com/title/tt1234567" }),
    });
    expect(res.status).toBe(401);
  });

  it("handles invalid JSON body", async () => {
    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("url is required");
  });

  it("accepts raw IMDB ID", async () => {
    const title = makeParsedTitle({ id: "movie-555" });
    (resolver.resolveImdbUrl as any).mockResolvedValueOnce(title);

    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "tt1234567" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
