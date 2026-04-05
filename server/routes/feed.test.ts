import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { createUser, createSession, getSessionWithUser, upsertTitles, trackTitle } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import feedApp from "./feed";
import type { AppEnv } from "../types";

function createMockAuth() {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const cookieHeader = headers.get("cookie") || "";
        const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
        const token = match?.[1];
        if (!token) return null;
        const user = await getSessionWithUser(token);
        if (!user) return null;
        return {
          session: { id: "session-id", userId: user.id },
          user: {
            id: user.id,
            name: user.display_name,
            username: user.username,
            role: user.role || (user.is_admin ? "admin" : "user"),
          },
        };
      },
    },
  };
}

let app: Hono<AppEnv>;
let userToken: string;
let userId: string;

beforeEach(async () => {
  setupTestDb();

  userId = await createUser("feeduser", "hash");
  userToken = await createSession(userId);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/feed/token*", requireAuth);
  app.route("/feed", feedApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders() {
  return { Cookie: `better-auth.session_token=${userToken}` };
}

describe("GET /feed/calendar.ics", () => {
  it("returns 401 when token is missing", async () => {
    const res = await app.request("/feed/calendar.ics");
    expect(res.status).toBe(401);
  });

  it("returns 401 for invalid token", async () => {
    const res = await app.request("/feed/calendar.ics?token=not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns valid iCal after regenerating token", async () => {
    // Generate a token first
    const tokenRes = await app.request("/feed/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(tokenRes.status).toBe(200);
    const { token } = await tokenRes.json() as { token: string };
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    // Fetch the feed with the token
    const feedRes = await app.request(`/feed/calendar.ics?token=${token}`);
    expect(feedRes.status).toBe(200);
    expect(feedRes.headers.get("Content-Type")).toContain("text/calendar");

    const body = await feedRes.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
    expect(body).toContain("VERSION:2.0");
  });

  it("includes tracked upcoming movies in the feed", async () => {
    // Generate token
    const tokenRes = await app.request("/feed/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = await tokenRes.json() as { token: string };

    // Create and track a future movie
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const releaseDate = futureDate.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({
      id: "movie-future",
      objectType: "MOVIE",
      title: "Future Movie",
      releaseDate,
    })]);
    await trackTitle("movie-future", userId);

    const feedRes = await app.request(`/feed/calendar.ics?token=${token}`);
    const body = await feedRes.text();
    expect(body).toContain("Future Movie");
    expect(body).toContain(`remindarr-movie-movie-future@remindarr`);
  });
});

describe("GET /feed/token", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/feed/token");
    expect(res.status).toBe(401);
  });

  it("returns null token before any regeneration", async () => {
    const res = await app.request("/feed/token", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string | null };
    expect(body.token).toBeNull();
  });

  it("returns token after regeneration", async () => {
    await app.request("/feed/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const res = await app.request("/feed/token", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string };
    expect(typeof body.token).toBe("string");
  });
});

describe("POST /feed/token/regenerate", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/feed/token/regenerate", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("generates a new token", async () => {
    const res = await app.request("/feed/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string };
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
  });

  it("new token replaces the old one", async () => {
    const res1 = await app.request("/feed/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token: token1 } = await res1.json() as { token: string };

    const res2 = await app.request("/feed/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token: token2 } = await res2.json() as { token: string };

    expect(token1).not.toBe(token2);

    // Old token no longer works
    const feedRes = await app.request(`/feed/calendar.ics?token=${token1}`);
    expect(feedRes.status).toBe(401);

    // New token works
    const feedRes2 = await app.request(`/feed/calendar.ics?token=${token2}`);
    expect(feedRes2.status).toBe(200);
  });
});
