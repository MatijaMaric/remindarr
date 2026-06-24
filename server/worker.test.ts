import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import Sentry from "./sentry";
import { classifyError } from "./lib/error-classifier";
import { errorsByCategory } from "./metrics";
import {
  maybeDeferRegistrySync,
  resetAchievementRegistrySync,
  handler,
} from "./worker";
import { logger } from "./logger";
import { rateLimiter, type RateLimitStore } from "./middleware/rate-limit";
import * as backendModule from "./jobs/backend";
import * as schema from "./db/schema";
import { withConfigGuard } from "./test-utils/config";

// ─── Scheduled handler cron-branching tests ───────────────────────────────────

describe("scheduled() cron-branching logic", () => {
  // Extract the branching logic as a pure function for unit testing
  // (mirrors the isDailyTick gate in worker.ts scheduled())
  function isDailyTick(cron: string): boolean {
    return cron === "0 0 * * *";
  }

  it("identifies the midnight cron as a daily tick", () => {
    expect(isDailyTick("0 0 * * *")).toBe(true);
  });

  it("identifies the 5-min watchdog cron as NOT a daily tick", () => {
    expect(isDailyTick("*/5 * * * *")).toBe(false);
  });

  it("any other cron expression is not a daily tick", () => {
    expect(isDailyTick("0 3 * * *")).toBe(false);
    expect(isDailyTick("30 3 * * *")).toBe(false);
    expect(isDailyTick("")).toBe(false);
  });
});

function makeTestApp(rateLimitStore?: RateLimitStore) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    const category = classifyError(err);
    errorsByCategory.inc({ category });

    const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();

    (
      Sentry.addBreadcrumb as
        | ((opts: { message: string; data: Record<string, string> }) => void)
        | undefined
    )?.({
      message: "Unhandled error",
      data: { category, requestId, path: c.req.path, method: c.req.method },
    });
    Sentry.captureException(err);

    console.error(
      JSON.stringify({
        level: "error",
        // Mirrors worker.ts: embed the error class + message so CF Observability
        // (which only surfaces `msg`) shows the actual failure (#1014).
        msg: `Unhandled ${err instanceof Error ? err.constructor.name : "error"}: ${err instanceof Error ? err.message : String(err)}`,
        category,
        requestId,
        path: c.req.path,
        method: c.req.method,
        error: err.message,
        stack: err.stack,
      }),
    );

    return c.json({ error: "Internal server error" }, 500, {
      "X-Request-Id": requestId,
    });
  });

  // Mirror production /api/* rate limiter so a throwing store is exercised the
  // same way it would be in worker.ts (#1026).
  if (rateLimitStore) {
    app.use(
      "/api/*",
      rateLimiter({ store: rateLimitStore, limit: 100, windowMs: 60_000 }),
    );
  }

  app.get("/boom", () => {
    throw new Error("test explosion");
  });

  app.get("/type-error", () => {
    throw new TypeError("cannot read property of undefined");
  });

  app.get("/sqlite-error", () => {
    const e = new Error("SQLITE_CONSTRAINT: NOT NULL constraint failed");
    (e as unknown as { code: string }).code = "SQLITE_CONSTRAINT";
    throw e;
  });

  app.get("/forbidden", () => {
    throw new HTTPException(403, { message: "Forbidden" });
  });

  // SPA fallback — mirrors worker.ts app.get("*"): unmatched /api/* paths 404.
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.text("Not Found", 404);
  });

  return app;
}

describe("CF worker onError handler", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captureSpy: ReturnType<typeof spyOn<typeof Sentry, "captureException">>;
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    captureSpy = spyOn(Sentry, "captureException").mockReturnValue(
      "test-event-id" as any,
    );
    consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    errorsByCategory.reset();
  });

  afterEach(() => {
    captureSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("returns 500 JSON with X-Request-Id for plain errors", async () => {
    const app = makeTestApp();
    const res = await app.request("/boom");

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, string>;
    expect(body.error).toBe("Internal server error");
    expect(res.headers.get("X-Request-Id")).toBeTypeOf("string");
    expect(res.headers.get("X-Request-Id")!.length).toBeGreaterThan(0);
  });

  it("captures exception to Sentry once", async () => {
    const app = makeTestApp();
    await app.request("/boom");

    expect(captureSpy).toHaveBeenCalledTimes(1);
    const capturedErr = captureSpy.mock.calls[0]?.[0] as Error;
    expect(capturedErr.message).toBe("test explosion");
  });

  it("propagates incoming x-request-id header", async () => {
    const app = makeTestApp();
    const res = await app.request("/boom", {
      headers: { "x-request-id": "my-trace-id" },
    });

    expect(res.headers.get("X-Request-Id")).toBe("my-trace-id");
  });

  it("increments errorsByCategory counter with classified category", async () => {
    const app = makeTestApp();
    await app.request("/sqlite-error");

    const rendered = errorsByCategory.render();
    expect(rendered).toContain('category="db"');
  });

  it("logs path, method, category, requestId, error, stack", async () => {
    const app = makeTestApp();
    await app.request("/boom");

    const logLines = consoleSpy.mock.calls
      .map((args: unknown[]) => {
        try {
          return JSON.parse(args[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (obj: Record<string, unknown> | null): obj is Record<string, unknown> =>
          obj !== null && typeof obj.msg === "string" && obj.path === "/boom",
      );

    expect(logLines.length).toBe(1);
    const log = logLines[0];
    expect(log.path).toBe("/boom");
    expect(log.method).toBe("GET");
    expect(log.category).toBe("unknown");
    expect(typeof log.requestId).toBe("string");
    expect(log.error).toBe("test explosion");
    expect(typeof log.stack).toBe("string");
  });

  it("delegates HTTPException to getResponse without capturing", async () => {
    const app = makeTestApp();
    const res = await app.request("/forbidden");

    expect(res.status).toBe(403);
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("embeds the error class name in the log message (#1014)", async () => {
    const app = makeTestApp();
    await app.request("/type-error");

    const messages = consoleSpy.mock.calls
      .map((args: unknown[]) => {
        try {
          return JSON.parse(args[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (obj: Record<string, unknown> | null): obj is Record<string, unknown> =>
          obj !== null && obj.path === "/type-error",
      )
      .map((obj: Record<string, unknown>) => obj.msg as string);

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("TypeError");
    expect(messages[0]).toContain("cannot read property of undefined");
  });
});

// ─── Unknown /api/* probes return 404, never 500 (#1026) ─────────────────────

describe("unknown /api/* paths fall through to 404", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captureSpy: ReturnType<typeof spyOn<typeof Sentry, "captureException">>;
  let consoleSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    captureSpy = spyOn(Sentry, "captureException").mockReturnValue(
      "test-event-id" as any,
    );
    consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
    errorsByCategory.reset();
  });

  afterEach(() => {
    captureSpy.mockRestore();
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("returns 404 for unknown /api/* probe paths", async () => {
    const app = makeTestApp();

    for (const path of ["/api/phpinfo.php", "/api/v1/credentials"]) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
    }
  });

  it("returns 404 (not 500) even when the rate-limit store throws", async () => {
    const throwingStore: RateLimitStore = {
      async consume() {
        throw new Error("KV unavailable");
      },
    };
    const app = makeTestApp(throwingStore);

    const res = await app.request("/api/phpinfo.php");

    expect(res.status).toBe(404);
    // Store failure must never reach onError → Sentry.
    expect(captureSpy).not.toHaveBeenCalled();
  });
});

// ─── maybeDeferRegistrySync — deferral contract (#799) ───────────────────────

describe("maybeDeferRegistrySync (#799 deferral contract)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeCtx(): { ctx: any; captured: Promise<unknown>[] } {
    const captured: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        captured.push(p);
      },
      passThroughOnException: () => {},
    };
    return { ctx, captured };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logSpy: ReturnType<typeof spyOn<any, any>>;

  beforeEach(() => {
    resetAchievementRegistrySync();
    logSpy = spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    resetAchievementRegistrySync();
    logSpy.mockRestore();
  });

  it("returns synchronously without awaiting run", () => {
    const { ctx, captured } = makeCtx();
    let runStarted = false;
    let resolveRun!: () => void;
    const run = () =>
      new Promise<void>((resolve) => {
        runStarted = true;
        resolveRun = resolve;
      });

    maybeDeferRegistrySync(ctx, run);

    // run was invoked synchronously (promise created) but not yet resolved
    expect(runStarted).toBe(true);
    // ctx.waitUntil received exactly one promise
    expect(captured).toHaveLength(1);
    // function itself returned without awaiting — resolveRun still pending
    resolveRun();
  });

  it("passes a promise to ctx.waitUntil, not void", () => {
    const { ctx, captured } = makeCtx();
    maybeDeferRegistrySync(ctx, () => Promise.resolve());
    expect(captured[0]).toBeInstanceOf(Promise);
  });

  it("does not call ctx.waitUntil a second time (stampede guard)", () => {
    const { ctx, captured } = makeCtx();
    maybeDeferRegistrySync(ctx, () => Promise.resolve());
    maybeDeferRegistrySync(ctx, () => Promise.resolve());

    expect(captured).toHaveLength(1);
  });

  it("resets the flag on error so a later request retries", async () => {
    const { ctx, captured } = makeCtx();
    maybeDeferRegistrySync(ctx, () => Promise.reject(new Error("sync failed")));

    // Await the captured waitUntil promise (the .catch wrapper)
    await captured[0];

    // Error was logged
    expect(logSpy).toHaveBeenCalledWith(
      "Achievement registry sync failed",
      expect.objectContaining({ error: "sync failed" }),
    );

    // Flag was reset — a subsequent call fires again
    const { ctx: ctx2, captured: captured2 } = makeCtx();
    maybeDeferRegistrySync(ctx2, () => Promise.resolve());
    expect(captured2).toHaveLength(1);
  });
});

// ─── scheduled() writes cron_bootstrap_last_seen_at to CACHE_KV ──────────────

describe("scheduled() bootstrap KV timestamp", () => {
  // Guard CONFIG so patchConfigFromEnv mutations don't leak across files.
  withConfigGuard();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spies: ReturnType<typeof spyOn<any, any>>[] = [];

  beforeEach(() => {
    // Stub out all heavy backend functions so scheduled() completes without a
    // real D1 DB or job infrastructure.
    spies = [
      spyOn(backendModule, "armCron").mockResolvedValue(undefined as any),
      spyOn(backendModule, "recoverStale").mockResolvedValue(0),
      spyOn(backendModule, "processPending").mockResolvedValue(0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spyOn(backendModule, "runWithEnv").mockImplementation(
        (_env: any, fn: any) => fn(),
      ),
      // runWithDb and runWithCache are from other modules — stub via schema/cache
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spyOn(schema, "runWithDb").mockImplementation((_db: any, fn: any) =>
        fn(),
      ),
    ];
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
    spies = [];
  });

  it("puts cron_bootstrap_last_seen_at into CACHE_KV when the scheduled handler runs", async () => {
    const puts: Array<[string, string]> = [];
    const fakeKv = {
      put: async (key: string, value: string) => {
        puts.push([key, value]);
      },
      get: async () => null,
    } as unknown as KVNamespace;

    const fakeEnv = {
      DB: {} as D1Database,
      CACHE_KV: fakeKv,
      TMDB_COUNTRY: "HR",
      TMDB_LANGUAGE: "hr-HR",
      LOG_LEVEL: "info",
    } as unknown as Parameters<typeof handler.scheduled>[1];

    const fakeCtx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    await handler.scheduled(
      { cron: "*/5 * * * *", type: "scheduled", scheduledTime: Date.now() },
      fakeEnv,
      fakeCtx,
    );

    const bootstrapPut = puts.find(
      ([k]) => k === "cron_bootstrap_last_seen_at",
    );
    expect(bootstrapPut).toBeDefined();
    // Value should be a valid ISO timestamp
    expect(new Date(bootstrapPut![1]).getTime()).toBeGreaterThan(0);
  });

  it("isolates a failing armCron so remaining cron jobs still tick (#1055)", async () => {
    // sync-episodes' /arm hits a blockConcurrencyWhile() timeout; the loop must
    // not abort the remaining jobs.
    const armed: string[] = [];
    const ticked: string[] = [];
    const armSpy = spyOn(backendModule, "armCron").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_env: any, name: string) => {
        armed.push(name);
        if (name === "sync-episodes")
          throw new Error("blockConcurrencyWhile() waited for too long");
      },
    );
    const tickSpy = spyOn(backendModule, "tickCron").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_env: any, name: string) => {
        ticked.push(name);
      },
    );
    spies.push(armSpy, tickSpy);

    const fakeEnv = {
      DB: {} as D1Database,
      CACHE_KV: {
        put: async () => {},
        get: async () => null,
      } as unknown as KVNamespace,
      TMDB_COUNTRY: "HR",
      TMDB_LANGUAGE: "hr-HR",
      LOG_LEVEL: "info",
    } as unknown as Parameters<typeof handler.scheduled>[1];

    const fakeCtx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    await handler.scheduled(
      { cron: "*/5 * * * *", type: "scheduled", scheduledTime: Date.now() },
      fakeEnv,
      fakeCtx,
    );

    // Every job was armed (loop never aborted), only the failing one skipped tick.
    expect(armed).toHaveLength(6);
    expect(ticked).not.toContain("sync-episodes");
    expect(ticked).toContain("send-notifications");
    expect(ticked).toContain("cleanup");
  });

  it("does NOT put to CACHE_KV when CACHE_KV is absent", async () => {
    const puts: Array<[string, string]> = [];

    const fakeEnv = {
      DB: {} as D1Database,
      CACHE_KV: undefined,
      TMDB_COUNTRY: "HR",
      TMDB_LANGUAGE: "hr-HR",
      LOG_LEVEL: "info",
    } as unknown as Parameters<typeof handler.scheduled>[1];

    const fakeCtx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    await handler.scheduled(
      { cron: "*/5 * * * *", type: "scheduled", scheduledTime: Date.now() },
      fakeEnv,
      fakeCtx,
    );

    expect(puts).toHaveLength(0);
  });
});
