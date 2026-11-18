import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import Sentry from "../sentry";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  enqueueJob,
  registerCron,
  getCronExpression,
  getJobStats,
} from "./queue";
import { registerHandler, processJobs, stopWorker } from "./worker";

const withMonitorSpy = spyOn(Sentry, "withMonitor").mockImplementation(((
  _slug: string,
  fn: () => unknown,
  _config?: unknown,
) => {
  return fn();
}) as typeof Sentry.withMonitor);

const captureExceptionSpy = spyOn(Sentry, "captureException").mockReturnValue(
  "test-event-id",
);

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
      },
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

describe("worker handler timeout", () => {
  it("fails a job whose handler never resolves within JOB_HANDLER_TIMEOUT_MS", async () => {
    const original = CONFIG.JOB_HANDLER_TIMEOUT_MS;
    CONFIG.JOB_HANDLER_TIMEOUT_MS = 50;
    try {
      registerHandler("hung-job", () => new Promise(() => {})); // never resolves
      enqueueJob("hung-job", undefined, { maxAttempts: 1 });
      await processJobs();

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      const err = captureExceptionSpy.mock.calls[0][0] as Error;
      expect(err.message).toContain("exceeded handler timeout");

      const stats = getJobStats();
      expect(stats["hung-job"].failed).toBe(1);
    } finally {
      CONFIG.JOB_HANDLER_TIMEOUT_MS = original;
    }
  });
});

describe("worker error logging includes stack traces", () => {
  it("logs raw err object so the stack is preserved", async () => {
    // Child loggers write to console.error for error/warn level
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(
      () => {},
    );

    const jobError = new Error("stack trace test");
    registerHandler("stack-trace-job", async () => {
      throw jobError;
    });
    enqueueJob("stack-trace-job");

    await processJobs();

    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorCalls = consoleErrorSpy.mock.calls
      .map((args) => {
        try {
          return JSON.parse(args[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (obj): obj is Record<string, unknown> =>
          obj !== null && obj.level === "error",
      );

    const failedLog = errorCalls.find((obj) => obj.msg === "Failed job");
    expect(failedLog).toBeDefined();
    // err is serialized as { message, stack } by the logger's serializeValue
    const errObj = failedLog!.err as Record<string, unknown>;
    expect(typeof errObj.stack).toBe("string");
    expect((errObj.stack as string).length).toBeGreaterThan(0);

    consoleErrorSpy.mockRestore();
  });
});

describe("worker drain and in-flight guards (#1442)", () => {
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  }

  it("drains all pending jobs of one name within a single tick", async () => {
    let calls = 0;
    registerHandler("drain-job", async () => {
      calls++;
    });
    for (let i = 0; i < 20; i++) enqueueJob("drain-job");

    await processJobs();

    expect(calls).toBe(20);
    expect(getJobStats()["drain-job"].completed).toBe(20);
  });

  it("stops claiming a name once its per-tick budget is spent", async () => {
    let now = 0;
    const nowSpy = spyOn(performance, "now").mockImplementation(() => now);
    try {
      registerHandler("budget-job", async () => {
        now += 20; // each job "takes" 20 ms of fake clock
      });
      for (let i = 0; i < 10; i++) enqueueJob("budget-job");

      // Claims at elapsed 0 and 20; at 40 the 30 ms budget is spent.
      await processJobs(30);

      const stats = getJobStats()["budget-job"];
      expect(stats.completed).toBe(2);
      expect(stats.pending).toBe(8);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("does not start a tick while the previous one is still running", async () => {
    const gate = deferred();
    const started = deferred();
    let calls = 0;
    registerHandler("overlap-job", async () => {
      calls++;
      started.resolve();
      await gate.promise;
    });
    let otherCalls = 0;
    registerHandler("overlap-other", async () => {
      otherCalls++;
    });
    enqueueJob("overlap-job");

    const first = processJobs();
    await started.promise;
    // A different name, so only the tick guard (not the per-name guard) can
    // stop the overlapping call from claiming it.
    enqueueJob("overlap-other");
    await processJobs(); // overlapping tick returns without claiming
    expect(otherCalls).toBe(0);
    expect(getJobStats()["overlap-other"].pending).toBe(1);

    gate.resolve();
    await first;
    expect(calls).toBe(1);
    expect(otherCalls).toBe(1);
  });

  it("skips a name whose timed-out handler has not settled yet", async () => {
    const original = CONFIG.JOB_HANDLER_TIMEOUT_MS;
    CONFIG.JOB_HANDLER_TIMEOUT_MS = 30;
    const gate = deferred();
    let calls = 0;
    try {
      registerHandler("unsettled-job", async () => {
        calls++;
        if (calls === 1) await gate.promise;
      });
      enqueueJob("unsettled-job", undefined, { maxAttempts: 1 });
      enqueueJob("unsettled-job", undefined, { maxAttempts: 1 });

      await processJobs(); // first job times out; its handler is still running
      await processJobs(); // name still unsettled: second job is not claimed
      expect(calls).toBe(1);
      expect(getJobStats()["unsettled-job"].pending).toBe(1);

      gate.resolve();
      await new Promise((r) => setImmediate(r)); // let the handler's finally run
      await processJobs();
      expect(calls).toBe(2);
      expect(getJobStats()["unsettled-job"].completed).toBe(1);
    } finally {
      CONFIG.JOB_HANDLER_TIMEOUT_MS = original;
    }
  });

  it("does not count a handler's synchronous start against the timeout window", async () => {
    // The timeout is armed after the handler is invoked, as before #1442.
    const original = CONFIG.JOB_HANDLER_TIMEOUT_MS;
    CONFIG.JOB_HANDLER_TIMEOUT_MS = 25;
    try {
      registerHandler("sync-start-job", () => {
        const until = Date.now() + 60;
        while (Date.now() < until); // synchronous work longer than the timeout
        return new Promise((r) => setTimeout(r, 5));
      });
      enqueueJob("sync-start-job", undefined, { maxAttempts: 1 });

      await processJobs();

      expect(getJobStats()["sync-start-job"].completed).toBe(1);
    } finally {
      CONFIG.JOB_HANDLER_TIMEOUT_MS = original;
    }
  });

  it("releases the name when a handler throws synchronously", async () => {
    let calls = 0;
    registerHandler("sync-throw-job", () => {
      calls++;
      throw new Error("boom");
    });
    enqueueJob("sync-throw-job", undefined, { maxAttempts: 1 });
    enqueueJob("sync-throw-job", undefined, { maxAttempts: 1 });

    await processJobs();

    expect(calls).toBe(2);
    expect(getJobStats()["sync-throw-job"].failed).toBe(2);
  });

  it("stops claiming after stopWorker() during an active drain", async () => {
    const gate = deferred();
    const started = deferred();
    let calls = 0;
    registerHandler("stop-drain-job", async () => {
      calls++;
      started.resolve();
      await gate.promise;
    });
    enqueueJob("stop-drain-job");
    enqueueJob("stop-drain-job");

    const tick = processJobs();
    await started.promise;
    stopWorker();
    gate.resolve();
    await tick;

    expect(calls).toBe(1);
    expect(getJobStats()["stop-drain-job"].pending).toBe(1);
  });

  it("does not count a handler's synchronous start against the timeout window", async () => {
    // The timeout is armed after the handler is invoked, as before #1442.
    const original = CONFIG.JOB_HANDLER_TIMEOUT_MS;
    CONFIG.JOB_HANDLER_TIMEOUT_MS = 25;
    try {
      registerHandler("sync-start-job", () => {
        const until = Date.now() + 60;
        while (Date.now() < until); // synchronous work longer than the timeout
        return new Promise((r) => setTimeout(r, 5));
      });
      enqueueJob("sync-start-job", undefined, { maxAttempts: 1 });

      await processJobs();

      expect(getJobStats()["sync-start-job"].completed).toBe(1);
    } finally {
      CONFIG.JOB_HANDLER_TIMEOUT_MS = original;
    }
  });

  it("releases the name when a handler throws synchronously", async () => {
    let calls = 0;
    registerHandler("sync-throw-job", () => {
      calls++;
      throw new Error("boom");
    });
    enqueueJob("sync-throw-job", undefined, { maxAttempts: 1 });
    enqueueJob("sync-throw-job", undefined, { maxAttempts: 1 });

    await processJobs();

    expect(calls).toBe(2);
    expect(getJobStats()["sync-throw-job"].failed).toBe(2);
  });

  it("stops claiming after stopWorker() during an active drain", async () => {
    const gate = deferred();
    const started = deferred();
    let calls = 0;
    registerHandler("stop-drain-job", async () => {
      calls++;
      started.resolve();
      await gate.promise;
    });
    enqueueJob("stop-drain-job");
    enqueueJob("stop-drain-job");

    const tick = processJobs();
    await started.promise;
    stopWorker();
    gate.resolve();
    await tick;

    expect(calls).toBe(1);
    expect(getJobStats()["stop-drain-job"].pending).toBe(1);
  });
});
