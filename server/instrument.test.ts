import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as Sentry from "@sentry/node";

describe("instrument", () => {
  it("captureException is callable and does not throw without DSN", () => {
    expect(() => {
      Sentry.captureException(new Error("test error"));
    }).not.toThrow();
  });

  it("Sentry exports expected functions", () => {
    expect(typeof Sentry.captureException).toBe("function");
    expect(typeof Sentry.init).toBe("function");
    expect(typeof Sentry.honoIntegration).toBe("function");
    expect(typeof Sentry.setupHonoErrorHandler).toBe("function");
  });
});

describe("onError handler", () => {
  let captureSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    captureSpy = spyOn(Sentry, "captureException").mockReturnValue(
      "test-event-id",
    );
  });

  afterEach(() => {
    captureSpy.mockRestore();
  });

  it("captures exceptions and returns 500 JSON for plain errors", async () => {
    const { Hono } = await import("hono");

    const app = new Hono();
    app.onError((err, c) => {
      Sentry.captureException(err);
      return c.json({ error: "Internal server error" }, 500);
    });
    app.get("/boom", () => {
      throw new Error("test explosion");
    });

    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect((captureSpy.mock.calls[0][0] as Error).message).toBe(
      "test explosion",
    );
  });

  it("delegates to HTTPException.getResponse for HTTP errors", async () => {
    const { Hono } = await import("hono");
    const { HTTPException } = await import("hono/http-exception");

    const app = new Hono();
    app.onError((err, c) => {
      Sentry.captureException(err);
      if (err instanceof HTTPException) {
        return err.getResponse();
      }
      return c.json({ error: "Internal server error" }, 500);
    });
    app.get("/forbidden", () => {
      throw new HTTPException(403, { message: "Forbidden" });
    });

    const res = await app.request("/forbidden");
    expect(res.status).toBe(403);
    expect(captureSpy).toHaveBeenCalledTimes(1);
  });
});
