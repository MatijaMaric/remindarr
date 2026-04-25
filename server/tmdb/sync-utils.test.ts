import { describe, expect, it, mock } from "bun:test";
import { Logger } from "../logger";
import { syncEachWithDelay } from "./sync-utils";

function makeLog(): Logger {
  // Real Logger; level "error" so default error logs don't spam test output.
  // We never assert log content here — failure semantics are asserted via
  // the returned `failures` array.
  return new Logger("error", { module: "test" });
}

describe("syncEachWithDelay", () => {
  it("returns all results and no failures when every item succeeds", async () => {
    const log = makeLog();
    const items = [1, 2, 3];

    const { results, failures } = await syncEachWithDelay(items, {
      delayMs: 0,
      label: "test",
      log,
      onItem: async (n) => n * 2,
    });

    expect(results).toEqual([2, 4, 6]);
    expect(failures).toEqual([]);
  });

  it("isolates failures so other items still run", async () => {
    const log = makeLog();
    const items = ["a", "BAD", "c"];
    const boom = new Error("nope");

    const { results, failures } = await syncEachWithDelay(items, {
      delayMs: 0,
      label: "test",
      log,
      onItem: async (s) => {
        if (s === "BAD") throw boom;
        return s.toUpperCase();
      },
    });

    expect(results).toEqual(["A", "C"]);
    expect(failures).toEqual([{ item: "BAD", error: boom }]);
  });

  it("supports delayMs: 0 with no observable delay between items", async () => {
    const log = makeLog();
    const calls: number[] = [];

    const start = performance.now();
    await syncEachWithDelay([1, 2, 3, 4, 5], {
      delayMs: 0,
      label: "test",
      log,
      onItem: async (n) => {
        calls.push(performance.now() - start);
        return n;
      },
    });
    const elapsed = performance.now() - start;

    expect(calls).toHaveLength(5);
    // 5 items with no delay should complete well under 50ms in CI.
    expect(elapsed).toBeLessThan(100);
  });

  it("waits delayMs between sequential items", async () => {
    const log = makeLog();
    const stamps: number[] = [];
    const start = performance.now();

    await syncEachWithDelay([1, 2, 3], {
      delayMs: 30,
      label: "test",
      log,
      onItem: async (n) => {
        stamps.push(performance.now() - start);
        return n;
      },
    });

    expect(stamps).toHaveLength(3);
    // Item 2 starts after delay following item 1 (>= ~30ms).
    expect(stamps[1]).toBeGreaterThanOrEqual(25);
    // Item 3 starts after another delay (>= ~60ms cumulative).
    expect(stamps[2]).toBeGreaterThanOrEqual(55);
  });

  it("runs items in parallel when concurrency > 1", async () => {
    const log = makeLog();
    const inFlight = { current: 0, peak: 0 };

    const tick = async () => {
      inFlight.current++;
      if (inFlight.current > inFlight.peak) inFlight.peak = inFlight.current;
      await new Promise((r) => setTimeout(r, 20));
      inFlight.current--;
    };

    const start = performance.now();
    await syncEachWithDelay([1, 2, 3, 4], {
      delayMs: 0,
      label: "test",
      log,
      concurrency: 2,
      onItem: async () => {
        await tick();
      },
    });
    const elapsed = performance.now() - start;

    // With concurrency 2 and 20ms per item, 4 items take ~40ms (not ~80ms).
    expect(inFlight.peak).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(75);
  });

  it("invokes onError and treats {result} as a successful fallback", async () => {
    const log = makeLog();
    const seen: unknown[] = [];

    const { results, failures } = await syncEachWithDelay([1, 2, 3], {
      delayMs: 0,
      label: "test",
      log,
      onItem: async (n) => {
        if (n === 2) throw new Error("two");
        return n * 10;
      },
      onError: (err, item) => {
        seen.push({ err, item });
        return { result: -1 };
      },
    });

    expect(results).toEqual([10, -1, 30]);
    expect(failures).toEqual([]);
    expect(seen).toHaveLength(1);
  });

  it("stops the loop when onError returns 'stop'", async () => {
    const log = makeLog();
    const visited: number[] = [];

    const { results, failures } = await syncEachWithDelay([1, 2, 3, 4, 5], {
      delayMs: 0,
      label: "test",
      log,
      onItem: async (n) => {
        visited.push(n);
        if (n === 3) throw new Error("stop now");
        return n;
      },
      onError: () => "stop",
    });

    expect(visited).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2]);
    expect(failures).toEqual([]);
  });

  it("logs default per-item failure when onError is not provided", async () => {
    const log = makeLog();
    const errSpy = mock(() => {});
    log.error = errSpy as unknown as Logger["error"];

    const { failures } = await syncEachWithDelay([1, 2], {
      delayMs: 0,
      label: "my-label",
      log,
      onItem: async (n) => {
        if (n === 2) throw new Error("nope");
        return n;
      },
    });

    expect(failures).toHaveLength(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const [msg, data] = errSpy.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(msg).toContain("my-label");
    expect(data).toHaveProperty("err");
  });
});
