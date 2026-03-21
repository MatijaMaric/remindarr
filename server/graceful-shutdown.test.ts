import { describe, it, expect, mock, spyOn, beforeAll, afterAll } from "bun:test";
import Sentry from "./sentry";
import { createShutdownHandler } from "./graceful-shutdown";

const flushSpy = spyOn(Sentry, "flush").mockResolvedValue(true);

let capturedExitCode: number | undefined;
const originalExit = process.exit;

beforeAll(() => {
  process.exit = ((code?: number) => {
    capturedExitCode = code;
  }) as typeof process.exit;
});

afterAll(() => {
  process.exit = originalExit;
});

describe("createShutdownHandler", () => {
  it("stops the server, worker, flushes Sentry, closes DB, then exits 0", async () => {
    capturedExitCode = undefined;
    flushSpy.mockClear();

    const serverStop = mock(() => {});
    const stopWorker = mock(() => {});
    const closeDb = mock(() => {});

    const shutdown = createShutdownHandler({ server: { stop: serverStop }, stopWorker, closeDb });
    await shutdown("SIGTERM");

    expect(serverStop).toHaveBeenCalledTimes(1);
    expect(stopWorker).toHaveBeenCalledTimes(1);
    expect(flushSpy).toHaveBeenCalledTimes(1);
    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(capturedExitCode).toBe(0);
  });

  it("works for SIGINT as well", async () => {
    capturedExitCode = undefined;
    flushSpy.mockClear();

    const shutdown = createShutdownHandler({
      server: { stop: mock(() => {}) },
      stopWorker: mock(() => {}),
      closeDb: mock(() => {}),
    });
    await shutdown("SIGINT");

    expect(capturedExitCode).toBe(0);
  });

  it("calls server.stop before closeDb", async () => {
    const callOrder: string[] = [];

    const shutdown = createShutdownHandler({
      server: { stop: mock(() => { callOrder.push("server.stop"); }) },
      stopWorker: mock(() => { callOrder.push("stopWorker"); }),
      closeDb: mock(() => { callOrder.push("closeDb"); }),
    });
    await shutdown("SIGTERM");

    expect(callOrder.indexOf("server.stop")).toBeLessThan(callOrder.indexOf("closeDb"));
    expect(callOrder.indexOf("stopWorker")).toBeLessThan(callOrder.indexOf("closeDb"));
  });
});
