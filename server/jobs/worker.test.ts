import { describe, it, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
import * as Sentry from "@sentry/node";
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

  it("wraps non-cron job with Sentry.withMonitor without schedule config", async () => {
    let handlerCalled = false;
    registerHandler("one-off-job", async () => {
      handlerCalled = true;
    });
    enqueueJob("one-off-job");

    await processJobs();

    expect(handlerCalled).toBe(true);
    expect(withMonitorSpy).toHaveBeenCalledWith(
      "one-off-job",
      expect.any(Function),
      undefined
    );
  });

  it("reports failure to Sentry when job throws", async () => {
    withMonitorSpy.mockImplementationOnce(
      ((_slug: string, fn: () => unknown, _config?: unknown) => {
        return fn();
      }) as typeof Sentry.withMonitor
    );

    const jobError = new Error("job failed");
    registerHandler("failing-job", async () => {
      throw jobError;
    });
    enqueueJob("failing-job");

    await processJobs();

    expect(withMonitorSpy).toHaveBeenCalledWith(
      "failing-job",
      expect.any(Function),
      undefined
    );
    expect(captureExceptionSpy).toHaveBeenCalledWith(jobError);
  });
});
