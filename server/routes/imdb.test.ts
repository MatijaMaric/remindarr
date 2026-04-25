import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import * as resolver from "../imdb/resolver";
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
let userCookie: string;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(async () => {
  setupTestDb();

  spies = [
    spyOn(resolver, "resolveImdbUrl").mockResolvedValue(makeParsedTitle()),
  ];

  const userId = await createUser("testuser", "hash");
  const token = await createSession(userId);
  userCookie = `better-auth.session_token=${token}`;

  const imdbApp = (await import("./imdb")).default;
  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
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
    // Now handled by zod, returns standard validation error shape
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
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
    expect(body.title).toBeDefined();
  });
});

describe("validation", () => {
  it("rejects POST /imdb with empty url string", async () => {
    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects POST /imdb with non-string url", async () => {
    const res = await app.request("/imdb", {
      method: "POST",
      headers: {
        Cookie: userCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: 12345 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
