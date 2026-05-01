import type { MiddlewareHandler } from "hono";
import { CONFIG } from "./config";
import { httpRequestsTotal, httpRequestDurationSeconds } from "./metrics";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  time: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

// Ring buffer for in-process log tail (GET /api/admin/logs).
// Disabled in test runtime to avoid memory growth and cross-test interference.
const LOG_BUFFER_CAPACITY = 500;
const logBuffer: LogEntry[] = [];
const bufferEnabled = process.env.NODE_ENV !== "test";

export function getRecentLogs(
  limit: number = 50,
  level?: LogLevel,
  module?: string,
): LogEntry[] {
  let entries: LogEntry[] = logBuffer;
  if (level) entries = entries.filter((e) => e.level === level);
  if (module) entries = entries.filter((e) => e.module === module);
  const capped = Math.min(limit, LOG_BUFFER_CAPACITY);
  return entries.slice(-capped);
}

interface LogData {
  [key: string]: unknown;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack };
  }
  return value;
}

function serializeData(data: LogData): LogData {
  const result: LogData = {};
  for (const key of Object.keys(data)) {
    result[key] = serializeValue(data[key]);
  }
  return result;
}

export class Logger {
  private _levelThreshold: number;
  private bindings: LogData;
  private root: Logger;

  constructor(level: LogLevel, bindings: LogData = {}) {
    this._levelThreshold = LEVELS[level];
    this.bindings = bindings;
    this.root = this;
  }

  /** Update the log level threshold (propagates to all child loggers). */
  setLevel(level: LogLevel): void {
    this._levelThreshold = LEVELS[level];
  }

  child(bindings: LogData): Logger {
    const child = new Logger("debug", { ...this.bindings, ...bindings });
    child.root = this.root;
    return child;
  }

  debug(msg: string, data?: LogData): void {
    this.log("debug", msg, data);
  }

  info(msg: string, data?: LogData): void {
    this.log("info", msg, data);
  }

  warn(msg: string, data?: LogData): void {
    this.log("warn", msg, data);
  }

  error(msg: string, data?: LogData): void {
    this.log("error", msg, data);
  }

  private log(level: LogLevel, msg: string, data?: LogData): void {
    if (LEVELS[level] < this.root._levelThreshold) return;

    const entry: LogData = {
      time: new Date().toISOString(),
      level,
      ...this.bindings,
      msg,
      ...(data ? serializeData(data) : {}),
    };

    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({
        time: entry.time,
        level,
        msg,
        serializationError: "Failed to serialize log data",
      });
    }

    if (bufferEnabled) {
      if (logBuffer.length >= LOG_BUFFER_CAPACITY) logBuffer.shift();
      logBuffer.push(entry as LogEntry);
    }

    if (level === "warn" || level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

export const logger = new Logger(CONFIG.LOG_LEVEL);

/** Update the global logger threshold (propagates to all child loggers). */
export function resetLogLevel(level: LogLevel): void {
  logger.setLevel(level);
}

/**
 * Normalize a URL path to remove dynamic segments (IDs, UUIDs) so that
 * Prometheus metric labels have bounded cardinality.
 *
 * Examples:
 *   /api/details/movie/12345        → /api/details/movie/:id
 *   /api/track/tt1234567            → /api/track/:id
 *   /api/details/show/123/season/2  → /api/details/show/:id/season/:id
 */
export function normalizeRoutePath(path: string): string {
  return path
    // Replace UUID segments first (must come before numeric to prevent partial matches)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, "/:id")
    // Replace IMDB IDs (tt followed by digits)
    .replace(/\/tt\d+(?=\/|$)/g, "/:id")
    // Replace purely numeric ID segments
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

export function requestLogger(): MiddlewareHandler {
  const log = logger.child({ module: "http" });
  return async (c, next) => {
    const start = performance.now();
    await next();
    const durationMs = performance.now() - start;
    const status = c.res.status;
    const method = c.req.method;
    const route = normalizeRoutePath(c.req.path);

    // 5xx → error; 401/403 auth failures → info (expected from bots/expired sessions);
    // other 4xx → warn; 2xx/3xx → info
    const level: LogLevel =
      status >= 500 ? "error"
      : status === 401 || status === 403 ? "info"
      : status >= 400 ? "warn"
      : "info";
    log[level](`${method} ${c.req.path}`, { status, duration: Math.round(durationMs) });

    const statusStr = String(status);
    httpRequestsTotal.inc({ method, route, status: statusStr });
    httpRequestDurationSeconds.observe({ method, route, status: statusStr }, durationMs / 1000);
  };
}
