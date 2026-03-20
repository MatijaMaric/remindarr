import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { Logger, requestLogger, resetLogLevel, logger } from "./logger";

describe("Logger", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function lastLog(): Record<string, unknown> {
    const call = logSpy.mock.calls[logSpy.mock.calls.length - 1];
    return JSON.parse(call[0] as string);
  }

  function lastError(): Record<string, unknown> {
    const call = errorSpy.mock.calls[errorSpy.mock.calls.length - 1];
    return JSON.parse(call[0] as string);
  }

  it("outputs valid JSON with time, level, and msg", () => {
    const log = new Logger("debug");
    log.info("hello");
    const entry = lastLog();
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("hello");
    expect(typeof entry.time).toBe("string");
  });

  it("timestamp is valid ISO 8601", () => {
    const log = new Logger("debug");
    log.info("check time");
    const entry = lastLog();
    const timeStr = entry.time as string;
    const parsed = new Date(timeStr);
    expect(parsed.toISOString()).toBe(timeStr);
  });

  it("filters messages below the configured level", () => {
    const log = new Logger("warn");
    log.debug("skip");
    log.info("skip");
    log.warn("keep");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(lastError().msg).toBe("keep");
  });

  it("default level info suppresses debug", () => {
    const log = new Logger("info");
    log.debug("hidden");
    log.info("visible");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(lastLog().msg).toBe("visible");
  });

  it("child logger merges bindings", () => {
    const log = new Logger("debug");
    const child = log.child({ module: "tmdb" });
    child.info("test");
    const entry = lastLog();
    expect(entry.module).toBe("tmdb");
    expect(entry.msg).toBe("test");
  });

  it("nested child loggers merge all bindings", () => {
    const log = new Logger("debug");
    const child = log.child({ module: "tmdb" }).child({ op: "sync" });
    child.info("nested");
    const entry = lastLog();
    expect(entry.module).toBe("tmdb");
    expect(entry.op).toBe("sync");
  });

  it("includes per-call data in output", () => {
    const log = new Logger("debug");
    log.info("synced", { count: 42 });
    const entry = lastLog();
    expect(entry.count).toBe(42);
  });

  it("serializes Error objects with message and stack", () => {
    const log = new Logger("debug");
    const err = new Error("boom");
    log.error("failed", { err });
    const entry = lastError();
    const serialized = entry.err as Record<string, unknown>;
    expect(serialized.message).toBe("boom");
    expect(typeof serialized.stack).toBe("string");
  });

  it("uses stderr for warn and error levels", () => {
    const log = new Logger("debug");
    log.warn("warning");
    log.error("failure");
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("uses stdout for debug and info levels", () => {
    const log = new Logger("debug");
    log.debug("debug msg");
    log.info("info msg");
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("child inherits parent level threshold", () => {
    const log = new Logger("error");
    const child = log.child({ module: "test" });
    child.info("suppressed");
    child.warn("suppressed");
    child.error("visible");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(lastError().msg).toBe("visible");
  });

  it("handles circular references gracefully", () => {
    const log = new Logger("debug");
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    log.info("circular", circular);
    const entry = lastLog();
    expect(entry.serializationError).toBe("Failed to serialize log data");
    expect(entry.msg).toBe("circular");
  });

  it("per-call data overrides bindings with same key", () => {
    const log = new Logger("debug");
    const child = log.child({ module: "tmdb", op: "default" });
    child.info("override", { op: "sync" });
    const entry = lastLog();
    expect(entry.module).toBe("tmdb");
    expect(entry.op).toBe("sync");
  });

  it("handles data with non-Error objects unchanged", () => {
    const log = new Logger("debug");
    log.info("mixed", { count: 5, name: "test", nested: { a: 1 } });
    const entry = lastLog();
    expect(entry.count).toBe(5);
    expect(entry.name).toBe("test");
    expect(entry.nested).toEqual({ a: 1 });
  });
});

describe("resetLogLevel", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    // Restore default level
    resetLogLevel("info");
  });

  it("changes the global logger threshold", () => {
    resetLogLevel("error");
    logger.info("should be suppressed");
    logger.warn("should be suppressed");
    logger.error("should appear");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("allows debug messages when set to debug", () => {
    resetLogLevel("debug");
    logger.debug("visible now");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});

describe("requestLogger", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function parsedLog(): Record<string, unknown> {
    const calls = logSpy.mock.calls;
    for (let i = calls.length - 1; i >= 0; i--) {
      const parsed = JSON.parse(calls[i][0] as string);
      if (parsed.module === "http") return parsed;
    }
    throw new Error("No http log found");
  }

  function parsedError(): Record<string, unknown> {
    const calls = errorSpy.mock.calls;
    for (let i = calls.length - 1; i >= 0; i--) {
      const parsed = JSON.parse(calls[i][0] as string);
      if (parsed.module === "http") return parsed;
    }
    throw new Error("No http error log found");
  }

  it("logs successful requests at info level", async () => {
    const app = new Hono();
    app.use("*", requestLogger());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(200);

    const entry = parsedLog();
    expect(entry.level).toBe("info");
    expect(entry.module).toBe("http");
    expect(entry.msg).toBe("GET /test");
    expect(entry.status).toBe(200);
    expect(typeof entry.duration).toBe("number");
  });

  it("logs 404 responses at warn level", async () => {
    const app = new Hono();
    app.use("*", requestLogger());
    app.get("/exists", (c) => c.json({ ok: true }));
    app.get("/missing", (c) => c.json({ error: "not found" }, 404));

    const res = await app.request("/missing");
    expect(res.status).toBe(404);

    const entry = parsedError();
    expect(entry.level).toBe("warn");
    expect(entry.status).toBe(404);
  });

  it("logs 500 responses at error level", async () => {
    const app = new Hono();
    app.use("*", requestLogger());
    app.get("/fail", (c) => c.json({ error: "internal" }, 500));

    const res = await app.request("/fail");
    expect(res.status).toBe(500);

    const entry = parsedError();
    expect(entry.level).toBe("error");
    expect(entry.status).toBe(500);
  });
});
