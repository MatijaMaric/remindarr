import type { MiddlewareHandler } from "hono";
import { CONFIG } from "./config";

export type LogLevel = "debug" | "info" | "warn" | "error";

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
  private levelThreshold: number;
  private bindings: LogData;

  constructor(level: LogLevel, bindings: LogData = {}) {
    this.levelThreshold = LEVELS[level];
    this.bindings = bindings;
  }

  child(bindings: LogData): Logger {
    const child = new Logger("debug", { ...this.bindings, ...bindings });
    child.levelThreshold = this.levelThreshold;
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
    if (LEVELS[level] < this.levelThreshold) return;

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

    if (level === "warn" || level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

export let logger = new Logger(CONFIG.LOG_LEVEL);

/** Reinitialize the logger with a new level (called after patchConfig on CF Workers). */
export function resetLogLevel(level: LogLevel): void {
  logger = new Logger(level);
}

export function requestLogger(): MiddlewareHandler {
  const log = logger.child({ module: "http" });
  return async (c, next) => {
    const start = performance.now();
    await next();
    const duration = Math.round(performance.now() - start);
    const status = c.res.status;
    const level: LogLevel =
      status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    log[level](`${c.req.method} ${c.req.path}`, { status, duration });
  };
}
