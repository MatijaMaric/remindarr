import { describe, it, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
import Sentry from "../sentry";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { enqueueJob, registerCron, getCronExpression } from "./queue";
import { registerHandler, processJobs, stopWorker } from "./worker";

const withMonitorSpy = spyOn(Sentry, "withMonitor").mockImplementation(
  ((_slug: string, fn: () => unknown, _config?: unknown) => {
    return fn();
  }) as typeof Sentry.withMonitor
);

const captureExceptionSpy = spyOn(Sentry, "captureException").mockReturnValue("test-event-id");

beforeEach(() => {
  setupTestDb();
  withMonitorSpy.mockClear();
  captureExceptionSpy.mockClear();
});

afterAll(() => {
  stopWorker();
  teardownTestDb();
});

describe("getCronExpression", () => {
  it("returns cron expression for registered cron job", () => {
    registerCron("sync-titles", "0 3 * * *");
    expect(getCronExpression("sync-titles")).toBe("0 3 * * *");
  });

  it("returns null for non-existent job", () => {
    expect(getCronExpression("nonexistent")).toBeNull();
  });
});

describe("worker Sentry monitoring", () => {
  it("wraps cron job execution with Sentry.withMonitor and schedule config", async () => {
    let handlerCalled = false;
    registerHandler("test-cron-job", async () => {
      handlerCalled = true;
    });
    registerCron("test-cron-job", "*/10 * * * *");
    enqueueJob("test-cron-job");

    await processJobs();

    expect(handlerCalled).toBe(true);
    expect(withMonitorSpy).toHaveBeenCalledWith(
      "test-cron-job",
      expect.any(Function),
      {
        schedule: { type: "crontab", value: "*/10 * * * *" },
        maxRuntime: 30,
      }
    );
  });

  it("does not wrap non-cron job with Sentry.withMonitor", async () => {
    let handlerCalled = false;
    registerHandler("one-off-job", async () => {
      handlerCalled = true;
    });
    enqueueJob("one-off-job");

    withMonitorSpy.mockClear();
    await processJobs();

    expect(handlerCalled).toBe(true);
    expect(withMonitorSpy).not.toHaveBeenCalled();
  });

  it("reports failure to Sentry when job throws", async () => {
    const jobError = new Error("job failed");
    registerHandler("failing-job", async () => {
      throw jobError;
    });
    enqueueJob("failing-job");

    await processJobs();

    expect(captureExceptionSpy).toHaveBeenCalledWith(jobError);
  });
});

describe("worker error logging includes stack traces", () => {
  it("logs raw err object so the stack is preserved", async () => {
    // Child loggers write to console.error for error/warn level
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

    const jobError = new Error("stack trace test");
    registerHandler("stack-trace-job", async () => {
      throw jobError;
    });
    enqueueJob("stack-trace-job");

    await processJobs();

    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorCalls = consoleErrorSpy.mock.calls
      .map((args) => { try { return JSON.parse(args[0] as string) as Record<string, unknown>; } catch { return null; } })
      .filter((obj): obj is Record<string, unknown> => obj !== null && obj.level === "error");

    const failedLog = errorCalls.find((obj) => obj.msg === "Failed job");
    expect(failedLog).toBeDefined();
    // err is serialized as { message, stack } by the logger's serializeValue
    const errObj = failedLog!.err as Record<string, unknown>;
    expect(typeof errObj.stack).toBe("string");
    expect((errObj.stack as string).length).toBeGreaterThan(0);

    consoleErrorSpy.mockRestore();
  });
});
