import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { classifyError } from "./error-classifier";
import { errorsByCategory } from "../metrics";

// ─── Unit tests for classifyError ────────────────────────────────────────────

describe("classifyError", () => {
  it("returns 'db' for errors with 'sqlite' in the message", () => {
    expect(classifyError(new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed"))).toBe("db");
  });

  it("returns 'db' for errors with lowercase 'sqlite' in the message", () => {
    expect(classifyError(new Error("sqlite: no such table: users"))).toBe("db");
  });

  it("returns 'db' for errors whose constructor name contains 'Sql'", () => {
    class SqliteError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "SqliteError";
      }
    }
    expect(classifyError(new SqliteError("something broke"))).toBe("db");
  });

  it("returns 'db' for errors with a SQLITE_ error code", () => {
    const err = Object.assign(new Error("constraint failed"), { code: "SQLITE_CONSTRAINT" });
    expect(classifyError(err)).toBe("db");
  });

  it("returns 'external_api' for fetch TypeErrors", () => {
    const err = new TypeError("fetch failed: connection refused");
    expect(classifyError(err)).toBe("external_api");
  });

  it("returns 'external_api' for errors mentioning tmdb", () => {
    expect(classifyError(new Error("tmdb request timeout"))).toBe("external_api");
  });

  it("returns 'external_api' for errors mentioning plex", () => {
    expect(classifyError(new Error("plex server unreachable"))).toBe("external_api");
  });

  it("returns 'external_api' for errors mentioning discord", () => {
    expect(classifyError(new Error("discord webhook returned 429"))).toBe("external_api");
  });

  it("returns 'external_api' for errors mentioning telegram", () => {
    expect(classifyError(new Error("telegram bot API error"))).toBe("external_api");
  });

  it("returns 'auth' for errors mentioning unauthorized", () => {
    expect(classifyError(new Error("unauthorized access attempt"))).toBe("auth");
  });

  it("returns 'auth' for errors mentioning forbidden", () => {
    expect(classifyError(new Error("forbidden resource"))).toBe("auth");
  });

  it("returns 'auth' for errors mentioning auth", () => {
    expect(classifyError(new Error("auth token expired"))).toBe("auth");
  });

  it("returns 'validation' for ZodError-shaped constructor name", () => {
    class ZodError extends Error {
      constructor() {
        super("validation failed");
        this.name = "ZodError";
      }
    }
    expect(classifyError(new ZodError())).toBe("validation");
  });

  it("returns 'validation' for errors mentioning 'validation'", () => {
    expect(classifyError(new Error("input validation error"))).toBe("validation");
  });

  it("returns 'unknown' for a plain generic Error", () => {
    expect(classifyError(new Error("something unexpected happened"))).toBe("unknown");
  });

  it("returns 'unknown' for a non-Error thrown value", () => {
    expect(classifyError("some string error")).toBe("unknown");
    expect(classifyError(42)).toBe("unknown");
    expect(classifyError(null)).toBe("unknown");
    expect(classifyError(undefined)).toBe("unknown");
  });
});

// ─── Integration tests via a minimal Hono app ────────────────────────────────

function makeTestApp() {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    const category = classifyError(err);
    errorsByCategory.inc({ category });
    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
    return c.json({ error: "Internal server error" }, 500, {
      "X-Request-Id": requestId,
    });
  });

  app.get("/throw-sqlite", () => {
    throw Object.assign(new Error("SQLITE_CONSTRAINT: constraint failed"), {
      code: "SQLITE_CONSTRAINT",
    });
  });

  app.get("/throw-generic", () => {
    throw new Error("something went wrong");
  });

  app.get("/throw-http", () => {
    throw new HTTPException(404, { message: "not found" });
  });

  return app;
}

describe("global error handler integration", () => {
  it("returns 500 and increments db counter for SQLite errors", async () => {
    const app = makeTestApp();
    errorsByCategory.reset();
    const res = await app.request("/throw-sqlite");
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Internal server error");
    // verify counter was incremented for "db"
    const rendered = errorsByCategory.render();
    expect(rendered).toContain('category="db"');
  });

  it("returns 500 and increments unknown counter for generic errors", async () => {
    const app = makeTestApp();
    errorsByCategory.reset();
    const res = await app.request("/throw-generic");
    expect(res.status).toBe(500);
    const rendered = errorsByCategory.render();
    expect(rendered).toContain('category="unknown"');
  });

  it("sets X-Request-Id header on 500 responses", async () => {
    const app = makeTestApp();
    const res = await app.request("/throw-generic");
    expect(res.status).toBe(500);
    const requestId = res.headers.get("X-Request-Id");
    expect(typeof requestId).toBe("string");
    expect(requestId!.length).toBeGreaterThan(0);
  });

  it("propagates x-request-id from the incoming request", async () => {
    const app = makeTestApp();
    const res = await app.request("/throw-generic", {
      headers: { "x-request-id": "my-trace-id-123" },
    });
    expect(res.status).toBe(500);
    expect(res.headers.get("X-Request-Id")).toBe("my-trace-id-123");
  });

  it("passes HTTPException through unchanged (not treated as 500)", async () => {
    const app = makeTestApp();
    const res = await app.request("/throw-http");
    expect(res.status).toBe(404);
  });
});
