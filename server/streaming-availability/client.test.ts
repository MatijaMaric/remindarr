import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import Sentry from "../sentry";
import { CONFIG } from "../config";
import { RateLimitError } from "./types";
import { BreakerOpenError, _resetBreakersForTest } from "../lib/circuit-breaker";
import { MemoryCache } from "../cache/memory";
import * as cacheModule from "../cache";

// Mock Sentry tracing
let sentrySpy: ReturnType<typeof spyOn>;
let fetchSpy: ReturnType<typeof spyOn>;
let getCacheSpy: ReturnType<typeof spyOn>;
let testCache: MemoryCache;

const originalApiKey = CONFIG.STREAMING_AVAILABILITY_API_KEY;

beforeEach(() => {
  _resetBreakersForTest();
  sentrySpy = spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));
  fetchSpy = spyOn(globalThis, "fetch");
  testCache = new MemoryCache();
  getCacheSpy = spyOn(cacheModule, "getCache").mockReturnValue(testCache);
  CONFIG.STREAMING_AVAILABILITY_API_KEY = "test-api-key";
});

afterEach(() => {
  sentrySpy?.mockRestore();
  fetchSpy?.mockRestore();
  getCacheSpy?.mockRestore();
  CONFIG.STREAMING_AVAILABILITY_API_KEY = originalApiKey;
});

import { fetchStreamingOptions } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchStreamingOptions", () => {
  it("fetches streaming options for a movie", async () => {
    const mockResponse = {
      streamingOptions: {
        us: [
          {
            service: { id: "netflix", name: "Netflix", homePage: "", themeColorCode: "", imageSet: {} },
            type: "subscription",
            link: "https://www.netflix.com/watch/12345",
            quality: "hd",
          },
        ],
      },
    };
    fetchSpy.mockResolvedValue(jsonResponse(mockResponse));

    const result = await fetchStreamingOptions(550, "MOVIE", "US");

    expect(result).toHaveLength(1);
    expect(result[0].link).toBe("https://www.netflix.com/watch/12345");
    expect(result[0].service.id).toBe("netflix");

    const fetchCall = fetchSpy.mock.calls[0];
    expect(fetchCall[0]).toContain("/shows/movie/550");
    expect(fetchCall[0]).toContain("country=us");
  });

  it("fetches streaming options for a TV show", async () => {
    const mockResponse = {
      streamingOptions: {
        us: [
          {
            service: { id: "disney", name: "Disney+", homePage: "", themeColorCode: "", imageSet: {} },
            type: "subscription",
            link: "https://www.disneyplus.com/series/123",
          },
        ],
      },
    };
    fetchSpy.mockResolvedValue(jsonResponse(mockResponse));

    const result = await fetchStreamingOptions(1396, "SHOW", "US");

    expect(result).toHaveLength(1);
    const fetchCall = fetchSpy.mock.calls[0];
    expect(fetchCall[0]).toContain("/shows/tv/1396");
  });

  it("returns empty array on 404", async () => {
    fetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));

    const result = await fetchStreamingOptions(999999, "MOVIE", "US");
    expect(result).toEqual([]);
  });

  it("throws RateLimitError on 429", async () => {
    fetchSpy.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));

    await expect(fetchStreamingOptions(550, "MOVIE", "US")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("throws on other HTTP errors", async () => {
    fetchSpy.mockResolvedValue(new Response("Server Error", { status: 500, statusText: "Internal Server Error" }));

    await expect(fetchStreamingOptions(550, "MOVIE", "US")).rejects.toThrow("SA API error: 500");
  });

  it("returns empty array when country has no options", async () => {
    const mockResponse = {
      streamingOptions: {
        gb: [{ service: { id: "netflix" }, type: "subscription", link: "https://netflix.com/1" }],
      },
    };
    fetchSpy.mockResolvedValue(jsonResponse(mockResponse));

    const result = await fetchStreamingOptions(550, "MOVIE", "US");
    expect(result).toEqual([]);
  });

  it("sends correct headers", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ streamingOptions: {} }));

    await fetchStreamingOptions(550, "MOVIE", "US");

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers["X-RapidAPI-Key"]).toBe("test-api-key");
    expect(headers["X-RapidAPI-Host"]).toBe("streaming-availability.p.rapidapi.com");
  });

  it("returns cached result without fetching", async () => {
    const cachedOptions = [
      { service: { id: "netflix", name: "Netflix", homePage: "", themeColorCode: "", imageSet: { lightThemeImage: "", darkThemeImage: "", whiteImage: "" } }, type: "subscription", link: "https://netflix.com/cached" },
    ] as any;
    await testCache.set("sa:streaming:movie/550:us", cachedOptions, 3600);

    const result = await fetchStreamingOptions(550, "MOVIE", "US");

    expect(result).toEqual(cachedOptions);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stores result in cache after successful fetch", async () => {
    const mockResponse = {
      streamingOptions: {
        us: [{ service: { id: "hulu", name: "Hulu", homePage: "", themeColorCode: "", imageSet: { lightThemeImage: "", darkThemeImage: "", whiteImage: "" } }, type: "subscription", link: "https://hulu.com/watch/550" }],
      },
    };
    fetchSpy.mockResolvedValue(jsonResponse(mockResponse));

    await fetchStreamingOptions(550, "MOVIE", "US");

    const cached = await testCache.get("sa:streaming:movie/550:us");
    expect(cached).toHaveLength(1);
    expect((cached as any[])[0].service.id).toBe("hulu");
  });

  it("stores empty array in cache on 404", async () => {
    fetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));

    const result = await fetchStreamingOptions(999999, "MOVIE", "US");

    expect(result).toEqual([]);
    const cached = await testCache.get("sa:streaming:movie/999999:us");
    expect(cached).toEqual([]);
  });

  it("does not cache on rate limit error", async () => {
    fetchSpy.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));

    await expect(fetchStreamingOptions(550, "MOVIE", "US")).rejects.toBeInstanceOf(RateLimitError);

    const cached = await testCache.get("sa:streaming:movie/550:us");
    expect(cached).toBeNull();
  });

  it("does not cache on other HTTP errors", async () => {
    fetchSpy.mockResolvedValue(new Response("Server Error", { status: 500, statusText: "Internal Server Error" }));

    await expect(fetchStreamingOptions(550, "MOVIE", "US")).rejects.toThrow("SA API error: 500");

    const cached = await testCache.get("sa:streaming:movie/550:us");
    expect(cached).toBeNull();
  });
});

describe("fetchStreamingOptions — circuit breaker", () => {
  it("opens the breaker after 5 consecutive 500 errors and blocks subsequent calls", async () => {
    fetchSpy.mockResolvedValue(new Response("Server Error", { status: 500, statusText: "Internal Server Error" }));

    for (let i = 0; i < 5; i++) {
      await expect(fetchStreamingOptions(i + 1, "MOVIE", "US")).rejects.toThrow("SA API error: 500");
    }

    // 6th call: breaker should be open — no fetch should be issued
    await expect(fetchStreamingOptions(6, "MOVIE", "US")).rejects.toBeInstanceOf(BreakerOpenError);
    expect(fetchSpy.mock.calls.length).toBe(5);
  });

  it("opens the breaker for 24h after 5 consecutive 429 errors", async () => {
    fetchSpy.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));

    for (let i = 0; i < 5; i++) {
      await expect(fetchStreamingOptions(i + 1, "MOVIE", "US")).rejects.toBeInstanceOf(RateLimitError);
    }

    // Breaker is open; 6th call should throw BreakerOpenError without calling fetch
    await expect(fetchStreamingOptions(6, "MOVIE", "US")).rejects.toBeInstanceOf(BreakerOpenError);

    // Confirm the error carries the 24h window — openUntil should be ~24h from now
    let caughtErr: BreakerOpenError | undefined;
    try {
      await fetchStreamingOptions(7, "MOVIE", "US");
    } catch (e) {
      if (e instanceof BreakerOpenError) caughtErr = e;
    }
    expect(caughtErr).toBeInstanceOf(BreakerOpenError);
    const remainingMs = caughtErr!.openUntil - Date.now();
    // Should be between 23h and 24h (some test execution time elapsed)
    expect(remainingMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(remainingMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);

    // Fetch should still only have been called 5 times (the 5 quota failures)
    expect(fetchSpy.mock.calls.length).toBe(5);
  });

  it("does not open the breaker on 404 responses", async () => {
    fetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));

    for (let i = 0; i < 5; i++) {
      const result = await fetchStreamingOptions(i + 1, "MOVIE", "US");
      expect(result).toEqual([]);
    }

    // Breaker should remain closed — next call goes through normally
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ streamingOptions: { us: [] } }), { status: 200 })
    );
    await expect(fetchStreamingOptions(6, "MOVIE", "US")).resolves.toEqual([]);
    expect(fetchSpy.mock.calls.length).toBe(6);
  });

  it("cache hit bypasses the breaker even when it is open", async () => {
    // Open the breaker by sending 5 failures for different tmdbIds
    fetchSpy.mockResolvedValue(new Response("Server Error", { status: 500, statusText: "Internal Server Error" }));
    for (let i = 1; i <= 5; i++) {
      await expect(fetchStreamingOptions(i, "MOVIE", "US")).rejects.toThrow("SA API error: 500");
    }
    // Breaker is now open
    await expect(fetchStreamingOptions(6, "MOVIE", "US")).rejects.toBeInstanceOf(BreakerOpenError);

    // Pre-warm cache for tmdbId 999
    const cachedOptions = [{ service: { id: "netflix" }, link: "https://netflix.com/999" }] as any;
    await testCache.set("sa:streaming:movie/999:us", cachedOptions, 3600);

    // Cache hit should succeed without touching the breaker
    const result = await fetchStreamingOptions(999, "MOVIE", "US");
    expect(result).toEqual(cachedOptions);
    // fetch should still be 5 (only the initial failures, no new call for tmdbId 999)
    expect(fetchSpy.mock.calls.length).toBe(5);
  });
});
