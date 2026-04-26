import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { resetMetrics } from "../metrics";

// Reset metrics before each test so counters start from zero
beforeEach(() => {
  resetMetrics();
});

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe("httpFetch", () => {
  it("returns immediately on 200 without retrying", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(makeResponse(200));
    try {
      const { httpFetch } = await import("./http");
      const { httpRetryTotal } = await import("../metrics");

      const res = await httpFetch("https://example.com", undefined, { baseDelayMs: 0 });
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // No retries should have been counted
      const rendered = httpRetryTotal.render();
      expect(rendered).toContain("http_retry_total 0");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("retries on 500 and resolves when 200 is returned", async () => {
    let callCount = 0;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => {
      callCount++;
      if (callCount <= 2) return Promise.resolve(makeResponse(500));
      return Promise.resolve(makeResponse(200));
    }) as any);
    try {
      const { httpFetch } = await import("./http");
      const { httpRetryTotal } = await import("../metrics");

      const res = await httpFetch("https://example.com", undefined, { baseDelayMs: 0 });
      expect(res.status).toBe(200);
      expect(callCount).toBe(3);

      // Two retries were incremented (status 500 twice)
      const rendered = httpRetryTotal.render();
      expect(rendered).toContain('status="500"');
      expect(rendered).toMatch(/status="500"\} 2/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns 400 immediately without retrying (non-retryable 4xx)", async () => {
    let callCount = 0;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => {
      callCount++;
      return Promise.resolve(makeResponse(400));
    }) as any);
    try {
      const { httpFetch } = await import("./http");

      const res = await httpFetch("https://example.com", undefined, { baseDelayMs: 0 });
      expect(res.status).toBe(400);
      expect(callCount).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("retries on 429 and uses Retry-After header", async () => {
    let callCount = 0;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(makeResponse(429, { "Retry-After": "0" }));
      return Promise.resolve(makeResponse(200));
    }) as any);
    try {
      const { httpFetch } = await import("./http");
      const { httpRetryTotal } = await import("../metrics");

      const res = await httpFetch("https://example.com", undefined, { baseDelayMs: 0 });
      expect(res.status).toBe(200);
      expect(callCount).toBe(2);

      const rendered = httpRetryTotal.render();
      expect(rendered).toContain('status="429"');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("throws after exhausting maxRetries on repeated network errors", async () => {
    let callCount = 0;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => {
      callCount++;
      return Promise.reject(new Error("ECONNREFUSED"));
    }) as any);
    try {
      const { httpFetch } = await import("./http");
      const { httpRetryTotal } = await import("../metrics");

      await expect(
        httpFetch("https://example.com", undefined, { maxRetries: 3, baseDelayMs: 0 })
      ).rejects.toThrow("ECONNREFUSED");

      // Called maxRetries+1 times total (attempts 0,1,2,3)
      expect(callCount).toBe(4);

      // 3 retries were counted (the last attempt's error is re-thrown, not counted)
      const rendered = httpRetryTotal.render();
      expect(rendered).toContain('status="network_error"');
      expect(rendered).toMatch(/status="network_error"\} 3/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns the last retryable response on final attempt instead of throwing", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(makeResponse(503));
    try {
      const { httpFetch } = await import("./http");

      const res = await httpFetch("https://example.com", undefined, {
        maxRetries: 2,
        baseDelayMs: 0,
      });
      // After exhausting retries on a retryable status, returns the response as-is
      expect(res.status).toBe(503);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
