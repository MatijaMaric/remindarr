import { describe, it, expect } from "bun:test";
import { pLimit } from "./p-limit";

describe("pLimit", () => {
  it("resolves all tasks and returns correct values", async () => {
    const limit = pLimit(3);
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => limit(async () => n * 2))
    );
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("never exceeds concurrency limit", async () => {
    const concurrency = 3;
    const limit = pLimit(concurrency);
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 50 }, (_, i) => i);
    await Promise.all(
      tasks.map(() =>
        limit(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise<void>((r) => setTimeout(r, 1));
          active--;
        })
      )
    );

    expect(maxActive).toBeLessThanOrEqual(concurrency);
  });

  it("propagates errors without blocking remaining tasks", async () => {
    const limit = pLimit(2);
    const results = await Promise.allSettled([
      limit(async () => { throw new Error("fail"); }),
      limit(async () => 42),
      limit(async () => 99),
    ]);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
    expect(results[2].status).toBe("fulfilled");
  });
});
